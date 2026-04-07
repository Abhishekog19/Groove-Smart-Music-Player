import { convertWithBackoff } from './conversion-retry';

/**
 * Extract TIDAL platform info from Songlink data
 * Songlink aggregates multiple platform URLs
 */
export function extractTidalInfo(songlinkData) {
  try {
    const tidalData = songlinkData?.tidal || songlinkData?.linksByPlatform?.tidal;
    if (!tidalData) return null;

    // Method 1: Direct ID (if available)
    if (tidalData.id) {
      return {
        type: 'track',
        id: tidalData.id,
        url: tidalData.url
      };
    }

    // Method 2: Extract from URL
    // Example: https://listen.tidal.com/track/123456789
    const match = tidalData.url?.match(/\/track\/(\d+)/);
    if (match?.[1]) {
      return {
        type: 'track',
        id: match[1],
        url: tidalData.url
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to extract TIDAL info', error);
    return null;
  }
}

/**
 * Convert a Spotify/streaming URL to TIDAL via the /api/songlink backend.
 * Uses song.link with automatic failover between primary and backup APIs.
 */
export async function convertToTidal(sourceUrl, options = {}) {
  try {
    const params = new URLSearchParams({
      url: sourceUrl,
      userCountry: options.userCountry || 'US',
      songIfSingle: String(options.songIfSingle ?? true),
    });

    const response = await fetch(`/api/songlink?${params}`);

    if (!response.ok) {
      throw new Error(`Songlink API failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Extract TIDAL-specific info from the Songlink response
    const tidalInfo = extractTidalInfo(data);
    return tidalInfo;
  } catch (error) {
    console.error('TIDAL conversion failed', error);
    return null;
  }
}

/**
 * Complete conversion flow with retry logic
 */
export async function convertSonglinkToTidal(sourceUrl) {
  return convertWithBackoff(
    () => convertToTidal(sourceUrl, {
      userCountry: 'US',
      songIfSingle: true
    }),
    { maxRetries: 3 }
  );
}
