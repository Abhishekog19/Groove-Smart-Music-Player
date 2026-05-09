/**
 * src/lib/api/client.js
 *
 * Backend API helpers that talk to our Express server routes.
 *
 * NOTE: All TIDAL content queries (tracks, albums, artists) are delegated
 * to `tidalAPI` (src/lib/tidal) which uses 10 weighted proxy mirrors with
 * automatic failover.  Do NOT call https://api.tidal.com/v1 directly from
 * the frontend — it requires an auth token and bypasses the load balancer.
 */

import { tidalAPI } from '../tidal/index.js';

/**
 * Make a raw proxied API call through /api/proxy.
 * Prefer the named helpers below for TIDAL content.
 */
export async function proxyFetch(url) {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
  return fetch(proxyUrl);
}

/**
 * Convert a streaming URL (Spotify) to TIDAL via /api/songlink
 */
export async function convertToTidal(streamingUrl, userCountry = 'US') {
  const params = new URLSearchParams({ url: streamingUrl, userCountry });
  const response = await fetch(`/api/songlink?${params}`);
  if (!response.ok) {
    throw new Error(`Songlink conversion failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Extract all track URLs from a Spotify playlist via /api/spotify-playlist
 * @returns {Promise<string[]>} Array of Spotify track URLs
 */
export async function extractSpotifyPlaylist(playlistUrl) {
  const response = await fetch('/api/spotify-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistUrl }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Playlist extraction failed: ${response.statusText}`);
  }
  const data = await response.json();
  return {
    tracks: data.tracks || [],           // rich track objects with ISRC
    songLinks: data.songLinks || [],     // backwards compat
    playlistName: data.playlistName || 'Spotify Playlist',
  };
}


/**
 * Resolve a shortened URL (e.g. spotify.link) to its final destination.
 * Used for mobile Spotify share links.
 */
export async function resolveUrl(shortUrl) {
  const response = await fetch(`/api/resolve-url?url=${encodeURIComponent(shortUrl)}`);
  if (!response.ok) {
    throw new Error(`URL resolution failed: ${response.status}`);
  }
  const data = await response.json();
  return data.resolvedUrl || shortUrl;
}

/**
 * Search TIDAL tracks.
 * Delegates to tidalAPI.searchTracks — routes through 10 weighted proxy mirrors.
 *
 * @param {string} query
 * @param {number} limit  - max results to return (client-side slice)
 * @returns {Promise<{ items: Track[], totalNumberOfItems: number }>}
 */
export async function searchTracks(query, limit = 50) {
  const data = await tidalAPI.searchTracks(query);
  if (limit && data?.items) {
    data.items = data.items.slice(0, limit);
  }
  return data;
}

/**
 * Get TIDAL track info + stream manifest.
 * Delegates to tidalAPI.getTrack — routes through proxy mirrors.
 *
 * @param {number} trackId
 * @param {string} [quality]
 * @returns {Promise<TrackLookup>}  { track, info, originalTrackUrl? }
 */
export async function getTrackInfo(trackId, quality = 'LOSSLESS') {
  return tidalAPI.getTrack(trackId, quality);
}

/**
 * Get TIDAL album with all tracks.
 * Delegates to tidalAPI.getAlbum — routes through proxy mirrors.
 *
 * @param {number} albumId
 * @returns {Promise<{ album: Album, tracks: Track[] }>}
 */
export async function getAlbumInfo(albumId) {
  return tidalAPI.getAlbum(albumId);
}

/**
 * Get TIDAL artist with discography and top tracks.
 * Delegates to tidalAPI.getArtist — routes through proxy mirrors.
 *
 * @param {number} artistId
 * @returns {Promise<ArtistDetails>}
 */
export async function getArtistInfo(artistId) {
  return tidalAPI.getArtist(artistId);
}
