/**
 * Type definitions and JSDoc types for Search Interface
 * Using JSDoc for runtime type documentation without TypeScript
 */

/**
 * @typedef {('LOSSLESS' | 'HI_RES_LOSSLESS' | 'HIGH' | 'NORMAL' | 'LOW')} AudioQuality
 */

/**
 * @typedef {Object} Artist
 * @property {number | string} id
 * @property {string} name
 * @property {string} [picture]
 * @property {string} [url]
 */

/**
 * @typedef {Object} Album
 * @property {number} id
 * @property {string} title
 * @property {string} cover
 * @property {string} [videoCover]
 * @property {Artist} artist
 * @property {string} [releaseDate]
 * @property {boolean} [explicit]
 * @property {number} [numberOfTracks]
 * @property {string} [url]
 */

/**
 * @typedef {Object} Track
 * @property {number} id
 * @property {string} title
 * @property {string} [version]
 * @property {boolean} [explicit]
 * @property {number} duration
 * @property {AudioQuality} audioQuality
 * @property {Artist[]} artists
 * @property {Artist} artist
 * @property {Album} album
 * @property {string} [url]
 */

/**
 * @typedef {Object} SonglinkTrack
 * @property {string} id
 * @property {string} title
 * @property {string} artistName
 * @property {number} duration
 * @property {string} [thumbnailUrl]
 * @property {string} sourceUrl
 * @property {Object} songlinkData
 * @property {boolean} isSonglinkTrack
 * @property {number} [tidalId]
 * @property {AudioQuality} audioQuality
 */

/**
 * @typedef {Track | SonglinkTrack} PlayableTrack
 */

/**
 * @typedef {Object} PlaylistCreator
 * @property {number | string} id
 * @property {string} name
 * @property {string} [picture]
 */

/**
 * @typedef {Object} Playlist
 * @property {string} uuid
 * @property {string} title
 * @property {string} [description]
 * @property {PlaylistCreator} creator
 * @property {number} numberOfTracks
 * @property {string} [image]
 * @property {string} [squareImage]
 * @property {boolean} [explicit]
 * @property {string} [url]
 */

/**
 * @typedef {('tracks' | 'albums' | 'artists' | 'playlists')} SearchTab
 */

/**
 * @typedef {('auto' | 'us' | 'eu')} RegionOption
 */

/**
 * @typedef {Object} SearchResult
 * @property {any[]} items
 * @property {number} [limit]
 * @property {number} [offset]
 * @property {number} [totalNumberOfItems]
 */

/**
 * @typedef {Object} SearchState
 * @property {string} query
 * @property {SearchTab} activeTab
 * @property {PlayableTrack[]} tracks
 * @property {Album[]} albums
 * @property {Artist[]} artists
 * @property {Playlist[]} playlists
 * @property {boolean} isLoading
 * @property {string | null} error
 * @property {string | null} playlistLoadingMessage
 * @property {boolean} isPlaylistConversionMode
 * @property {number} playlistConversionTotal
 */

/**
 * @typedef {Object} DownloadProgress
 * @property {('downloading' | 'processing' | 'converting')} stage
 * @property {number} receivedBytes
 * @property {number} totalBytes
 * @property {number} progress
 */

/**
 * @typedef {Object} DownloadTask
 * @property {string} id
 * @property {PlayableTrack} track
 * @property {string} filename
 * @property {string} [subtitle]
 * @property {number} progress
 * @property {('downloading' | 'processing' | 'converting')} stage
 * @property {string | null} error
 * @property {Date} createdAt
 * @property {Date} [startedAt]
 * @property {Date} [completedAt]
 * @property {AbortController} controller
 */

/**
 * @typedef {Object} AlbumDownloadState
 * @property {boolean} downloading
 * @property {number} completed
 * @property {number} total
 * @property {string | null} error
 */

/**
 * @typedef {Object} DownloadOptions
 * @property {AbortSignal} [signal]
 * @property {(progress: DownloadProgress) => void} [onProgress]
 * @property {(data: {totalBytes?: number}) => void} [onFfmpegCountdown]
 * @property {() => void} [onFfmpegStart]
 * @property {(value: number) => void} [onFfmpegProgress]
 * @property {() => void} [onFfmpegComplete]
 * @property {(error: Error) => void} [onFfmpegError]
 * @property {boolean} [ffmpegAutoTriggered]
 * @property {boolean} [convertAacToMp3]
 * @property {boolean} [downloadCoverSeperately]
 */

/**
 * @typedef {Object} PlayerState
 * @property {PlayableTrack | null} currentTrack
 * @property {PlayableTrack[]} queue
 * @property {number} currentIndex
 * @property {boolean} isPlaying
 * @property {AudioQuality} quality
 * @property {number} volume
 * @property {number} duration
 * @property {number} currentTime
 */

/**
 * @typedef {Object} UserPreferences
 * @property {AudioQuality} playbackQuality
 * @property {AudioQuality} downloadQuality
 * @property {boolean} convertAacToMp3
 * @property {boolean} downloadCoversSeperately
 * @property {RegionOption} region
 */

/**
 * @typedef {('track' | 'album' | 'artist' | 'playlist')} ContentType
 */

/**
 * @typedef {Object} ImportResult
 * @property {ContentType} type
 * @property {any} data
 */

/**
 * @typedef {Object} TidalInfo
 * @property {ContentType} type
 * @property {string | number} id
 * @property {string} [title]
 */

/**
 * @typedef {Object} UrlImportOptions
 * @property {string} [userCountry]
 * @property {boolean} [songIfSingle]
 */

/**
 * Type guard functions
 */

/**
 * Check if a track is a SonglinkTrack
 * @param {PlayableTrack} track
 * @returns {boolean}
 */
export function isSonglinkTrack(track) {
  return track && track.isSonglinkTrack === true;
}

/**
 * Check if a track is a regular Track
 * @param {PlayableTrack} track
 * @returns {boolean}
 */
export function isTrack(track) {
  return !isSonglinkTrack(track);
}

/**
 * Convert PlayableTrack to Track (throws if SonglinkTrack)
 * @param {PlayableTrack} track
 * @returns {Track}
 */
export function asTrack(track) {
  if (isSonglinkTrack(track)) {
    throw new Error('Cannot convert SonglinkTrack to Track');
  }
  return track;
}
