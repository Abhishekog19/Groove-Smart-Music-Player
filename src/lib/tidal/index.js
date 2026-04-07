// TIDAL API Client — React Compatible Barrel Export
// Use: import { tidalAPI } from '../lib/tidal'

export { losslessAPI as tidalAPI, losslessAPI } from './api.js';
export { isSonglinkTrack } from './types.js';
export { formatArtists, formatArtistsForMetadata } from './utils.js';
export { downloadAlbum, buildTrackFilename, sanitizeForFilename } from './downloads.js';
export { isFFmpegSupported, getFFmpeg } from './ffmpegClient.js';
