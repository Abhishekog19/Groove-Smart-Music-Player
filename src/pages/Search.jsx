/**
 * Search page — wraps SearchInterface and bridges it with the Smusic Zustand player store.
 *
 * When the user clicks a track in search results the track is handed off to
 * usePlayerStore.playWithQueue(). The existing useAudioPlayer hook then loads the
 * song via audioPlayer.loadSong(currentSong) which internally resolves the stream.
 */

import { useCallback } from 'react';
import { SearchInterface } from '../components/SearchInterface/SearchInterface.jsx';
import { apiClient } from '../components/SearchInterface/apiClient.js';
import { usePlayerStore } from '../store/store.js';

export default function Search() {
  const playWithQueue = usePlayerStore((s) => s.playWithQueue);

  /**
   * Called when the user clicks a track row in SearchInterface.
   * Builds a "song" object the Smusic player understands and starts playback.
   */
  const handleTrackSelect = useCallback((track) => {
    const trackId = track.tidalId ?? track.id;
    if (!trackId) return;

    const artistName =
      track.artistName ??
      track.artist?.name ??
      track.artists?.[0]?.name ??
      'Unknown Artist';

    const coverUrl =
      track.thumbnailUrl ??
      (track.album?.cover
        ? `https://resources.tidal.com/images/${track.album.cover.replace(/-/g, '/')}/320x320.jpg`
        : null);

    const durationSec = track.duration ?? 0;
    const mins = Math.floor(durationSec / 60);
    const secs = Math.floor(durationSec % 60);

    const song = {
      id: `tidal-${trackId}`,
      title: track.title ?? 'Unknown',
      artist: artistName,
      album: track.album?.title ?? '',
      cover: coverUrl ?? '🎵',
      tidalId: Number(trackId),
      sourceType: 'tidal',
      duration: `${mins}:${String(secs).padStart(2, '0')}`,
      durationSeconds: durationSec,
    };

    playWithQueue(song, [song]);
  }, [playWithQueue]);

  return (
    <SearchInterface
      apiClient={apiClient}
      onTrackSelect={handleTrackSelect}
    />
  );
}
