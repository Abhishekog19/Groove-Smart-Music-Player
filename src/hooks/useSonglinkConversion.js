import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../../store/store';
import { convertSonglinkToTidal, extractTidalInfo, convertToTidal } from '../../lib/utils/songlink';
import { convertWithBackoff } from '../../lib/utils/conversion-retry';

// Function to safely check if a track is a songlink track
export function isSonglinkTrack(track) {
  return track && track.sourceUrl && track.sourceType === 'tidal' && !track.streamUrl;
}

/**
 * Hook to manage Songlink track conversion
 * Prevents duplicate conversions and implements rate limiting
 */
export function useSonglinkConversion() {
  const { currentSong, setCurrentSong } = usePlayerStore();
  
  // Track which songs are currently being converted
  const convertingTracksRef = useRef(new Set());
  
  // Rate limiting
  const lastConversionTimeRef = useRef(0);
  const MIN_CONVERSION_INTERVAL = 300; // milliseconds
  
  // Debouncing
  const pendingConversionTimeoutRef = useRef(null);

  /**
   * Main conversion function
   */
  const convertSonglinkTrackToTidal = useCallback(
    async (songlinkTrack) => {
      console.log('[convertSonglinkTrackToTidal] Converting:', songlinkTrack.title);

      // In the real SMusic app, convertToTidalSong normally returns the basic track directly
      // Here we use the backend API fallback if provided:
      const fallbackTidalInfo = await convertWithBackoff(
        () => convertToTidal(songlinkTrack.sourceUrl, {
          userCountry: 'US',
          songIfSingle: true
        }),
        { maxRetries: 3 }
      );

      if (!fallbackTidalInfo || fallbackTidalInfo.type !== 'track') {
        throw new Error(`Could not find TIDAL equivalent for: ${songlinkTrack.title}`);
      }

      // Merge the new info into the existing song object since we don't have a full losslessAPI
      const trackId = Number(fallbackTidalInfo.id);
      
      const newTrack = {
          ...songlinkTrack,
          id: `tidal-${trackId}`,
          tidalId: trackId,
          tidalUrl: fallbackTidalInfo.url,
      };

      console.log('[convertSonglinkTrackToTidal] Successfully converted:', newTrack.title);
      return newTrack;
    },
    []
  );

  /**
   * Effect to auto-convert SonglinkTrack when it becomes current
   */
  useEffect(() => {
    if (!currentSong || !isSonglinkTrack(currentSong)) {
      return;
    }

    const trackId = currentSong.id;
    console.log('[Conversion Effect] Detected SonglinkTrack:', currentSong.title, 'ID:', trackId);

    // ✅ STEP 1: Check if already converting THIS track
    if (convertingTracksRef.current.has(trackId)) {
      console.log('[Conversion Effect] Already converting this track, skipping duplicate');
      return;
    }

    // ✅ STEP 2: Cancel any pending conversion task
    if (pendingConversionTimeoutRef.current) {
      clearTimeout(pendingConversionTimeoutRef.current);
      console.log('[Conversion Effect] Cancelled previous pending conversion');
    }

    // ✅ STEP 3: Debounce conversion request (wait 300ms before converting)
    pendingConversionTimeoutRef.current = setTimeout(() => {
      // ✅ STEP 4: Rate limiting - don't convert too frequently
      const now = Date.now();
      if (now - lastConversionTimeRef.current < MIN_CONVERSION_INTERVAL) {
        console.log('[Conversion Effect] Rate limited - too soon, skipping');
        pendingConversionTimeoutRef.current = null;
        return;
      }

      // ✅ STEP 5: Mark this track as being converted
      convertingTracksRef.current.add(trackId);
      lastConversionTimeRef.current = now;
      console.log('[Conversion Effect] Starting conversion for:', currentSong.title);

      convertSonglinkTrackToTidal(currentSong)
        .then((tidalTrack) => {
          console.log('[Conversion Effect] SUCCESS - Got TIDAL track:', tidalTrack.title);
          
          // ✅ CRITICAL: Verify this is still the current track
          // Since setCurrentSong updates the store, only dispatch if it's still current
          const state = usePlayerStore.getState();
          if (
            state.currentSong &&
            isSonglinkTrack(state.currentSong) &&
            state.currentSong.id === trackId
          ) {
            console.log('[Conversion Effect] Still current track, updating player');
            setCurrentSong(tidalTrack);
          } else {
            console.log('[Conversion Effect] Track changed during conversion, not updating');
          }
        })
        .catch((error) => {
          console.error('[Conversion Effect] FAILED:', error);
          alert(`Failed to play track: ${error instanceof Error ? error.message : 'Unknown error'}`);
        })
        .finally(() => {
          // ✅ STEP 6: Clean up after conversion completes
          convertingTracksRef.current.delete(trackId);
          pendingConversionTimeoutRef.current = null;
          console.log('[Conversion Effect] Finished conversion attempt for:', currentSong.title);
        });

    }, 300); // Wait 300ms before converting (debounce)

    return () => {
      // Cleanup on unmount
      if (pendingConversionTimeoutRef.current) {
        clearTimeout(pendingConversionTimeoutRef.current);
      }
    };
  }, [currentSong, convertSonglinkTrackToTidal, setCurrentSong]);

  return {
    convertSonglinkTrackToTidal,
    isConverting: convertingTracksRef.current.size > 0
  };
}
