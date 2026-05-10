/**
 * Vercel Serverless Function: /api/recommendations
 *
 * GET /api/recommendations?title=...&artist=...&limit=8
 *
 * Returns "You May Also Like" track recommendations:
 *   1. Last.fm track.getSimilar (fetches 3× the requested limit to guarantee fill after filtering)
 *   2. Resolves each on TIDAL via:
 *      - Tier 1: parallel mirror race across all V2 proxy mirrors (Promise.any)
 *      - Tier 2: TIDAL v1 public API fallback when all mirrors are down
 *   3. Filters live/instrumental/karaoke versions to prefer studio originals with lyrics
 *
 * This mirrors server/routes/recommendations.js but as a standalone Vercel handler.
 * The Express server (server/index.js) is NOT deployed to Vercel — only api/ files are.
 */

const BROWSER_UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const LASTFM_API_KEY = 'b25b959554ed76058ac220b7b2e0a026';
const LASTFM_BASE    = 'https://ws.audioscrobbler.com/2.0';
const TIDAL_V1_TOKEN = 'CzET4vdadNUFQ5JU';
const TIDAL_V1_URL   = 'https://listen.tidal.com/v1/search';

const V2_MIRRORS = [
  { name: 'squid',       url: 'https://triton.squid.wtf' },
  { name: 'spotisaver1', url: 'https://hifi-one.spotisaver.net' },
  { name: 'spotisaver2', url: 'https://hifi-two.spotisaver.net' },
  { name: 'hund',        url: 'https://hund.qqdl.site' },
  { name: 'katze',       url: 'https://katze.qqdl.site' },
  { name: 'maus',        url: 'https://maus.qqdl.site' },
  { name: 'vogel',       url: 'https://vogel.qqdl.site' },
  { name: 'wolf',        url: 'https://wolf.qqdl.site' },
  { name: 'monochrome',  url: 'https://arran.monochrome.tf' },
  // kinoplus excluded — returns 200 OK with HTML auth wall, not JSON
];

// ─── findItems: handle all V2 response shapes ─────────────────────────────────
// V2 mirrors return: { data: [...] } or { items: [...] } or bare [...]
function findItems(obj, visited = new WeakSet()) {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    return obj.length > 0 && (obj[0]?.id !== undefined || obj[0]?.title !== undefined) ? obj : null;
  }
  if (visited.has(obj)) return null;
  visited.add(obj);
  if (Array.isArray(obj.items) && obj.items.length > 0) return obj.items;
  if (Array.isArray(obj.data))  return obj.data;
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      const found = findItems(val, visited);
      if (found) return found;
    }
  }
  return null;
}

function buildCoverUrl(cover, size = 320) {
  if (!cover) return null;
  return `https://resources.tidal.com/images/${cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
}

// ─── Version preference scoring ───────────────────────────────────────────────
const LYRIC_SKIP = /\b(live|instrumental|karaoke|backing track|minus one|acapella|a cappella|orch\.?|orchestra)\b/i;
const REMIX_RE   = /\(.*?remix.*?\)/i;

function isLikelyToHaveLyrics(trackTitle, requestedTitle) {
  if (trackTitle.toLowerCase() === requestedTitle.toLowerCase()) return true;
  if (LYRIC_SKIP.test(trackTitle)) return false;
  if (REMIX_RE.test(trackTitle))   return false;
  return true;
}

function versionScore(title) {
  if (/\(.*?(live|concert|tour).*?\)/i.test(title))          return 100;
  if (/\(.*?instrumental.*?\)/i.test(title))                  return 90;
  if (/\(.*?(karaoke|backing).*?\)/i.test(title))             return 85;
  if (/\(.*?remix.*?\)/i.test(title))                         return 50;
  if (/\(.*?(edit|version|mix|radio).*?\)/i.test(title))      return 20;
  if (/\(.*?(remaster|deluxe|anniversary).*?\)/i.test(title)) return 5;
  return 0;
}

// ─── Parallel mirror race (5s timeout then fall to TIDAL v1) ─────────────────
async function raceMirrors(path) {
  const controllers = new Map();

  const racePromises = V2_MIRRORS.map(m => {
    const ac  = new AbortController();
    controllers.set(m.name, ac);
    const url = `${m.url}${path}`;

    return fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA, 'X-Client': 'BiniLossless/1.0' },
      signal: ac.signal,
    })
    .then(r => {
      if (!r.ok) { ac.abort(); throw new Error(`${m.name}: ${r.status}`); }
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('text/html')) { throw new Error(`${m.name}: HTML wall`); }
      return r.json().then(data => ({ data, mirror: m.name }));
    })
    .catch(err => { throw err; });
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('mirrors timed out')), 5000)
  );

  try {
    const winner = await Promise.any([...racePromises, timeout]);
    for (const [name, ac] of controllers) {
      if (name !== winner.mirror) { try { ac.abort(); } catch {} }
    }
    return winner.data;
  } catch {
    for (const ac of controllers.values()) { try { ac.abort(); } catch {} }
    throw new Error('All mirrors failed');
  }
}

// ─── Step 1: Last.fm similar tracks ──────────────────────────────────────────
async function getSimilarFromLastfm(title, artist, fetchLimit) {
  const params = new URLSearchParams({
    method:      'track.getSimilar',
    track:       title,
    artist:      artist,
    limit:       String(fetchLimit),
    autocorrect: '1',
    format:      'json',
    api_key:     LASTFM_API_KEY,
  });

  const res = await fetch(`${LASTFM_BASE}?${params}`, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    signal:  AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Last.fm ${res.status}`);
  const data   = await res.json();
  const tracks = data?.similartracks?.track;
  if (!tracks || tracks.length === 0) return [];

  return (Array.isArray(tracks) ? tracks : [tracks])
    .map(t => ({ title: t.name || '', artist: t.artist?.name || '' }))
    .filter(t => t.title && t.artist);
}

// ─── Step 2: Resolve each track on TIDAL ─────────────────────────────────────
async function searchOnTidal(title, artist, requestedTitle) {
  const query = `${title} ${artist}`.trim();
  const path  = `/search/?s=${encodeURIComponent(query)}`;

  let items = [];

  // Tier 1: parallel mirror race
  try {
    const data = await raceMirrors(path);
    items = findItems(data) || [];
  } catch { /* fall through to TIDAL v1 */ }

  // Tier 2: TIDAL v1 public API fallback
  if (items.length === 0) {
    try {
      const url = `${TIDAL_V1_URL}?query=${encodeURIComponent(query)}&limit=10&countryCode=US&types=TRACKS`;
      const r = await fetch(url, {
        headers: {
          'x-tidal-token': TIDAL_V1_TOKEN,
          Origin:  'https://listen.tidal.com',
          Referer: 'https://listen.tidal.com/',
          'User-Agent': BROWSER_UA,
        },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const d = await r.json();
        items = d.tracks?.items || [];
      }
    } catch { /* give up */ }
  }

  if (items.length === 0) return null;

  const lTitle = title.toLowerCase();

  const candidates = items
    .filter(t => t.title && t.id)
    .map(t => {
      const itemTitle  = (t.title || '').toLowerCase();
      const titleMatch = itemTitle === lTitle ? 0 : (itemTitle.startsWith(lTitle) ? 5 : 15);
      const score      = titleMatch + versionScore(t.title || '');
      const hasLyrics  = isLikelyToHaveLyrics(t.title || '', requestedTitle);
      return { ...t, _score: score, _hasLyrics: hasLyrics };
    })
    .sort((a, b) => {
      if (a._hasLyrics !== b._hasLyrics) return a._hasLyrics ? -1 : 1;
      return a._score - b._score;
    });

  const best = candidates[0];
  if (!best) return null;

  const artistName = best.artists?.map(a => a.name).filter(Boolean).join(', ')
                  || best.artist?.name || best.artistName || artist;
  const coverUuid   = best.album?.cover || null;
  const coverUrl    = buildCoverUrl(coverUuid);
  const durationSec = best.duration ?? 0;
  const mins = Math.floor(durationSec / 60);
  const secs = Math.floor(durationSec % 60);

  return {
    id:              `tidal-${best.id}`,
    tidalId:         Number(best.id),
    title:           best.title || title,
    artist:          artistName,
    album:           best.album?.title || '',
    cover:           coverUrl || '🎵',
    duration:        `${mins}:${String(secs).padStart(2, '0')}`,
    durationSeconds: durationSec,
    sourceType:      'tidal',
  };
}

// ─── Main Vercel handler ──────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { title, artist } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 8, 12);

  if (!title || !artist) {
    return res.status(400).json({ error: 'Missing required params: title, artist' });
  }

  try {
    // Fetch 3× the limit from Last.fm to guarantee fill after filtering
    const similar = await getSimilarFromLastfm(title, artist, limit * 3);

    if (similar.length === 0) {
      return res.status(404).json({ error: 'No similar tracks found', title, artist });
    }

    console.log(`[recommendations] Last.fm: ${similar.length} similar for "${title}"`);

    // Resolve ALL in parallel — mirror race handles load distribution
    const settled = await Promise.allSettled(
      similar.map(t => searchOnTidal(t.title, t.artist, title))
    );

    const resolved = settled
      .filter(s => s.status === 'fulfilled' && s.value !== null)
      .map(s => s.value)
      .slice(0, limit);

    console.log(`[recommendations] Resolved ${resolved.length}/${similar.length} on TIDAL for "${title}"`);

    if (resolved.length === 0) {
      return res.status(404).json({ error: 'No tracks resolved on TIDAL', title, artist });
    }

    res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.json({ tracks: resolved, source: 'lastfm+tidal', total: resolved.length });

  } catch (err) {
    console.error('[recommendations] Error:', err.message);
    return res.status(502).json({ error: 'Recommendations fetch failed', details: err.message });
  }
}
