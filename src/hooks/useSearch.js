import { useState, useCallback } from 'react';

/**
 * useSearch — searches TIDAL tracks via the backend /api/tidal-download/search route.
 *
 * Previously called tidalAPI.searchTracks() directly from the browser, which:
 *  - Picked a single random mirror (could be dead/slow → 8s timeout per attempt)
 *  - Was subject to CORS issues on some mirrors
 *  - Bypassed the parallel mirror race we have on the server
 *
 * Now routes through the backend which:
 *  - Fires ALL 10 mirrors simultaneously (Promise.any race)
 *  - Rejects HTML responses (kinoplus auth wall)
 *  - Returns the first valid JSON response (typically < 1s vs 3-8s before)
 *  - Normalizes the response shape across all mirror variants
 *
 * Shape returned:
 *   { results: Track[], loading: bool, error: Error|null, search: fn }
 *
 * Track shape (compatible with existing Song objects in the store):
 *   { id, tidalId, title, artist, album, albumArt, audioQuality,
 *     durationSeconds, durationMs, isrc, sourceType, cover }
 */
export function useSearch() {
  const [state, setState] = useState({
    results: [],
    loading: false,
    error:   null,
  });

  const search = useCallback(async (query, limit = 50) => {
    if (!query.trim()) return;
    setState({ results: [], loading: true, error: null });

    try {
      const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
      const res = await fetch(`/api/tidal-download/search?${params}`, {
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
      const data = await res.json();

      // Backend returns { results: [...] }
      // Normalize to the shape the rest of the app expects
      const items = (data.results || []).map(track => ({
        // Core identity
        id:              `tidal-${track.id}`,
        tidalId:         Number(track.id),
        sourceType:      'tidal',

        // Metadata
        title:           track.title   || '',
        artist:          track.artist  || '',
        album:           track.album   || '',
        audioQuality:    track.audioQuality || 'LOSSLESS',
        isrc:            track.isrc    || null,

        // Duration — keep both forms
        durationMs:      track.durationMs || 0,
        durationSeconds: Math.round((track.durationMs || 0) / 1000),

        // Cover art — use the high-res version for display
        albumArt:        track.albumArt   || null,
        cover:           track.albumArt   || null,
        albumCoverId:    track.albumCoverId || null,
      }));

      setState({ results: items, loading: false, error: null });
      return items;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setState({ results: [], loading: false, error });
      throw error;
    }
  }, []);

  return { ...state, search };
}
