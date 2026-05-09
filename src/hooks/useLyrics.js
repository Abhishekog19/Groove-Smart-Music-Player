import { useState, useEffect, useRef } from 'react';

// ─── LRC Parser ─────────────────────────────────────────────────────────────
// Handles the standard LRC format: [MM:SS.cs] lyric line
// Also handles extended [MM:SS:ms] and [MM:SS,ms] variants

function parseLRC(raw) {
  if (!raw || typeof raw !== 'string') return [];

  const lines = [];
  // Matches: [MM:SS.cs], [MM:SS:ms], [MM:SS,ms], [M:SS.cs]
  const re = /\[(\d{1,2}):(\d{2})[.:,](\d{1,3})\]\s*(.*)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const [, mm, ss, frac, text] = m;
    // Normalize fraction to milliseconds (2 digits = centiseconds, 3 = ms)
    const ms = frac.length === 3
      ? parseInt(frac, 10)
      : parseInt(frac.padEnd(3, '0'), 10);
    const time = parseInt(mm, 10) * 60 + parseInt(ss, 10) + ms / 1000;
    const clean = text.trim();
    if (clean) lines.push({ time, text: clean });
  }

  return lines.sort((a, b) => a.time - b.time);
}

// ─── Simple localStorage cache ───────────────────────────────────────────────
// Keyed by "title|||artist" — persists across reloads for 30 days

const CACHE_PREFIX  = 'smusic_lyrics_';
const CACHE_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days

function makeCacheKey(title, artist) {
  return CACHE_PREFIX + btoa(`${title}|||${artist}`).replace(/[^a-zA-Z0-9]/g, '');
}

function readFromCache(title, artist) {
  try {
    const key  = makeCacheKey(title, artist);
    const raw  = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) { localStorage.removeItem(key); return null; }
    return entry.data;
  } catch { return null; }
}

function writeToCache(title, artist, data) {
  try {
    const key = makeCacheKey(title, artist);
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* localStorage full — skip */ }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useLyrics
 *
 * Fetches lyrics for the currently playing song from /api/lyrics
 * (lrclib.net → lyrics.ovh fallback chain on the backend).
 *
 * Works for ALL songs with a title + artist — not just TIDAL tracks.
 * Results are cached in localStorage for 30 days.
 *
 * Returns:
 *   lines        {time, text}[]  — parsed, sorted lyric lines
 *   activeIndex  number          — index of currently active line (-1 = before first)
 *   status       string          — 'idle' | 'loading' | 'ready' | 'unavailable'
 *   isSynced     boolean         — true if real timestamps, false if estimated
 */
export function useLyrics(currentSong, currentTime) {
  const [lines,       setLines]       = useState([]);
  const [status,      setStatus]      = useState('idle');
  const [isSynced,    setIsSynced]    = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Track the last fetched song to avoid duplicate fetches
  const lastKeyRef = useRef(null);

  // ── Fetch lyrics when song changes ──────────────────────────────────────────
  useEffect(() => {
    const title  = currentSong?.title;
    const artist = currentSong?.artist;

    if (!title || !artist) {
      setLines([]); setStatus('idle'); setIsSynced(false);
      lastKeyRef.current = null;
      return;
    }

    const key = `${title}|||${artist}`;
    if (lastKeyRef.current === key) return; // same song, skip
    lastKeyRef.current = key;

    // ── Check localStorage cache ─────────────────────────────────────────────
    const cached = readFromCache(title, artist);
    if (cached) {
      setLines(cached.lines);
      setIsSynced(cached.isSynced);
      setStatus(cached.lines.length > 0 ? 'ready' : 'unavailable');
      return;
    }

    setStatus('loading');
    setLines([]);

    // ── Call /api/lyrics ─────────────────────────────────────────────────────
    const params = new URLSearchParams({ title, artist });
    if (currentSong.album)           params.set('album',    currentSong.album);
    if (currentSong.durationSeconds) params.set('duration', String(currentSong.durationSeconds));

    fetch(`/api/lyrics?${params}`)
      .then(async (res) => {
        if (res.status === 404) {
          // Backend tried all providers, nothing found
          const cacheEntry = { lines: [], isSynced: false };
          writeToCache(title, artist, cacheEntry);
          setLines([]); setIsSynced(false); setStatus('unavailable');
          return;
        }
        if (!res.ok) throw new Error(`/api/lyrics returned ${res.status}`);

        const data = await res.json();
        const raw  = data.syncedLyrics || data.plainLyrics || '';
        const parsed = parseLRC(raw);
        const synced = data.isSynced ?? !!data.syncedLyrics;

        const cacheEntry = { lines: parsed, isSynced: synced };
        writeToCache(title, artist, cacheEntry);

        setLines(parsed);
        setIsSynced(synced);
        setStatus(parsed.length > 0 ? 'ready' : 'unavailable');
      })
      .catch((err) => {
        console.warn('[useLyrics] Fetch error:', err.message);
        setLines([]); setIsSynced(false); setStatus('unavailable');
      });
  }, [currentSong]);

  // ── Track active line via binary search (runs up to 60×/sec) ───────────────
  useEffect(() => {
    if (lines.length === 0) { setActiveIndex(-1); return; }

    let lo = 0, hi = lines.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].time <= currentTime) { idx = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    setActiveIndex(idx);
  }, [lines, currentTime]);

  return { lines, activeIndex, status, isSynced };
}
