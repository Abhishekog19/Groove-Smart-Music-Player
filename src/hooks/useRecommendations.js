import { useState, useEffect, useRef } from 'react';

// In-memory cache: cacheKey → { tracks, ts }
const memCache = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * useRecommendations
 *
 * Fetches "You May Also Like" tracks for the currently playing song.
 * Uses /api/recommendations which proxies to Railway (parallel mirror race).
 *
 * @param {object} currentSong  — from usePlayerStore
 * @param {number} limit        — max tracks to return (default 8)
 * @returns {{ tracks: object[], status: string }}
 *   status: 'idle' | 'loading' | 'ready' | 'unavailable'
 */
export function useRecommendations(currentSong, limit = 8) {
  const [tracks, setTracks]   = useState([]);
  const [status, setStatus]   = useState('idle');
  const lastKeyRef = useRef(null);
  const abortRef   = useRef(null);

  useEffect(() => {
    const title  = currentSong?.title?.trim();
    // Normalize artist: if it's an object take .name, if comma-separated take first
    const rawArtist = currentSong?.artist;
    const artist = (typeof rawArtist === 'string'
      ? rawArtist.split(',')[0]
      : rawArtist?.name || ''
    ).trim();

    if (!title || !artist) {
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

    // Build request — Railway backend (via Vite proxy in dev, Vercel proxy in prod)
    const params = new URLSearchParams({ title, artist, limit: String(limit) });
    const url    = `/api/recommendations?${params}`;

    // 20-second timeout — Railway can be slow to cold-start
    const timeoutId = setTimeout(() => ac.abort(), 20000);

    fetch(url, { signal: ac.signal })
      .then(async res => {
        clearTimeout(timeoutId);

        if (res.status === 404) {
          memCache[key] = { tracks: [], ts: Date.now() };
          setTracks([]); setStatus('unavailable');
          return;
        }
        if (!res.ok) throw new Error(`/api/recommendations ${res.status}`);

        const data = await res.json();
        const list = (data.tracks || []).slice(0, limit);

        memCache[key] = { tracks: list, ts: Date.now() };
        setTracks(list);
        setStatus(list.length > 0 ? 'ready' : 'unavailable');
      })
      .catch(err => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          // Either song changed or 20s timeout hit
          if (!ac.signal.aborted || lastKeyRef.current !== key) return;
          // Timeout case — don't cache, just show unavailable
          console.warn('[useRecommendations] Timed out for:', title);
          setTracks([]); setStatus('unavailable');
          return;
        }
        console.warn('[useRecommendations]', err.message);
        setTracks([]); setStatus('unavailable');
      });

    return () => {
      clearTimeout(timeoutId);
      ac.abort();
    };
  }, [
    currentSong?.tidalId,
    currentSong?.id,
    currentSong?.title,
    limit,
  ]);

  return { tracks, status };
}
