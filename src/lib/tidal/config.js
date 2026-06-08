// Dynamic mirror discovery — replaces static hardcoded list
import { getLiveMirrors, getFallbackMirrors } from './mirrorDiscovery.js';

// API Configuration — converted from SvelteKit to React
// Removed: import { APP_VERSION } from '$lib/version'
const APP_VERSION = '1.0.0';

// NOTE: All previously hardcoded mirrors (squid.wtf, spotisaver.net, qqdl.site)
// are confirmed DEAD as of 2026-06-08 (504 Track unreachable per uptime workers).
// We now start with the known-good fallback and refresh dynamically.
let V2_API_TARGETS = [
  // requiresProxy: true → all calls go through /api/proxy (server-side)
  { name: 'monochrome-eu', baseUrl: 'https://eu-central.monochrome.tf', weight: 15, requiresProxy: true, category: 'auto-only' },
  { name: 'monochrome-us', baseUrl: 'https://us-west.monochrome.tf', weight: 15, requiresProxy: true, category: 'auto-only' },
  { name: 'monochrome-api', baseUrl: 'https://api.monochrome.tf', weight: 10, requiresProxy: true, category: 'auto-only' },
  { name: 'samidy', baseUrl: 'https://monochrome-api.samidy.com', weight: 10, requiresProxy: true, category: 'auto-only' },
];

const ALL_API_TARGETS = [...V2_API_TARGETS];
const US_API_TARGETS = [];

// NOTE: These used to be static spreads but V2_API_TARGETS is now mutable.
// TARGET_COLLECTIONS.auto is updated by refreshMirrors() via API_CONFIG.targets.
export const API_CONFIG = {
  targets: [...V2_API_TARGETS],
  baseUrl: V2_API_TARGETS[0]?.baseUrl ?? 'https://eu-central.monochrome.tf',
  useProxy: true,
  proxyUrl: '/api/proxy'
};

let v1WeightedTargets = null;
let v2WeightedTargets = null;

/**
 * Refresh the live mirror list from Cloudflare Workers.
 * Invalidates the weighted target cache so the next selection picks fresh mirrors.
 * Called once on module load and can be called again manually.
 */
export async function refreshMirrors() {
  try {
    const liveMirrors = await getLiveMirrors();
    if (liveMirrors && liveMirrors.length > 0) {
      V2_API_TARGETS = liveMirrors;
      // Invalidate weighted caches so they rebuild with new mirrors
      v1WeightedTargets = null;
      v2WeightedTargets = null;
      // Update API_CONFIG base URL
      API_CONFIG.targets = [...V2_API_TARGETS];
      API_CONFIG.baseUrl = V2_API_TARGETS[0]?.baseUrl ?? API_CONFIG.baseUrl;
      console.log(`[config] Mirror list updated: ${V2_API_TARGETS.length} mirrors via ${V2_API_TARGETS[0]?.name}`);
    }
  } catch (err) {
    console.warn('[config] Mirror refresh failed, keeping current list:', err.message);
  }
}

// Kick off initial mirror refresh (non-blocking — don't await on module load)
refreshMirrors();

// Re-refresh every 15 minutes to stay current
setInterval(refreshMirrors, 15 * 60 * 1000);

function buildWeightedTargets(targets) {
  const validTargets = targets.filter((target) => {
    if (!target?.baseUrl || typeof target.baseUrl !== 'string') return false;
    if (target.weight <= 0) return false;
    try { new URL(target.baseUrl); return true; }
    catch { return false; }
  });

  if (validTargets.length === 0) throw new Error('No valid API targets configured');

  let cumulative = 0;
  return validTargets.map(target => {
    cumulative += target.weight;
    return { ...target, cumulativeWeight: cumulative };
  });
}

function ensureWeightedTargets(apiVersion = 'v2') {
  if (apiVersion === 'v2') {
    if (!v2WeightedTargets) v2WeightedTargets = buildWeightedTargets(V2_API_TARGETS);
    return v2WeightedTargets;
  } else {
    if (!v1WeightedTargets) {
      // v1 fallback: use current V2_API_TARGETS at lower weight
      const v2Fallback = V2_API_TARGETS.map((t) => ({ ...t, weight: 1 }));
      v1WeightedTargets = buildWeightedTargets([...V2_API_TARGETS, ...v2Fallback]);
    }
    return v1WeightedTargets;
  }
}

export function selectApiTarget(apiVersion = 'v2') {
  return selectFromWeightedTargets(ensureWeightedTargets(apiVersion));
}

export function getPrimaryTarget(apiVersion = 'v2') {
  return ensureWeightedTargets(apiVersion)[0];
}

function selectFromWeightedTargets(weighted) {
  if (weighted.length === 0) throw new Error('No weighted targets available');
  const totalWeight = weighted[weighted.length - 1]?.cumulativeWeight ?? 0;
  if (totalWeight <= 0) return weighted[0];
  const random = Math.random() * totalWeight;
  for (const target of weighted) {
    if (random < target.cumulativeWeight) return target;
  }
  return weighted[0];
}

export function getTargetsForRegion(region = 'auto') {
  // eu/us specific targets are not currently populated — all traffic uses auto (V2_API_TARGETS)
  if (region === 'auto') return [...V2_API_TARGETS];
  return []; // eu/us not yet configured
}

export function selectApiTargetForRegion(region) {
  if (region === 'auto') return selectApiTarget();
  const targets = getTargetsForRegion(region);
  if (targets.length === 0) return selectApiTarget();
  return selectFromWeightedTargets(buildWeightedTargets(targets));
}

export function hasRegionTargets(region) {
  if (region === 'auto') return TARGET_COLLECTIONS.auto.length > 0;
  return getTargetsForRegion(region).length > 0;
}

function parseTargetBase(target) {
  try { return new URL(target.baseUrl); }
  catch { return null; }
}

function getBaseApiUrl(target) {
  return parseTargetBase(target ?? getPrimaryTarget());
}

function stripTrailingSlash(path) {
  if (path === '/') return path;
  return path.replace(/\/+$/, '') || '/';
}

function combinePaths(basePath, relativePath) {
  const trimmedBase = stripTrailingSlash(basePath || '/');
  const normalizedRelative = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  if (trimmedBase === '/' || trimmedBase === '') return normalizedRelative;
  if (normalizedRelative === '/') return `${trimmedBase}/`;
  return `${trimmedBase}${normalizedRelative}`;
}

function getRelativePath(url, targetBase) {
  const basePath = stripTrailingSlash(targetBase.pathname || '/');
  const currentPath = url.pathname || '/';
  if (basePath === '/' || basePath === '') {
    return currentPath.startsWith('/') ? currentPath : `/${currentPath}`;
  }
  if (!currentPath.startsWith(basePath)) return currentPath;
  const relative = currentPath.slice(basePath.length);
  if (!relative) return '/';
  return relative.startsWith('/') ? relative : `/${relative}`;
}

function matchesTarget(url, target) {
  const base = parseTargetBase(target);
  if (!base) return false;
  if (url.origin !== base.origin) return false;
  const basePath = stripTrailingSlash(base.pathname || '/');
  if (basePath === '/' || basePath === '') return true;
  const targetPath = stripTrailingSlash(url.pathname || '/');
  return targetPath === basePath || targetPath.startsWith(`${basePath}/`);
}

function findTargetForUrl(url) {
  for (const target of API_CONFIG.targets) {
    if (matchesTarget(url, target)) return target;
  }
  return null;
}

export function isProxyTarget(url) {
  return findTargetForUrl(url)?.requiresProxy === true;
}

function shouldPreferPrimaryTarget(url) {
  const path = url.pathname.toLowerCase();
  if (path.includes('/album/') || path.includes('/artist/') || path.includes('/playlist/')) return true;
  if (path.includes('/search/')) {
    const params = url.searchParams;
    if (params.has('a') || params.has('al') || params.has('p')) return true;
  }
  return false;
}

function resolveUrl(url) {
  try { return new URL(url); }
  catch {
    const baseApiUrl = getBaseApiUrl();
    if (!baseApiUrl) return null;
    try { return new URL(url, baseApiUrl); }
    catch { return null; }
  }
}

export function getProxiedUrl(url) {
  if (!API_CONFIG.useProxy || !API_CONFIG.proxyUrl) return url;
  const targetUrl = resolveUrl(url);
  if (!targetUrl) return url;
  if (!isProxyTarget(targetUrl)) return url;
  return `${API_CONFIG.proxyUrl}?url=${encodeURIComponent(targetUrl.toString())}`;
}

function isLikelyProxyErrorEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const status = typeof entry.status === 'number' ? entry.status : undefined;
  const subStatus = typeof entry.subStatus === 'number' ? entry.subStatus : undefined;
  const userMessage = typeof entry.userMessage === 'string' ? entry.userMessage : undefined;
  const detail = typeof entry.detail === 'string' ? entry.detail : undefined;
  if (typeof status === 'number' && status >= 400) return true;
  if (typeof subStatus === 'number' && subStatus >= 400) return true;
  const tokenPattern = /(token|invalid|unauthorized)/i;
  if (userMessage && tokenPattern.test(userMessage)) return true;
  if (detail && tokenPattern.test(detail)) return true;
  return false;
}

function isLikelyProxyErrorPayload(payload) {
  if (Array.isArray(payload)) return payload.some(isLikelyProxyErrorEntry);
  if (payload && typeof payload === 'object') return isLikelyProxyErrorEntry(payload);
  return false;
}

async function isUnexpectedProxyResponse(response) {
  if (!response.ok) return false;
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.toLowerCase().includes('application/json')) return false;
  try {
    const payload = await response.clone().json();
    return isLikelyProxyErrorPayload(payload);
  } catch { return false; }
}

function isV2Target(target) {
  return V2_API_TARGETS.some((t) => t.name === target.name);
}

/**
 * Fetch with CORS handling and multi-target retry
 */
export async function fetchWithCORS(url, options) {
  const resolvedUrl = resolveUrl(url);
  if (!resolvedUrl) throw new Error(`Unable to resolve URL: ${url}`);

  const originTarget = findTargetForUrl(resolvedUrl);
  if (!originTarget) {
    return fetch(getProxiedUrl(resolvedUrl.toString()), { ...options });
  }

  const apiVersion = options?.apiVersion ?? 'v2';
  const weightedTargets = ensureWeightedTargets(apiVersion);
  const attemptOrder = [];

  if (shouldPreferPrimaryTarget(resolvedUrl)) {
    const primary = getPrimaryTarget(apiVersion);
    if (!attemptOrder.some((c) => c.name === primary.name)) attemptOrder.push(primary);
  }

  const selected = selectApiTarget(apiVersion);
  if (!attemptOrder.some((c) => c.name === selected.name)) attemptOrder.push(selected);

  for (const target of weightedTargets) {
    if (!attemptOrder.some((c) => c.name === target.name)) attemptOrder.push(target);
  }

  let uniqueTargets = attemptOrder.filter(
    (target, index, array) => array.findIndex((e) => e.name === target.name) === index
  );
  if (uniqueTargets.length === 0) uniqueTargets = [getPrimaryTarget(apiVersion)];

  const originBase = parseTargetBase(originTarget);
  if (!originBase) throw new Error('Invalid origin target configuration.');

  const totalAttempts = Math.max(3, uniqueTargets.length);
  let lastError = null;
  let lastResponse = null;
  let lastUnexpectedResponse = null;
  let lastValidButRejectedResponse = null;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const target = uniqueTargets[attempt % uniqueTargets.length];
    const targetBase = parseTargetBase(target);
    if (!targetBase) continue;

    const relativePath = getRelativePath(resolvedUrl, originBase);
    const rewrittenPath = combinePaths(targetBase.pathname || '/', relativePath);
    const rewrittenUrl = new URL(
      rewrittenPath + resolvedUrl.search + resolvedUrl.hash,
      targetBase.origin
    );

    if (isV2Target(target) && options?.preferredQuality && rewrittenUrl.searchParams.has('quality')) {
      rewrittenUrl.searchParams.set('quality', options.preferredQuality);
    }

    const finalUrl = getProxiedUrl(rewrittenUrl.toString());
    const headers = new Headers(options?.headers);
    const isCustom =
      [...V2_API_TARGETS].some((t) => t.name === target.name) &&
      !target.baseUrl.includes('tidal.com') &&
      !target.baseUrl.includes('api.tidal.com') &&
      !target.baseUrl.includes('monochrome.tf');

    if (isCustom) headers.set('X-Client', `BiniLossless/${APP_VERSION}`);

    try {
      const response = await fetch(finalUrl, { ...options, headers });
      if (response.ok) {
        const unexpected = await isUnexpectedProxyResponse(response);
        if (!unexpected) {
          if (options?.validateResponse) {
            const isValid = await options.validateResponse(response.clone());
            if (!isValid) { lastValidButRejectedResponse = response; continue; }
          }
          return response;
        }
        lastUnexpectedResponse = response;
        continue;
      }
      lastResponse = response;
    } catch (error) {
      lastError = error;
      if (error instanceof TypeError && error.message.includes('CORS')) continue;
    }
  }

  if (lastValidButRejectedResponse) return lastValidButRejectedResponse;
  if (lastUnexpectedResponse) return lastUnexpectedResponse;
  if (lastResponse) return lastResponse;

  if (lastError) {
    if (lastError instanceof TypeError && typeof lastError.message === 'string' && lastError.message.includes('CORS')) {
      throw new Error('CORS error detected. Please configure a proxy.');
    }
    throw lastError;
  }

  throw new Error('All API targets failed without response.');
}
