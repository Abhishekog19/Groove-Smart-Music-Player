/**
 * Antigravity API Client
 * Calls the Express backend API routes.
 */

/**
 * Make a proxied API call through /api/proxy
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
 * Search TIDAL tracks via the proxy route
 */
export async function searchTracks(query, limit = 50) {
  const url = `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}`;
  const response = await proxyFetch(url);
  if (!response.ok) {
    throw new Error(`Search failed for "${query}": ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get TIDAL track info
 */
export async function getTrackInfo(trackId) {
  const url = `https://api.tidal.com/v1/tracks/${trackId}`;
  const response = await proxyFetch(url);
  if (!response.ok) throw new Error(`Failed to fetch track ${trackId}`);
  return response.json();
}

/**
 * Get TIDAL album info
 */
export async function getAlbumInfo(albumId) {
  const url = `https://api.tidal.com/v1/albums/${albumId}`;
  const response = await proxyFetch(url);
  if (!response.ok) throw new Error(`Failed to fetch album ${albumId}`);
  return response.json();
}

/**
 * Get TIDAL artist info
 */
export async function getArtistInfo(artistId) {
  const url = `https://api.tidal.com/v1/artists/${artistId}`;
  const response = await proxyFetch(url);
  if (!response.ok) throw new Error(`Failed to fetch artist ${artistId}`);
  return response.json();
}
