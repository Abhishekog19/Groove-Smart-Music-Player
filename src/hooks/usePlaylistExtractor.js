import { useState, useCallback } from 'react';
import { extractSpotifyPlaylist, convertToTidal } from '../lib/api/client';

/**
 * Hook to extract a full Spotify playlist and convert each track to TIDAL.
 * Provides per-track progress tracking.
 */
export function usePlaylistExtractor() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const extractPlaylist = useCallback(async (playlistUrl) => {
    setLoading(true);
    setError(null);
    setProgress(0);
    setTracks([]);

    try {
      // Step 1: Get all Spotify track URLs
      const songLinks = await extractSpotifyPlaylist(playlistUrl);

      // Pre-populate with Spotify URLs
      setTracks(songLinks.map((url, i) => ({ id: i, spotifyUrl: url, tidalUrl: null, error: null })));

      // Step 2: Convert each to TIDAL
      for (let i = 0; i < songLinks.length; i++) {
        try {
          const tidalData = await convertToTidal(songLinks[i]);
          const tidalUrl = tidalData?.linksByPlatform?.tidal?.url || null;
          setTracks((prev) =>
            prev.map((t) => (t.id === i ? { ...t, tidalUrl } : t))
          );
        } catch (trackErr) {
          setTracks((prev) =>
            prev.map((t) =>
              t.id === i
                ? { ...t, error: trackErr instanceof Error ? trackErr.message : 'Conversion failed' }
                : t
            )
          );
        }
        setProgress(Math.round(((i + 1) / songLinks.length) * 100));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract playlist');
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { tracks, loading, error, progress, extractPlaylist };
}
