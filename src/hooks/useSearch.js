import { useState, useCallback } from 'react';

/**
 * Hook for searching TIDAL tracks via the proxy route
 */
export function useSearch() {
  const [state, setState] = useState({ results: [], loading: false, error: null, cached: false });

  const search = useCallback(async (query, limit = 50) => {
    if (!query.trim()) return;
    setState({ results: [], loading: true, error: null, cached: false });

    try {
      const encodedUrl = encodeURIComponent(
        `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}`
      );
      const response = await fetch(`/api/proxy?url=${encodedUrl}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const cached = response.headers.get('X-Cache') === 'HIT';

      setState({ results: data.tracks || data.items || [], loading: false, error: null, cached });
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setState({ results: [], loading: false, error, cached: false });
      throw error;
    }
  }, []);

  return { ...state, search };
}
