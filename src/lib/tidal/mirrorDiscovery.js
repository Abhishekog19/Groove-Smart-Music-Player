/**
 * mirrorDiscovery.js — Dynamic TIDAL API Mirror Discovery (Frontend)
 *
 * Fetches the live list of working mirrors from uptime endpoints every 15 minutes.
 * Priority order matches Monochrome's storage.js prioritySort():
 *   1. hifi.geeked.wtf  (top priority)
 *   2. Official Monochrome CDN (eu-central, us-west, api.monochrome.tf, samidy)
 *   3. qqdl.site community instances (shuffled, lowest priority)
 *
 * Uses tidal-uptime.geeked.wtf — the SAME source Monochrome itself uses (storage.js line 7).
 */

// Uptime workers — geeked.wtf is Monochrome's primary, others are Smusic fallbacks
const UPTIME_WORKERS = [
  'https://tidal-uptime.geeked.wtf',
  'https://tidal-uptime.jiffy-puffs-1j.workers.dev/',
  'https://tidal-uptime.props-76styles.workers.dev/',
];

// Full mirror list sourced from monochrome-main/js/storage.js — 11 instances
const FALLBACK_MIRRORS = [
  // Tier 1: highest-reliability per Monochrome source code
  { name: 'hifi-geeked',    baseUrl: 'https://hifi.geeked.wtf',             weight: 20, requiresProxy: true, category: 'auto-only' },
  // Tier 2: Official Monochrome CDN nodes
  { name: 'monochrome-eu',  baseUrl: 'https://eu-central.monochrome.tf',    weight: 15, requiresProxy: true, category: 'auto-only' },
  { name: 'monochrome-us',  baseUrl: 'https://us-west.monochrome.tf',       weight: 15, requiresProxy: true, category: 'auto-only' },
  { name: 'monochrome-api', baseUrl: 'https://api.monochrome.tf',           weight: 10, requiresProxy: true, category: 'auto-only' },
  { name: 'samidy',         baseUrl: 'https://monochrome-api.samidy.com',   weight: 10, requiresProxy: true, category: 'auto-only' },
  // Tier 3: qqdl.site community instances (lower priority)
  { name: 'maus-qqdl',     baseUrl: 'https://maus.qqdl.site',              weight: 8,  requiresProxy: true, category: 'auto-only' },
  { name: 'vogel-qqdl',    baseUrl: 'https://vogel.qqdl.site',             weight: 8,  requiresProxy: true, category: 'auto-only' },
  { name: 'katze-qqdl',    baseUrl: 'https://katze.qqdl.site',             weight: 8,  requiresProxy: true, category: 'auto-only' },
  { name: 'hund-qqdl',     baseUrl: 'https://hund.qqdl.site',              weight: 8,  requiresProxy: true, category: 'auto-only' },
  { name: 'wolf-qqdl',     baseUrl: 'https://wolf.qqdl.site',              weight: 6,  requiresProxy: true, category: 'auto-only' },
  { name: 'kinoplus',      baseUrl: 'https://tidal.kinoplus.online',       weight: 4,  requiresProxy: true, category: 'auto-only' },
];

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

let cachedMirrors = null;
let lastFetchTime = 0;
let fetchInFlight = null;

/**
 * Priority-sort matching Monochrome's storage.js prioritySort():
 * hifi.geeked.wtf → official CDN (shuffled) → qqdl.site (shuffled).
 */
function prioritySort(mirrors) {
  const top    = [];
  const middle = [];
  const bottom = [];
  for (const m of mirrors) {
    const url = m.baseUrl || m.url || '';
    if (url.includes('hifi.geeked.wtf'))  top.push(m);
    else if (url.includes('.qqdl.site'))  bottom.push({ ...m, weight: 6 });
    else                                  middle.push(m);
  }
  const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
  return [...top, ...shuffle(middle), ...shuffle(bottom)];
}

/**
 * Fetch fresh mirrors from a single uptime worker.
 * Returns an array of mirror objects, or null on failure.
 *
 * Worker response shape:
 * {
 *   api: [{ url: "https://...", version: "2.10" }, ...],
 *   streaming: [],
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

    const apiList       = Array.isArray(data?.api)       ? data.api       : [];
    const streamingList = Array.isArray(data?.streaming) ? data.streaming : [];
    const combined = [...apiList, ...streamingList];

    if (combined.length === 0) return null;

    const mirrors = combined.map((entry, i) => ({
      name:          entry.name || `worker-mirror-${i}`,
      baseUrl:       (entry.url || entry.baseUrl || '').replace(/\/$/, ''),
      weight:        entry.weight || 10,
      requiresProxy: true,
      category:      'auto-only',
    }));

    return prioritySort(mirrors);
  } catch {
    return null;
  }
}

/**
 * Fetch live mirrors from uptime workers.
 * Tries all workers in random order, returns first successful result.
 * Falls back to full 11-instance FALLBACK_MIRRORS if all workers fail.
 */
async function _fetchLiveMirrors() {
  const workers = [...UPTIME_WORKERS].sort(() => Math.random() - 0.5);

  for (const worker of workers) {
    const mirrors = await fetchFromWorker(worker);
    if (mirrors && mirrors.length > 0) {
      console.log(`[mirrorDiscovery] Fetched ${mirrors.length} mirrors from ${worker}`);
      return mirrors;
    }
  }

  console.warn('[mirrorDiscovery] All uptime workers unreachable — using fallback mirrors');
  return prioritySort([...FALLBACK_MIRRORS]);
}

/**
 * Returns the current live mirror list (cached 15 min).
 * @returns {Promise<Array>}
 */
export async function getLiveMirrors() {
  const now = Date.now();

  if (cachedMirrors && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedMirrors;
  }

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
    return cachedMirrors || prioritySort([...FALLBACK_MIRRORS]);
  });

  return fetchInFlight;
}

/**
 * Force-invalidate the mirror cache.
 */
export function invalidateMirrorCache() {
  cachedMirrors = null;
  lastFetchTime = 0;
  fetchInFlight = null;
  console.log('[mirrorDiscovery] Cache invalidated — will refetch on next getLiveMirrors()');
}

/**
 * Returns fallback mirrors without hitting the network.
 */
export function getFallbackMirrors() {
  return prioritySort([...FALLBACK_MIRRORS]);
}
