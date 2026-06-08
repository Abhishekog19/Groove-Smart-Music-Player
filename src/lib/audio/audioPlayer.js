import { Howl, Howler } from 'howler';
import { getAudioBlob, getAudioFile } from '../db/indexedDB';
import { db } from '../db/indexedDB';
import { extractStreamUrl as parseManifestUrl } from '../tidal/manifestParser.js';
// Static import — dynamic import('../tidal/index.js') breaks Vite production builds
// because chunks get renamed (e.g. index-CuyoZGbS.js) and the path no longer resolves.
import { tidalAPI } from '../tidal/index.js';

// Increase the HTML5 audio pool size (default is 10) so rapid song changes
// don't exhaust the pool and return locked audio elements that ignore seeks.
Howler.html5PoolSize = 20;

// Map file extensions → Howler format strings
const EXT_TO_FORMAT = {
    mp3: 'mp3',
    mp4: 'mp4',
    m4a: 'mp4',
    aac: 'aac',
    ogg: 'ogg',
    oga: 'ogg',
    opus: 'opus',
    wav: 'wav',
    wave: 'wav',
    flac: 'flac',
    webm: 'webm',
    wma: 'wma',
};

/**
 * Derive a Howler-compatible format string from a song object.
 * Tries the filePath extension first, then the stored format field.
 */
function resolveFormat(song) {
    // Prefer real file extension (most reliable)
    if (song.filePath) {
        const ext = song.filePath.split('.').pop()?.toLowerCase();
        if (ext && EXT_TO_FORMAT[ext]) return EXT_TO_FORMAT[ext];
    }
    // TIDAL stream URLs are HTTPS — infer format from URL if available
    if (song.sourceType === 'tidal') {
        const quality = (song.audioQuality || '').toUpperCase();
        if (quality === 'HI_RES_LOSSLESS' || quality === 'LOSSLESS') return 'flac';
        if (quality === 'HIGH') return 'mp4';  // AAC
        return 'mp4';  // safe default for TIDAL
    }
    // Fallback: stored format string (normalise to lowercase)
    if (song.format && typeof song.format === 'string') {
        const f = song.format.toLowerCase();
        if (f.includes('mpeg') || f.includes('mp3')) return 'mp3';
        if (f.includes('ogg') || f.includes('vorbis')) return 'ogg';
        if (f.includes('flac')) return 'flac';
        if (f.includes('wav') || f.includes('wave')) return 'wav';
        if (f.includes('aac') || f.includes('m4a') || f.includes('mp4')) return 'mp4';
        if (f.includes('opus')) return 'opus';
        if (f.includes('webm')) return 'webm';
    }
    // Last resort: let Howler guess
    return 'mp3';
}

class AudioPlayerManager {
    constructor() {
        this.sound = null;
        this.currentObjectUrl = null;   // revoke on next load
        this.onPlay = null;
        this.onPause = null;
        this.onEnd = null;
        this.onTimeUpdate = null;
        this.onDurationReady = null;   // called once duration is known
        this.onLoadError = null;   // called when a song can't be loaded
        this._loadId = 0;      // incremented on each load; detects superseded calls
    }

    /**
     * Load a song for playback.
     *
     * Strategy (in order):
     *  1. Folder-scanned songs  → FileSystemFileHandle → File → Object URL
     *  2. Blob-uploaded songs   → audioFiles table     → Blob → Object URL
     *  3. Demo / in-memory songs (no DB row)           → silent no-op (returns false)
     *
     * @param {object} song  The full song object from the Zustand store.
     * @returns {Promise<boolean>}  true if load succeeded, false otherwise.
     */
    async loadSong(song) {
        if (!song) return false;

        // Stamp this load so we can detect if a newer call supersedes it.
        const loadId = ++this._loadId;

        try {
            this.stop();

            let audioUrl = null;
            const format = resolveFormat(song);

            // ── Strategy 1: folder-scanned song ──────────────────────────
            if (song.sourceType === 'folder' && song.filePath) {
                const file = await getAudioFile(song.filePath);
                if (!file) {
                    this.onLoadError?.('File not accessible. Has the folder moved?');
                    return false;
                }
                this.currentObjectUrl = URL.createObjectURL(file);
                audioUrl = this.currentObjectUrl;

                // ── Strategy 2: TIDAL stream ──────────────────────────────────
            } else if (song.sourceType === 'tidal' && song.tidalId) {
                try {
                    // Build query — include tidalId so backend can skip search if supported
                    const q = new URLSearchParams({
                        title:   song.title   || '',
                        artist:  song.artist?.name || song.artist || '',
                        quality: 'LOSSLESS',
                    });
                    if (song.tidalId) q.set('tidalId', song.tidalId);

                    let streamUrl = null;

                    // Two-pass strategy to handle Render cold starts (~50 seconds on free tier):
                    // Pass 1: fast timeout (20s) — works when backend is warm
                    // Pass 2: long timeout (65s) — waits out the cold start
                    const passes = [
                        { timeout: 20_000, label: 'warm' },
                        { timeout: 65_000, label: 'cold-start' },
                    ];

                    for (const { timeout, label } of passes) {
                        try {
                            const resolveRes = await fetch(
                                `/api/tidal-download/resolve?${q.toString()}`,
                                { cache: 'no-store', signal: AbortSignal.timeout(timeout) }
                            );
                            if (resolveRes.ok) {
                                const data = await resolveRes.json();
                                streamUrl = data.streamUrl || null;
                                if (streamUrl) break;
                            } else {
                                const err = await resolveRes.json().catch(() => ({}));
                                console.warn(`[audioPlayer] /resolve ${label} failed (${resolveRes.status}):`, err.details || err.error);
                                // On a 502 (mirror failure) retry with next pass; on 4xx stop
                                if (resolveRes.status < 500) break;
                            }
                        } catch (passErr) {
                            console.warn(`[audioPlayer] /resolve ${label} error:`, passErr.message);
                            // If last pass, give up
                        }
                    }

                    if (!streamUrl) {
                        this.onLoadError?.('Could not resolve TIDAL stream — backend unreachable.');
                        return false;
                    }

                    // All TIDAL CDN URLs need the audio-proxy (CORS + token in header)
                    const isTidalCdn = /\.tidal\.com|tidal\.com\/|audio\.tidal/i.test(streamUrl);
                    audioUrl = isTidalCdn
                        ? `/api/audio-proxy?url=${encodeURIComponent(streamUrl)}`
                        : streamUrl;

                    this.currentObjectUrl = null;
                    console.log('[audioPlayer] TIDAL stream proxied:', audioUrl.substring(0, 80));
                } catch (tidalErr) {
                    console.error('[audioPlayer] TIDAL stream error:', tidalErr.message);
                    this.onLoadError?.('TIDAL stream failed: ' + tidalErr.message);
                    return false;
                }

                // ── Strategy 3: blob-uploaded song ───────────────────────────
            } else if (song.sourceType === 'upload' || (!song.sourceType && song.id)) {
                const dbSong = song.sourceType ? song : await db.songs.get(song.id).catch(() => null);

                if (dbSong) {
                    const blob = await getAudioBlob(song.id);
                    if (!blob) {
                        this.onLoadError?.('Audio data not found in browser storage.');
                        return false;
                    }
                    this.currentObjectUrl = URL.createObjectURL(blob);
                    audioUrl = this.currentObjectUrl;
                } else {
                    // Demo song — no real audio, skip silently
                    return false;
                }

                // ── Strategy 4: demo / unknown — skip silently ───────────────
            } else {
                return false;
            }

            // ── Build Howl instance & await actual load ─────────────────────
            // If a newer loadSong() call already started, abort this one so we
            // don't create an orphaned Howl that drains the HTML5 audio pool.
            if (loadId !== this._loadId) {
                URL.revokeObjectURL(audioUrl);
                this.currentObjectUrl = null;
                return false;
            }

            await new Promise((resolve, reject) => {
                this.sound = new Howl({
                    src: [audioUrl],
                    html5: true,
                    format: [format],

                    onload: () => {
                        // Another load started before this one finished — abandon.
                        if (loadId !== this._loadId) { resolve(false); return; }
                        this.onDurationReady?.(this.sound.duration());
                        resolve(true);
                    },
                    onplay: () => {
                        this.startTimeUpdate();
                        this.onPlay?.();
                    },
                    onpause: () => {
                        this.stopTimeUpdate();
                        this.onPause?.();
                    },
                    onend: () => {
                        this.stopTimeUpdate();
                        this.onEnd?.();
                    },
                    onloaderror: (_id, err) => {
                        console.error('[audioPlayer] Load error:', err);
                        this.onLoadError?.('Could not play this file.');
                        reject(err);
                    },
                    onplayerror: (_id, err) => {
                        console.error('[audioPlayer] Play error:', err);
                    },
                });
            });

            return true;

        } catch (error) {
            console.error('[audioPlayer] Unexpected error loading song:', error);
            this.onLoadError?.(error.message);
            return false;
        }
    }

    play() {
        if (this.sound) this.sound.play();
    }

    pause() {
        if (this.sound) this.sound.pause();
    }

    stop() {
        this.stopTimeUpdate();
        if (this.sound) {
            this.sound.stop();
            this.sound.unload();
            this.sound = null;
        }
        // Only revoke object URLs (blob://) — not TIDAL HTTPS stream URLs
        if (this.currentObjectUrl && this.currentObjectUrl.startsWith('blob:')) {
            URL.revokeObjectURL(this.currentObjectUrl);
        }
        this.currentObjectUrl = null;
    }

    seek(seconds) {
        if (!this.sound) return;
        const duration = this.sound.duration() || 0;
        // Only apply upper clamp when duration is known (>0).
        // When html5 audio hasn't reported metadata yet, duration is 0 and
        // clamping would silently reset the position to 0.
        const clamped = duration > 0
            ? Math.max(0, Math.min(seconds, duration))
            : Math.max(0, seconds);
        this.sound.seek(clamped);
    }

    seekFraction(fraction) {
        if (!this.sound) return;
        this.sound.seek(fraction * (this.sound.duration() || 0));
    }

    setVolume(volume) {
        Howler.volume(Math.max(0, Math.min(1, volume)));
    }

    getCurrentTime() {
        return this.sound ? (this.sound.seek() || 0) : 0;
    }

    getDuration() {
        return this.sound ? (this.sound.duration() || 0) : 0;
    }

    isLoaded() {
        return this.sound !== null;
    }

    startTimeUpdate() {
        this.stopTimeUpdate();
        this.timeUpdateInterval = setInterval(() => {
            if (this.sound?.playing()) {
                this.onTimeUpdate?.(this.getCurrentTime());
            }
        }, 250);
    }

    stopTimeUpdate() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }
}

export const audioPlayer = new AudioPlayerManager();
