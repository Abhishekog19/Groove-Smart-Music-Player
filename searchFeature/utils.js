/**
 * Utility functions for formatting and API operations
 * JavaScript version without TypeScript
 */

import { isSonglinkTrack, asTrack } from './types.js';

/**
 * Format artists array into a string
 * @param {Array<{name: string}>} artists
 * @returns {string}
 */
export function formatArtists(artists) {
  if (!artists || artists.length === 0) return 'Unknown Artist';
  return artists.map(a => a.name).join(', ');
}

/**
 * Format seconds to MM:SS format
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format audio quality to display label
 * @param {string} quality
 * @returns {string}
 */
export function formatQualityLabel(quality) {
  if (!quality) return '—';
  const normalized = quality.toUpperCase();
  if (normalized === 'LOSSLESS') {
    return 'CD • 16-bit/44.1 kHz FLAC';
  }
  if (normalized === 'HI_RES_LOSSLESS') {
    return 'Hi-Res • up to 24-bit/192 kHz FLAC';
  }
  return quality;
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get file extension for audio quality
 * @param {string} quality
 * @param {boolean} [convertToMp3]
 * @returns {string}
 */
export function getExtensionForQuality(quality, convertToMp3) {
  if (convertToMp3) return 'mp3';
  if (quality === 'HI_RES_LOSSLESS' || quality === 'LOSSLESS') return 'flac';
  return 'mp4';
}

/**
 * Get long share link
 * @param {'track' | 'album' | 'artist' | 'playlist'} type
 * @param {string | number} id
 * @param {string} [baseUrl]
 * @returns {string}
 */
export function getLongLink(type, id, baseUrl) {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return `${base}/${type}/${id}`;
}

/**
 * Get short share link
 * @param {'track' | 'album' | 'artist' | 'playlist'} type
 * @param {string | number} id
 * @returns {string}
 */
export function getShortLink(type, id) {
  const prefixMap = {
    track: 't',
    album: 'al',
    artist: 'ar',
    playlist: 'p'
  };
  return `https://okiw.me/${prefixMap[type]}/${id}`;
}

/**
 * Get embed code
 * @param {'track' | 'album' | 'artist' | 'playlist'} type
 * @param {string | number} id
 * @param {string} [baseUrl]
 * @returns {string}
 */
export function getEmbedCode(type, id, baseUrl) {
  const base = baseUrl || 'https://music.binimum.org';
  const height = type === 'track' ? 150 : 450;
  return `<iframe src="${base}/embed/${type}/${id}" width="100%" height="${height}" style="border:none; overflow:hidden; border-radius: 0.5em;" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
}

/**
 * Copy text to clipboard
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    }
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Get filename for track download
 * @param {Object} track
 * @param {string} quality
 * @param {boolean} [convertToMp3]
 * @returns {string}
 */
export function getTrackFilename(track, quality, convertToMp3) {
  const artistName = isSonglinkTrack(track) ? track.artistName : formatArtists(track.artists);
  let title = track.title;
  if (track.version) {
    title = `${title} (${track.version})`;
  }
  const extension = getExtensionForQuality(quality, convertToMp3);
  return `${artistName} - ${title}.${extension}`;
}

/**
 * Get track duration
 * @param {Object} track
 * @returns {number}
 */
export function getTrackDuration(track) {
  return track.duration || 0;
}

/**
 * Get track artist name
 * @param {Object} track
 * @returns {string}
 */
export function getTrackArtist(track) {
  if (isSonglinkTrack(track)) {
    return track.artistName;
  }
  return formatArtists(track.artists);
}

/**
 * Get track album title
 * @param {Object} track
 * @returns {string | undefined}
 */
export function getTrackAlbumTitle(track) {
  if (track.album && track.album.title) {
    return track.album.title;
  }
  return undefined;
}

/**
 * Fetch with retry logic
 * @template T
 * @param {() => Promise<T>} action
 * @param {number} [attempts=3]
 * @param {number} [delayMs=250]
 * @returns {Promise<T>}
 */
export async function fetchWithRetry(action, attempts = 3, delayMs = 250) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

/**
 * Check if track ID is valid
 * @param {number | string} id
 * @returns {boolean}
 */
export function isValidTrackId(id) {
  if (typeof id === 'number') {
    return Number.isFinite(id) && id > 0;
  }
  const num = Number(id);
  return Number.isFinite(num) && num > 0;
}

/**
 * Check if track is valid
 * @param {Object} track
 * @returns {boolean}
 */
export function isValidPlayableTrack(track) {
  return (
    track.title &&
    track.title.length > 0 &&
    track.duration !== undefined &&
    isValidTrackId(track.id)
  );
}
