/**
 * manifestParser.js — Unified TIDAL Manifest Parsing (Frontend)
 *
 * TIDAL API returns audio manifests in multiple formats, all base64-encoded.
 * This module handles all known formats so the audio player always gets a usable URL.
 *
 * Known formats:
 *   1. JSON with .urls array  → { type:'direct', urls:[...] }
 *   2. DASH XML with BaseURL  → { type:'dash', isSegmented:false, urls:[...] }
 *   3. DASH XML with SegmentTemplate → { type:'dash', isSegmented:true, template:{...} }
 *      (Cannot be played directly — signals caller to handle differently)
 */

/**
 * Decode a base64 manifest string (handles both standard and URL-safe base64).
 * Returns the decoded string, or the original if decoding fails.
 */
export function decodeBase64Manifest(manifest) {
  if (!manifest || typeof manifest !== 'string') return '';
  try {
    // URL-safe base64 uses - and _ instead of + and /
    const normalized = manifest
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      // Add = padding to make length a multiple of 4
      .padEnd(manifest.length + (4 - (manifest.length % 4)) % 4, '=');
    return atob(normalized);
  } catch {
    return manifest; // return as-is if decode fails (might already be plain text)
  }
}

/**
 * Detect whether a decoded manifest string is DASH XML.
 */
export function isDashManifest(decoded) {
  return (
    decoded.trimStart().startsWith('<') &&
    (decoded.includes('<MPD') || decoded.includes('<AdaptationSet') || decoded.includes('<BaseURL'))
  );
}

/**
 * Detect whether a decoded DASH manifest uses SegmentTemplate (segmented streaming).
 * Segmented streams cannot be played via a single URL — they require downloading
 * multiple segment files (init + segments 1..N) and concatenating them.
 */
export function isSegmentedDash(decoded) {
  return /<SegmentTemplate/i.test(decoded);
}

/**
 * Extract the <BaseURL> from a DASH XML manifest.
 * Returns the URL string or null.
 */
export function extractBaseUrl(xmlString) {
  const match = /<BaseURL[^>]*>([^<]+)<\/BaseURL>/i.exec(xmlString);
  if (!match?.[1]) return null;
  const url = match[1].trim();
  return url.startsWith('http') ? url : null;
}

/**
 * Parse a DASH XML manifest's SegmentTemplate element.
 * Returns the template info needed to construct segment URLs.
 */
export function parseSegmentTemplate(xmlString) {
  const mediaMatch = /media="([^"]+)"/.exec(xmlString);
  const initMatch = /initialization="([^"]+)"/.exec(xmlString);
  const startMatch = /startNumber="(\d+)"/.exec(xmlString);
  const baseUrl = extractBaseUrl(xmlString);

  return {
    mediaTemplate: mediaMatch?.[1] ?? null,
    initialization: initMatch?.[1] ?? null,
    startNumber: parseInt(startMatch?.[1] ?? '1', 10),
    baseUrl: baseUrl,
  };
}

/**
 * Build a segment URL from a SegmentTemplate and segment number.
 * Example: buildSegmentUrl('https://cdn/segs/', 'seg-$Number$.m4s', 3)
 *          → 'https://cdn/segs/seg-3.m4s'
 */
export function buildSegmentUrl(baseUrl, mediaTemplate, segmentNumber) {
  const filename = mediaTemplate.replace('$Number$', String(segmentNumber));
  return (baseUrl || '') + filename;
}

/**
 * Main manifest parsing entry point.
 *
 * @param {string} manifest - Raw manifest string (may be base64-encoded or plain)
 * @param {string} [mimeType] - Optional MIME type hint ('application/dash+xml' etc.)
 * @returns {{
 *   type: 'direct' | 'dash',
 *   isSegmented: boolean,
 *   urls?: string[],
 *   template?: { mediaTemplate: string, initialization: string, startNumber: number, baseUrl: string }
 * } | null}
 */
export function parseManifest(manifest, mimeType) {
  if (!manifest) return null;

  // Step 1: Decode base64
  const decoded = decodeBase64Manifest(manifest);

  // Step 2: Try JSON first (most common for LOSSLESS direct streams)
  if (!isDashManifest(decoded)) {
    try {
      const json = JSON.parse(decoded);
      if (Array.isArray(json.urls) && json.urls.length > 0) {
        return { type: 'direct', isSegmented: false, urls: json.urls };
      }
      // Some mirrors return { url: '...' } instead of { urls: [...] }
      if (typeof json.url === 'string' && json.url.startsWith('http')) {
        return { type: 'direct', isSegmented: false, urls: [json.url] };
      }
    } catch {
      // Not JSON — fall through to DASH parsing
    }
  }

  // Step 3: Parse DASH XML
  if (isDashManifest(decoded) || mimeType?.includes('dash')) {
    // Step 3a: Detect segmented DASH (SegmentTemplate)
    if (isSegmentedDash(decoded)) {
      const template = parseSegmentTemplate(decoded);
      return {
        type: 'dash',
        isSegmented: true,
        template,
        // Note: cannot play directly — caller must handle segmented download
      };
    }

    // Step 3b: Non-segmented DASH — extract BaseURL (direct FLAC/MP4 URL)
    const baseUrl = extractBaseUrl(decoded);
    if (baseUrl) {
      return { type: 'dash', isSegmented: false, urls: [baseUrl] };
    }
  }

  // Step 4: Last-resort regex URL extraction from any decoded content
  const urlRegex = /https?:\/\/[\w\-.~:?#[\]@!$&'()*+,;=%/]+/g;
  let match;
  while ((match = urlRegex.exec(decoded)) !== null) {
    const url = match[0];
    if (url.includes('$Number$')) continue;      // Skip segment template placeholders
    if (/\/\d+\.mp4$/.test(url)) continue;      // Skip numbered segment files
    if (
      url.includes('.flac') ||
      url.includes('.mp4') ||
      url.includes('.m4a') ||
      url.includes('token=') ||
      url.includes('/audio/')
    ) {
      return { type: 'direct', isSegmented: false, urls: [url] };
    }
  }

  // Could not extract anything usable
  return null;
}

/**
 * Convenience: extract just the first usable stream URL from a manifest.
 * Returns null for segmented DASH (which can't be played as a single URL).
 *
 * @param {string} manifest
 * @param {string} [mimeType]
 * @returns {string | null}
 */
export function extractStreamUrl(manifest, mimeType) {
  const parsed = parseManifest(manifest, mimeType);
  if (!parsed) return null;
  if (parsed.isSegmented) {
    console.warn('[manifestParser] Segmented DASH manifest — cannot extract single URL');
    return null;
  }
  return parsed.urls?.[0] ?? null;
}
