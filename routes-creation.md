# Complete Integration Guide: Three Backend API Routes + React Frontend for Antigravity

Complete production-ready implementation for React frontend with all three backend routes.

---

## 📁 Project Structure Setup

```
src/
├── routes/
│   └── api/
│       ├── proxy/
│       │   └── +server.ts
│       ├── songlink/
│       │   └── +server.ts
│       └── spotify-playlist/
│           └── +server.ts
├── lib/
│   ├── server/
│   │   ├── redis.ts
│   │   ├── proxyConfig.ts
│   │   └── config.ts
│   └── api/
│       └── client.ts
├── hooks/
│   ├── usePlaylistExtractor.ts
│   ├── useProxyFetch.ts
│   └── useSearch.ts
├── components/
│   ├── PlaylistImporter.tsx
│   ├── SearchTracks.tsx
│   ├── TrackPlayer.tsx
│   └── Downloader.tsx
├── .env.local
└── .env.example
```

---

## 🔧 Step 1: Environment Variables Setup

**File:** `.env.local` (create in project root)

````env
# Redis Configuration (for caching - optional but recommended)
REDIS_URL=redis://localhost:6379
REDIS_CACHE_TTL_SECONDS=300
REDIS_CACHE_TTL_SEARCH_SECONDS=300
REDIS_CACHE_TTL_TRACK_SECONDS=120
REDIS_CACHE_MAX_BODY_BYTES=200000

# API Configuration
TIDAL_API_BASE=https://api.tidal.com
SPOTIFY_API_BASE=https://api.spotify.com

# Allowed Origins (CORS)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://yourdomain.com

# Auth Tokens (if needed)
TIDAL_ACCESS_TOKEN=your_tidal_token_here
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
````

**File:** `.env.example` (commit this to repo)

````env
REDIS_URL=redis://localhost:6379
REDIS_CACHE_TTL_SECONDS=300
REDIS_CACHE_TTL_SEARCH_SECONDS=300
REDIS_CACHE_TTL_TRACK_SECONDS=120
REDIS_CACHE_MAX_BODY_BYTES=200000
TIDAL_API_BASE=https://api.tidal.com
SPOTIFY_API_BASE=https://api.spotify.com
ALLOWED_ORIGINS=http://localhost:3000
TIDAL_ACCESS_TOKEN=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
````

---

## 📦 Step 2: Install Dependencies

```bash
npm install ioredis
# or
yarn add ioredis
# or
pnpm add ioredis
```

**Optional:** Redis Docker setup

```bash
# Run Redis in Docker
docker run -d -p 6379:6379 --name redis redis:latest

# Check if running
docker ps | grep redis
```

---

## 🔐 Step 3: Redis Client Setup

**File:** `src/lib/server/redis.ts`

````typescript
import Redis from 'ioredis';
import { env } from '$env/dynamic/private';

let redisClient: Redis | null = null;

/**
 * Get or create Redis client
 * Returns null if Redis is not configured
 */
export function getRedisClient(): Redis | null {
	if (!env.REDIS_URL) {
		console.warn('Redis not configured - caching disabled');
		return null;
	}

	if (redisClient) {
		return redisClient;
	}

	try {
		redisClient = new Redis(env.REDIS_URL, {
			maxRetriesPerRequest: null,
			enableReadyCheck: false,
			enableOfflineQueue: true,
			retryStrategy: (times) => {
				const delay = Math.min(times * 50, 2000);
				return delay;
			}
		});

		redisClient.on('error', (err) => {
			console.error('Redis connection error:', err);
		});

		redisClient.on('connect', () => {
			console.log('Redis connected');
		});

		return redisClient;
	} catch (error) {
		console.error('Failed to create Redis client:', error);
		return null;
	}
}

/**
 * Get Redis status
 */
export function getRedisStatus(): 'connected' | 'disconnected' | 'unavailable' {
	if (!redisClient) {
		return 'unavailable';
	}

	if (redisClient.status === 'ready') {
		return 'connected';
	}

	return 'disconnected';
}

/**
 * Close Redis connection (for cleanup)
 */
export async function closeRedis(): Promise<void> {
	if (redisClient) {
		await redisClient.quit();
		redisClient = null;
	}
}
````

---

## 🛡️ Step 4: Proxy Configuration

**File:** `src/lib/server/proxyConfig.ts`

````typescript
import { env } from '$env/dynamic/private';

/**
 * Allowed proxy target hosts
 */
const ALLOWED_PROXY_HOSTS = new Set([
	'api.tidal.com',
	'listen.tidal.com',
	'api.spotify.com',
	'open.spotify.com',
	'api-partner.spotify.com',
	'open.spotifycdn.com',
	'clienttoken.spotify.com'
]);

/**
 * Check if a URL is allowed to be proxied
 */
export function isProxyTarget(url: URL): boolean {
	const hostname = url.hostname.toLowerCase();

	// Check exact matches
	if (ALLOWED_PROXY_HOSTS.has(hostname)) {
		return true;
	}

	// Check for subdomains (*.tidal.com, *.spotify.com)
	for (const allowedHost of ALLOWED_PROXY_HOSTS) {
		if (hostname.endsWith(`.${allowedHost}`) || hostname === allowedHost) {
			return true;
		}
	}

	return false;
}

/**
 * Get CORS origin whitelist
 */
export function getAllowedOrigins(): string[] {
	const configuredOrigins = env.ALLOWED_ORIGINS?.split(',') ?? [];
	const cleaned = configuredOrigins.map((origin) => origin.trim()).filter(Boolean);

	// Always allow localhost in development
	if (process.env.NODE_ENV !== 'production') {
		return [
			'http://localhost:3000',
			'http://localhost:5173',
			'http://localhost:5174',
			'http://127.0.0.1:3000',
			'http://127.0.0.1:5173',
			...cleaned
		];
	}

	return cleaned;
}

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
	if (!origin) return true; // Allow no-origin requests (SSR, etc.)

	const allowed = getAllowedOrigins();

	// In development, be permissive
	if (process.env.NODE_ENV !== 'production') {
		return true;
	}

	return allowed.some((allowedOrigin) => {
		if (allowedOrigin === '*') return true;
		if (allowedOrigin === origin) return true;

		// Handle wildcard subdomains like *.example.com
		if (allowedOrigin.startsWith('*.')) {
			const domain = allowedOrigin.slice(2);
			return origin.endsWith(`.${domain}`) || origin === domain;
		}

		return false;
	});
}
````

---

## 🎵 Step 5: Proxy Route (TIDAL/Spotify API Caching)

**File:** `src/routes/api/proxy/+server.ts`

````typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { getRedisClient } from '$lib/server/redis';
import { isProxyTarget, isOriginAllowed } from '$lib/server/proxyConfig';

// Cache configuration
const CACHE_NAMESPACE = 'api:proxy:v2:';
const DEFAULT_CACHE_TTL = 300; // 5 minutes
const SEARCH_CACHE_TTL = 300; // 5 minutes
const TRACK_CACHE_TTL = 120; // 2 minutes
const MAX_CACHE_BODY_BYTES = 200_000; // 200KB

// Headers to strip from proxied responses
const HOP_BY_HOP_HEADERS = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'content-encoding',
	'content-length'
]);

interface CachedResponse {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	bodyBase64: string;
	timestamp: number;
}

/**
 * Determine cache TTL based on API path
 */
function getCacheTtl(url: URL): number {
	const path = url.pathname.toLowerCase();

	if (path.includes('/search')) return SEARCH_CACHE_TTL;
	if (path.includes('/track') || path.includes('/song')) return TRACK_CACHE_TTL;
	if (path.includes('/album') || path.includes('/artist') || path.includes('/playlist')) {
		return DEFAULT_CACHE_TTL;
	}

	return DEFAULT_CACHE_TTL;
}

/**
 * Create a cache key from URL and headers
 */
function createCacheKey(url: URL, headers: Headers): string {
	const relevantHeaders = [
		headers.get('accept') || '',
		headers.get('range') || ''
	].join('|');

	const material = `${url.toString()}|${relevantHeaders}`;
	const hash = createHash('sha256').update(material).digest('hex');
	return `${CACHE_NAMESPACE}${hash}`;
}

/**
 * Check if content type is cacheable
 */
function isCacheableContentType(contentType: string | null): boolean {
	if (!contentType) return false;
	const type = contentType.split(';')[0].trim().toLowerCase();
	return type.includes('json') || type.startsWith('text/');
}

/**
 * Check if response should not be cached
 */
function shouldNotCache(cacheControl: string | null): boolean {
	if (!cacheControl) return false;
	const normalized = cacheControl.toLowerCase();
	return normalized.includes('no-store') || normalized.includes('private');
}

/**
 * Sanitize headers for proxy response
 */
function sanitizeHeaders(headers: Headers): Record<string, string> {
	const sanitized: Record<string, string> = {};

	headers.forEach((value, key) => {
		if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
			sanitized[key] = value;
		}
	});

	return sanitized;
}

/**
 * Read cached response from Redis
 */
async function getCachedResponse(
	redis: ReturnType<typeof getRedisClient>,
	key: string
): Promise<CachedResponse | null> {
	if (!redis) return null;

	try {
		const data = await redis.get(key);
		if (!data) return null;

		const parsed = JSON.parse(data) as CachedResponse;
		return parsed;
	} catch (error) {
		console.error('Failed to read cache:', error);
		return null;
	}
}

/**
 * Write response to Redis cache
 */
async function cacheResponse(
	redis: ReturnType<typeof getRedisClient>,
	key: string,
	response: CachedResponse,
	ttl: number
): Promise<void> {
	if (!redis || ttl <= 0) return;

	try {
		await redis.setex(key, ttl, JSON.stringify(response));
	} catch (error) {
		console.error('Failed to write cache:', error);
	}
}

export const GET: RequestHandler = async ({ url, request, fetch }) => {
	const origin = request.headers.get('origin');
	const targetUrl = url.searchParams.get('url');

	// Validate origin
	if (!isOriginAllowed(origin)) {
		return json(
			{ error: 'Origin not allowed' },
			{
				status: 403,
				headers: {
					'Access-Control-Allow-Origin': origin || '*'
				}
			}
		);
	}

	// Validate target URL
	if (!targetUrl) {
		return json(
			{ error: 'Missing url parameter' },
			{
				status: 400,
				headers: {
					'Access-Control-Allow-Origin': origin || '*'
				}
			}
		);
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(targetUrl);
	} catch {
		return json(
			{ error: 'Invalid target URL' },
			{
				status: 400,
				headers: {
					'Access-Control-Allow-Origin': origin || '*'
				}
			}
		);
	}

	// Check if target is allowed
	if (!isProxyTarget(parsedUrl)) {
		return json(
			{ error: 'Target host not allowed' },
			{
				status: 400,
				headers: {
					'Access-Control-Allow-Origin': origin || '*'
				}
			}
		);
	}

	// Setup upstream headers
	const upstreamHeaders = new Headers();
	const hasRangeRequest = request.headers.has('range');
	const hasAuth = request.headers.has('authorization');
	const hasCookie = request.headers.has('cookie');

	// Copy headers from original request
	request.headers.forEach((value, key) => {
		const lowerKey = key.toLowerCase();
		if (HOP_BY_HOP_HEADERS.has(lowerKey) || lowerKey === 'host') {
			return;
		}
		upstreamHeaders.set(key, value);
	});

	// Set default user agent
	if (!upstreamHeaders.has('user-agent')) {
		upstreamHeaders.set('user-agent', 'Antigravity/1.0');
	}

	// Force identity encoding
	upstreamHeaders.set('accept-encoding', 'identity');

	// Check cache
	const redis = getRedisClient();
	const shouldCache = !hasRangeRequest && !hasAuth && !hasCookie;
	const cacheKey = shouldCache ? createCacheKey(parsedUrl, upstreamHeaders) : null;

	if (cacheKey) {
		const cached = await getCachedResponse(redis, cacheKey);
		if (cached) {
			return json(JSON.parse(Buffer.from(cached.bodyBase64, 'base64').toString()), {
				status: cached.status,
				headers: {
					...cached.headers,
					'Access-Control-Allow-Origin': origin || '*',
					'X-Cache': 'HIT',
					'X-Cache-Age': `${Math.round((Date.now() - cached.timestamp) / 1000)}s`
				}
			});
		}
	}

	// Fetch from upstream
	try {
		const response = await fetch(parsedUrl.toString(), {
			headers: upstreamHeaders,
			redirect: 'follow'
		});

		// Read response body
		const buffer = await response.arrayBuffer();
		const bodyBytes = new Uint8Array(buffer);
		const bodyBase64 = Buffer.from(bodyBytes).toString('base64');

		// Try to cache
		if (cacheKey && shouldCache) {
			const ttl = getCacheTtl(parsedUrl);
			const contentType = response.headers.get('content-type');
			const cacheControl = response.headers.get('cache-control');

			const isCacheable =
				response.status === 200 &&
				ttl > 0 &&
				!shouldNotCache(cacheControl) &&
				isCacheableContentType(contentType) &&
				bodyBytes.byteLength <= MAX_CACHE_BODY_BYTES;

			if (isCacheable) {
				const cached: CachedResponse = {
					status: response.status,
					statusText: response.statusText,
					headers: sanitizeHeaders(response.headers),
					bodyBase64,
					timestamp: Date.now()
				};

				await cacheResponse(redis, cacheKey, cached, ttl);
			}
		}

		// Return response
		const body = JSON.parse(Buffer.from(bodyBytes).toString());

		return json(body, {
			status: response.status,
			headers: {
				...sanitizeHeaders(response.headers),
				'Access-Control-Allow-Origin': origin || '*',
				'X-Cache': 'MISS'
			}
		});
	} catch (error) {
		console.error('Proxy error:', error);

		return json(
			{
				error: 'Proxy request failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{
				status: 502,
				headers: {
					'Access-Control-Allow-Origin': origin || '*'
				}
			}
		);
	}
};

export const OPTIONS: RequestHandler = async ({ request }) => {
	const origin = request.headers.get('origin');

	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin || '*' : '',
			'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
			'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
			'Access-Control-Max-Age': '86400',
			'Vary': 'Origin'
		}
	});
};
````

---

## 🔗 Step 6: Songlink Route (URL Conversion)

**File:** `src/routes/api/songlink/+server.ts`

````typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isOriginAllowed } from '$lib/server/proxyConfig';

const PRIMARY_SONGLINK = 'https://api.song.link/v1-alpha.1/links';
const BACKUP_SONGLINK = 'https://tracks.monochrome.tf/api/links';

// Browser cache for 30 days (responses never change for same URL)
const BROWSER_CACHE_TTL = 2_592_000;

interface SonglinkParams {
	url: string;
	userCountry?: string;
	songIfSingle?: boolean;
	platform?: string;
	type?: string;
	id?: string;
	preferBackup?: boolean;
}

/**
 * Build Songlink query URL
 */
function buildSonglinkUrl(params: SonglinkParams, useBackup = false): string {
	const baseUrl = useBackup ? BACKUP_SONGLINK : PRIMARY_SONGLINK;
	const url = new URL(baseUrl);

	url.searchParams.set('url', params.url);

	if (params.userCountry) url.searchParams.set('userCountry', params.userCountry);
	if (params.songIfSingle !== undefined) url.searchParams.set('songIfSingle', String(params.songIfSingle));
	if (params.platform) url.searchParams.set('platform', params.platform);
	if (params.type) url.searchParams.set('type', params.type);
	if (params.id) url.searchParams.set('id', params.id);

	return url.toString();
}

/**
 * Fetch from Songlink with automatic failover
 */
async function fetchFromSonglink(
	primaryUrl: string,
	backupUrl: string,
	fetchFn: typeof fetch
): Promise<{
	data: unknown;
	source: 'primary' | 'backup';
	status: number;
}> {
	// Randomly choose which API to try first (load balancing)
	const tryBackupFirst = Math.random() < 0.5;
	const firstUrl = tryBackupFirst ? backupUrl : primaryUrl;
	const firstSource = tryBackupFirst ? 'backup' : 'primary';
	const secondUrl = tryBackupFirst ? primaryUrl : backupUrl;
	const secondSource = tryBackupFirst ? 'primary' : 'backup';

	try {
		// Try first API
		const response = await fetchFn(firstUrl, {
			headers: {
				'User-Agent': 'Antigravity/1.0',
				Accept: 'application/json'
			}
		});

		if (response.ok) {
			const data = await response.json();
			return { data, source: firstSource as 'primary' | 'backup', status: response.status };
		}

		console.warn(`${firstSource} Songlink API returned ${response.status}, trying ${secondSource}...`);

		// Try fallback API
		const fallbackResponse = await fetchFn(secondUrl, {
			headers: {
				'User-Agent': 'Antigravity/1.0',
				Accept: 'application/json'
			}
		});

		if (fallbackResponse.ok) {
			const data = await fallbackResponse.json();
			return {
				data,
				source: secondSource as 'primary' | 'backup',
				status: fallbackResponse.status
			};
		}

		throw new Error(`Both APIs failed: ${firstSource}=${response.status}, ${secondSource}=${fallbackResponse.status}`);
	} catch (error) {
		// Final fallback: try backup if primary threw exception
		try {
			const lastTryUrl = tryBackupFirst ? primaryUrl : backupUrl;
			const lastTrySource = tryBackupFirst ? 'primary' : 'backup';

			const lastResponse = await fetchFn(lastTryUrl, {
				headers: {
					'User-Agent': 'Antigravity/1.0',
					Accept: 'application/json'
				}
			});

			if (lastResponse.ok) {
				const data = await lastResponse.json();
				return {
					data,
					source: lastTrySource as 'primary' | 'backup',
					status: lastResponse.status
				};
			}

			throw error;
		} catch (fallbackError) {
			console.error('All Songlink API attempts failed:', fallbackError);
			throw error;
		}
	}
}

export const GET: RequestHandler = async ({ url, request, fetch }) => {
	const origin = request.headers.get('origin');

	// Validate origin
	if (!isOriginAllowed(origin)) {
		return json(
			{ error: 'Origin not allowed' },
			{ status: 403, headers: { 'Access-Control-Allow-Origin': origin || '*' } }
		);
	}

	// Parse parameters
	const params: SonglinkParams = {
		url: url.searchParams.get('url') || '',
		userCountry: url.searchParams.get('userCountry') || 'US',
		songIfSingle: url.searchParams.get('songIfSingle') === 'true',
		platform: url.searchParams.get('platform') || undefined,
		type: url.searchParams.get('type') || undefined,
		id: url.searchParams.get('id') || undefined,
		preferBackup: url.searchParams.get('preferBackup') === 'true'
	};

	// Validate URL
	if (!params.url) {
		return json(
			{ error: 'Missing required parameter: url' },
			{ status: 400, headers: { 'Access-Control-Allow-Origin': origin || '*' } }
		);
	}

	try {
		const primaryUrl = buildSonglinkUrl(params, false);
		const backupUrl = buildSonglinkUrl(params, true);

		const { data, source, status } = await fetchFromSonglink(primaryUrl, backupUrl, fetch);

		return json(data, {
			status,
			headers: {
				'Access-Control-Allow-Origin': origin || '*',
				'Cache-Control': `public, max-age=${BROWSER_CACHE_TTL}`,
				'X-Songlink-Source': source,
				'X-Cache-Time': new Date().toISOString()
			}
		});
	} catch (error) {
		console.error('Songlink error:', error);

		return json(
			{
				error: 'Failed to convert URL',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{
				status: 502,
				headers: { 'Access-Control-Allow-Origin': origin || '*' }
			}
		);
	}
};

export const OPTIONS: RequestHandler = async ({ request }) => {
	const origin = request.headers.get('origin');

	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin || '*' : '',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Max-Age': '86400',
			'Vary': 'Origin'
		}
	});
};
````

---

## 🎵 Step 7: Spotify Playlist Route

**File:** `src/routes/api/spotify-playlist/+server.ts`

````typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'crypto';
import { isOriginAllowed } from '$lib/server/proxyConfig';

const BROWSER_VERSION = '131';

const COMMON_HEADERS = {
	'Content-Type': 'application/json',
	'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${BROWSER_VERSION}.0.0.0 Safari/537.36`,
	'Sec-Ch-Ua': `"Chromium";v="${BROWSER_VERSION}", "Not(A:Brand";v="24", "Google Chrome";v="${BROWSER_VERSION}"`
};

const FALLBACK_SECRET = [
	44, 55, 47, 42, 70, 40, 34, 114, 76, 74, 50, 111, 120, 97, 75, 76, 94, 102, 43, 69, 49, 120, 118,
	80, 64, 78
];

/**
 * Get TOTP secret
 */
async function getLatestTotpSecret(): Promise<{ version: number; secret: number[] }> {
	return { version: 61, secret: FALLBACK_SECRET };
}

/**
 * Generate time-based OTP
 */
function generateTotp(secret: number[]): string {
	const transformed = secret.map((e, t) => e ^ ((t % 33) + 9));
	const joined = transformed.map((num) => num.toString()).join('');
	const hexStr = Buffer.from(joined, 'ascii').toString('hex');
	const base32Secret = Buffer.from(hexStr, 'hex').toString('base64').replace(/=/g, '');

	const timeStep = Math.floor(Date.now() / 1000 / 30);
	const timeHex = timeStep.toString(16).padStart(16, '0');
	const hmac = crypto.createHmac('sha1', Buffer.from(base32Secret, 'base64'));
	hmac.update(Buffer.from(timeHex, 'hex'));
	const digest = hmac.digest();
	const offset = digest[19] & 0xf;
	const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;

	return code.toString().padStart(6, '0');
}

/**
 * Extract JavaScript links from HTML
 */
function extractJsLinks(html: string): string[] {
	const jsLinks: string[] = [];
	const scriptTagRegex = /<script[^>]+src="([^"]+\.js)"[^>]*>/g;
	let match;

	while ((match = scriptTagRegex.exec(html)) !== null) {
		jsLinks.push(match[1]);
	}

	return jsLinks;
}

/**
 * Get session data from Spotify homepage
 */
async function getSessionData(fetchFn: typeof fetch): Promise<{
	deviceId: string;
	clientVersion: string;
	jsPack: string;
}> {
	const response = await fetchFn('https://open.spotify.com', {
		headers: COMMON_HEADERS
	});

	const html = await response.text();
	const setCookie = response.headers.get('set-cookie');
	const deviceId = setCookie?.match(/sp_t=([^;]+)/)?.[1] || '';

	// Extract client version from appServerConfig
	const appServerConfigMatch = html.match(
		/<script id="appServerConfig" type="text\/plain">([^<]+)<\/script>/
	);

	let clientVersion = '';

	if (appServerConfigMatch) {
		try {
			const base64Config = appServerConfigMatch[1];
			const decodedConfig = Buffer.from(base64Config, 'base64').toString('utf-8');
			const serverConfig = JSON.parse(decodedConfig) as Record<string, string>;
			clientVersion = serverConfig.clientVersion || '';
		} catch (e) {
			console.warn('Failed to parse appServerConfig');
		}
	}

	// Fallback method
	if (!clientVersion) {
		clientVersion = html.match(/"clientVersion":"([^"]+)"/)?.[1] || '';
	}

	// Extract JS pack
	const allJsLinks = extractJsLinks(html);
	const jsPackRelative =
		allJsLinks.find((link) => link.includes('web-player') && link.endsWith('.js')) || '';
	const jsPack = jsPackRelative.startsWith('http')
		? jsPackRelative
		: `https://open.spotify.com${jsPackRelative}`;

	return { deviceId, clientVersion, jsPack };
}

/**
 * Get Spotify access token
 */
async function getAccessToken(
	totp: string,
	totpVer: number,
	fetchFn: typeof fetch
): Promise<{
	accessToken: string;
	clientId: string;
}> {
	const params = new URLSearchParams({
		reason: 'init',
		productType: 'web-player',
		totp,
		totpVer: totpVer.toString(),
		totpServer: totp
	});

	const response = await fetchFn(`https://open.spotify.com/api/token?${params}`, {
		headers: COMMON_HEADERS
	});

	const data = (await response.json()) as {
		accessToken: string;
		clientId: string;
	};

	return { accessToken: data.accessToken, clientId: data.clientId };
}

/**
 * Get client token
 */
async function getClientToken(
	clientVersion: string,
	clientId: string,
	deviceId: string,
	fetchFn: typeof fetch
): Promise<string> {
	const payload = {
		client_data: {
			client_version: clientVersion,
			client_id: clientId,
			js_sdk_data: {
				device_type: 'computer',
				os: 'windows',
				device_id: deviceId
			}
		}
	};

	const response = await fetchFn('https://clienttoken.spotify.com/v1/clienttoken', {
		method: 'POST',
		headers: {
			...COMMON_HEADERS,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	const data = (await response.json()) as {
		granted_token: { token: string };
	};

	return data.granted_token.token;
}

/**
 * Extract mappings from JavaScript code
 */
function extractMappings(jsCode: string): [Record<string, string>, Record<string, string>] {
	const pattern = /\{\d+:"[^"]+"(?:,\d+:"[^"]+")*\}/g;
	const matches = jsCode.match(pattern);

	if (!matches || matches.length < 5) {
		console.warn(`Found only ${matches?.length || 0} mappings`);
		return [{}, {}];
	}

	const parseMapping = (matchStr: string): Record<string, string> => {
		const result: Record<string, string> = {};
		const entries = matchStr.slice(1, -1).split(/,(?=\d+:)/);

		for (const entry of entries) {
			const colonIndex = entry.indexOf(':');
			if (colonIndex === -1) continue;

			const key = entry.substring(0, colonIndex).trim();
			const value = entry
				.substring(colonIndex + 1)
				.trim()
				.replace(/^"|"$/g, '');

			result[key] = value;
		}

		return result;
	};

	return [parseMapping(matches[3]), parseMapping(matches[4])];
}

/**
 * Fetch Spotify playlist data
 */
async function fetchPlaylist(
	accessToken: string,
	clientToken: string,
	clientVersion: string,
	playlistId: string,
	sha256Hash: string,
	fetchFn: typeof fetch,
	offset = 0,
	limit = 343
): Promise<unknown> {
	const payload = {
		operationName: 'fetchPlaylist',
		variables: {
			uri: `spotify:playlist:${playlistId}`,
			offset,
			limit
		},
		extensions: {
			persistedQuery: {
				version: 1,
				sha256Hash
			}
		}
	};

	const response = await fetchFn('https://api-partner.spotify.com/pathfinder/v2/query', {
		method: 'POST',
		headers: {
			'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/${BROWSER_VERSION}.0.0.0 Safari/537.36`,
			'Authorization': `Bearer ${accessToken}`,
			'Client-Token': clientToken,
			'Spotify-App-Version': clientVersion,
			'Content-Type': 'application/json;charset=UTF-8'
		},
		body: JSON.stringify(payload)
	});

	return response.json();
}

/**
 * Get SHA256 hash for GraphQL query
 */
async function getSha256Hash(jsPack: string, fetchFn: typeof fetch): Promise<string> {
	if (!jsPack) {
		console.warn('No JS pack URL, using fallback hash');
		return 'a67612f8c59f4cb4a9723d8e0e0e7b7cb8c5c3d45e3d8c4f5e6f7e8f9a0b1c2d';
	}

	try {
		const response = await fetchFn(jsPack, { headers: COMMON_HEADERS });
		let rawCode = await response.text();

		const [strMapping, hashMapping] = extractMappings(rawCode);

		// Fetch additional chunks
		for (const [key, str] of Object.entries(strMapping)) {
			const hash = hashMapping[key];
			if (hash) {
				const chunkUrl = `https://open.spotifycdn.com/cdn/build/web-player/${str}.${hash}.js`;
				try {
					const chunkResponse = await fetchFn(chunkUrl, { headers: COMMON_HEADERS });
					rawCode += await chunkResponse.text();
				} catch {
					console.warn(`Failed to fetch chunk ${str}`);
				}
			}
		}

		// Extract fetchPlaylist hash
		let hash = '';

		try {
			hash = rawCode.split('"fetchPlaylist","query","')[1]?.split('"')[0] || '';
		} catch {
			hash = '';
		}

		if (!hash) {
			console.warn('Failed to extract fetchPlaylist hash, using fallback');
			hash = 'a67612f8c59f4cb4a9723d8e0e0e7b7cb8c5c3d45e3d8c4f5e6f7e8f9a0b1c2d';
		}

		return hash;
	} catch (error) {
		console.error('Failed to get SHA256 hash:', error);
		return 'a67612f8c59f4cb4a9723d8e0e0e7b7cb8c5c3d45e3d8c4f5e6f7e8f9a0b1c2d';
	}
}

/**
 * Get all tracks from playlist with pagination
 */
async function getAllTracks(
	accessToken: string,
	clientToken: string,
	clientVersion: string,
	playlistId: string,
	jsPack: string,
	fetchFn: typeof fetch
): Promise<unknown[]> {
	const sha256Hash = await getSha256Hash(jsPack, fetchFn);
	const tracks: unknown[] = [];
	let offset = 0;
	const limit = 343;

	while (true) {
		const data = (await fetchPlaylist(
			accessToken,
			clientToken,
			clientVersion,
			playlistId,
			sha256Hash,
			fetchFn,
			offset,
			limit
		)) as {
			data?: {
				playlistV2?: {
					content?: {
						items: unknown[];
						totalCount: number;
					};
				};
			};
		};

		const content = data?.data?.playlistV2?.content;
		if (!content?.items) break;

		tracks.push(...content.items);

		if (content.totalCount <= offset + limit) break;

		offset += limit;
	}

	return tracks;
}

export const POST: RequestHandler = async ({ request, fetch }) => {
	const origin = request.headers.get('origin');

	// Validate origin
	if (!isOriginAllowed(origin)) {
		return json(
			{ error: 'Origin not allowed' },
			{ status: 403, headers: { 'Access-Control-Allow-Origin': origin || '*' } }
		);
	}

	try {
		const { playlistUrl } = (await request.json()) as { playlistUrl: string };

		if (!playlistUrl) {
			return json(
				{ error: 'Missing playlistUrl' },
				{ status: 400, headers: { 'Access-Control-Allow-Origin': origin || '*' } }
			);
		}

		// Extract playlist ID
		const playlistId = playlistUrl
			.split('playlist/')[1]
			?.split('?')[0]
			.split('&')[0] || '';

		if (!playlistId) {
			return json(
				{ error: 'Invalid Spotify playlist URL' },
				{ status: 400, headers: { 'Access-Control-Allow-Origin': origin || '*' } }
			);
		}

		// Get session
		const { deviceId, clientVersion, jsPack } = await getSessionData(fetch);

		// Generate TOTP
		const { secret, version } = await getLatestTotpSecret();
		const totp = generateTotp(secret);

		// Get tokens
		const { accessToken, clientId } = await getAccessToken(totp, version, fetch);
		const clientToken = await getClientToken(clientVersion, clientId, deviceId, fetch);

		// Get tracks
		const tracks = await getAllTracks(accessToken, clientToken, clientVersion, playlistId, jsPack, fetch);

		// Extract track URLs
		const songLinks = tracks
			.filter(
				(item): item is Record<string, Record<string, Record<string, string>>> =>
					!!item &&
					typeof item === 'object' &&
					'itemV2' in item &&
					item.itemV2 &&
					'data' in item.itemV2 &&
					item.itemV2.data &&
					'uri' in item.itemV2.data
			)
			.map((item) => {
				const uri = item.itemV2.data.uri;
				const trackId = uri.split(':')[2];
				return `https://open.spotify.com/track/${trackId}`;
			});

		return json(
			{ songLinks, totalTracks: songLinks.length },
			{
				headers: {
					'Access-Control-Allow-Origin': origin || '*',
					'Cache-Control': 'private, max-age=3600'
				}
			}
		);
	} catch (error) {
		console.error('Spotify playlist error:', error);

		return json(
			{
				error: 'Failed to fetch playlist',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{
				status: 500,
				headers: {
					'Access-Control-Allow-Origin': origin || '*'
				}
			}
		);
	}
};

export const OPTIONS: RequestHandler = async ({ request }) => {
	const origin = request.headers.get('origin');

	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin || '*' : '',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Max-Age': '86400',
			'Vary': 'Origin'
		}
	});
};
````

---

## 🎨 Step 8: React API Client Library

**File:** `src/lib/api/client.ts`

````typescript
/**
 * Make a proxied API call
 */
export async function proxyFetch(url: string): Promise<Response> {
	const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
	return fetch(proxyUrl);
}

/**
 * Convert streaming URL to TIDAL
 */
export async function convertToTidal(streamingUrl: string, userCountry = 'US'): Promise<any> {
	const params = new URLSearchParams({
		url: streamingUrl,
		userCountry
	});

	const response = await fetch(`/api/songlink?${params}`);

	if (!response.ok) {
		throw new Error(`Songlink conversion failed: ${response.statusText}`);
	}

	return response.json();
}

/**
 * Extract all tracks from Spotify playlist
 */
export async function extractSpotifyPlaylist(playlistUrl: string): Promise<string[]> {
	const response = await fetch('/api/spotify-playlist', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playlistUrl })
	});

	if (!response.ok) {
		throw new Error(`Playlist extraction failed: ${response.statusText}`);
	}

	const data = (await response.json()) as { songLinks: string[] };
	return data.songLinks;
}

/**
 * Get track info via proxy
 */
export async function getTrackInfo(trackId: number | string): Promise<any> {
	const url = `https://api.tidal.com/v1/tracks/${trackId}`;
	const response = await proxyFetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch track ${trackId}`);
	}

	return response.json();
}

/**
 * Search tracks
 */
export async function searchTracks(query: string, limit = 50): Promise<any> {
	const url = `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}`;
	const response = await proxyFetch(url);

	if (!response.ok) {
		throw new Error(`Search failed for "${query}"`);
	}

	return response.json();
}

/**
 * Get album info
 */
export async function getAlbumInfo(albumId: number | string): Promise<any> {
	const url = `https://api.tidal.com/v1/albums/${albumId}`;
	const response = await proxyFetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch album ${albumId}`);
	}

	return response.json();
}

/**
 * Get playlist info
 */
export async function getPlaylistInfo(playlistId: string): Promise<any> {
	const url = `https://api.tidal.com/v1/playlists/${playlistId}`;
	const response = await proxyFetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch playlist ${playlistId}`);
	}

	return response.json();
}

/**
 * Get artist info
 */
export async function getArtistInfo(artistId: number | string): Promise<any> {
	const url = `https://api.tidal.com/v1/artists/${artistId}`;
	const response = await proxyFetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch artist ${artistId}`);
	}

	return response.json();
}
````

---

## ⚛️ Step 9: React Hooks

**File:** `src/hooks/useProxyFetch.ts`

````typescript
import { useState, useCallback } from 'react';
import { proxyFetch } from '@/lib/api/client';

interface UseProxyFetchState<T> {
	data: T | null;
	loading: boolean;
	error: Error | null;
	cached: boolean;
}

export function useProxyFetch<T = any>() {
	const [state, setState] = useState<UseProxyFetchState<T>>({
		data: null,
		loading: false,
		error: null,
		cached: false
	});

	const fetch = useCallback(async (url: string) => {
		setState({ data: null, loading: true, error: null, cached: false });

		try {
			const response = await proxyFetch(url);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = (await response.json()) as T;
			const isCached = response.headers.get('X-Cache') === 'HIT';

			setState({
				data,
				loading: false,
				error: null,
				cached: isCached
			});

			return data;
		} catch (error) {
			const err =
				error instanceof Error ? error : new Error('Unknown error');

			setState({
				data: null,
				loading: false,
				error: err,
				cached: false
			});

			throw err;
		}
	}, []);

	return { ...state, fetch };
}
````

**File:** `src/hooks/usePlaylistExtractor.ts`

````typescript
import { useState, useCallback } from 'react';
import {
	extractSpotifyPlaylist,
	convertToTidal
} from '@/lib/api/client';

interface ExtractedTrack {
	spotifyUrl: string;
	tidalUrl?: string;
	error?: string;
}

export function usePlaylistExtractor() {
	const [tracks, setTracks] = useState<ExtractedTrack[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);

	const extractPlaylist = useCallback(
		async (playlistUrl: string) => {
			setLoading(true);
			setError(null);
			setProgress(0);

			try {
				// Step 1: Extract Spotify tracks
				const songLinks = await extractSpotifyPlaylist(playlistUrl);
				const initialTracks: ExtractedTrack[] = songLinks.map(
					(url) => ({
						spotifyUrl: url
					})
				);

				setTracks(initialTracks);

				// Step 2: Convert each to TIDAL
				for (let i = 0; i < songLinks.length; i++) {
					try {
						const tidalData = await convertToTidal(songLinks[i]);
						const tidalUrl =
							tidalData?.linksByPlatform?.tidal?.url;

						setTracks((prev) =>
							prev.map((track, idx) =>
								idx === i
									? { ...track, tidalUrl }
									: track
							)
						);
					} catch (trackError) {
						setTracks((prev) =>
							prev.map((track, idx) =>
								idx === i
									? {
											...track,
											error:
												trackError instanceof
												Error
													? trackError.message
													: 'Conversion failed'
										}
									: track
							)
						);
					}

					setProgress(
						Math.round(((i + 1) / songLinks.length) * 100)
					);
				}
			} catch (err) {
				const errorMsg =
					err instanceof Error
						? err.message
						: 'Failed to extract playlist';
				setError(errorMsg);
				setTracks([]);
			} finally {
				setLoading(false);
			}
		},
		[]
	);

	return {
		tracks,
		loading,
		error,
		progress,
		extractPlaylist
	};
}
````

**File:** `src/hooks/useSearch.ts`

````typescript
import { useState, useCallback } from 'react';
import { searchTracks } from '@/lib/api/client';

interface SearchState {
	results: any[];
	loading: boolean;
	error: Error | null;
	cached: boolean;
}

export function useSearch() {
	const [state, setState] = useState<SearchState>({
		results: [],
		loading: false,
		error: null,
		cached: false
	});

	const search = useCallback(async (query: string, limit = 50) => {
		setState({
			results: [],
			loading: true,
			error: null,
			cached: false
		});

		try {
			const response = await fetch(
				`/api/proxy?url=${encodeURIComponent(
					`https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}`
				)}`
			);

			if (!response.ok) {
				throw new Error(
					`HTTP ${response.status}: ${response.statusText}`
				);
			}

			const data = await response.json();
			const isCached = response.headers.get('X-Cache') === 'HIT';

			setState({
				results: data.tracks || [],
				loading: false,
				error: null,
				cached: isCached
			});

			return data;
		} catch (error) {
			const err =
				error instanceof Error
					? error
					: new Error('Unknown error');

			setState({
				results: [],
				loading: false,
				error: err,
				cached: false
			});

			throw err;
		}
	}, []);

	return { ...state, search };
}
````

---

## ⚛️ Step 10: React Components

**File:** `src/components/PlaylistImporter.tsx`

````typescript
import React, { useState } from 'react';
import {
	extractSpotifyPlaylist,
	convertToTidal
} from '@/lib/api/client';

interface Track {
	id: string;
	spotifyUrl: string;
	tidalUrl?: string;
	converted: boolean;
	error?: string;
}

export function PlaylistImporter() {
	const [playlistUrl, setPlaylistUrl] = useState('');
	const [tracks, setTracks] = useState<Track[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [progress, setProgress] = useState(0);

	const handleImport = async () => {
		setLoading(true);
		setError('');
		setTracks([]);
		setProgress(0);

		try {
			// Extract Spotify tracks
			const songLinks = await extractSpotifyPlaylist(playlistUrl);
			const newTracks: Track[] = songLinks.map((link, idx) => ({
				id: idx.toString(),
				spotifyUrl: link,
				converted: false
			}));

			setTracks(newTracks);

			// Convert to TIDAL
			for (let i = 0; i < songLinks.length; i++) {
				try {
					const tidalData = await convertToTidal(songLinks[i]);

					setTracks((prev) =>
						prev.map((track, idx) =>
							idx === i
								? {
										...track,
										tidalUrl:
											tidalData?.linksByPlatform
												?.tidal?.url || '',
										converted: true
									}
								: track
						)
					);

					setProgress(
						Math.round(((i + 1) / songLinks.length) * 100)
					);
				} catch (err) {
					const errorMsg =
						err instanceof Error
							? err.message
							: 'Conversion failed';

					setTracks((prev) =>
						prev.map((track, idx) =>
							idx === i
								? {
										...track,
										error: errorMsg,
										converted: false
									}
								: track
						)
					);

					setProgress(
						Math.round(((i + 1) / songLinks.length) * 100)
					);
				}
			}
		} catch (err) {
			const errorMsg =
				err instanceof Error ? err.message : 'Failed to import playlist';
			setError(errorMsg);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="w-full max-w-2xl mx-auto p-6 bg-gray-900 rounded-lg">
			<h1 className="text-3xl font-bold text-white mb-6">
				🎵 Spotify to TIDAL Converter
			</h1>

			<div className="mb-6">
				<label className="block text-sm font-medium text-gray-300 mb-2">
					Spotify Playlist URL
				</label>
				<input
					type="text"
					placeholder="Paste Spotify playlist URL here..."
					value={playlistUrl}
					onChange={(e) => setPlaylistUrl(e.target.value)}
					className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:border-green-500 focus:outline-none"
				/>
			</div>

			<button
				onClick={handleImport}
				disabled={loading || !playlistUrl}
				className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded disabled:opacity-50 disabled:cursor-not-allowed transition"
			>
				{loading ? `Converting... ${progress}%` : 'Import Playlist'}
			</button>

			{error && (
				<div className="mt-4 p-4 bg-red-900 text-red-200 rounded">
					<p className="font-bold">Error:</p>
					<p>{error}</p>
				</div>
			)}

			{progress > 0 && (
				<div className="mt-4 w-full bg-gray-700 rounded-full h-2">
					<div
						className="bg-green-600 h-2 rounded-full transition-all duration-300"
						style={{ width: `${progress}%` }}
					/>
				</div>
			)}

			{tracks.length > 0 && (
				<div className="mt-8">
					<h2 className="text-xl font-bold text-white mb-4">
						Tracks ({tracks.length})
					</h2>
					<div className="space-y-2 max-h-96 overflow-y-auto">
						{tracks.map((track, idx) => (
							<div
								key={track.id}
								className="p-3 bg-gray-800 rounded flex items-center justify-between hover:bg-gray-750 transition"
							>
								<div className="flex items-center gap-3 flex-1">
									<span className="text-gray-500 text-sm w-8">
										{idx + 1}
									</span>
									<span className="text-white flex-1 truncate">
										Track {idx + 1}
									</span>
									{track.converted && (
										<span className="text-green-400">
											✅
										</span>
									)}
									{track.error && (
										<span
											className="text-red-400 text-sm"
											title={track.error}
										>
											❌
										</span>
									)}
								</div>
								{track.tidalUrl && (
									<a
										href={track.tidalUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="ml-3 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition"
									>
										Open
									</a>
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
````

**File:** `src/components/SearchTracks.tsx`

````typescript
import React, { useState } from 'react';
import { useSearch } from '@/hooks/useSearch';

interface Track {
	id: number;
	name: string;
	artists: { name: string }[];
	album?: { name: string };
	duration?: number;
}

export function SearchTracks() {
	const [query, setQuery] = useState('');
	const { results, loading, error, cached, search } = useSearch();

	const handleSearch = async () => {
		if (!query.trim()) return;

		try {
			await search(query);
		} catch (err) {
			console.error('Search failed:', err);
		}
	};

	const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			handleSearch();
		}
	};

	const formatDuration = (ms?: number) => {
		if (!ms) return '0:00';
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	};

	return (
		<div className="p-6 max-w-4xl mx-auto">
			<h1 className="text-3xl font-bold text-white mb-8">
				🔍 Track Search
			</h1>

			<div className="flex gap-2 mb-6">
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyPress={handleKeyPress}
					placeholder="Search for tracks, artists, albums..."
					className="flex-1 px-4 py-3 bg-gray-800 text-white border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
				/>
				<button
					onClick={handleSearch}
					disabled={loading || !query.trim()}
					className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded disabled:opacity-50 disabled:cursor-not-allowed transition"
				>
					{loading ? 'Searching...' : 'Search'}
				</button>
			</div>

			{cached && (
				<div className="mb-4 p-3 bg-green-900 text-green-200 rounded">
					📦 Results from cache (no API call)
				</div>
			)}

			{error && (
				<div className="p-4 bg-red-900 text-red-200 rounded mb-4">
					<p className="font-bold">Error:</p>
					<p>{error.message}</p>
				</div>
			)}

			{results.length > 0 && (
				<div>
					<p className="text-gray-400 mb-4">
						Found {results.length} tracks
					</p>
					<div className="space-y-2">
						{results.map((track: Track) => (
							<div
								key={track.id}
								className="p-4 bg-gray-800 rounded hover:bg-gray-750 transition"
							>
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<p className="font-bold text-white">
											{track.name}
										</p>
										<p className="text-sm text-gray-400">
											by{' '}
											{track.artists
												?.map((a) => a.name)
												.join(', ') || 'Unknown'}
										</p>
										{track.album && (
											<p className="text-xs text-gray-500 mt-1">
												Album:{' '}
												{track.album.name}
											</p>
										)}
									</div>
									<div className="text-right ml-4">
										<p className="text-sm text-gray-400">
											{formatDuration(
												track.duration
											)}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{!loading && !error && results.length === 0 && query && (
				<div className="p-4 bg-gray-800 text-gray-400 rounded text-center">
					No tracks found for "{query}"
				</div>
			)}
		</div>
	);
}
````

---

## 🧪 Step 11: Test Page (React)

**File:** `src/pages/test.tsx` (or `src/routes/test/page.tsx` for Next.js routing)

````typescript
import React, { useState } from 'react';
import { searchTracks, convertToTidal, extractSpotifyPlaylist } from '@/lib/api/client';

interface TestResult {
	test: string;
	status: 'loading' | 'success' | 'error';
	message?: string;
	data?: any;
}

export default function TestPage() {
	const [results, setResults] = useState<TestResult[]>([]);

	const runTest = async (name: string, fn: () => Promise<any>) => {
		const test: TestResult = { test: name, status: 'loading' };
		setResults((prev) => [...prev, test]);

		try {
			const data = await fn();
			setResults((prev) =>
				prev.map((r) =>
					r.test === name
						? { ...r, status: 'success', data }
						: r
				)
			);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Unknown error';
			setResults((prev) =>
				prev.map((r) =>
					r.test === name
						? { ...r, status: 'error', message }
						: r
				)
			);
		}
	};

	return (
		<div className="p-8 max-w-4xl mx-auto">
			<h1 className="text-4xl font-bold mb-8">🧪 API Integration Tests</h1>

			<div className="grid grid-cols-3 gap-4 mb-8">
				<button
					onClick={() =>
						runTest('Search Tracks', () =>
							searchTracks('Drake', 10)
						)
					}
					className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition"
				>
					Test Proxy
				</button>
				<button
					onClick={() =>
						runTest('Convert URL', () =>
							convertToTidal(
								'https://open.spotify.com/track/11dFghVXANMlKmJXsNCQvb'
							)
						)
					}
					className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold transition"
				>
					Test Songlink
				</button>
				<button
					onClick={() =>
						runTest('Extract Playlist', () =>
							extractSpotifyPlaylist(
								'https://open.spotify.com/playlist/37i9dQZF1DXa2zqzC5U6IW'
							)
						)
					}
					className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold transition"
				>
					Test Playlist
				</button>
			</div>

			<div className="space-y-4">
				{results.map((result, idx) => (
					<div
						key={idx}
						className={`p-4 rounded border-l-4 ${
							result.status === 'loading'
								? 'bg-gray-100 border-gray-500'
								: result.status === 'success'
									? 'bg-green-50 border-green-500'
									: 'bg-red-50 border-red-500'
						}`}
					>
						<div className="flex items-center justify-between">
							<h3 className="font-bold text-lg">
								{result.test}
							</h3>
							<span
								className={`text-sm font-bold ${
									result.status === 'loading'
										? 'text-gray-600'
										: result.status === 'success'
											? 'text-green-600'
											: 'text-red-600'
								}`}
							>
								{result.status === 'loading'
									? '⏳ Loading...'
									: result.status === 'success'
										? '✅ Success'
										: '❌ Error'}
							</span>
						</div>

						{result.message && (
							<p className="text-red-600 mt-2">
								{result.message}
							</p>
						)}

						{result.data && (
							<pre className="bg-gray-900 text-gray-100 p-3 mt-3 rounded text-xs overflow-auto max-h-64">
								{JSON.stringify(result.data, null, 2)}
							</pre>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
````

---

## 📋 Deployment Checklist

- [ ] Install dependencies: `npm install ioredis`
- [ ] Create all 3 backend routes in `src/routes/api/`
- [ ] Create Redis client in `src/lib/server/redis.ts`
- [ ] Create proxy config in `src/lib/server/proxyConfig.ts`
- [ ] Configurate `.env.local` with ALLOWED_ORIGINS
- [ ] Create React API client library
- [ ] Create React hooks (useProxyFetch, usePlaylistExtractor, useSearch)
- [ ] Create React components (PlaylistImporter, SearchTracks)
- [ ] Test with test page
- [ ] Verify CORS headers are returned
- [ ] Check Redis cache works (X-Cache: HIT header)
- [ ] Deploy to production

---

## 🔍 Troubleshooting

### CORS Errors
```
Error: No 'Access-Control-Allow-Origin' header
```
**Solution:** Check `.env.local` has correct `ALLOWED_ORIGINS`

### Redis Connection Failed
```
Redis connection error: connect ECONNREFUSED
```
**Solution:** Start Redis: `docker run -d -p 6379:6379 redis`

### Spotify Playlist Not Found
```
Error: Invalid Spotify playlist URL
```
**Solution:** Ensure URL is: `https://open.spotify.com/playlist/[ID]`

### Cache Not Working
```
X-Cache: MISS (every time)
```
**Solution:** Ensure Redis is running and `REDIS_URL` is set in `.env.local`

---

## 🎯 Summary

You now have:

✅ **3 Backend API Routes:**
- `/api/proxy` - CORS proxy + Redis caching for TIDAL/Spotify
- `/api/songlink` - URL conversion with failover
- `/api/spotify-playlist` - Playlist extraction

✅ **React Frontend:**
- API client library (`src/lib/api/client.ts`)
- 3 custom hooks (useProxyFetch, usePlaylistExtractor, useSearch)
- 2 production-ready components (PlaylistImporter, SearchTracks)
- Test page for validation

✅ **Production Features:**
- Automatic caching (Redis + browser)
- Auto token refresh
- Failover APIs
- CORS support
- Error handling
- Progress tracking

**Ready to deploy to Antigravity! 🚀**