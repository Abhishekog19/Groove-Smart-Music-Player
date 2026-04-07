/**
 * Custom React Hooks for Search Interface
 * JavaScript version without TypeScript
 */

import { useState, useCallback, useEffect, useRef } from 'react';

const initialSearchState = {
  query: '',
  activeTab: 'tracks',
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
  isLoading: false,
  error: null,
  playlistLoadingMessage: null,
  isPlaylistConversionMode: false,
  playlistConversionTotal: 0,
};

/**
 * Hook for managing search state
 * @returns {Object} Search state and setters
 */
export function useSearchStore() {
  const [state, setState] = useState(initialSearchState);

  const setQuery = useCallback((query) => {
    setState(prev => ({ ...prev, query }));
  }, []);

  const setActiveTab = useCallback((tab) => {
    setState(prev => ({ ...prev, activeTab: tab }));
  }, []);

  const setTracks = useCallback((tracks) => {
    setState(prev => ({ ...prev, tracks }));
  }, []);

  const setAlbums = useCallback((albums) => {
    setState(prev => ({ ...prev, albums }));
  }, []);

  const setArtists = useCallback((artists) => {
    setState(prev => ({ ...prev, artists }));
  }, []);

  const setPlaylists = useCallback((playlists) => {
    setState(prev => ({ ...prev, playlists }));
  }, []);

  const setIsLoading = useCallback((loading) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  }, []);

  const setError = useCallback((error) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const setPlaylistLoadingMessage = useCallback((message) => {
    setState(prev => ({ ...prev, playlistLoadingMessage: message }));
  }, []);

  const setIsPlaylistConversionMode = useCallback((mode) => {
    setState(prev => ({ ...prev, isPlaylistConversionMode: mode }));
  }, []);

  const setPlaylistConversionTotal = useCallback((total) => {
    setState(prev => ({ ...prev, playlistConversionTotal: total }));
  }, []);

  const clearResults = useCallback(() => {
    setState(prev => ({
      ...prev,
      tracks: [],
      albums: [],
      artists: [],
      playlists: [],
    }));
  }, []);

  const reset = useCallback(() => {
    setState(initialSearchState);
  }, []);

  return {
    ...state,
    setQuery,
    setActiveTab,
    setTracks,
    setAlbums,
    setArtists,
    setPlaylists,
    setIsLoading,
    setError,
    setPlaylistLoadingMessage,
    setIsPlaylistConversionMode,
    setPlaylistConversionTotal,
    clearResults,
    reset,
  };
}

const initialPlayerState = {
  currentTrack: null,
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  quality: 'LOSSLESS',
  volume: 1,
  duration: 0,
  currentTime: 0,
};

/**
 * Hook for managing player state
 * @returns {Object} Player state and actions
 */
export function usePlayer() {
  const [state, setState] = useState(initialPlayerState);

  const setTrack = useCallback((track) => {
    setState(prev => ({
      ...prev,
      currentTrack: track,
      currentTime: 0,
      isPlaying: true,
    }));
  }, []);

  const play = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const enqueue = useCallback((track) => {
    setState(prev => ({
      ...prev,
      queue: [...prev.queue, track],
    }));
  }, []);

  const enqueueNext = useCallback((track) => {
    setState(prev => {
      const newQueue = [...prev.queue];
      const insertIndex = prev.currentIndex + 1;
      newQueue.splice(insertIndex, 0, track);
      return { ...prev, queue: newQueue };
    });
  }, []);

  const setQueue = useCallback((tracks, startIndex = 0) => {
    setState(prev => ({
      ...prev,
      queue: tracks,
      currentIndex: startIndex,
      currentTrack: tracks[startIndex] || null,
      isPlaying: true,
    }));
  }, []);

  const setQuality = useCallback((quality) => {
    setState(prev => ({ ...prev, quality }));
  }, []);

  const setVolume = useCallback((volume) => {
    setState(prev => ({ ...prev, volume: Math.max(0, Math.min(1, volume)) }));
  }, []);

  const setCurrentTime = useCallback((time) => {
    setState(prev => ({ ...prev, currentTime: Math.max(0, time) }));
  }, []);

  return {
    ...state,
    setTrack,
    play,
    pause,
    enqueue,
    enqueueNext,
    setQueue,
    setQuality,
    setVolume,
    setCurrentTime,
  };
}

/**
 * Hook for managing downloads
 * @returns {Object} Download state and actions
 */
export function useDownloads() {
  const [activeDownloads, setActiveDownloads] = useState(new Map());
  const [albumStates, setAlbumStates] = useState({});
  const [downloadingIds, setDownloadingIds] = useState(new Set());
  const [cancelledIds, setCancelledIds] = useState(new Set());

  const startDownload = useCallback((track, filename, subtitle) => {
    const taskId = `download-${Date.now()}-${Math.random()}`;
    const task = {
      id: taskId,
      track,
      filename,
      subtitle,
      progress: 0,
      stage: 'downloading',
      error: null,
      createdAt: new Date(),
      controller: new AbortController(),
    };

    setActiveDownloads(prev => new Map(prev).set(taskId, task));
    setDownloadingIds(prev => new Set(prev).add(track.id));

    return task;
  }, []);

  const updateProgress = useCallback((taskId, received, total) => {
    setActiveDownloads(prev => {
      const next = new Map(prev);
      const task = next.get(taskId);
      if (task) {
        const progress = Math.round((received / total) * 100);
        task.progress = progress;
        next.set(taskId, { ...task });
      }
      return next;
    });
  }, []);

  const updateStage = useCallback((taskId, stage) => {
    setActiveDownloads(prev => {
      const next = new Map(prev);
      const task = next.get(taskId);
      if (task) {
        task.stage = stage;
        next.set(taskId, { ...task });
      }
      return next;
    });
  }, []);

  const completeDownload = useCallback((taskId) => {
    setActiveDownloads(prev => {
      const next = new Map(prev);
      const task = next.get(taskId);
      if (task) {
        task.completedAt = new Date();
        task.progress = 100;
        next.set(taskId, { ...task });
      }
      return next;
    });
  }, []);

  const cancelDownload = useCallback((taskId) => {
    setActiveDownloads(prev => {
      const next = new Map(prev);
      const task = next.get(taskId);
      if (task) {
        task.controller.abort();
        setDownloadingIds(prev => {
          const updated = new Set(prev);
          updated.delete(task.track.id);
          return updated;
        });
      }
      return next;
    });
  }, []);

  const errorDownload = useCallback((taskId, error) => {
    setActiveDownloads(prev => {
      const next = new Map(prev);
      const task = next.get(taskId);
      if (task) {
        task.error = error;
        next.set(taskId, { ...task });
      }
      return next;
    });
  }, []);

  const markCancelled = useCallback((trackId) => {
    setCancelledIds(prev => new Set(prev).add(trackId));
    setTimeout(() => {
      setCancelledIds(prev => {
        const next = new Set(prev);
        next.delete(trackId);
        return next;
      });
    }, 1500);
  }, []);

  const updateAlbumState = useCallback((albumId, patch) => {
    setAlbumStates(prev => ({
      ...prev,
      [albumId]: { ...prev[albumId], ...patch },
    }));
  }, []);

  return {
    activeDownloads,
    downloadingIds,
    cancelledIds,
    startDownload,
    updateProgress,
    updateStage,
    completeDownload,
    cancelDownload,
    errorDownload,
    markCancelled,
    albumStates,
    updateAlbumState,
  };
}

/**
 * Hook for clicking outside element
 * @param {Function} callback
 * @returns {React.RefObject}
 */
export function useOutsideClick(callback) {
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [callback]);

  return ref;
}

const initialPreferences = {
  playbackQuality: 'LOSSLESS',
  downloadQuality: 'LOSSLESS',
  convertAacToMp3: false,
  downloadCoversSeperately: false,
  region: 'auto',
};

/**
 * Hook for user preferences with localStorage
 * @returns {Object} Preferences and update function
 */
export function useUserPreferences() {
  const [preferences, setPreferences] = useState(() => {
    const stored = localStorage.getItem('userPreferences');
    return stored ? { ...initialPreferences, ...JSON.parse(stored) } : initialPreferences;
  });

  const updatePreference = useCallback((key, value) => {
    setPreferences(prev => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem('userPreferences', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { ...preferences, updatePreference };
}

/**
 * Hook for region selection
 * @param {Object} availableRegions
 * @returns {Object} Region state and actions
 */
export function useRegion(availableRegions) {
  const [selectedRegion, setSelectedRegion] = useState('auto');
  const [isOpen, setIsOpen] = useState(false);

  const ensureSupportedRegion = useCallback(
    (value) => {
      if (value !== 'auto' && !availableRegions[value]) {
        return 'auto';
      }
      return value;
    },
    [availableRegions]
  );

  const handleRegionChange = useCallback((value) => {
    const supported = ensureSupportedRegion(value);
    setSelectedRegion(supported);
    setIsOpen(false);
  }, [ensureSupportedRegion]);

  return {
    selectedRegion,
    isOpen,
    setIsOpen,
    handleRegionChange,
    ensureSupportedRegion,
  };
}
