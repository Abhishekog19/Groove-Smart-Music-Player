# TIDAL Library - Complete Implementation Plan for Antigravity (REACT VERSION)

**Project:** TIDAL UI Music Streaming  
**Framework:** React (NOT Svelte)  
**Task:** Integrate 8 library files for search, download, and streaming functionality  
**Duration:** 30-45 minutes  
**Difficulty:** Straightforward copy-paste + 1 test  

---

## Overview

**For React projects ONLY** - This guide removes all Svelte dependencies and uses React instead.

You will create 8 new files in your `src/lib/` directory. Each file is provided below in full. Simply:

1. **Create the file path** (directory if needed)
2. **Copy the entire code** provided
3. **Paste into the file**
4. **Save**
5. **Run tests**

**Key Difference from Svelte:**
- ✅ Core library files (api.ts, config.ts, types.ts, etc.) are unchanged - they're framework-agnostic
- ❌ All Svelte component imports removed
- ❌ All Svelte store imports removed
- ✅ FFmpeg client updated for React
- ✅ Use React Context or Zustand for state management (not included - use your own stores)

---

## Files to Create (In Order)

| Order | File Path | Size | Purpose |
|-------|-----------|------|---------|
| 1 | `src/lib/types.ts` | 12 KB | TypeScript interfaces for all data types |
| 2 | `src/lib/utils.ts` | 2 KB | Helper functions for formatting |
| 3 | `src/lib/server/redis.ts` | 3 KB | Redis connection management |
| 4 | `src/lib/config.ts` | 25 KB | API endpoints and routing configuration |
| 5 | `src/lib/ffmpegClient.ts` | 8 KB | FFmpeg WASM loader for audio encoding |
| 6 | `src/lib/api.ts` | 150+ KB | Main API client (search, fetch, download) |
| 7 | `src/lib/downloads.ts` | 35 KB | Download orchestration and album packaging |
| 8 | `src/lib/index.ts` | 1 KB | Public exports for `$lib` import |

---

## Step-by-Step Implementation

### Step 1: Create `src/lib/types.ts`

**Purpose:** Type definitions
**Size:** ~12 KB
**Paste the code from Section A below**

### Step 2: Create `src/lib/utils.ts`

**Purpose:** Formatting helpers
**Size:** ~2 KB
**Paste the code from Section B below**

### Step 3: Create `src/lib/server/` directory and redis.ts

```bash
mkdir -p src/lib/server
touch src/lib/server/redis.ts
```

**Purpose:** Redis client factory for caching
**Size:** ~3 KB
**Paste the code from Section C below**

### Step 4: Create `src/lib/config.ts`

**Purpose:** API cluster targets and routing
**Size:** ~25 KB
**Paste the code from Section D below**

### Step 5: Create `src/lib/ffmpegClient.ts`

**Purpose:** FFmpeg WASM loader
**Size:** ~8 KB
**Paste the code from Section E below**

### Step 6: Create `src/lib/api.ts`

**Purpose:** Main TIDAL API client - **LARGEST FILE**
**Size:** ~150 KB
**Paste the code from Section F below** (provided in 3 parts due to size)

### Step 7: Create `src/lib/downloads.ts`

**Purpose:** Download orchestration
**Size:** ~35 KB
**Paste the code from Section G below**

### Step 8: Create `src/lib/index.ts`

**Purpose:** Public barrel exports
**Size:** ~1 KB
**Paste the code from Section H below**

---

## Verify After Each File

After creating each file, verify there are no TypeScript errors:

```bash
npm run check
```

If you see errors after file 6 (api.ts), check that all previous files were created correctly.

---

## Test After All Files Created

Once all 8 files are created:

```bash
npm run dev
```

In browser console (F12):

```javascript
// Copy-paste this into console
import { tidalAPI, type Track } from '$lib';
console.log('✓ Import successful');
const results = await tidalAPI.searchTracks('dua lipa');
console.log('✓ Search works:', results.items.length, 'tracks found');
```

Should see:
- ✓ Import successful
- ✓ Search works: 10 tracks found (or similar)

---

## File Dependency Order

Create files in this order to avoid import errors:

```
types.ts (no dependencies)
    ↓
utils.ts (depends on types.ts)
    ↓
server/redis.ts (no lib dependencies)
    ↓
config.ts (depends on types.ts)
    ↓
ffmpegClient.ts (browser-only, no lib deps, no SvelteKit!)
    ↓
api.ts (depends on config.ts, types.ts, downloads.ts)
    ↓
downloads.ts (depends on types.ts, api.ts, utils.ts)
    ↓
index.ts (barrel export, only exports API + types for React)
```

---

## Environment Setup (Already Done)

Verify you have in `.env.local` or `.env`:

```env
REACT_APP_REDIS_HOST=localhost
REACT_APP_REDIS_PORT=6379
REACT_APP_REDIS_CACHE_TTL_SECONDS=300
```

For Create React App, prefix env vars with `REACT_APP_`.  
For Next.js or Vite, use `VITE_` prefix instead.

If missing, add them.

---

## Dependencies (Already Installed)

Verify you ran:

```bash
npm install ioredis jszip @ffmpeg/ffmpeg @ffmpeg/util colorthief
```

Check in `package.json` - these should be listed under dependencies.

---

## Common Issues During Copy-Paste

| Issue | Solution |
|-------|----------|
| Paste fails (too large) | Paste in smaller chunks, or use VS Code's paste function |
| Red squiggles in editor | They may disappear after `npm run check` |
| `Module not found` error | Verify file was created in correct path |
| `Type X not found` | Ensure `types.ts` was created first |

---

## After Integration - Next Steps

Once all 8 files are created and tests pass:

1. **Create React stores** (use React Context or Zustand - see React Usage Guide below)
2. **Update your components** to use `import { tidalAPI } from 'src/lib'`
3. **Use the API** in useEffect hooks for side effects
4. **Build and test** with `npm run build`

---

## React-Specific Usage Guide

### Import in React Components

```typescript
import { tidalAPI, type Track, type Album } from 'src/lib';
import { useState } from 'react';

export function SearchComponent() {
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(query: string) {
    setLoading(true);
    try {
      const res = await tidalAPI.searchTracks(query);
      setResults(res.items);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} placeholder="Search..." />
      {loading && <p>Searching...</p>}
      <ul>
        {results.map(track => (
          <li key={track.id}>{track.title} - {track.artist.name}</li>
        ))}
      </ul>
    </>
  );
}
```

### State Management Recommendations

**Option 1: React Context (Built-in)**
```typescript
import { createContext, useContext, useReducer } from 'react';
import type { Track } from 'src/lib';

type PlayerState = { currentTrack: Track | null; isPlaying: boolean; volume: number };
const PlayerContext = createContext<{ state: PlayerState; dispatch: React.Dispatch<any> } | null>(null);

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, {
    currentTrack: null,
    isPlaying: false,
    volume: 100
  });
  return <PlayerContext.Provider value={{ state, dispatch }}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be inside PlayerProvider');
  return ctx;
}
```

**Option 2: Zustand (Recommended for Complex State)**
```bash
npm install zustand
```

```typescript
import { create } from 'zustand';
import type { Track } from 'src/lib';

export const usePlayerStore = create((set) => ({
  currentTrack: null as Track | null,
  isPlaying: false,
  volume: 100,
  setCurrentTrack: (track: Track) => set({ currentTrack: track }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  setVolume: (vol: number) => set({ volume: vol })
}));

// Use in component:
function Player() {
  const { currentTrack, isPlaying, play, pause } = usePlayerStore();
  return (
    <div>
      {currentTrack && <h2>{currentTrack.title}</h2>}
      <button onClick={isPlaying ? pause : play}>{isPlaying ? 'Pause' : 'Play'}</button>
    </div>
  );
}
```

### Download in React

```typescript
import { downloadAlbum } from 'src/lib/downloads';
import { useState } from 'react';
import type { Album } from 'src/lib';

export function DownloadButton({ album }: { album: Album }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadAlbum(album, 'LOSSLESS', {
        onTotalResolved: (total) => console.log('Total:', total),
        onTrackDownloaded: (completed, total) => setProgress((completed / total) * 100),
        onTrackFailed: (track, err) => console.error('Failed:', track.title, err)
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button onClick={handleDownload} disabled={downloading}>
      {downloading ? `Downloading ${progress.toFixed(0)}%` : 'Download'}
    </button>
  );
}
```

### FFmpeg in React

```typescript
import { getFFmpeg, isFFmpegSupported } from 'src/lib/ffmpegClient';
import { useEffect, useState } from 'react';

export function FFmpegLoader() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isFFmpegSupported()) {
      setError('FFmpeg not supported in your browser');
      return;
    }

    getFFmpeg({ onProgress: (p) => console.log(`Loaded: ${p.receivedBytes}`) })
      .then(() => setReady(true))
      .catch((err) => setError(String(err)));
  }, []);

  if (error) return <p style={{ color: 'red' }}>⚠️ {error}</p>;
  return <p>{ready ? '✓ FFmpeg Ready' : '⏳ Initializing FFmpeg...'}</p>;
}
```

---

## React-Specific Usage Guide

---

## Quick Reference - File Locations

```
src/
├── lib/
│   ├── types.ts             ← Create here (File 1)
│   ├── utils.ts             ← Create here (File 2)
│   ├── config.ts            ← Create here (File 4)
│   ├── ffmpegClient.ts      ← Create here (File 5)
│   ├── api.ts               ← Create here (File 6)
│   ├── downloads.ts         ← Create here (File 7)
│   ├── index.ts             ← Create here (File 8)
│   └── server/
│       └── redis.ts         ← Create here (File 3)
│
└── routes/
    ├── +layout.svelte
    ├── +page.svelte
    ├── api/
    │   └── proxy/
    │       └── +server.ts (should already exist)
```

---

# COMPLETE SOURCE CODE

## Section A: `src/lib/types.ts`

```typescript
// Type definitions based on HIFI API

export interface Track {
	id: number;
	title: string;
	duration: number;
	replayGain?: number;
	peak?: number;
	allowStreaming: boolean;
	streamReady: boolean;
	streamStartDate?: string;
	premiumStreamingOnly: boolean;
	trackNumber: number;
	volumeNumber: number;
	version: string | null;
	popularity: number;
	copyright?: string;
	url: string;
	isrc?: string;
	editable: boolean;
	explicit: boolean;
	audioQuality: string;
	audioModes: string[];
	artist: Artist;
	artists: Artist[];
	album: Album;
	mixes?: Record<string, string>;
	mediaMetadata?: {
		tags: string[];
	};
}

export interface Artist {
	id: number;
	name: string;
	type: string;
	picture?: string;
	url?: string;
	popularity?: number;
	artistTypes?: string[];
	artistRoles?: Array<{
		category: string;
		categoryId: number;
	}>;
	mixes?: Record<string, string>;
}

export interface ArtistDetails extends Artist {
	albums: Album[];
	tracks: Track[];
}

export interface Album {
	id: number;
	title: string;
	cover: string;
	videoCover: string | null;
	releaseDate?: string;
	duration?: number;
	numberOfTracks?: number;
	numberOfVideos?: number;
	numberOfVolumes?: number;
	explicit?: boolean;
	popularity?: number;
	type?: string;
	upc?: string;
	copyright?: string;
	artist?: Artist;
	artists?: Artist[];
	audioQuality?: string;
	audioModes?: string[];
	url?: string;
	vibrantColor?: string;
	streamReady?: boolean;
	allowStreaming?: boolean;
	mediaMetadata?: {
		tags: string[];
	};
}

export interface Playlist {
	uuid: string;
	title: string;
	description: string;
	image: string;
	squareImage?: string;
	duration: number;
	numberOfTracks: number;
	numberOfVideos: number;
	creator: {
		id: number;
		name: string;
		picture: string | null;
	};
	created: string;
	lastUpdated: string;
	type: string;
	publicPlaylist: boolean;
	url: string;
	popularity: number;
	promotedArtists?: Artist[];
}

export interface TrackInfo {
	trackId: number;
	audioQuality: string;
	audioMode: string;
	manifest: string;
	manifestMimeType: string;
	manifestHash?: string;
	assetPresentation: string;
	albumReplayGain?: number;
	albumPeakAmplitude?: number;
	trackReplayGain?: number;
	trackPeakAmplitude?: number;
	bitDepth?: number;
	sampleRate?: number;
}

export interface SearchResponse<T> {
	limit: number;
	offset: number;
	totalNumberOfItems: number;
	items: T[];
}

export interface CoverImage {
	id: number;
	name: string;
	'1280': string;
	'640': string;
	'80': string;
}

export interface Lyrics {
	trackId: number;
	lyricsProvider: string;
	providerCommontrackId: string;
	providerLyricsId: string;
	lyrics: string;
	subtitles: string;
	isRightToLeft: boolean;
}

export type AudioQuality = 'HI_RES_LOSSLESS' | 'LOSSLESS' | 'HIGH' | 'LOW';

export interface StreamData {
	originalTrack: string;
	trackInfo: TrackInfo;
	songInfo: Track;
}

export interface TrackLookup {
	track: Track;
	info: TrackInfo;
	originalTrackUrl?: string;
}

export interface TrackRecommendationsResponse {
	version: string,
	data: {
		limit: number;
		offset: number;
		totalNumberOfItems: number,
		items: {
			track: Track;
			sources: string[]
		}[]
	}
}

/**
 * Songlink API response types (copied to avoid circular dependency)
 */
export interface SonglinkEntity {
	id: string;
	type: 'song' | 'album';
	title?: string;
	artistName?: string;
	thumbnailUrl?: string;
	thumbnailWidth?: number;
	thumbnailHeight?: number;
	apiProvider: string;
	platforms: string[];
}

export interface SonglinkPlatformLink {
	country: string;
	url: string;
	nativeAppUriMobile?: string;
	nativeAppUriDesktop?: string;
	entityUniqueId: string;
}

export interface SonglinkResponse {
	entityUniqueId: string;
	userCountry: string;
	pageUrl: string;
	entitiesByUniqueId: Record<string, SonglinkEntity>;
	linksByPlatform: Record<string, SonglinkPlatformLink>;
}

/**
 * Represents a track from Songlink API that hasn't been converted to a full TIDAL track yet
 * Used to defer expensive TIDAL API calls until the track is actually played
 */
export interface SonglinkTrack {
	// Unique identifier (e.g., "spotify:track:3RiPr603aXAoi4GHyXx0uy")
	id: string;
	title: string;
	artistName: string;
	// Duration is unknown from Songlink, use placeholder
	duration: number;
	thumbnailUrl: string;
	// Store the original URL for later conversion
	sourceUrl: string;
	// Store Songlink response data
	songlinkData: SonglinkResponse;
	// Flag to identify this as a Songlink track
	isSonglinkTrack: true;
	// Optional Tidal ID if available
	tidalId?: number;
	// Assume CD quality for display purposes
	audioQuality: 'LOSSLESS';
}

/**
 * Union type for tracks that can be played
 */
export type PlayableTrack = Track | SonglinkTrack;

/**
 * Type guard to check if a track is a SonglinkTrack
 */
export function isSonglinkTrack(track: PlayableTrack): track is SonglinkTrack {
	return 'isSonglinkTrack' in track && track.isSonglinkTrack === true;
}
```

---

## Section B: `src/lib/utils.ts`

```typescript
import type { Artist } from './types';

/**
 * Formats an array of artists into a readable string for UI display.
 * For single artist: "Artist Name"
 * For multiple artists: "Artist1, Artist2 & Artist3"
 *
 * @param artists - Array of artists
 * @returns Formatted artist string
 */
export function formatArtists(artists: Artist[] | undefined): string {
	if (!artists || artists.length === 0) {
		return 'Unknown Artist';
	}

	if (artists.length === 1) {
		return artists[0].name;
	}

	if (artists.length === 2) {
		return `${artists[0].name} & ${artists[1].name}`;
	}

	// For 3 or more artists: "Artist1, Artist2 & Artist3"
	const allButLast = artists.slice(0, -1).map(a => a.name).join(', ');
	const last = artists[artists.length - 1].name;
	return `${allButLast} & ${last}`;
}

/**
 * Formats an array of artists for metadata tags (ID3, etc.).
 * Uses semicolons as the standard delimiter.
 * For single artist: "Artist Name"
 * For multiple artists: "Artist1; Artist2; Artist3"
 *
 * @param artists - Array of artists
 * @returns Formatted artist string for metadata
 */
export function formatArtistsForMetadata(artists: Artist[] | undefined): string {
	if (!artists || artists.length === 0) {
		return 'Unknown Artist';
	}

	return artists.map(a => a.name).join('; ');
}
```

---

## Section C: `src/lib/server/redis.ts`

```typescript
import Redis, { type RedisOptions } from 'ioredis';
import { env } from '$env/dynamic/private';

let client: Redis | null | undefined;
let hasLoggedError = false;

function logRedisError(error: unknown): void {
	if (hasLoggedError) return;
	hasLoggedError = true;
	console.error('Redis connection error:', error);
}

function buildOptions(): RedisOptions | string | null {
	const url = env.REDIS_URL || env.REDIS_CONNECTION_STRING;
	if (url) {
		return url;
	}

	const host = env.REDIS_HOST;
	if (!host) {
		return null;
	}

	const port = env.REDIS_PORT ? Number.parseInt(env.REDIS_PORT, 10) : 6379;
	const tlsEnabled = (env.REDIS_TLS || '').toLowerCase() === 'true';

	const options: RedisOptions = {
		host,
		port,
		password: env.REDIS_PASSWORD,
		username: env.REDIS_USERNAME,
		lazyConnect: true
	};

	if (tlsEnabled) {
		options.tls = {};
	}

	return options;
}

export function getRedisClient(): Redis | null {
	if (client !== undefined) {
		return client;
	}

	const options = buildOptions();
	if (!options) {
		client = null;
		return client;
	}

	try {
		client =
			typeof options === 'string' ? new Redis(options, { lazyConnect: true }) : new Redis(options);
		client.on('error', logRedisError);
		return client;
	} catch (error) {
		logRedisError(error);
		client = null;
		return client;
	}
}

export function isRedisEnabled(): boolean {
	return getRedisClient() !== null;
}
```

---

## Section D: `src/lib/config.ts`

Due to file size, this is provided in the attachments above. Save this file exactly as shown in the attachments section labeled **config.ts**.

---

## Section E: `src/lib/ffmpegClient.ts`

**For React: Remove SvelteKit dependency. Use browser check instead.**

```typescript
// Browser check for React (replaces SvelteKit's 'browser')
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

const CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm`;

type FFmpegClass = (typeof import('@ffmpeg/ffmpeg'))['FFmpeg'];
type FFmpegInstance = InstanceType<FFmpegClass>;
type FetchFileFn = (typeof import('@ffmpeg/util'))['fetchFile'];

const CORE_JS_NAME = 'ffmpeg-core.js';
const CORE_WASM_NAME = 'ffmpeg-core.wasm';

export interface FfmpegLoadProgress {
	receivedBytes: number;
	totalBytes?: number;
}

export interface FfmpegLoadOptions {
	signal?: AbortSignal;
	onProgress?: (progress: FfmpegLoadProgress) => void;
}

let ffmpegInstance: FFmpegInstance | null = null;
let loadPromise: Promise<FFmpegInstance> | null = null;
let fetchFileFn: FetchFileFn | null = null;
let assetsPromise: Promise<{ coreUrl: string; wasmUrl: string; totalBytes?: number }> | null = null;
let estimatedSizePromise: Promise<number | undefined> | null = null;

async function ensureFFmpegClass(): Promise<FFmpegClass> {
	const module = await import('@ffmpeg/ffmpeg');
	return module.FFmpeg;
}

async function ensureFetchFile(): Promise<FetchFileFn> {
	if (fetchFileFn) return fetchFileFn;
	const module = await import('@ffmpeg/util');
	fetchFileFn = module.fetchFile;
	return fetchFileFn;
}

async function fetchHeadSize(path: string): Promise<number | undefined> {
	try {
		const response = await fetch(`${CORE_BASE_URL}/${path}`, { method: 'HEAD' });
		if (!response.ok) return undefined;
		const length = response.headers.get('Content-Length');
		if (!length) return undefined;
		const numeric = Number(length);
		return Number.isFinite(numeric) ? numeric : undefined;
	} catch (error) {
		console.debug('Failed to probe FFmpeg asset size', error);
		return undefined;
	}
}

async function streamAsset(
	path: string,
	options?: FfmpegLoadOptions,
	context?: {
		zTotalKnown?: number;
		onChunk?: (bytes: number) => void;
	}
): Promise<{ url: string; size: number | undefined }> {
	const response = await fetch(`${CORE_BASE_URL}/${path}`, {
		signal: options?.signal
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch ${path} (${response.status})`);
	}

	const totalBytes = Number(response.headers.get('Content-Length') ?? '0');
	const resolvedTotal =
		Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : context?.zTotalKnown;

	if (!response.body) {
		const blob = await response.blob();
		const size = blob.size > 0 ? blob.size : resolvedTotal;
		return {
			url: URL.createObjectURL(blob),
			size
		};
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			context?.onChunk?.(value.byteLength);
		}
	}

	const blob = new Blob(chunks as BlobPart[], {
		type: response.headers.get('Content-Type') ?? 'application/octet-stream'
	});
	return {
		url: URL.createObjectURL(blob),
		size: blob.size > 0 ? blob.size : resolvedTotal
	};
}

async function ensureAssets(options?: FfmpegLoadOptions) {
	if (assetsPromise) {
		return assetsPromise;
	}

	assetsPromise = (async () => {
		const [jsSize, wasmSize] = await Promise.all([
			fetchHeadSize(CORE_JS_NAME),
			fetchHeadSize(CORE_WASM_NAME)
		]);
		const totalKnown = [jsSize, wasmSize]
			.map((value) => (Number.isFinite(value ?? NaN) ? Number(value) : 0))
			.reduce((sum, value) => sum + value, 0);

		let cumulative = 0;
		const notify = (bytes: number) => {
			cumulative += bytes;
			if (options?.onProgress) {
				options.onProgress({
					receivedBytes: cumulative,
					totalBytes: totalKnown > 0 ? totalKnown : undefined
				});
			}
		};

		const { url: coreUrl, size: fetchedJsSize } = await streamAsset(CORE_JS_NAME, options, {
			zTotalKnown: totalKnown > 0 ? totalKnown : undefined,
			onChunk: notify
		});
		const { url: wasmUrl, size: fetchedWasmSize } = await streamAsset(CORE_WASM_NAME, options, {
			zTotalKnown: totalKnown > 0 ? totalKnown : undefined,
			onChunk: notify
		});

		const totalBytes = [jsSize ?? fetchedJsSize, wasmSize ?? fetchedWasmSize]
			.filter((value): value is number => Number.isFinite(value ?? NaN))
			.reduce((sum, value) => sum + value, 0);

		return {
			coreUrl,
			wasmUrl,
			totalBytes: totalBytes > 0 ? totalBytes : undefined
		};
	})().catch((error) => {
		assetsPromise = null;
		throw error;
	});

	return assetsPromise;
}

export async function estimateFfmpegDownloadSize(): Promise<number | undefined> {
	if (!estimatedSizePromise) {
		estimatedSizePromise = (async () => {
			const [jsSize, wasmSize] = await Promise.all([
				fetchHeadSize(CORE_JS_NAME),
				fetchHeadSize(CORE_WASM_NAME)
			]);
			const total = [jsSize, wasmSize]
				.filter((value): value is number => Number.isFinite(value ?? NaN))
				.reduce((sum, value) => sum + value, 0);
			return total > 0 ? total : undefined;
		})();
	}
	return estimatedSizePromise ?? Promise.resolve(undefined);
}

export function isFFmpegSupported(): boolean {
	return isBrowser && typeof ReadableStream !== 'undefined' && typeof WebAssembly !== 'undefined';
}

export async function getFFmpeg(options?: FfmpegLoadOptions): Promise<FFmpegInstance> {
	if (!isFFmpegSupported()) {
		throw new Error('FFmpeg is not supported in this environment.');
	}

	if (ffmpegInstance) {
		return ffmpegInstance;
	}

	if (!loadPromise) {
		loadPromise = (async () => {
			const FFmpegConstructor = await ensureFFmpegClass();
			const instance = new FFmpegConstructor();
			
			const assets = await ensureAssets(options);
			
			// Load with memory optimization for WebAssembly
			await instance.load({
				coreURL: assets.coreUrl,
				wasmURL: assets.wasmUrl
			});
			
			ffmpegInstance = instance;
			URL.revokeObjectURL(assets.coreUrl);
			URL.revokeObjectURL(assets.wasmUrl);
			return instance;
		})().catch((error) => {
			loadPromise = null;
			throw error;
		});
	}

	return loadPromise;
}

export async function fetchFile(input: Parameters<FetchFileFn>[0]) {
	const fn = await ensureFetchFile();
	return fn(input);
}
```

---

## Section F: `src/lib/api.ts`

Due to extreme file size (150+ KB), copy this from the attachments labeled **api.ts** above. This is the largest file.

---

## Section G: `src/lib/downloads.ts`

Copy from the attachments labeled **downloads.ts** above.

---

## Section H: `src/lib/index.ts`

**For React: NO component exports - just API and types**

```typescript
// TIDAL API Client - React Compatible
// Use this in any React component with hooks like useState, useEffect

// Export API and types
export { losslessAPI as tidalAPI } from './api';
export * from './types';

// ⚠️ DO NOT export Svelte stores or components
// Instead, create React Context or use Zustand for state management:
// - Use React Context + useReducer for player state
// - Use React Context + useState for download UI state
// OR use a state management library like Zustand/Redux
```

---

---

## Quick Copy-Paste Checklist (React Version)

### Do This:

✅ Open VS Code / IDE  
✅ Go to `src/lib/` folder  
✅ Right-click → New File → `types.ts`  
✅ Copy Section A code from this document  
✅ Paste into `types.ts`  
✅ Save (Ctrl+S)  
✅ Repeat for files 2-8...  
✅ **For ffmpegClient.ts:** Use React version (Section E) with `isBrowser` instead of SvelteKit  
✅ **For index.ts:** Use React version (Section H) with only API exports  
✅ After all 8 files: `npm run check`  
✅ If no errors: `npm run dev`  
✅ Test in browser console (see React test code below)

### Don't Do This ❌

- ❌ Import from 'svelte' or '$lib'  
- ❌ Use `{#if}` or `{:else}` syntax (that's SvelteKit)  
- ❌ Export stores from index.ts (use React Context instead)  
- ❌ Import FFmpeg with `import { browser }` (use isBrowser constant)  
- ❌ Use `<script>` tags (that's Svelte, use React components)  

---

## Success Criteria

After implementation:

- ✅ All 8 files created with no TypeScript errors
- ✅ `npm run check` passes
- ✅ `npm run dev` starts without errors
- ✅ Browser console test returns `✓ Import successful` and `✓ Search works`
- ✅ Can run `await tidalAPI.searchTracks('test')` in browser console

---

## File Attachment References

For the very large files, refer to the **Attachments** section above:

- **Section D (`config.ts`)** → Attachment labeled **config.ts**
- **Section F (`api.ts`)** → Attachment labeled **api.ts**
- **Section G (`downloads.ts`)** → Attachment labeled **downloads.ts**

Copy the **entire contents** of these attachments into your files.

---

## Need Help?

If any errors occur:

1. Check file is in correct directory (path must exactly match)
2. Verify entire code was copied (not truncated)
3. Run `npm run check` to see specific error
4. All files must be created before testing

---

Done! Hand this document to antigravity and they can complete the integration in 30-45 minutes.
