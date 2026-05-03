import { useState } from 'react';
import { extractSpotifyPlaylist, convertToTidal, resolveUrl } from '../lib/api/client';
import { tidalAPI } from '../lib/tidal';
import { batchMatchTracks } from '../utils/songMatcher';

/**
 * Search TIDAL via the backend endpoint (server-side mirror retry — no 502 noise in browser).
 * Returns the same { items: [...] } shape as tidalAPI.searchTracks.
 */
async function backendSearchTracks(query) {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `/api/tidal-download/search?q=${encodeURIComponent(query)}&limit=20`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const { results } = await res.json();
        if (results && results.length > 0) {
          return {
            items: results.map((t) => ({
              id: t.id,
              title: t.title || '',
              duration: Math.round((t.durationMs || 0) / 1000),
              artist: { name: t.artist || '' },
              artists: t.artist ? [{ name: t.artist }] : [],
              album: { title: t.album || '', cover: t.albumCoverId || null },
              isrc: t.isrc || null,
            })),
            totalNumberOfItems: results.length,
          };
        }
        // Backend returned ok but 0 results — could be a bad mirror pick.
        // Retry (backend rotates to a different mirror each call).
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 300 * attempt));
          continue;
        }
      }
      // Non-ok response — retry
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 300 * attempt));
      }
    } catch {
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 300 * attempt));
      }
    }
  }
  // All retries exhausted — return empty (better than causing a 502 flood)
  return { items: [], totalNumberOfItems: 0 };
}

/**
 * Clean and extract a Spotify/TIDAL URL from pasted text.
 * Mobile share text often looks like:
 *   "Check out this song on Spotify: https://open.spotify.com/track/...?si=abc"
 *   "https://spotify.link/AbCdEfGh"
 * This function extracts the actual URL and strips tracking params.
 */
function cleanUrl(raw) {
  const trimmed = raw.trim();

  // Try to extract a URL from surrounding share text
  const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/i);
  let url = urlMatch ? urlMatch[1] : trimmed;

  // Remove trailing punctuation that might have been captured
  url = url.replace(/[.,;:!?)]+$/, '');

  // Strip known tracking query params (si, utm_*, nd, dl_branch, etc.)
  try {
    const parsed = new URL(url);
    const keepParams = new URLSearchParams();
    for (const [key, val] of parsed.searchParams) {
      // Keep only meaningful params, drop tracking ones
      if (!['si', 'nd', 'dl_branch', 'context', '_branch_match_id',
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
            'feature', 'app_destination'].includes(key)) {
        keepParams.set(key, val);
      }
    }
    parsed.search = keepParams.toString() ? `?${keepParams}` : '';
    url = parsed.toString();
  } catch {
    // Not a valid URL, return as-is
  }

  return url;
}

/**
 * Detect URL type from a Spotify or TIDAL link
 */
function detectUrlType(url) {
  const trimmed = url.trim();
  if (trimmed.includes('open.spotify.com/playlist/') || trimmed.includes('spotify:playlist:'))
    return 'spotify-playlist';
  if (trimmed.includes('open.spotify.com/track/') || trimmed.includes('spotify:track:'))
    return 'spotify-track';
  if (trimmed.includes('open.spotify.com/album/') || trimmed.includes('spotify:album:'))
    return 'spotify-album';
  if (trimmed.includes('tidal.com/')) return 'tidal';
  // Spotify mobile shortened links (e.g. https://spotify.link/AbCdEfGh)
  if (trimmed.includes('spotify.link/')) return 'spotify-short';
  if (trimmed.startsWith('http')) return 'unknown-url';
  return 'invalid';
}

/**
 * Resolve a shortened Spotify URL (spotify.link) to the real open.spotify.com URL.
 * Falls back to the original URL if resolution fails.
 */
async function resolveShortUrl(url) {
  try {
    const resolved = await resolveUrl(url);
    if (resolved && resolved !== url) {
      console.log(`[resolve] ${url} → ${resolved}`);
      return resolved;
    }
  } catch (err) {
    console.warn(`[resolve] Failed to resolve ${url}:`, err.message);
  }
  return url;
}

/**
 * Extract TIDAL numeric ID from a songlink API response.
 */
function parseTidalIdFromSonglink(data) {
  if (!data) return null;

  const entityId = data?.linksByPlatform?.tidal?.entityUniqueId;
  if (entityId) {
    const match = entityId.match(/TIDAL_SONG::(\d+)/);
    if (match) return Number(match[1]);
  }

  const entities = data?.entitiesByUniqueId;
  if (entities) {
    for (const [key, val] of Object.entries(entities)) {
      if (key.startsWith('TIDAL_SONG::')) {
        const id = Number(val?.id || key.replace('TIDAL_SONG::', ''));
        if (id) return id;
      }
    }
  }

  if (data?.tidalId) return Number(data.tidalId);
  return null;
}

/**
 * Enrich a single spotify track that already has pre-fetched metadata from
 * the playlist (title, artist, ISRC, albumArt).
 *
 * Matching priority:
 *  1. ISRC search on TIDAL  → exact match (same recording)
 *  2. Title + Artist search → best-effort with artist validation
 */
async function enrichFromMetadata(spotifyMeta) {
  const { spotifyId, spotifyUrl, title, artist, album, albumArt, isrc, durationMs } = spotifyMeta;

  let tidalId = null;
  let tidalTrack = null;
  let canDownload = false;
  let resolvedAlbumArt = albumArt;

  // ── Strategy 1: ISRC search ───────────────────────────────────────────────
  if (isrc) {
    try {
      const results = await backendSearchTracks(`isrc:${isrc}`);
      if (results?.items?.length > 0) {
        // ISRC results are exact — always take the first
        tidalTrack = results.items[0];
        tidalId = tidalTrack.id;
        canDownload = true;
        if (tidalTrack.album?.cover) {
          resolvedAlbumArt = `https://resources.tidal.com/images/${tidalTrack.album.cover.replace(/-/g, '/')}/640x640.jpg`;
        }
        console.log(`[enrich] ISRC match: "${title}" (${isrc}) → TIDAL ${tidalId}`);
      }
    } catch (err) {
      console.warn(`[enrich] ISRC search failed for "${title}" (${isrc}):`, err.message);
    }
  }

  // ── Strategy 2: Title + Artist search (with artist validation) ────────────
  if (!tidalId && title) {
    const query = artist ? `${title} ${artist}` : title;
    try {
      const results = await backendSearchTracks(query);
      if (results?.items?.length > 0) {
        // Try to find a result where the artist name roughly matches
        const artistLower = artist?.toLowerCase() || '';
        const match = results.items.find(item => {
          const itemArtist = (item.artist?.name || item.artists?.[0]?.name || '').toLowerCase();
          return !artistLower || itemArtist.includes(artistLower) || artistLower.includes(itemArtist);
        }) || results.items[0]; // fallback to first if no artist match

        tidalTrack = match;
        tidalId = match.id;
        canDownload = true;
        if (match.album?.cover) {
          resolvedAlbumArt = `https://resources.tidal.com/images/${match.album.cover.replace(/-/g, '/')}/640x640.jpg`;
        }
        console.log(`[enrich] Text match: "${title}" → TIDAL ${tidalId} ("${match.title}" by ${match.artist?.name || '?'})`, tidalId === (results.items[0]?.id) && match !== results.items[0] ? '(artist-validated)' : '');
      }
    } catch (err) {
      console.warn(`[enrich] Text search failed for "${title}":`, err.message);
    }
  }

  return {
    spotifyId,
    spotifyUrl,
    title: tidalTrack?.title || title || 'Unknown',
    artist: tidalTrack?.artist?.name || tidalTrack?.artists?.[0]?.name || artist || 'Unknown',
    album: tidalTrack?.album?.title || album || '',
    albumArt: resolvedAlbumArt || null,
    previewUrl: null,
    isrc: isrc || null,
    explicit: tidalTrack?.explicit || false,
    tidalId,
    tidalTrack,
    canDownload,
    durationMs,
  };
}

/**
 * Enrich a single Spotify track URL the old way (via songlink).
 * Used for single-track and album imports where we don't have pre-fetched metadata.
 */
async function enrichSpotifyUrl(spotifyUrl) {
  const trackId = spotifyUrl.split('/track/')[1]?.split('?')[0] || '';

  let title = trackId ? `Track ${trackId.slice(0, 8)}…` : 'Unknown';
  let artist = 'Unknown';
  let albumArt = null;
  let tidalId = null;
  let tidalTrack = null;
  let canDownload = false;

  try {
    const songlinkData = await convertToTidal(spotifyUrl);

    if (songlinkData) {
      title = songlinkData.title || title;
      artist = songlinkData.artistName || artist;
      albumArt = songlinkData.thumbnailUrl || albumArt;

      const parsedId = parseTidalIdFromSonglink(songlinkData);
      if (parsedId) {
        tidalId = parsedId;
        canDownload = true;

        try {
          const result = await tidalAPI.getTrack(tidalId);
          const track = result?.track ?? result;
          if (track) {
            tidalTrack = track;
            title = track.title || title;
            artist = track.artist?.name || track.artists?.[0]?.name || artist;
            if (track.album?.cover) {
              albumArt = `https://resources.tidal.com/images/${track.album.cover.replace(/-/g, '/')}/640x640.jpg`;
            }
          }
        } catch (tidalErr) {
          console.warn(`[enrichSpotifyUrl] TIDAL getTrack failed for ID ${tidalId}:`, tidalErr.message);
        }
      }
    }

    if (!tidalId) {
      const isPlaceholder = !title || title.startsWith('Track ') || artist === 'Unknown';
      const searchQuery = songlinkData?._searchQuery || (!isPlaceholder ? `${title} ${artist}`.trim() : null);

      if (searchQuery) {
        try {
          const results = await backendSearchTracks(searchQuery);
          if (results?.items?.length > 0) {
            tidalTrack = results.items[0];
            tidalId = tidalTrack.id;
            canDownload = true;
            title = tidalTrack.title || title;
            artist = tidalTrack.artist?.name || tidalTrack.artists?.[0]?.name || artist;
            if (tidalTrack.album?.cover) {
              albumArt = `https://resources.tidal.com/images/${tidalTrack.album.cover.replace(/-/g, '/')}/640x640.jpg`;
            }
          }
        } catch (searchErr) {
          console.warn(`[enrichSpotifyUrl] TIDAL search failed for "${searchQuery}":`, searchErr.message);
        }
      }
    }
  } catch (enrichErr) {
    console.warn(`[enrichSpotifyUrl] Failed for ${spotifyUrl}:`, enrichErr.message);
  }

  return {
    spotifyId: trackId,
    spotifyUrl,
    title,
    artist,
    album: tidalTrack?.album?.title || '',
    albumArt,
    previewUrl: null,
    isrc: null,
    explicit: tidalTrack?.explicit || false,
    tidalId,
    tidalTrack,
    canDownload,
  };
}

export function usePlaylistImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, stage: '', message: '' });
  const [importedTracks, setImportedTracks] = useState([]);
  const [playlistName, setPlaylistName] = useState('');
  const [error, setError] = useState(null);

  const importPlaylist = async (rawUrl) => {
    setIsImporting(true);
    setError(null);

    try {
      // ── Clean the pasted text: extract URL, strip tracking params ──
      let url = cleanUrl(rawUrl);
      let urlType = detectUrlType(url);

      // ── Resolve shortened spotify.link URLs ──
      if (urlType === 'spotify-short') {
        setProgress({ current: 0, total: 0, stage: 'resolving', message: 'Resolving shortened link…' });
        url = await resolveShortUrl(url);
        urlType = detectUrlType(url);
        // If still unresolved, the server-side resolve will handle it
        if (urlType === 'spotify-short' || urlType === 'unknown-url') {
          // Try as a track via songlink as last resort
          urlType = 'unknown-url';
        }
      }

      // ── Spotify playlist: extract rich metadata directly, use ISRC for TIDAL ──
      if (urlType === 'spotify-playlist') {
        setProgress({ current: 0, total: 0, stage: 'fetching', message: 'Fetching Spotify playlist…' });

        const { tracks: spotifyTracks, playlistName: pName } = await extractSpotifyPlaylist(url);
        if (pName) setPlaylistName(pName);

        if (!spotifyTracks || spotifyTracks.length === 0) {
          throw new Error('No tracks found in this playlist. Make sure it is public.');
        }

        setProgress({
          current: 0,
          total: spotifyTracks.length,
          stage: 'enriching',
          message: `Found ${spotifyTracks.length} tracks. Matching on TIDAL…`,
        });

        const enrichedTracks = [];
        for (let i = 0; i < spotifyTracks.length; i++) {
          const enriched = await enrichFromMetadata(spotifyTracks[i]);
          enrichedTracks.push(enriched);

          setProgress({
            current: i + 1,
            total: spotifyTracks.length,
            stage: 'enriching',
            message: `${i + 1}/${spotifyTracks.length}: ${enriched.title}`,
          });

          // Throttle to avoid TIDAL rate limits
          if (spotifyTracks.length > 1) {
            await new Promise(r => setTimeout(r, 200));
          }
        }

        setProgress({ current: enrichedTracks.length, total: enrichedTracks.length, stage: 'matching', message: 'Matching against local library…' });
        const matched = await batchMatchTracks(enrichedTracks);
        setImportedTracks(matched);
        setProgress({ current: matched.length, total: matched.length, stage: 'complete', message: `Imported ${matched.length} track(s)!` });
        setIsImporting(false);
        return matched;
      }

      // ── Single track / album / TIDAL URL: use songlink as before ─────────────
      let songLinks = [];
      if (urlType === 'spotify-track' || urlType === 'spotify-album' || urlType === 'unknown-url' || urlType === 'tidal') {
        songLinks = [url];
      } else if (urlType === 'invalid') {
        throw new Error('That doesn\'t look like a valid URL. Paste a Spotify or TIDAL link (playlist, track, or album).');
      } else {
        throw new Error('Unsupported URL. Paste a Spotify playlist, track, or album link.');
      }

      setProgress({ current: 0, total: songLinks.length, stage: 'enriching', message: `Fetching TIDAL data…` });

      const enrichedTracks = [];
      for (let i = 0; i < songLinks.length; i++) {
        const enriched = await enrichSpotifyUrl(songLinks[i]);
        enrichedTracks.push(enriched);
        setProgress({ current: i + 1, total: songLinks.length, stage: 'enriching', message: `Processed: ${enriched.title}` });
        if (songLinks.length > 1) await new Promise(r => setTimeout(r, 150));
      }

      setProgress({ current: enrichedTracks.length, total: enrichedTracks.length, stage: 'matching', message: 'Matching against local library…' });
      const matched = await batchMatchTracks(enrichedTracks);
      setImportedTracks(matched);
      setProgress({ current: matched.length, total: matched.length, stage: 'complete', message: `Imported ${matched.length} track(s)!` });
      setIsImporting(false);
      return matched;

    } catch (err) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to import');
      setIsImporting(false);
      return null;
    }
  };

  const reset = () => {
    setImportedTracks([]);
    setPlaylistName('');
    setProgress({ current: 0, total: 0, stage: '', message: '' });
    setError(null);
  };

  return { importPlaylist, isImporting, progress, importedTracks, playlistName, error, reset };
}
