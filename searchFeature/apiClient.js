/**
 * API Client for Search Interface
 * JavaScript implementation without TypeScript
 */

/**
 * API Client class with all required methods for SearchInterface
 */
export class ApiClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  // =========================================================================
  // SEARCH METHODS
  // =========================================================================

  async searchTracks(query, region = 'auto') {
    const response = await fetch(
      `${this.baseUrl}/search?type=track&q=${encodeURIComponent(query)}&region=${region}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return response.json();
  }

  async searchAlbums(query, region = 'auto') {
    const response = await fetch(
      `${this.baseUrl}/search?type=album&q=${encodeURIComponent(query)}&region=${region}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return response.json();
  }

  async searchArtists(query, region = 'auto') {
    const response = await fetch(
      `${this.baseUrl}/search?type=artist&q=${encodeURIComponent(query)}&region=${region}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return response.json();
  }

  async searchPlaylists(query, region = 'auto') {
    const response = await fetch(
      `${this.baseUrl}/search?type=playlist&q=${encodeURIComponent(query)}&region=${region}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return response.json();
  }

  // =========================================================================
  // CONTENT RETRIEVAL
  // =========================================================================

  async getTrack(id) {
    const response = await fetch(`${this.baseUrl}/tracks/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return response.json();
  }

  async getAlbum(id) {
    const response = await fetch(`${this.baseUrl}/albums/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return response.json();
  }

  async getArtist(id) {
    const response = await fetch(`${this.baseUrl}/artists/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return response.json();
  }

  async getPlaylist(id) {
    const response = await fetch(`${this.baseUrl}/playlists/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return response.json();
  }

  // =========================================================================
  // DOWNLOAD METHODS
  // =========================================================================

  async downloadTrack(trackId, quality, filename, options = {}) {
    const response = await fetch(
      `${this.baseUrl}/download/track/${trackId}?quality=${quality}&filename=${encodeURIComponent(filename)}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: options.signal,
      }
    );

    const reader = response.body?.getReader();
    if (!reader) return;

    const contentLength = Number(response.headers.get('content-length'));
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedLength += value.length;
      options.onProgress?.({
        stage: 'downloading',
        receivedBytes: receivedLength,
        totalBytes: contentLength,
        progress: Math.round((receivedLength / contentLength) * 100),
      });
    }
  }

  async downloadAlbum(album, quality, callbacks) {
    // Implementation would fetch all tracks and download them
    throw new Error('Not implemented');
  }

  // =========================================================================
  // URL IMPORT & CONVERSION
  // =========================================================================

  async importFromUrl(url) {
    const response = await fetch(`${this.baseUrl}/import?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return response.json();
  }

  async convertToTidal(url, options = {}) {
    const response = await fetch(
      `${this.baseUrl}/convert?url=${encodeURIComponent(url)}&country=${options.userCountry || 'US'}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    if (!response.ok) return null;
    return response.json();
  }

  async convertSpotifyPlaylist(playlistUrl) {
    const response = await fetch(
      `${this.baseUrl}/spotify/playlist?url=${encodeURIComponent(playlistUrl)}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    const data = await response.json();
    return data.tracks || [];
  }

  async fetchSonglinkData(trackUrl, options = {}) {
    const response = await fetch(
      `${this.baseUrl}/songlink?url=${encodeURIComponent(trackUrl)}&country=${options.userCountry || 'US'}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return response.json();
  }

  extractTidalSongEntity(songlinkData) {
    const tidalPlatform = songlinkData.linksByPlatform['tidal'];
    if (!tidalPlatform) return null;

    const entity = songlinkData.entitiesByUniqueId[tidalPlatform.entityUniqueId];
    return entity || null;
  }

  // =========================================================================
  // URL & STREAM UTILITIES
  // =========================================================================

  async getStreamUrl(trackId, quality) {
    const response = await fetch(`${this.baseUrl}/stream/${trackId}?quality=${quality}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const data = await response.json();
    return data.url;
  }

  getCoverUrl(coverId, size) {
    return `${this.baseUrl}/cover/${coverId}?size=${size}`;
  }

  getArtistPictureUrl(pictureId) {
    if (!pictureId) return '/placeholder-artist.jpg';
    return `${this.baseUrl}/artist-picture/${pictureId}`;
  }

  getVideoCoverUrl(videoCoverId, size) {
    return `${this.baseUrl}/video-cover/${videoCoverId}?size=${size}`;
  }

  formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // =========================================================================
  // URL DETECTION
  // =========================================================================

  isTidalUrl(url) {
    return /^https?:\/\/(www\.)?tidal\.com/.test(url);
  }

  isSupportedStreamingUrl(url) {
    return /spotify\.com|youtube\.com|music\.apple\.com|soundcloud\.com|deezer\.com/.test(url);
  }

  isSpotifyPlaylistUrl(url) {
    return /spotify\.com\/(intl-\w+\/)?playlist/.test(url);
  }

  getPlatformName(url) {
    if (/spotify\.com/.test(url)) return 'Spotify';
    if (/youtube\.com|youtu\.be/.test(url)) return 'YouTube';
    if (/music\.apple\.com|itunes\.apple\.com/.test(url)) return 'Apple Music';
    if (/soundcloud\.com/.test(url)) return 'SoundCloud';
    if (/deezer\.com/.test(url)) return 'Deezer';
    return 'Streaming';
  }
}

// ============================================================================
// EXPORT SINGLETON INSTANCE (optional)
// ============================================================================

const baseUrl = process.env.REACT_APP_API_BASE_URL || process.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const apiKey = process.env.REACT_APP_API_KEY || process.env.VITE_API_KEY || '';

export const apiClient = new ApiClient(baseUrl, apiKey);

/**
 * Usage:
 * 
 * import { apiClient } from './apiClient.js';
 * 
 * Then use in component:
 * <SearchInterface apiClient={apiClient} />
 */
