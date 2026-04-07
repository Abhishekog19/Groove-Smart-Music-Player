/**
 * QUICK START GUIDE - SearchInterface Component
 * React JSX + JavaScript Implementation
 * 
 * This is your complete portable search interface for your antigrAVITY project
 */

// ============================================================================
// FILES YOU HAVE
// ============================================================================

/**
 * 1. types.js
 *    - Type definitions for all data structures
 *    - Uses JSDoc comments (no TypeScript needed)
 *    - Defines: Track, Album, Artist, Playlist, SearchState, etc.
 * 
 * 2. utils.js
 *    - Utility functions for common operations
 *    - Includes: formatArtists, formatQualityLabel, copyToClipboard, etc.
 *    - Also: API helpers, download utilities, URL generation
 * 
 * 3. hooks.js
 *    - Custom React hooks for state management
 *    - Includes: useSearchState, useDownloadManager, useTrackMenu, etc.
 *    - These handle all the complex state logic
 * 
 * 4. SearchInterface.jsx
 *    - Main React component
 *    - Contains all subcomponents (SearchInputSection, TabsSection, etc.)
 *    - Ready to drop into your app
 *    - Includes: search, download, queue, share, URL detection features
 * 
 * 5. SearchInterface.module.css
 *    - Component styling with CSS Modules
 *    - Glassmorphic design
 *    - Mobile responsive
 * 
 * 6. apiClient.js
 *    - API client class with all required methods
 *    - Implement the methods to connect to your backend
 *    - Or use the mock implementation for testing
 * 
 * 7. config.js
 *    - Configuration settings
 *    - Customize API endpoints, UI behavior, defaults
 * 
 * 8. example-usage.jsx
 *    - Shows how to integrate the component
 *    - Basic and advanced examples included
 */

// ============================================================================
// QUICK SETUP (3 STEPS)
// ============================================================================

/**
 * STEP 1: Copy all files to your antigrAVITY project
 * 
 *   src/
 *     components/
 *       SearchInterface/
 *         types.js
 *         utils.js
 *         hooks.js
 *         config.js
 *         apiClient.js
 *         SearchInterface.jsx
 *         SearchInterface.module.css
 */

/**
 * STEP 2: Install dependencies (if not already installed)
 * 
 *   npm install react lucide-react
 * 
 * If using a framework that needs build tools:
 *   npm install vite @vitejs/plugin-react
 */

/**
 * STEP 3: Use in your app
 * 
 *   import SearchInterface from './components/SearchInterface/SearchInterface';
 *   import { ApiClient } from './components/SearchInterface/apiClient';
 *   
 *   export default function App() {
 *     const apiClient = new ApiClient('http://your-api.com', 'your-api-key');
 *     return <SearchInterface apiClient={apiClient} />;
 *   }
 */

// ============================================================================
// IMPLEMENTING THE API CLIENT
// ============================================================================

/**
 * The apiClient.js file has all the method signatures you need to implement.
 * 
 * These are the ESSENTIAL methods:
 * 
 * async searchTracks(query, region)
 *   → Returns: { items: Track[] }
 * 
 * async searchAlbums(query, region)
 *   → Returns: { items: Album[] }
 * 
 * async searchArtists(query, region)
 *   → Returns: { items: Artist[] }
 * 
 * async searchPlaylists(query, region)
 *   → Returns: { items: Playlist[] }
 * 
 * async getTrack(id)
 *   → Returns: { track: Track }
 * 
 * async getAlbum(id)
 *   → Returns: { album: Album, tracks: Track[] }
 * 
 * async getPlaylist(id)
 *   → Returns: { playlist: Playlist, tracks: Track[] }
 * 
 * async downloadTrack(trackId, quality, filename, options)
 *   → Handles file download with progress tracking
 *   → Calls options.onProgress with {stage, receivedBytes, totalBytes, progress}
 * 
 * async getStreamUrl(trackId, quality)
 *   → Returns: stream URL for playback
 * 
 * getCoverUrl(coverId, size)
 *   → Returns: image URL (synchronous)
 * 
 * getArtistPictureUrl(pictureId)
 *   → Returns: artist image URL (synchronous)
 * 
 * async importFromUrl(url)
 *   → Detects platform and imports track/album/playlist
 *   → Returns: { type: 'track'|'album'|'playlist', data: {...} }
 * 
 * async convertSpotifyPlaylist(playlistUrl)
 *   → Returns: Track[] from Spotify playlist
 * 
 * async fetchSonglinkData(trackUrl, options)
 *   → Returns: Songlink metadata with platform links
 * 
 * URL detection methods (synchronous):
 * 
 *   isTidalUrl(url)
 *   isSupportedStreamingUrl(url)
 *   isSpotifyPlaylistUrl(url)
 *   getPlatformName(url)
 */

// ============================================================================
// CUSTOMIZATION
// ============================================================================

/**
 * Change default settings in config.js:
 * 
 * import { config } from './config.js';
 * 
 * // Customize search behavior
 * config.search.debounceMs = 500;
 * config.search.defaultRegion = 'US';
 * 
 * // Customize download defaults
 * config.download.defaultQuality = 'LOSSLESS';
 * config.download.convertAacToMp3 = true;
 * 
 * // Toggle features
 * config.features.enableDownloads = true;
 * config.features.enableSharing = false;
 * 
 * // Change UI theme
 * config.theme.primaryColor = '#your-color';
 */

// ============================================================================
// FEATURES INCLUDED
// ============================================================================

/**
 * ✅ Search by tracks, albums, artists, playlists
 * 
 * ✅ URL Detection & Import
 *    - Tidal URLs (tracks, albums, artists, playlists)
 *    - Spotify playlist conversion
 *    - Generic streaming platform detection
 * 
 * ✅ Downloads
 *    - Multiple quality levels (Lossy, Lossless, HiRes)
 *    - Progress tracking
 *    - Cancellation support
 *    - Download state management
 * 
 * ✅ Playback
 *    - Stream URLs support
 *    - Quality selection per track
 *    - Keyboard shortcuts (Enter to search, arrows to navigate)
 * 
 * ✅ Queue Management
 *    - Add to queue
 *    - Play next
 *    - Remove from queue
 * 
 * ✅ Sharing
 *    - Copy link to clipboard
 *    - Get shareable URLs
 *    - Generate embed code
 * 
 * ✅ User Preferences
 *    - Region selection (Auto, US, EU)
 *    - Quality preferences
 *    - Persistent preferences (if you implement localStorage)
 * 
 * ✅ Mobile Responsive
 *    - Adapts to phone, tablet, desktop
 *    - Touch-friendly buttons and interactions
 */

// ============================================================================
// COMPONENT COMMUNICATION
// ============================================================================

/**
 * The SearchInterface component accepts props:
 * 
 * <SearchInterface
 *   apiClient={apiClient}
 *   
 *   // Optional callbacks
 *   onTrackPlay={(track) => { ... }}
 *   onAddToQueue={(track) => { ... }}
 *   onDownloadStart={(trackId, quality) => { ... }}
 *   onDownloadComplete={(taskId, path) => { ... }}
 *   onShareClick={(track) => { ... }}
 *   
 *   // Optional config override
 *   config={customConfig}
 * />
 */

// ============================================================================
// CONNECTING TO YOUR BACKEND
// ============================================================================

/**
 * Example: Connecting to a Node.js/Express backend
 * 
 * // Your backend endpoint
 * http://your-server.com/api/search?type=track&q=query&region=US
 * 
 * // Expected response format from your search endpoints:
 * {
 *   items: [
 *     {
 *       id: "unique-id",
 *       title: "Song Name",
 *       artists: [
 *         { id: "artist-id", name: "Artist Name" }
 *       ],
 *       album: {
 *         id: "album-id",
 *         title: "Album Name",
 *         cover: { uuid: "uuid-for-cover" }
 *       },
 *       duration: 210000,  // milliseconds
 *       audioQuality: "LOSSY",
 *       explicit: false,
 *       version: "Version info",
 *       isrc: "ISRC code"
 *     }
 *   ]
 * }
 * 
 * // Other endpoints needed:
 * /api/tracks/{id}
 * /api/albums/{id}
 * /api/artists/{id}
 * /api/playlists/{id}
 * /api/stream/{id}?quality=LOSSY
 * /api/cover/{coverId}?size=320x320
 * /api/download/track/{trackId}?quality=LOSSLESS&filename=song.flac
 * /api/import?url=https://tidal.com/...
 * /api/spotify/playlist?url=https://open.spotify.com/playlist/...
 * /api/songlink?url=https://open.spotify.com/track/...
 */

// ============================================================================
// TROUBLESHOOTING
// ============================================================================

/**
 * Issue: "SearchInterface is not defined"
 * Solution: Make sure you're importing the default export
 *   ✅ import SearchInterface from './SearchInterface'
 *   ❌ import { SearchInterface } from './SearchInterface'
 * 
 * Issue: API calls return 404
 * Solution: Check that your apiClient.baseUrl matches your backend URL
 *   const apiClient = new ApiClient('http://your-actual-api-url', 'key')
 * 
 * Issue: CSS not loading
 * Solution: Make sure CSS Modules are supported in your build tool
 *   - Vite: supports by default
 *   - Create React App: supports by default
 *   - Custom webpack: add css-loader with modules: true
 * 
 * Issue: lucide-react icons not showing
 * Solution: Install lucide-react
 *   npm install lucide-react
 * 
 * Issue: Styling looks broken
 * Solution: Ensure your app has these base styles:
 *   body { background: #121212; color: #fff; font-family: system-ui, sans-serif; }
 */

// ============================================================================
// MIGRATION FROM SVELTE VERSION
// ============================================================================

/**
 * If you were using the original Svelte version, here's the mapping:
 * 
 * Svelte Stores → React Hooks
 *   searchStore → useSearchState hook
 *   downloadUi → useDownloadManager hook
 *   player → useTrackMenu hook
 * 
 * Svelte Components → React Components
 *   SearchInterface.svelte → SearchInterface.jsx
 *   All subcomponents reorganized as functions within SearchInterface.jsx
 * 
 * Svelte Actions → React Callbacks
 *   on:click → onClick
 *   on:keypress → onKeyPress
 *   bind:value → value + onChange
 * 
 * Svelte-specific → React patterns
 *   $store → useSearchState().activeTab (etc.)
 *   {#if condition} → {condition && ...}
 *   {#each items as item} → items.map(item => ...)
 */

// ============================================================================
// NEXT STEPS
// ============================================================================

/**
 * 1. Copy all files to your project (SearchInterface folder in src/components/)
 * 
 * 2. Implement the ApiClient methods in apiClient.js:
 *    - Connect to your music database/API
 *    - Implement search, streaming, download endpoints
 * 
 * 3. Create a .env file with your API configuration:
 *    REACT_APP_API_BASE_URL=http://your-api.com
 *    REACT_APP_API_KEY=your-secret-key
 * 
 * 4. Import and use in your app:
 *    <SearchInterface apiClient={apiClient} />
 * 
 * 5. (Optional) Connect to your state management (Redux, Zustand, etc.)
 *    - Use the component callbacks (onTrackPlay, onAddToQueue, etc.)
 * 
 * 6. Test with your music data
 * 
 * 7. Customize styling in SearchInterface.module.css as needed
 * 
 * 8. Deploy! 🚀
 */

// ============================================================================
// NEED HELP?
// ============================================================================

/**
 * Reference the example-usage.jsx file for:
 *   - Basic setup
 *   - Advanced setup with custom config
 *   - State management integration
 *   - Helper components (Settings, Queue, Downloads panels)
 * 
 * Each method in apiClient.js has detailed JSDoc comments explaining:
 *   - Parameters
 *   - Return type
 *   - Expected data format
 *   - Error handling
 * 
 * Types are defined in types.js with full JSDoc documentation
 * 
 * All configuration options explained in config.js
 */
