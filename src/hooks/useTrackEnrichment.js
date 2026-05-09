import { useState, useEffect, useRef } from 'react';

/**
 * useTrackEnrichment
 *
 * Silently enriches a TIDAL song's metadata after it starts playing.
 * Calls the backend /api/tidal-download/track-metadata?id=&title=&artist=
 * which internally runs a V2 proxy search by title+artist and returns:
 *
 *   coverUrl       — 640×640 static JPEG cover (getCoverUrl equivalent)
 *   videoCoverUrl  — 640×640 MP4 animated cover (getVideoCoverUrl equivalent)
 *   artistPicUrl   — 750×750 artist picture URL (getArtistPictureUrl equivalent)
 *
 * API gaps closed by this hook:
 *   getCover                    ✅  640px static cover URL
 *   getVideoCoverUrl            ✅  animated MP4 cover URL
 *   getPreferredTrackMetadata   ✅  primary metadata source
 *   getDashManifestWithMetadata ✅  already used internally in stream path
 *   getSong                     ✅  implicit via the search-by-title path
 *
 * No quality badges are surfaced — enrichment is purely visual.
 *
 * @param {object|null} currentSong  — song from usePlayerStore
 * @returns {{ coverUrl, videoCoverUrl, artistPicUrl, enriched }}
 */
export function useTrackEnrichment(currentSong) {
  const [state, setState] = useState({
    coverUrl:      null,
    videoCoverUrl: null,
    artistPicUrl:  null,
    enriched:      false,
  });

  const abortRef  = useRef(null);
  const lastIdRef = useRef(null);

  useEffect(() => {
    const tidalId = currentSong?.tidalId;
    const title   = currentSong?.title;
    const artist  = currentSong?.artist;

    // Only enrich TIDAL tracks with a title (needed for search)
    if (!tidalId || !title) return;

    // Skip if same song is already enriched / in progress
    if (lastIdRef.current === tidalId) return;
    lastIdRef.current = tidalId;

    // Cancel any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Reset to un-enriched while we fetch
    setState({ coverUrl: null, videoCoverUrl: null, artistPicUrl: null, enriched: false });

    (async () => {
      try {
        // Build query: id + title + artist so the backend can search by text
        // (V2 proxy /track/?id= only returns stream manifests, not cover art)
        const params = new URLSearchParams({
          id:     tidalId,
          title:  title,
          artist: artist || '',
        });

        const res = await fetch(
          `/api/tidal-download/track-metadata?${params}`,
          { signal: controller.signal }
        );

        if (controller.signal.aborted) return;

        if (!res.ok) {
          // Non-fatal — the player still shows the search thumbnail
          console.warn(`[useTrackEnrichment] ${res.status} for "${title}" (id ${tidalId})`);
          setState({ coverUrl: null, videoCoverUrl: null, artistPicUrl: null, enriched: true });
          return;
        }

        const data = await res.json();
        if (controller.signal.aborted) return;

        const { coverUrl, videoCoverUrl, artistPicUrl } = data;

        setState({ coverUrl, videoCoverUrl, artistPicUrl, enriched: true });

        if (coverUrl)      console.log(`[useTrackEnrichment] ✅ Cover upgraded  "${title}"`);
        if (videoCoverUrl) console.log(`[useTrackEnrichment] 🎬 Video cover     "${title}" — ${videoCoverUrl.slice(0, 60)}`);

      } catch (err) {
        if (controller.signal.aborted) return;
        // Non-fatal — silently fall back to search thumbnail
        console.warn(`[useTrackEnrichment] Fetch failed for "${title}":`, err.message);
        setState({ coverUrl: null, videoCoverUrl: null, artistPicUrl: null, enriched: true });
      }
    })();

    return () => { controller.abort(); };
  }, [currentSong?.tidalId]);

  return state;
}
