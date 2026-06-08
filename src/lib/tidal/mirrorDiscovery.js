/**
 * mirrorDiscovery.js — Dynamic TIDAL API Mirror Discovery (Frontend)
 *
 * Fetches the live list of working mirrors from Cloudflare Worker uptime endpoints
 * every 15 minutes. Uses the `api` array from the worker response (the `streaming`
 * array is currently empty as of 2026-06).
 *
 * Key finding: ALL 10 previously hardcoded mirrors (squid.wtf, spotisaver.net,
 * qqdl.site) are confirmed dead (504). The only working mirrors come from
 * monochrome.tf / samidy.com, discovered via the workers.
 */

// Cloudflare Workers that maintain the live mirror list
const UPTIME_WORKERS = [
  'https://tidal-uptime.jiffy-puffs-1j.workers.dev/',
  'https://tidal-uptime.props-76styles.workers.dev/',
];

// Fallback mirrors in case both workers are unreachable.
// These are the known-working monochrome.tf endpoints (as of 2026-06-08).
const FALLBACK_MIRRORS = [
  { name: 'monochrome-eu', baseUrl: 'https://eu-central.monochrome.tf', weight: 15, requiresProxy: true, category: 'auto-only' },
  { name: 'monochrome-us', baseUrl: 'https://us-west.monochrome.tf', weight: 15, requiresProxy: true, category: 'auto-only' },
  { name: 'monochrome-api', baseUrl: 'https://api.monochrome.tf', weight: 10, requiresProxy: true, category: 'auto-only' },
  { name: 'samidy', baseUrl: 'https://monochrome-api.samidy.com', weight: 10, requiresProxy: true, category: 'auto-only' },
];

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

let cachedMirrors = null;
let lastFetchTime = 0;
let fetchInFlight = null; // Deduplicates concurrent fetch calls

/**
 * Fetch fresh mirrors from a single uptime worker.
 * Returns an array of mirror objects, or null on failure.
 *
 * Worker response shape:
 * {
 *   api: [{ url: "https://...", version: "2.10" }, ...],  ← USE THIS
 *   streaming: [],                                         ← Empty, skip
 *   down: [{ url: "...", status: 504, error: "..." }]
 * }
 */
async function fetchFromWorker(workerUrl) {
  try {
    const res = await fetch(workerUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;

    const data = await res.json();

    // Use `api` array — `streaming` is currently empty
    const apiList = Array.isArray(data?.api) ? data.api : [];
    const streamingList = Array.isArray(data?.streaming) ? data.streaming : [];

    // Combine both; prefer api entries since streaming is empty right now.
    // If streaming gets populated in future, it'll automatically be included.
    const combined = [...apiList, ...streamingList];

    if (combined.length === 0) return null;

    return combined.map((entry, i) => ({
      name: `worker-mirror-${i}`,
      baseUrl: entry.url.replace(/\/$/, ''), // strip trailing slash
      weight: 15,
      requiresProxy: true,
      category: 'auto-only',
    }));
  } catch {
    return null;
  }
}

/**
 * Fetch live mirrors from uptime workers.
 * Tries both workers in random order, returns first successful result.
 * Falls back to FALLBACK_MIRRORS if both workers fail.
 */
async function _fetchLiveMirrors() {
  // Shuffle workers so both get load across clients
  const workers = [...UPTIME_WORKERS].sort(() => Math.random() - 0.5);

  for (const worker of workers) {
    const mirrors = await fetchFromWorker(worker);
    if (mirrors && mirrors.length > 0) {
      console.log(`[mirrorDiscovery] Fetched ${mirrors.length} live mirrors from ${worker}`);
      return mirrors;
    }
  }

  // Both workers failed — use hardcoded fallback
  console.warn('[mirrorDiscovery] Both workers unreachable, using fallback mirrors');
  return FALLBACK_MIRRORS;
}

/**
 * Returns the current live mirror list.
 * Refreshes from workers if the 15-minute cache has expired.
 * Deduplicates concurrent calls so only one fetch is in flight at a time.
 *
 * @returns {Promise<Array>} Array of mirror objects compatible with config.js
 */
export async function getLiveMirrors() {
  const now = Date.now();

  // Cache hit
  if (cachedMirrors && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedMirrors;
  }

  // Deduplicate concurrent fetches
  if (fetchInFlight) {
    return fetchInFlight;
  }

  fetchInFlight = _fetchLiveMirrors().then(mirrors => {
    cachedMirrors = mirrors;
    lastFetchTime = Date.now();
    fetchInFlight = null;
    return mirrors;
  }).catch(err => {
    fetchInFlight = null;
    console.error('[mirrorDiscovery] Fetch failed:', err);
    return cachedMirrors || FALLBACK_MIRRORS;
  });

  return fetchInFlight;
}

/**
 * Force-invalidate the mirror cache.
 * Useful when a mirror consistently fails and you want to pick fresh ones.
 */
export function invalidateMirrorCache() {
  cachedMirrors = null;
  lastFetchTime = 0;
  fetchInFlight = null;
  console.log('[mirrorDiscovery] Cache invalidated — will refetch on next getLiveMirrors()');
}

/**
 * Returns the fallback mirrors without hitting the network.
 * Used as a synchronous emergency fallback.
 */
export function getFallbackMirrors() {
  return FALLBACK_MIRRORS;
}
