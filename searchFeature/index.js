/**
 * SearchInterface Library Export Index
 * Central point for importing all components and utilities
 */

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export { default as SearchInterface } from './SearchInterface';

// ============================================================================
// CUSTOM HOOKS
// ============================================================================
export {
  useSearchState,
  useDownloadManager,
  useTrackMenu,
  useAlbumDownloads,
  useRegionSelector,
  useFetchWithRetry,
  useUrlDetection,
  useSearchHandlers,
} from './hooks';

// ============================================================================
// UTILITIES
// ============================================================================
export {
  formatArtists,
  formatQualityLabel,
  getExtensionForQuality,
  copyToClipboard,
  getLongLink,
  getShortLink,
  getEmbedCode,
  fetchWithRetry,
  isSonglinkTrack,
  asTrack,
} from './utils';

// ============================================================================
// API CLIENT
// ============================================================================
export { ApiClient, apiClient } from './apiClient';

// ============================================================================
// CONFIGURATION
// ============================================================================
export { config } from './config';

// ============================================================================
// TYPES (exported for reference)
// ============================================================================
// These are JSDoc types - use in comments like:
// /** @type {import('./index.js').Track} */
// const track = { ... };

/**
 * @typedef {import('./types.js').Track} Track
 * @typedef {import('./types.js').Album} Album
 * @typedef {import('./types.js').Artist} Artist
 * @typedef {import('./types.js').Playlist} Playlist
 * @typedef {import('./types.js').SearchState} SearchState
 * @typedef {import('./types.js').AudioQuality} AudioQuality
 * @typedef {import('./types.js').PlayableTrack} PlayableTrack
 * @typedef {import('./types.js').SonglinkTrack} SonglinkTrack
 */

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * EXAMPLE 1: Basic Import and Use
 * 
 * import { SearchInterface, ApiClient } from './SearchInterface';
 * 
 * const apiClient = new ApiClient('http://api.example.com', 'key');
 * <SearchInterface apiClient={apiClient} />
 */

/**
 * EXAMPLE 2: Using Hooks in Your Components
 * 
 * import { useSearchState, useDownloadManager } from './SearchInterface';
 * 
 * function MyComponent() {
 *   const { results, isLoading, query } = useSearchState();
 *   const { downloading } = useDownloadManager();
 *   
 *   return (
 *     <div>
 *       <p>Query: {query}</p>
 *       <p>Results: {results.length}</p>
 *       <p>Downloading: {downloading.size}</p>
 *     </div>
 *   );
 * }
 */

/**
 * EXAMPLE 3: Using Utilities
 * 
 * import { formatQualityLabel, copyToClipboard } from './SearchInterface';
 * 
 * const label = formatQualityLabel('LOSSLESS');
 * // "CD • 16-bit/44.1 kHz FLAC"
 * 
 * copyToClipboard('https://tidal.com/...');
 */

/**
 * EXAMPLE 4: Configuration
 * 
 * import { config } from './SearchInterface';
 * 
 * // Change defaults
 * config.search.debounceMs = 500;
 * config.download.defaultQuality = 'LOSSLESS';
 * 
 * // Use in your app
 * const apiClient = new ApiClient(config.api.baseUrl, config.api.apiKey);
 */

/**
 * EXAMPLE 5: Full App Integration
 * 
 * import React from 'react';
 * import { SearchInterface, ApiClient, config } from './SearchInterface';
 * 
 * export default function App() {
 *   const apiClient = new ApiClient(config.api.baseUrl, config.api.apiKey);
 *   
 *   return (
 *     <div className="app">
 *       <header>
 *         <h1>Music Search</h1>
 *       </header>
 *       <SearchInterface apiClient={apiClient} />
 *     </div>
 *   );
 * }
 */

export default SearchInterface;
