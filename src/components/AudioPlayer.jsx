import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePlayerStore } from '../store/store';
import { useSonglinkConversion, isSonglinkTrack } from '../hooks/useSonglinkConversion';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  ListMusic,
  Trash2,
  X,
  Shuffle,
  ScrollText,
  Download,
  Loader
} from 'lucide-react';

export function AudioPlayer() {
  const audioRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(0.8);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const {
    currentSong: currentTrack,
    isPlaying,
    queue,
    currentTime,
    duration,
    volume,
    setCurrentTime,
    setDuration,
    togglePlay,
    nextSong: next,
    previousSong: previous,
    removeFromQueue,
    setVolume,
    playSong
  } = usePlayerStore();

  const queueIndex = currentTrack ? queue.findIndex(s => s.id === currentTrack.id) : -1;

  const playAtIndex = (index) => {
      const song = queue[index];
      if (song) playSong(song, queue);
  };

  const { isConverting } = useSonglinkConversion();

  // Handle audio events
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [setCurrentTime]);

  const handleDurationChange = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, [setDuration]);

  const handleSeek = useCallback((e) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = percent * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration, setCurrentTime]);

  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  }, [setVolume, isMuted]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setVolume(previousVolume);
      setIsMuted(false);
    } else {
      setPreviousVolume(volume);
      setVolume(0);
      setIsMuted(true);
    }
  }, [isMuted, volume, previousVolume, setVolume]);

  const handleDownload = useCallback(async () => {
    if (!currentTrack || isDownloading || isSonglinkTrack(currentTrack)) {
      return;
    }

    setIsDownloading(true);
    try {
      // TODO: Implement download logic
      console.log('Downloading track:', currentTrack.title);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download track');
    } finally {
      setIsDownloading(false);
    }
  }, [currentTrack, isDownloading]);

  // Sync playback state with audio element
  useEffect(() => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Sync volume with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  if (!currentTrack) {
    return (
      <div className="fixed bottom-0 right-0 left-0 bg-gray-900/80 backdrop-blur-md border-t border-gray-800 p-4">
        <div className="max-w-4xl mx-auto text-center text-gray-400">
          Nothing is playing
        </div>
      </div>
    );
  }

  const isLoading = isConverting;
  const displayTrack = currentTrack;
  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <>
      <audio
        ref={audioRef}
        src={currentTrack.streamUrl || currentTrack.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onEnded={() => next()}
        className="hidden"
      />

      <div className="fixed bottom-0 right-0 left-0 z-50 px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-4xl mx-auto">
          {/* Main Player */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl border border-gray-700 shadow-2xl p-4 relative overflow-hidden">
            
            {/* Progress Bar */}
            <div className="mb-4">
              <div
                onClick={handleSeek}
                className="group relative h-1 w-full cursor-pointer overflow-hidden rounded-full bg-gray-700 hover:h-2 transition-all"
              >
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-gray-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Track Info & Controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              
              {/* Track Info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {!isSonglinkTrack(displayTrack) && displayTrack.cover && (
                  <div className="h-16 w-16 rounded-md object-cover flex-shrink-0 bg-gray-700 flex items-center justify-center text-2xl">
                    {displayTrack.cover}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-white font-semibold truncate">
                    {displayTrack.title}
                  </h3>
                  <p className="text-sm text-gray-400 truncate">
                    {displayTrack.artist}
                  </p>
                  {!isSonglinkTrack(displayTrack) && (
                    <p className="text-xs text-gray-500 truncate">
                      {displayTrack.album}
                    </p>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between gap-4">
                
                {/* Playback Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => previous()}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                    aria-label="Previous track"
                  >
                    <SkipBack size={18} />
                  </button>

                  <button
                    onClick={() => togglePlay()}
                    className="rounded-full bg-white p-3 text-gray-900 hover:scale-105 transition-transform"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause size={20} fill="currentColor" />
                    ) : (
                      <Play size={20} fill="currentColor" />
                    )}
                  </button>

                  <button
                    onClick={() => next()}
                    disabled={queueIndex >= queue.length - 1 && queue.length > 0}
                    className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                    aria-label="Next track"
                  >
                    <SkipForward size={18} />
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="hidden sm:flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                    aria-label="Download"
                  >
                    {isDownloading ? (
                      <Loader size={18} className="animate-spin" />
                    ) : (
                      <Download size={18} />
                    )}
                  </button>

                  <button
                    onClick={() => setShowQueuePanel(!showQueuePanel)}
                    className={`p-2 transition-colors ${
                      showQueuePanel
                        ? 'text-blue-400'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    aria-label="Toggle queue"
                  >
                    <ListMusic size={18} />
                  </button>
                </div>

                {/* Volume Control */}
                <div className="hidden sm:flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX size={20} />
                    ) : (
                      <Volume2 size={20} />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
                    aria-label="Volume"
                  />
                </div>
              </div>
            </div>

            {/* Queue Panel */}
            {showQueuePanel && queue.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-700 space-y-2 max-h-60 overflow-y-auto">
                {queue.map((track, index) => (
                  <div
                    key={`${track.id}-${index}`}
                    onClick={() => playAtIndex(index)}
                    className={`p-2 rounded cursor-pointer transition-colors ${
                      index === queueIndex
                        ? 'bg-blue-500/20 text-white'
                        : 'text-gray-200 hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-500 w-6">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{track.title}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {track.artist}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(track.id);
                        }}
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                        aria-label={`Remove ${track.title}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="absolute inset-0 rounded-2xl bg-gray-900/50 flex items-center justify-center">
                <Loader className="animate-spin text-blue-400" size={24} />
                <span className="ml-2 text-gray-200">Converting track...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default AudioPlayer;
