/**
 * SearchInterface Configuration
 * Customize behavior and appearance of the search component
 */

export const config = {
  // =========================================================================
  // API CONFIGURATION
  // =========================================================================
  api: {
    baseUrl: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000/api',
    apiKey: process.env.REACT_APP_API_KEY || '',
    timeout: 10000, // milliseconds
    retryAttempts: 3,
    retryDelay: 1000, // milliseconds
  },

  // =========================================================================
  // SEARCH CONFIGURATION
  // =========================================================================
  search: {
    debounceMs: 300, // Delay before triggering search
    minChars: 2, // Minimum chars before search trigger
    defaultLimit: 20, // Results per page
    defaultRegion: 'auto', // 'auto', 'US', 'EU', or country code
  },

  // =========================================================================
  // DOWNLOAD CONFIGURATION
  // =========================================================================
  download: {
    defaultQuality: 'LOSSY', // LOSSY, LOSSLESS, or HI_RES_LOSSLESS
    convertAacToMp3: true, // Convert AAC to MP3 for compatibility
    maxConcurrentDownloads: 3,
    chunkSize: 8192, // bytes
    outputPath: '/downloads', // Browser-relative or server path
  },

  // =========================================================================
  // AUDIO QUALITY SETTINGS
  // =========================================================================
  audioQuality: {
    LOSSY: {
      label: 'Loss-Safe',
      format: 'MP3 • 320 kbps',
      bitrate: 320,
    },
    LOSSLESS: {
      label: 'Lossless',
      format: 'CD • 16-bit/44.1 kHz FLAC',
      bitrate: 1411,
    },
    HI_RES_LOSSLESS: {
      label: 'HiRes',
      format: 'HiRes • up to 24-bit/192 kHz',
      bitrate: 9216,
    },
  },

  // =========================================================================
  // UI CONFIGURATION
  // =========================================================================
  ui: {
    showNewsSection: true, // Show news/updates when no search
    newsRefreshMs: 300000, // 5 minutes
    mobileBreakpoint: 768, // px
    resultsPerTab: 20,
    highlightDownloadedTracks: true,
    showQualitySelector: true,
    showRegionSelector: true,
    showShareButtons: true,
  },

  // =========================================================================
  // FEATURE FLAGS
  // =========================================================================
  features: {
    enableSpotifyPlaylistImport: true,
    enableSonglinkConversion: true,
    enableDownloads: true,
    enableQueueManagement: true,
    enableSharing: true,
    enablePlaylists: true,
    enableEmbEdding: true,
  },

  // =========================================================================
  // REGION/AVAILABILITY
  // =========================================================================
  regions: {
    auto: { name: 'Auto Detect', code: null },
    us: { name: 'United States', code: 'US' },
    eu: { name: 'Europe', code: 'EU' },
  },

  // =========================================================================
  // SHARE & EMBED SETTINGS
  // =========================================================================
  sharing: {
    enableClipboard: true,
    enableLink: true,
    enableEmbed: true,
    enableQR: false,
    embedSize: {
      width: 400,
      height: 600,
    },
  },

  // =========================================================================
  // KEYBOARD SHORTCUTS
  // =========================================================================
  shortcuts: {
    searchFocus: 'Ctrl+K', // or 'Cmd+K' on Mac
    enterSearch: 'Enter',
    clearSearch: 'Escape',
    navDown: 'ArrowDown',
    navUp: 'ArrowUp',
  },

  // =========================================================================
  // STYLING & THEME
  // =========================================================================
  theme: {
    glassBlur: '10px', // CSS backdrop-filter blur
    glassOpacity: 0.1, // Background opacity (0-1)
    primaryColor: '#1db954', // Spotify-like green
    textColor: '#fff',
    bgColor: '#121212',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },

  // =========================================================================
  // LOGGING & DEBUGGING
  // =========================================================================
  debug: {
    enabled: process.env.NODE_ENV === 'development',
    logRequests: true,
    logResponses: true,
    logStateChanges: false,
  },
};

/**
 * Override config at runtime:
 * 
 * import { config } from './config.js';
 * 
 * config.search.debounceMs = 500;
 * config.download.defaultQuality = 'LOSSLESS';
 * config.ui.showNewsSection = false;
 */
