import { useState } from 'react';
import { extractSpotifyPlaylist, convertToTidal } from '../lib/api/client';
import { tidalAPI } from '../lib/tidal';
import { batchMatchTracks } from '../utils/songMatcher';

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
  if (trimmed.startsWith('http')) return 'unknown-url';
  return 'invalid';
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
      const results = await tidalAPI.searchTracks(`isrc:${isrc}`);
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
      const results = await tidalAPI.searchTracks(query);
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
          const results = await tidalAPI.searchTracks(searchQuery);
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

  const importPlaylist = async (url) => {
    setIsImporting(true);
    setError(null);

    try {
      const urlType = detectUrlType(url);

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
