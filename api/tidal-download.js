/**
 * Vercel Serverless Function: /api/tidal-download
 * Handles /api/tidal-download/search and /api/tidal-download/resolve
 * using V2 TIDAL proxy mirrors (server-side, no CORS issues).
 *
 * Routes:
 *   GET /api/tidal-download/search?q=...&limit=...  → search results
 *   GET /api/tidal-download/resolve?title=...&artist=...&isrc=...&quality=... → stream URL
 */

const APP_VERSION = '1.0.0';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const V2_TARGETS = [
  { name: 'squid-api',    baseUrl: 'https://triton.squid.wtf' },
  { name: 'spotisaver-1', baseUrl: 'https://hifi-one.spotisaver.net' },
  { name: 'spotisaver-2', baseUrl: 'https://hifi-two.spotisaver.net' },
  { name: 'kinoplus',     baseUrl: 'https://tidal.kinoplus.online' },
  { name: 'hund',         baseUrl: 'https://hund.qqdl.site' },
  { name: 'katze',        baseUrl: 'https://katze.qqdl.site' },
  { name: 'maus',         baseUrl: 'https://maus.qqdl.site' },
  { name: 'vogel',        baseUrl: 'https://vogel.qqdl.site' },
  { name: 'wolf',         baseUrl: 'https://wolf.qqdl.site' },
  { name: 'monochrome',   baseUrl: 'https://arran.monochrome.tf' },
];

const FALLBACK_BASE = 'https://tidal.401658.xyz';

function buildHeaders(target) {
  const headers = { Accept: 'application/json', 'User-Agent': BROWSER_UA };
  const isCustom =
    !target.baseUrl.includes('tidal.com') && !target.baseUrl.includes('monochrome.tf');
  if (isCustom) headers['X-Client'] = `BiniLossless/${APP_VERSION}`;
  return headers;
}

function selectTarget() {
  return V2_TARGETS[Math.floor(Math.random() * V2_TARGETS.length)];
}

async function fetchV2(path, maxAttempts = 10) {
  const tried = new Set();
  let lastError = null;

  for (let i = 0; i < maxAttempts; i++) {
    const remaining = V2_TARGETS.filter((t) => !tried.has(t.name));
    if (remaining.length === 0) break;
    const target = remaining[Math.floor(Math.random() * remaining.length)];
    tried.add(target.name);

    const url = `${target.baseUrl.replace(/\/+$/, '')}${path}`;
    try {
      const r = await fetch(url, {
        headers: buildHeaders(target),
        signal: AbortSignal.timeout(8000),  // 5s per mirror (was 12s) — fits 6 mirrors in 30s
      });
      if (r.ok) return { response: r, target };
      console.warn(`[tidal-v2] ${target.name} returned ${r.status} for ${path}`);
      lastError = new Error(`${target.name}: HTTP ${r.status}`);
    } catch (err) {
      console.warn(`[tidal-v2] ${target.name} failed: ${err.message}`);
      lastError = err;
    }
  }

  // Last resort fallback
  try {
    const url = `${FALLBACK_BASE}${path}`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { response: r, target: { name: 'fallback', baseUrl: FALLBACK_BASE } };
  } catch (err) {
    console.warn(`[tidal-v2] Fallback also failed: ${err.message}`);
  }

  throw lastError || new Error('All TIDAL proxy mirrors failed');
}

function findItems(obj, visited = new WeakSet()) {
  if (!obj || typeof obj !== 'object') return null;
  if (visited.has(obj)) return null;
  visited.add(obj);
  if (Array.isArray(obj.items)) return obj.items;
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      const found = findItems(val, visited);
      if (found) return found;
    }
  }
  return null;
}

// ─── Route handlers ──────────────────────────────────────────────────────────

async function handleSearch(req, res) {
  const { q, limit = '20' } = req.query;
  if (!q || !String(q).trim()) {
    return res.status(400).json({ error: 'Missing required query param: q' });
  }

  try {
    const path = `/search/?s=${encodeURIComponent(String(q).trim())}`;
    const { response, target } = await fetchV2(path);
    const data = await response.json();
    const items = findItems(data) || [];

    const searchLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const results = items.slice(0, searchLimit).map((track) => {
      const artistName =
        track.artists?.map((a) => a.name).filter(Boolean).join(', ') ||
        track.artist?.name ||
        '';
      const albumTitle = track.album?.title || '';
      const albumCover = track.album?.cover
        ? `https://resources.tidal.com/images/${track.album.cover.replace(/-/g, '/')}/640x640.jpg`
        : null;
      return {
        id: track.id,
        title: track.title || '',
        artist: artistName,
        album: albumTitle,
        albumArt: albumCover,
        durationMs: (track.duration || 0) * 1000,
        isrc: track.isrc || null,
      };
    });

    console.log(`[tidal-download/search] "${q}" via ${target.name} → ${results.length} results`);
    return res.json({ results });
  } catch (err) {
    console.error('[tidal-download/search] Failed:', err.message);
    return res.status(502).json({ error: 'TIDAL search failed', details: err.message });
  }
}

async function handleResolve(req, res) {
  const { title, artist, isrc, quality = 'LOSSLESS' } = req.query;
  if (!title || !artist) {
    return res.status(400).json({ error: 'Missing required params: title, artist' });
  }

  try {
    // Search for the track
    const query = isrc || `${title} ${artist}`.trim();
    const searchPath = `/search/?s=${encodeURIComponent(query)}`;
    const { response: searchRes, target: searchTarget } = await fetchV2(searchPath);
    const searchData = await searchRes.json();
    const items = findItems(searchData) || [];

    if (items.length === 0) {
      return res.status(404).json({ error: `No TIDAL results for: "${query}"` });
    }

    const best =
      items.find((t) => t.title?.toLowerCase() === String(title).toLowerCase()) || items[0];
    const trackId = best.id;

    // Get stream URL
    const qualityMap = { LOSSLESS: 'LOSSLESS', HI_RES: 'HI_RES_LOSSLESS', HIGH: 'HIGH', LOW: 'LOW' };
    const tidalQuality = qualityMap[quality] || 'LOSSLESS';
    const streamPath = `/track/?id=${trackId}&quality=${tidalQuality}`;
    const { response: streamRes, target: streamTarget } = await fetchV2(streamPath);
    const streamData = await streamRes.json();

    // Extract stream URL from response
    const container = streamData?.data ?? streamData;
    let streamUrl = container?.url || container?.urls?.[0] || null;

    // Try manifest if no direct URL
    if (!streamUrl && container?.manifest) {
      try {
        let m = container.manifest.replace(/-/g, '+').replace(/_/g, '/');
        const pad = m.length % 4;
        if (pad === 2) m += '==';
        if (pad === 3) m += '=';
        const decoded = Buffer.from(m, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        streamUrl = parsed?.urls?.[0] || null;
      } catch { /* not JSON manifest */ }
    }

    if (!streamUrl) {
      return res.status(502).json({ error: `No stream URL found for track ${trackId}` });
    }

    const format = tidalQuality.includes('LOSSLESS') ? 'flac' : 'm4a';
    console.log(`[tidal-download/resolve] ✓ "${best.title}" via ${searchTarget.name}+${streamTarget.name}`);

    return res.json({
      streamUrl,
      tidalTrackId: trackId,
      title: best.title || title,
      artist: best.artists?.map((a) => a.name).join(', ') || artist,
      album: best.album?.title || '',
      durationMs: (best.duration || 0) * 1000,
      format,
      quality: tidalQuality,
    });
  } catch (err) {
    console.error('[tidal-download/resolve] Failed:', err.message);
    return res.status(502).json({ error: 'Failed to resolve TIDAL stream', details: err.message });
  }
}

// ─── Main handler (Vercel routes all /api/tidal-download/* here) ─────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Vercel passes the full path as req.url — extract the sub-path
  // e.g. /api/tidal-download/search → /search
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname; // e.g. /api/tidal-download/search

  if (pathname.endsWith('/search')) return handleSearch(req, res);
  if (pathname.endsWith('/resolve')) return handleResolve(req, res);

  return res.status(404).json({ error: 'Unknown tidal-download route', path: pathname });
}
