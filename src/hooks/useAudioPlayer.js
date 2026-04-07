import { useEffect, useCallback, useRef } from 'react';
import { usePlayerStore } from '../store/store';
import { audioPlayer } from '../lib/audio/audioPlayer';
import { saveSession } from '../lib/session/sessionPersistence';

/**
 * useAudioPlayer
 *
 * Mounts once in App.jsx and keeps the AudioPlayerManager in sync with
 * the Zustand player store. Handles:
 *  - Loading the song when currentSong changes
 *  - Play / pause syncing
 *  - Volume syncing
 *  - Real-time progress (currentTime) updates
 *  - Accurate duration from the Howl `onload` event
 *  - Repeat-one / repeat-all logic on song end
 *  - Graceful no-op for demo songs with no audio data
 *  - Session persistence: saves state to localStorage every 5 s (throttled)
 *    and restores seek position when a session song is loaded on startup
 */
export function useAudioPlayer() {
    const {
        currentSong,
        isPlaying,
        volume,
        repeat,
        shuffle,
        queue,
        setPlaying,
        setCurrentTime,
        setDuration,
        nextSong,
        setNeedsFolderPermission,
        seekOnLoad,
        clearSeekOnLoad,
    } = usePlayerStore();

    // Throttle: only write to localStorage once every 5 seconds
    const lastSaveRef   = useRef(0);
    // Keep refs to latest store values for use inside callbacks
    const stateRef = useRef({});
    useEffect(() => {
        stateRef.current = { currentSong, queue, volume, repeat, shuffle };
    }, [currentSong, queue, volume, repeat, shuffle]);

    // ── Wire event callbacks once ──────────────────────────────────────────
    useEffect(() => {
        audioPlayer.onPlay  = () => setPlaying(true);
        audioPlayer.onPause = () => {
            setPlaying(false);
            // Save exact position immediately on pause so a refresh after
            // pausing always restores to the exact second, not up to 5s early.
            const { currentSong: song, queue: q, volume: vol, repeat: rep, shuffle: sh } = stateRef.current;
            if (song) {
                saveSession({
                    songId:      song.id,
                    currentTime: audioPlayer.getCurrentTime(),
                    queueIds:    q.map(s => s.id),
                    volume:      vol,
                    repeat:      rep,
                    shuffle:     sh,
                });
            }
        };

        audioPlayer.onDurationReady = (dur) => {
            setDuration(dur);
        };

        audioPlayer.onTimeUpdate = (time) => {
            setCurrentTime(time);

            // Throttled session save (every 5 s)
            const now = Date.now();
            if (now - lastSaveRef.current >= 5000) {
                lastSaveRef.current = now;
                const { currentSong: song, queue: q, volume: vol, repeat: rep, shuffle: sh } = stateRef.current;
                if (song) {
                    saveSession({
                        songId:      song.id,
                        currentTime: time,
                        queueIds:    q.map(s => s.id),
                        volume:      vol,
                        repeat:      rep,
                        shuffle:     sh,
                    });
                }
            }
        };

        audioPlayer.onLoadError = (msg) => {
            console.error('[useAudioPlayer] Load error:', msg);
            if (msg && msg.includes('not accessible')) {
                setNeedsFolderPermission(true);
            }
        };

        return () => {
            audioPlayer.onPlay          = null;
            audioPlayer.onPause         = null;
            audioPlayer.onEnd           = null;
            audioPlayer.onTimeUpdate    = null;
            audioPlayer.onDurationReady = null;
            audioPlayer.onLoadError     = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Re-wire onEnd whenever repeat mode changes ─────────────────────────
    useEffect(() => {
        audioPlayer.onEnd = () => {
            setPlaying(false);
            if (repeat === 'one') {
                setCurrentTime(0);
                audioPlayer.seek(0);
                audioPlayer.play();
                setPlaying(true);
            } else {
                nextSong();
            }
        };
    }, [repeat, nextSong, setPlaying, setCurrentTime]);

    // ── Keep a ref so async callbacks always see the latest isPlaying ──────
    const isPlayingRef = useRef(isPlaying);
    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    // ── Track the seekOnLoad target in a ref (avoids closure staleness) ────
    const seekOnLoadRef = useRef(null);
    useEffect(() => {
        seekOnLoadRef.current = seekOnLoad;
    }, [seekOnLoad]);

    // ── Load & (optionally) play whenever the song changes ─────────────────
    useEffect(() => {
        if (!currentSong) return;

        // Reset progress UI before loading (audio seek handled separately)
        setCurrentTime(0);
        setDuration(currentSong.durationSeconds || 0);

        const loadAndPlay = async () => {
            const loaded = await audioPlayer.loadSong(currentSong);
            if (!loaded) return;

            // Update the UI to reflect the saved position immediately.
            // IMPORTANT: we do NOT call audioPlayer.seek() here and we do NOT
            // call clearSeekOnLoad() — Howler's html5 backend loses a seek()
            // applied to an un-played sound when play() is later called.
            // The actual audio seek happens right before play() below or in the
            // play/pause sync effect when the user presses Play.
            const seekTarget = seekOnLoadRef.current;
            if (seekTarget != null && seekTarget > 0) {
                setCurrentTime(seekTarget); // visual only
            }

            if (isPlayingRef.current) {
                // Seek right before play so Howler doesn't reset position
                if (seekTarget != null && seekTarget > 0) {
                    await new Promise(r => setTimeout(r, 50)); // let metadata settle
                    audioPlayer.seek(seekTarget);
                    clearSeekOnLoad();
                }
                audioPlayer.play();
            }
        };

        loadAndPlay();

        return () => {
            audioPlayer.stop();
        };
    }, [currentSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Sync play / pause state ────────────────────────────────────────────
    useEffect(() => {
        if (!currentSong || !audioPlayer.isLoaded()) return;
        if (isPlaying) {
            // Re-apply the session seek target RIGHT before play() so Howler
            // doesn't restart from 0.  seekOnLoad is kept alive until this
            // moment precisely so the seek survives the paused state.
            const seekTarget = seekOnLoadRef.current;
            if (seekTarget != null && seekTarget > 0) {
                audioPlayer.seek(seekTarget);
                setCurrentTime(seekTarget);
                clearSeekOnLoad();   // consumed — won't fire again
            }
            audioPlayer.play();
        } else {
            audioPlayer.pause();
        }
    }, [isPlaying, currentSong]);

    // ── Sync volume ────────────────────────────────────────────────────────
    useEffect(() => {
        audioPlayer.setVolume(volume);
    }, [volume]);

    // ── Save session immediately when volume / repeat / shuffle changes ────
    useEffect(() => {
        const { currentSong: song, queue: q, shuffle: sh } = stateRef.current;
        if (!song) return;
        saveSession({
            songId:      song.id,
            currentTime: audioPlayer.getCurrentTime?.() ?? 0,
            queueIds:    q.map(s => s.id),
            volume,
            repeat,
            shuffle:     sh,
        });
    }, [volume, repeat]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Exposed seek helpers ───────────────────────────────────────────────
    const seekFraction = useCallback((fraction) => {
        audioPlayer.seekFraction(fraction);
        const duration = audioPlayer.getDuration();
        setCurrentTime(fraction * duration);
    }, [setCurrentTime]);

    const seekSeconds = useCallback((seconds) => {
        audioPlayer.seek(seconds);
        setCurrentTime(seconds);
    }, [setCurrentTime]);

    return { seekFraction, seekSeconds };
}
