import { useState, useEffect, useRef } from 'react';

// In-memory cache: cacheKey → { tracks, ts }
const memCache = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * useRecommendations
 *
 * Fetches "You May Also Like" tracks for the currently playing song.
 * Always returns exactly `limit` tracks (or fewer if not enough resolved on TIDAL).
 *
 * @param {object} currentSong  — from usePlayerStore
 * @param {number} limit        — max tracks to return (default 8)
 * @returns {{ tracks: object[], status: string }}
 *   status: 'idle' | 'loading' | 'ready' | 'unavailable'
 */
export function useRecommendations(currentSong, limit = 8) {
  const [tracks, setTracks] = useState([]);
  const [status, setStatus] = useState('idle');
  const lastKeyRef    = useRef(null);
  const abortRef      = useRef(null);

  useEffect(() => {
    const title  = currentSong?.title?.trim();
    // Normalize artist: if it's an object take .name, if comma-separated take first
    const rawArtist = currentSong?.artist;
    const artist = (typeof rawArtist === 'string'
      ? rawArtist.split(',')[0]
      : rawArtist?.name || ''
    ).trim();

    if (!title || !artist || currentSong?.sourceType !== 'tidal') {
      setTracks([]); setStatus('idle');
      lastKeyRef.current = null;
      return;
    }

    // Stable cache key — lowercase, trimmed so "The Weeknd" === "the weeknd"
    const key = `${title.toLowerCase()}|||${artist.toLowerCase()}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    // Cancel any in-flight request for a previous song
    if (abortRef.current) abortRef.current.abort();

    // Instant cache hit
    const cached = memCache[key];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setTracks(cached.tracks);
      setStatus(cached.tracks.length > 0 ? 'ready' : 'unavailable');
      return;
    }

    setStatus('loading');
    setTracks([]);

    const ac = new AbortController();
    abortRef.current = ac;

    // Request more from the server than we need — backend filters
    // live/karaoke/instrumental and we take the top `limit` here.
    const params = new URLSearchParams({ title, artist, limit: String(limit) });

    fetch(`/api/recommendations?${params}`, { signal: ac.signal })
      .then(async res => {
        if (res.status === 404) {
          memCache[key] = { tracks: [], ts: Date.now() };
          setTracks([]); setStatus('unavailable');
          return;
        }
        if (!res.ok) throw new Error(`/api/recommendations ${res.status}`);
        const data  = await res.json();
        const list  = (data.tracks || []).slice(0, limit);

        memCache[key] = { tracks: list, ts: Date.now() };
        setTracks(list);
        setStatus(list.length > 0 ? 'ready' : 'unavailable');
      })
      .catch(err => {
        if (err.name === 'AbortError') return; // song changed — ignore stale result
        console.warn('[useRecommendations]', err.message);
        setTracks([]); setStatus('unavailable');
      });

    return () => ac.abort();
  }, [
    // Only re-run when the actual song identity changes
    // (not every render that happens to pass a new object reference)
    currentSong?.tidalId,
    currentSong?.title,
    limit,
  ]);

  return { tracks, status };
}
