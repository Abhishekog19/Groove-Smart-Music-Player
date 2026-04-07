/**
 * Example Integration of SearchInterface Component
 * Shows how to set up and use the component in your React app
 */

import React, { useState, useEffect } from 'react';
import SearchInterface from './SearchInterface';
import { ApiClient } from './apiClient';
import { config } from './config';

/**
 * OPTION 1: Basic Setup with Environment Variables
 */
function App() {
  const apiClient = new ApiClient(config.api.baseUrl, config.api.apiKey);

  return (
    <div className="app">
      <header>
        <h1>Music Search & Download</h1>
      </header>
      <main>
        <SearchInterface apiClient={apiClient} />
      </main>
    </div>
  );
}

export default App;

// ============================================================================
// OPTION 2: Advanced Setup with Custom Configuration
// ============================================================================

export function AdvancedApp() {
  const [config, setConfig] = useState({
    api: {
      baseUrl: 'http://your-api-server.com/api',
      apiKey: 'your-api-key',
    },
    search: {
      debounceMs: 500,
      defaultRegion: 'US',
    },
    download: {
      defaultQuality: 'LOSSLESS',
      convertAacToMp3: true,
    },
  });

  const apiClient = new ApiClient(config.api.baseUrl, config.api.apiKey);

  return (
    <div className="advanced-app">
      <header>
        <h1>Advanced Music Management</h1>
      </header>
      <aside>
        <SettingsPanel config={config} onConfigChange={setConfig} />
      </aside>
      <main>
        <SearchInterface apiClient={apiClient} config={config} />
      </main>
    </div>
  );
}

// ============================================================================
// OPTION 3: With State Management Integration
// ============================================================================

export function AppWithStateManagement() {
  const [queue, setQueue] = useState([]);
  const [downloads, setDownloads] = useState(new Map());
  const [userPreferences, setUserPreferences] = useState({
    region: 'auto',
    quality: 'LOSSY',
  });

  const apiClient = new ApiClient(config.api.baseUrl, config.api.apiKey);

  const handleAddToQueue = (track) => {
    setQueue((prev) => [...prev, track]);
  };

  const handleDownloadTrack = (track, quality) => {
    const taskId = `download-${track.id}-${Date.now()}`;
    setDownloads((prev) => new Map(prev).set(taskId, { track, quality, progress: 0 }));
  };

  return (
    <div className="app-with-state">
      <header>
        <h1>Music Platform</h1>
        <button onClick={() => setQueue([])}>Clear Queue ({queue.length})</button>
      </header>
      <div className="container">
        <main>
          <SearchInterface apiClient={apiClient} onAddToQueue={handleAddToQueue} />
        </main>
        <aside>
          <QueuePanel queue={queue} />
          <DownloadsPanel downloads={downloads} />
        </aside>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * Settings Panel - Allow users to customize search behavior
 */
function SettingsPanel({ config, onConfigChange }) {
  const handleQualityChange = (quality) => {
    onConfigChange({
      ...config,
      download: { ...config.download, defaultQuality: quality },
    });
  };

  const handleRegionChange = (region) => {
    onConfigChange({
      ...config,
      search: { ...config.search, defaultRegion: region },
    });
  };

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

      <div className="setting">
        <label>Audio Quality</label>
        <select onChange={(e) => handleQualityChange(e.target.value)}>
          <option value="LOSSY">Lossy (320 kbps MP3)</option>
          <option value="LOSSLESS">Lossless (FLAC)</option>
          <option value="HI_RES_LOSSLESS">HiRes (up to 192 kHz)</option>
        </select>
      </div>

      <div className="setting">
        <label>Region</label>
        <select onChange={(e) => handleRegionChange(e.target.value)}>
          <option value="auto">Auto Detect</option>
          <option value="US">United States</option>
          <option value="EU">Europe</option>
        </select>
      </div>

      <div className="setting">
        <label>
          <input type="checkbox" defaultChecked={config.download.convertAacToMp3} />
          Convert AAC to MP3
        </label>
      </div>
    </div>
  );
}

/**
 * Queue Panel - Shows currently queued tracks
 */
function QueuePanel({ queue }) {
  return (
    <div className="queue-panel">
      <h3>Queue ({queue.length})</h3>
      <div className="queue-list">
        {queue.length === 0 ? (
          <p className="empty">No tracks queued</p>
        ) : (
          queue.map((track, idx) => (
            <div key={idx} className="queue-item">
              <span className="index">{idx + 1}</span>
              <span className="title">{track.title}</span>
              <span className="artist">{track.artists?.[0]?.name}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Downloads Panel - Shows active and completed downloads
 */
function DownloadsPanel({ downloads }) {
  return (
    <div className="downloads-panel">
      <h3>Downloads ({downloads.size})</h3>
      <div className="downloads-list">
        {downloads.size === 0 ? (
          <p className="empty">No active downloads</p>
        ) : (
          Array.from(downloads.entries()).map(([taskId, { track, progress }]) => (
            <div key={taskId} className="download-item">
              <div className="track-info">
                <span className="title">{track.title}</span>
                <span className="progress">{Math.round(progress * 100)}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ENVIRONMENT SETUP TEMPLATE
// ============================================================================

/**
 * Create a .env file in your project root with:
 * 
 * REACT_APP_API_BASE_URL=http://localhost:3000/api
 * REACT_APP_API_KEY=your-secret-api-key
 * 
 * For Vite projects, use:
 * VITE_API_BASE_URL=http://localhost:3000/api
 * VITE_API_KEY=your-secret-api-key
 * 
 * Then restart your dev server for changes to take effect.
 */

// ============================================================================
// STYLING EXAMPLE
// ============================================================================

/**
 * In your CSS, ensure you have:
 * 
 * body {
 *   background: #121212;
 *   color: #fff;
 *   font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
 * }
 * 
 * .app {
 *   max-width: 1400px;
 *   margin: 0 auto;
 *   padding: 20px;
 * }
 * 
 * header {
 *   margin-bottom: 40px;
 *   border-bottom: 1px solid rgba(255, 255, 255, 0.1);
 *   padding-bottom: 20px;
 * }
 * 
 * main {
 *   flex: 1;
 * }
 */
