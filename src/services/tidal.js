/**
 * src/services/tidal.js
 *
 * Thin compatibility shim — delegates every call to `tidalAPI` (src/lib/tidal)
 * which uses the 10-mirror weighted proxy system.
 *
 * The original version of this file called the official TIDAL v1 REST API
 * directly with a hardcoded placeholder token ("your_tidal_token"), meaning
 * ALL calls would silently fail in production.  That code has been removed.
 *
 * These named exports are kept for backwards compatibility in case any
 * external code still imports them, but all logic is now delegated to the
 * correct tidalAPI singleton.
 */

import { tidalAPI } from '../lib/tidal/index.js';

/**
 * Search TIDAL for a track by ISRC code.
 * Uses tidalAPI.searchTracks which routes through proxy mirrors.
 *
 * @param {string} isrc  - e.g. "USRC12345678"
 * @returns {Promise<Track|null>}
 */
export async function searchTIDALByISRC(isrc) {
  try {
    const data = await tidalAPI.searchTracks(`isrc:${isrc}`);
    return data?.items?.[0] ?? null;
  } catch (error) {
    console.error('[services/tidal] searchTIDALByISRC error:', error);
    return null;
  }
}

/**
 * Get a stream URL for a TIDAL track ID.
 * Uses tidalAPI.getTrackStreamUrl which resolves DASH manifests via proxy mirrors.
 *
 * @param {number} trackId
 * @param {string} quality - 'LOSSLESS' | 'HI_RES_LOSSLESS' | 'HIGH' | 'LOW'
 * @returns {Promise<string|null>}
 */
export async function getTIDALStreamUrl(trackId, quality = 'LOSSLESS') {
  try {
    return await tidalAPI.getTrackStreamUrl(trackId, quality);
  } catch (error) {
    console.error('[services/tidal] getTIDALStreamUrl error:', error);
    return null;
  }
}

/**
 * Download a TIDAL track to disk.
 * Uses tidalAPI.downloadTrack which handles DASH manifests, progress tracking,
 * and triggers the browser's native download dialog.
 *
 * @param {number}   trackId
 * @param {string}   quality
 * @param {string}   filename
 * @param {Function} onProgress  - called with a 0-1 fraction
 * @returns {Promise<boolean>}
 */
export async function downloadTrackFromTIDAL(trackId, quality, filename, onProgress) {
  try {
    await tidalAPI.downloadTrack(trackId, quality, filename, {
      skipEmbedding: true,
      onProgress: ({ stage, receivedBytes, totalBytes }) => {
        if (stage === 'downloading' && totalBytes && onProgress) {
          onProgress(receivedBytes / totalBytes);
        }
      },
    });
    return true;
  } catch (error) {
    console.error('[services/tidal] downloadTrackFromTIDAL error:', error);
    throw error;
  }
}
