import { Howl, Howler } from 'howler';
import { getAudioBlob, getAudioFile } from '../db/indexedDB';
import { db } from '../db/indexedDB';
import { extractStreamUrl as parseManifestUrl } from '../tidal/manifestParser.js';
// Static import — dynamic import('../tidal/index.js') breaks Vite production builds
// because chunks get renamed (e.g. index-CuyoZGbS.js) and the path no longer resolves.
import { tidalAPI } from '../tidal/index.js';
import { getStoredJwt } from '../../components/AmazonTurnstile.jsx';

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
            let format = resolveFormat(song);
            let dashMimeType = null; // set when backend returns DASH segments

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
                    let streamUrl = null;
                    let dashBlobUrl = null;
                    let resolvedProvider = 'tidal';

                    // ────────────────────────────────────────────────────────────
                    // Stage A: Amazon Music — DISABLED (amz.geeked.wtf requires
                    // Monochrome's own Turnstile site key; tokens from other keys
                    // return a restricted JWT that 401s on /api/track requests).
                    // Re-enable if a bypass_token or own Amazon proxy is available.
                    // ────────────────────────────────────────────────────────────
                    /* AMAZON_BLOCK_START
                    try {
                        const title = song.title || '';
                        const artist = song.artist?.name || song.artist || '';
                        const dur = song.durationMs ? Math.round(song.durationMs / 1000) : 0;

                        // Step A1: Get JWT from backend (it was cached there after Turnstile)
                        const jwtRes = await fetch('/api/amazon/jwt', { cache: 'no-store', signal: AbortSignal.timeout(3_000) });
                        if (jwtRes.ok) {
                            const { jwt, apiBase } = await jwtRes.json();
                            const AMZ_BASE = (apiBase || 'https://amz.geeked.wtf').replace(/\/+$/, '');

                            // Step A2: Get ASIN from backend (t2a.geeked.wtf works from server)
                            const asinParams = new URLSearchParams({ title, artist, duration: dur });
                            const asinRes = await fetch(`/api/amazon/asin?${asinParams}`, {
                                cache: 'no-store',
                                signal: AbortSignal.timeout(12_000),
                            });

                            if (asinRes.ok) {
                                const { asin } = await asinRes.json();
                                console.log(`[audioPlayer] Amazon ASIN: ${asin} for "${title}"`);

                                // Step A3: Fetch stream URL DIRECTLY from amz.geeked.wtf (browser → Cloudflare OK)
                                // Try quality cascade: HD → SD_HIGH
                                const qualities = ['HD', 'SD_HIGH'];
                                for (const q of qualities) {
                                    try {
                                        const trackRes = await fetch(`${AMZ_BASE}/api/track/${asin}?quality=${q}`, {
                                            headers: {
                                                'X-Turnstile-JWT': jwt,
                                                'Accept': 'application/json',
                                            },
                                            signal: AbortSignal.timeout(15_000),
                                        });

                                        if (trackRes.status === 403) {
                                            fetch('/api/amazon/report-rate-limit', { method: 'POST' }).catch(() => { });
                                            break;
                                        }
                                        if (trackRes.status === 401 || trackRes.status === 428) {
                                            fetch('/api/amazon/clear-jwt', { method: 'POST' }).catch(() => { });
                                            break;
                                        }
                                        if (!trackRes.ok) {
                                            console.warn(`[audioPlayer] Amazon API ${trackRes.status} for ${q}`);
                                            continue;
                                        }

                                        const trackData = await trackRes.json();
                                        if (!trackData?.stream_url) {
                                            console.warn(`[audioPlayer] Amazon: no stream_url in response for ${q}`, Object.keys(trackData || {}));
                                            continue;
                                        }

                                        const decryptionKey = trackData.decryption_key || null;
                                        console.log(`[audioPlayer] ✅ Amazon stream: ${trackData.quality_selected || q} encrypted=${!!decryptionKey}`);

                                        if (decryptionKey) {
                                            console.log('[audioPlayer] Amazon CENC — fetching & decrypting...');
                                            const rawRes = await fetch(trackData.stream_url, { signal: AbortSignal.timeout(60_000) });
                                            if (!rawRes.ok) throw new Error(`CDN fetch ${rawRes.status}`);
                                            const encBuf = await rawRes.arrayBuffer();
                                            const keyHex = decryptionKey.replace(/[^0-9a-f]/gi, '');
                                            const keyBytes = new Uint8Array(keyHex.match(/.{2}/g).map(b => parseInt(b, 16)));
                                            const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CTR' }, false, ['decrypt']);
                                            const decrypted = await crypto.subtle.decrypt({ name: 'AES-CTR', counter: new Uint8Array(16), length: 64 }, cryptoKey, encBuf);
                                            const blob = new Blob([decrypted], { type: 'audio/mp4' });
                                            const blobUrl = URL.createObjectURL(blob);
                                            this.currentObjectUrl = blobUrl;
                                            audioUrl = blobUrl;
                                            format = 'mp4';
                                            console.log(`[audioPlayer] ✅ Amazon decrypted: ${decrypted.byteLength} bytes`);
                                        } else {
                                            audioUrl = trackData.stream_url;
                                            format = 'mp4';
                                            console.log('[audioPlayer] ✅ Amazon stream (unencrypted)');
                                        }
                                        resolvedProvider = 'amazon';
                                        break;
                                    } catch (qualErr) {
                                        console.warn(`[audioPlayer] Amazon ${q} failed:`, qualErr.message);
                                    }
                                }
                            } else if (asinRes.status !== 404) {
                                console.warn(`[audioPlayer] ASIN lookup failed: ${asinRes.status}`);
                            }
                        }
                    } catch (amazonErr) {
                        console.warn('[audioPlayer] Amazon Music stage failed:', amazonErr.message);
                    }
                    AMAZON_BLOCK_END */

                    // ────────────────────────────────────────────────────────────
                    // Stage B: TIDAL backend resolve (Qobuz → Deezer → Mirrors → Relay)
                    // Only runs if Amazon didn't produce a URL above.
                    // ────────────────────────────────────────────────────────────
                    if (!audioUrl) {
                        const resolveQuality = async (quality) => {
                            const q = new URLSearchParams({
                                title: song.title || '',
                                artist: song.artist?.name || song.artist || '',
                                quality,
                            });
                            if (song.tidalId) q.set('tidalId', song.tidalId);

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

                                        // DASH segment response
                                        if (data.format === 'dash' && Array.isArray(data.segmentUrls) && data.segmentUrls.length > 0) {
                                            console.log(`[audioPlayer] DASH detected (${quality}) — ${data.segmentUrls.length} segments. Stitching...`);
                                            try {
                                                const buffers = await Promise.all(
                                                    data.segmentUrls.map(async (segUrl) => {
                                                        const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(segUrl)}`;
                                                        const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(30_000) });
                                                        if (!r.ok) throw new Error(`Segment fetch failed: ${r.status}`);
                                                        return r.arrayBuffer();
                                                    })
                                                );
                                                const totalBytes = buffers.reduce((s, b) => s + b.byteLength, 0);
                                                const combined = new Uint8Array(totalBytes);
                                                let offset = 0;
                                                for (const buf of buffers) { combined.set(new Uint8Array(buf), offset); offset += buf.byteLength; }
                                                const blob = new Blob([combined], { type: data.mimeType || 'audio/mp4' });
                                                const blobUrl = URL.createObjectURL(blob);
                                                console.log(`[audioPlayer] DASH stitched: ${totalBytes} bytes`);
                                                return { dashBlobUrl: blobUrl, isMirrorBan: false, isAllDown: false };
                                            } catch (dashErr) {
                                                console.warn(`[audioPlayer] DASH stitch failed (${quality}):`, dashErr.message);
                                                return { streamUrl: null, isMirrorBan: true, isAllDown: false };
                                            }
                                        }

                                        // Direct stream URL
                                        return {
                                            streamUrl: data.streamUrl || null,
                                            provider: data.provider || 'tidal',
                                            isMirrorBan: false,
                                            isAllDown: false,
                                        };
                                    }

                                    const err = await resolveRes.json().catch(() => ({}));
                                    console.warn(`[audioPlayer] /resolve ${label} (${quality}) HTTP ${resolveRes.status}:`, err.error);
                                    if (resolveRes.status === 403) return { streamUrl: null, isMirrorBan: true, isAllDown: false };
                                    if (resolveRes.status < 500) return { streamUrl: null, isMirrorBan: false, isAllDown: false };
                                } catch (passErr) {
                                    console.warn(`[audioPlayer] /resolve ${label} (${quality}) error:`, passErr.message);
                                }
                            }
                            return { streamUrl: null, isMirrorBan: false, isAllDown: true };
                        };

                        const qualityChain = ['LOSSLESS', 'HIGH', 'LOW'];
                        let lastBanOrDown = false;

                        for (const quality of qualityChain) {
                            const result = await resolveQuality(quality);
                            const { dashBlobUrl: dBlobUrl, isMirrorBan, isAllDown } = result;

                            if (dBlobUrl) {
                                dashBlobUrl = dBlobUrl;
                                if (quality !== 'LOSSLESS') console.log(`[audioPlayer] DASH quality degraded to ${quality}`);
                                break;
                            }
                            if (result.streamUrl) {
                                streamUrl = result.streamUrl;
                                resolvedProvider = result.provider || 'tidal';
                                if (quality !== 'LOSSLESS') console.log(`[audioPlayer] Quality degraded to ${quality}`);
                                break;
                            }

                            lastBanOrDown = isMirrorBan || isAllDown;
                            if (!isMirrorBan && !isAllDown) break;
                        }

                        if (!streamUrl && !dashBlobUrl) {
                            const msg = lastBanOrDown
                                ? 'TIDAL streaming mirrors are temporarily unavailable. Please try again in a few minutes.'
                                : 'Could not resolve stream — backend unreachable.';
                            this.onLoadError?.(msg);
                            return false;
                        }

                        // DASH blob
                        if (dashBlobUrl) {
                            audioUrl = dashBlobUrl;
                            this.currentObjectUrl = dashBlobUrl;
                            format = 'mp4';
                            console.log('[audioPlayer] Using DASH blob URL');
                        } else {
                            const isTidalCdn = /\.tidal\.com|tidal\.com\/|audio\.tidal/i.test(streamUrl);
                            audioUrl = isTidalCdn
                                ? `/api/audio-proxy?url=${encodeURIComponent(streamUrl)}`
                                : streamUrl;
                            this.currentObjectUrl = null;
                            console.log(`[audioPlayer] ${resolvedProvider} stream:`, audioUrl.substring(0, 80));
                        }
                    }

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
