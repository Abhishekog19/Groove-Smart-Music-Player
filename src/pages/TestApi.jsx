import React, { useState } from 'react';
import { searchTracks, convertToTidal, extractSpotifyPlaylist } from '../lib/api/client';

/**
 * TestApi — Test page for validating all 3 backend API routes.
 * Access at /test-api route.
 */
export default function TestApi() {
  const [results, setResults] = useState([]);

  const runTest = async (name, fn) => {
    // Add loading entry
    setResults((prev) => [...prev, { name, status: 'loading' }]);

    try {
      const data = await fn();
      setResults((prev) =>
        prev.map((r) => (r.name === name ? { name, status: 'success', data } : r))
      );
    } catch (err) {
      setResults((prev) =>
        prev.map((r) =>
          r.name === name
            ? { name, status: 'error', message: err instanceof Error ? err.message : String(err) }
            : r
        )
      );
    }
  };

  const tests = [
    {
      label: '🔵 Test Proxy',
      color: 'bg-blue-600 hover:bg-blue-700',
      fn: () =>
        fetch('/api/proxy?url=' + encodeURIComponent('http://127.0.0.1:3001/api/health'))
          .then((r) => r.json()),
      name: 'Proxy – Loopback Test',
    },
    {
      label: '🟢 Test Songlink (Spotify→TIDAL)',
      color: 'bg-green-600 hover:bg-green-700',
      fn: () => convertToTidal('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'),
      name: 'Songlink – URL Conversion',
    },
    {
      label: '🟣 Test Playlist Extract',
      color: 'bg-purple-600 hover:bg-purple-700',
      fn: () => extractSpotifyPlaylist('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'),
      name: 'Spotify Playlist Extract',
    },
    {
      label: '❤️ Health Check',
      color: 'bg-red-600 hover:bg-red-700',
      fn: () => fetch('/api/health').then((r) => r.json()),
      name: 'Health Check',
    },
  ];

  const clearResults = () => setResults([]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">🧪 API Integration Tests</h1>
        <p className="text-gray-400">Test all backend API routes. Make sure the server is running: <code className="text-green-400">npm run server</code></p>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        {tests.map((t) => (
          <button
            key={t.name}
            onClick={() => runTest(t.name, t.fn)}
            className={`px-4 py-2 ${t.color} text-white font-semibold rounded-lg transition`}
          >
            {t.label}
          </button>
        ))}
        {results.length > 0 && (
          <button
            onClick={clearResults}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
          >
            Clear
          </button>
        )}
      </div>

      <div className="space-y-4">
        {results.map((r, i) => (
          <div
            key={i}
            className={`p-4 rounded-lg border-l-4 ${
              r.status === 'loading'
                ? 'bg-gray-800 border-gray-500'
                : r.status === 'success'
                  ? 'bg-green-900/30 border-green-500'
                  : 'bg-red-900/30 border-red-500'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-white">{r.name}</h3>
              <span
                className={`text-sm font-bold ${
                  r.status === 'loading'
                    ? 'text-gray-400'
                    : r.status === 'success'
                      ? 'text-green-400'
                      : 'text-red-400'
                }`}
              >
                {r.status === 'loading' ? '⏳ Loading…' : r.status === 'success' ? '✅ Success' : '❌ Error'}
              </span>
            </div>

            {r.message && (
              <p className="text-red-300 text-sm mt-1">{r.message}</p>
            )}

            {r.data && (
              <pre className="mt-2 p-3 bg-gray-900 text-gray-200 text-xs rounded overflow-auto max-h-64">
                {JSON.stringify(r.data, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
