const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiry = 0;

// Force token refresh
export function clearSpotifyToken() {
  cachedToken = null;
  tokenExpiry = 0;
}

export async function getSpotifyToken() {
  if (cachedToken && Date.now() < (tokenExpiry - 60000)) {
    return cachedToken;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    throw new Error(`Token error: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  return cachedToken;
}

export function extractPlaylistId(url) {
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  if (!match) throw new Error('Invalid Spotify playlist URL');
  return match[1];
}

export async function getSpotifyPlaylist(playlistUrl, retryCount = 0) {
  const playlistId = extractPlaylistId(playlistUrl);
  let token = await getSpotifyToken();

  let allTracks = [];
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // Auto-retry on 403
    if (response.status === 403 && retryCount < 2) {
      clearSpotifyToken();
      return getSpotifyPlaylist(playlistUrl, retryCount + 1);
    }

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data = await response.json();
    allTracks.push(...data.items);
    nextUrl = data.next;
  }

  return allTracks.map(item => ({
    spotifyId: item.track.id,
    title: item.track.name,
    artist: item.track.artists.map(a => a.name).join(', '),
    album: item.track.album.name,
    albumArt: item.track.album.images[0]?.url,
    duration: item.track.duration_ms / 1000,
    previewUrl: item.track.preview_url,
    spotifyUrl: item.track.external_urls.spotify,
    isrc: item.track.external_ids?.isrc,
    explicit: item.track.explicit
  })).filter(track => track.isrc);
}