import { useState, useCallback } from 'react';
import { proxyFetch } from '../lib/api/client';

/**
 * Hook for making proxied API calls to TIDAL/Spotify
 * Returns data, loading, error, cached state
 */
export function useProxyFetch() {
  const [state, setState] = useState({ data: null, loading: false, error: null, cached: false });

  const execute = useCallback(async (url) => {
    setState({ data: null, loading: true, error: null, cached: false });
    try {
      const response = await proxyFetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      const cached = response.headers.get('X-Cache') === 'HIT';
      setState({ data, loading: false, error: null, cached });
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setState({ data: null, loading: false, error, cached: false });
      throw error;
    }
  }, []);

  return { ...state, fetch: execute };
}
