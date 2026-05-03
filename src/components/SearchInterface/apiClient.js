/**
 * ApiClient — wired to the existing Smusic backend and tidalAPI
 *
 * Implements every method that SearchInterface.jsx calls:
 *   - Search: searchTracks / searchAlbums / searchArtists / searchPlaylists
 *   - Get:    getTrack / getAlbum / getPlaylist / getArtist
 *   - Import: importFromUrl / convertToTidal / convertSpotifyPlaylist / fetchSonglinkData
 *   - Stream: getStreamUrl / getCoverUrl / getArtistPictureUrl
 *   - URL detection helpers
 *   - Download: downloadTrack / downloadAlbum
 */

import { tidalAPI, downloadAlbum as tidalDownloadAlbum } from '../../lib/tidal/index.js';
import { extractSpotifyPlaylist, convertToTidal as apiConvertToTidal } from '../../lib/api/client.js';

export class ApiClient {
  constructor() {
    // No baseUrl / apiKey needed — we delegate to tidalAPI which handles
    // weighted multi-target routing internally.
  }

  // ===========================================================================
  // SEARCH
  // ===========================================================================

  async searchTracks(query, region = 'auto') {
    return tidalAPI.searchTracks(query, region);
  }

  async searchAlbums(query, region = 'auto') {
    return tidalAPI.searchAlbums(query, region);
  }

  async searchArtists(query, region = 'auto') {
    return tidalAPI.searchArtists(query, region);
  }

  async searchPlaylists(query, region = 'auto') {
    return tidalAPI.searchPlaylists(query, region);
  }


  // ===========================================================================
  // CONTENT RETRIEVAL
  // ===========================================================================

  async getTrack(id) {
    return tidalAPI.getTrack(id);
  }

  async getAlbum(id) {
    return tidalAPI.getAlbum(id);
  }

  async getArtist(id) {
    return tidalAPI.getArtist?.(id);
  }

  async getPlaylist(id) {
    return tidalAPI.getPlaylist?.(id);
  }

  // ===========================================================================
  // URL IMPORT & CONVERSION
  // ===========================================================================

  /**
   * Import a TIDAL URL — delegates directly to tidalAPI.importFromUrl
   */
  async importFromUrl(url) {
    return tidalAPI.importFromUrl(url);
  }

  /**
   * Convert any streaming URL to a TIDAL track/album/playlist via Songlink.
   * Returns { type: 'track'|'album'|'playlist', id } or null.
   */
  async convertToTidal(url, options = {}) {
    try {
      const data = await apiConvertToTidal(url, options.userCountry || 'US');
      if (!data) return null;

      // Extract TIDAL entity from songlink response
      const tidalEntity = this.extractTidalSongEntity(data);
      if (!tidalEntity) return null;

      // Determine type
      const entityId = data?.linksByPlatform?.tidal?.entityUniqueId || '';
      const isAlbum = entityId.includes('ALBUM') || entityId.includes('_ALBUM_');
      const isPlaylist = entityId.includes('PLAYLIST');

      const tidalId = this._parseTidalId(tidalEntity.id || entityId);
      if (!tidalId) return null;

      return {
        type: isAlbum ? 'album' : isPlaylist ? 'playlist' : 'track',
        id: tidalId,
      };
    } catch (err) {
      console.warn('[ApiClient] convertToTidal failed:', err.message);
      return null;
    }
  }

  /**
   * Fetch rich Spotify playlist tracks via the backend /api/spotify-playlist endpoint.
   * Returns an array of Spotify track URLs (strings).
   */
  async convertSpotifyPlaylist(playlistUrl) {
    const { songLinks } = await extractSpotifyPlaylist(playlistUrl);
    return songLinks || [];
  }

  /**
   * Fetch Songlink metadata for a streaming URL via /api/songlink
   */
  async fetchSonglinkData(trackUrl, options = {}) {
    return apiConvertToTidal(trackUrl, options.userCountry || 'US');
  }

  /**
   * Extract TIDAL entity object from a songlink response
   */
  extractTidalSongEntity(songlinkData) {
    if (!songlinkData) return null;
    const tidalPlatform = songlinkData.linksByPlatform?.['tidal'];
    if (!tidalPlatform) return null;
    const entity = songlinkData.entitiesByUniqueId?.[tidalPlatform.entityUniqueId];
    return entity || null;
  }

  // ===========================================================================
  // DOWNLOAD
  // ===========================================================================

  /**
   * Download a single track.
   * Delegates to tidalAPI.fetchTrackBlob then triggers a browser download.
   *
   * @param {number} trackId
   * @param {string} quality  — e.g. 'LOSSLESS'
   * @param {string} filename — suggested filename
   * @param {Object} options  — { signal, onProgress, convertAacToMp3 }
   */
  async downloadTrack(trackId, quality, filename, options = {}) {
    const { blob } = await tidalAPI.fetchTrackBlob(trackId, quality, filename, {
      signal: options.signal,
      convertAacToMp3: options.convertAacToMp3,
      skipEmbedding: true,
      onProgress: ({ stage, receivedBytes, totalBytes }) => {
        options.onProgress?.({ stage, receivedBytes, totalBytes, progress: totalBytes ? Math.round((receivedBytes / totalBytes) * 100) : 0 });
      },
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Download all tracks in an album (ZIP mode for >1 track, individual for 1).
   * Uses the shared tidalDownloadAlbum utility.
   *
   * @param {Object} album
   * @param {string} quality
   * @param {Object} callbacks — { onTotalResolved, onTrackDownloaded }
   */
  async downloadAlbum(album, quality, callbacks) {
    await tidalDownloadAlbum(album, quality, callbacks, undefined, { mode: 'zip' });
  }

  // ===========================================================================
  // STREAM & COVER URLS  (synchronous helpers used by the UI for <img> srcs)
  // ===========================================================================

  /**
   * Get stream URL for a track.  Used for playback (not downloads).
   */
  async getStreamUrl(trackId, quality) {
    return tidalAPI.getTrackStreamUrl?.(trackId, quality);
  }

  /**
   * Build a TIDAL cover image URL.
   * coverId is the UUID string stored on track.album.cover
   * size is e.g. '160', '320', '640', '1280'
   */
  getCoverUrl(coverId, size) {
    if (!coverId) return null;
    return tidalAPI.getCoverUrl?.(coverId, size)
      ?? `https://resources.tidal.com/images/${coverId.replace(/-/g, '/')}/${size}x${size}.jpg`;
  }

  /**
   * Build a TIDAL artist picture URL.
   */
  getArtistPictureUrl(pictureId) {
    if (!pictureId) return null;
    return `https://resources.tidal.com/images/${pictureId.replace(/-/g, '/')}/320x320.jpg`;
  }

  // ===========================================================================
  // URL DETECTION HELPERS  (synchronous — used by SearchInterface for UI hints)
  // ===========================================================================

  isTidalUrl(url) {
    return /^https?:\/\/(www\.)?tidal\.com/.test(url);
  }

  isSupportedStreamingUrl(url) {
    return /spotify\.com|youtube\.com|youtu\.be|music\.apple\.com|soundcloud\.com|deezer\.com/.test(url)
      && !this.isSpotifyPlaylistUrl(url);
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

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  _parseTidalId(raw) {
    if (!raw) return null;
    const str = String(raw);
    // e.g. "TIDAL_SONG::12345678" or just "12345678"
    const match = str.match(/::(\d+)/) || str.match(/^(\d+)$/);
    if (match) return Number(match[1]);
    return null;
  }
}

// Singleton shared across the app
export const apiClient = new ApiClient();
