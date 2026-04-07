/**
 * TIDAL API Type Definitions (JSDoc for IDE intellisense)
 *
 * @typedef {Object} Track
 * @property {number} id
 * @property {string} title
 * @property {number} duration
 * @property {number} [replayGain]
 * @property {number} [peak]
 * @property {boolean} allowStreaming
 * @property {boolean} streamReady
 * @property {string} [streamStartDate]
 * @property {boolean} premiumStreamingOnly
 * @property {number} trackNumber
 * @property {number} volumeNumber
 * @property {string|null} version
 * @property {number} popularity
 * @property {string} [copyright]
 * @property {string} url
 * @property {string} [isrc]
 * @property {boolean} editable
 * @property {boolean} explicit
 * @property {string} audioQuality
 * @property {string[]} audioModes
 * @property {Artist} artist
 * @property {Artist[]} artists
 * @property {Album} album
 * @property {Object.<string, string>} [mixes]
 * @property {{tags: string[]}} [mediaMetadata]
 */

/**
 * @typedef {Object} Artist
 * @property {number} id
 * @property {string} name
 * @property {string} type
 * @property {string} [picture]
 * @property {string} [url]
 * @property {number} [popularity]
 * @property {string[]} [artistTypes]
 * @property {Array<{category: string, categoryId: number}>} [artistRoles]
 * @property {Object.<string, string>} [mixes]
 */

/**
 * @typedef {Artist & {albums: Album[], tracks: Track[]}} ArtistDetails
 */

/**
 * @typedef {Object} Album
 * @property {number} id
 * @property {string} title
 * @property {string} cover
 * @property {string|null} videoCover
 * @property {string} [releaseDate]
 * @property {number} [duration]
 * @property {number} [numberOfTracks]
 * @property {number} [numberOfVideos]
 * @property {number} [numberOfVolumes]
 * @property {boolean} [explicit]
 * @property {number} [popularity]
 * @property {string} [type]
 * @property {string} [upc]
 * @property {string} [copyright]
 * @property {Artist} [artist]
 * @property {Artist[]} [artists]
 * @property {string} [audioQuality]
 * @property {string[]} [audioModes]
 * @property {string} [url]
 * @property {string} [vibrantColor]
 * @property {boolean} [streamReady]
 * @property {boolean} [allowStreaming]
 * @property {{tags: string[]}} [mediaMetadata]
 */

/**
 * @typedef {Object} Playlist
 * @property {string} uuid
 * @property {string} title
 * @property {string} description
 * @property {string} image
 * @property {string} [squareImage]
 * @property {number} duration
 * @property {number} numberOfTracks
 * @property {number} numberOfVideos
 * @property {{id: number, name: string, picture: string|null}} creator
 * @property {string} created
 * @property {string} lastUpdated
 * @property {string} type
 * @property {boolean} publicPlaylist
 * @property {string} url
 * @property {number} popularity
 * @property {Artist[]} [promotedArtists]
 */

/**
 * @typedef {Object} TrackInfo
 * @property {number} trackId
 * @property {string} audioQuality
 * @property {string} audioMode
 * @property {string} manifest
 * @property {string} manifestMimeType
 * @property {string} [manifestHash]
 * @property {string} assetPresentation
 * @property {number} [albumReplayGain]
 * @property {number} [albumPeakAmplitude]
 * @property {number} [trackReplayGain]
 * @property {number} [trackPeakAmplitude]
 * @property {number} [bitDepth]
 * @property {number} [sampleRate]
 */

/**
 * @template T
 * @typedef {Object} SearchResponse
 * @property {number} limit
 * @property {number} offset
 * @property {number} totalNumberOfItems
 * @property {T[]} items
 */

/**
 * @typedef {Object} CoverImage
 * @property {number} id
 * @property {string} name
 * @property {string} 1280
 * @property {string} 640
 * @property {string} 80
 */

/**
 * @typedef {Object} Lyrics
 * @property {number} trackId
 * @property {string} lyricsProvider
 * @property {string} providerCommontrackId
 * @property {string} providerLyricsId
 * @property {string} lyrics
 * @property {string} subtitles
 * @property {boolean} isRightToLeft
 */

/**
 * @typedef {'HI_RES_LOSSLESS'|'LOSSLESS'|'HIGH'|'LOW'} AudioQuality
 */

/**
 * @typedef {Object} StreamData
 * @property {string} originalTrack
 * @property {TrackInfo} trackInfo
 * @property {Track} songInfo
 */

/**
 * @typedef {Object} TrackLookup
 * @property {Track} track
 * @property {TrackInfo} info
 * @property {string} [originalTrackUrl]
 */

/**
 * @typedef {Object} TrackRecommendationsResponse
 * @property {string} version
 * @property {{limit: number, offset: number, totalNumberOfItems: number, items: Array<{track: Track, sources: string[]}>}} data
 */

/**
 * @typedef {Object} SonglinkEntity
 * @property {string} id
 * @property {'song'|'album'} type
 * @property {string} [title]
 * @property {string} [artistName]
 * @property {string} [thumbnailUrl]
 * @property {number} [thumbnailWidth]
 * @property {number} [thumbnailHeight]
 * @property {string} apiProvider
 * @property {string[]} platforms
 */

/**
 * @typedef {Object} SonglinkPlatformLink
 * @property {string} country
 * @property {string} url
 * @property {string} [nativeAppUriMobile]
 * @property {string} [nativeAppUriDesktop]
 * @property {string} entityUniqueId
 */

/**
 * @typedef {Object} SonglinkResponse
 * @property {string} entityUniqueId
 * @property {string} userCountry
 * @property {string} pageUrl
 * @property {Object.<string, SonglinkEntity>} entitiesByUniqueId
 * @property {Object.<string, SonglinkPlatformLink>} linksByPlatform
 */

/**
 * @typedef {Object} SonglinkTrack
 * @property {string} id
 * @property {string} title
 * @property {string} artistName
 * @property {number} duration
 * @property {string} thumbnailUrl
 * @property {string} sourceUrl
 * @property {SonglinkResponse} songlinkData
 * @property {true} isSonglinkTrack
 * @property {number} [tidalId]
 * @property {'LOSSLESS'} audioQuality
 */

/**
 * @typedef {Track|SonglinkTrack} PlayableTrack
 */

/**
 * Type guard to check if a track is a SonglinkTrack
 * @param {PlayableTrack} track
 * @returns {boolean}
 */
export function isSonglinkTrack(track) {
  return 'isSonglinkTrack' in track && track.isSonglinkTrack === true;
}
