import React, { useState } from 'react';
import { useSearch } from '../hooks/useSearch';

/**
 * SearchTracks — Search TIDAL tracks via the proxy route.
 * Shows track name, artist, album, and duration.
 */
export function SearchTracks() {
  const [query, setQuery] = useState('');
  const { results, loading, error, cached, search } = useSearch();

  const handleSearch = async () => {
    if (!query.trim()) return;
    try { await search(query); } catch { /* error displayed via state */ }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6">🔍 Search Tracks</h2>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search for tracks, artists, albums..."
          className="flex-1 px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 transition"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {cached && (
        <p className="mb-3 text-sm text-green-400">📦 Results from cache</p>
      )}

      {error && (
        <div className="p-3 mb-4 bg-red-900/50 text-red-300 rounded-lg text-sm">
          {error.message}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-gray-400 text-sm mb-3">{results.length} tracks found</p>
          {results.map((track) => (
            <div
              key={track.id}
              className="p-4 bg-gray-800 rounded-lg flex items-center justify-between hover:bg-gray-750 transition"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{track.name}</p>
                <p className="text-sm text-gray-400 truncate">
                  {track.artists?.map((a) => a.name).join(', ') || 'Unknown'}
                  {track.album && <span className="text-gray-500"> · {track.album.name}</span>}
                </p>
              </div>
              <span className="text-sm text-gray-500 ml-4 shrink-0">
                {formatDuration(track.duration)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && results.length === 0 && query && (
        <p className="text-center text-gray-500">No results for "{query}"</p>
      )}
    </div>
  );
}

export default SearchTracks;
