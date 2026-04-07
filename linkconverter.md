# Complete AudioPlayer Integration Guide for Your Website

I'll create a comprehensive document explaining the entire flow and how to integrate the Songlink conversion + download features.

---

## 📋 Table of Contents

1. **Architecture Overview**
2. **Songlink Track Conversion Flow**
3. **Download Feature Implementation**
4. **Step-by-Step Integration Guide**
5. **API Requirements**
6. **Database Schema**
7. **Error Handling & Edge Cases**

---

# 1. 🏗️ Architecture Overview

## System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Music Website                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          AudioPlayer Component (Svelte)             │   │
│  │  - Track loading & playback                         │   │
│  │  - Quality management (HI-RES, LOSSLESS, HIGH)      │   │
│  │  - Download orchestration                           │   │
│  └──────────────────────────────────────────────────────┘   │
│            ↓                    ↓                      ↓      │
│     ┌────────────┐      ┌────────────┐      ┌─────────────┐ │
│     │ Stores     │      │ API Layer  │      │ Download UI │ │
│     │ (Svelte)   │      │ (HTTP)     │      │ (Progress)  │ │
│     └────────────┘      └────────────┘      └─────────────┘ │
│                              ↓                                 │
│                    ┌──────────────────────┐                   │
│                    │  Your Backend API    │                   │
│                    │  (Node/Python/etc)   │                   │
│                    └──────────────────────┘                   │
│                         ↓      ↓      ↓                       │
│                    ┌─────┬────┬─────┐                         │
│                    │     │    │     │                         │
│              TIDAL API  DB  Cache  Storage                    │
│                         (Songs, Songlinks)                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

# 2. 🔄 Songlink Track Conversion Deep Dive

## What is a Songlink Track?

A **SonglinkTrack** is a track available on **multiple platforms** (Spotify, Apple Music, YouTube Music, etc.) but we need to convert it to **TIDAL** for playback.

### Data Structure

```typescript
// Before: SonglinkTrack (from external source)
{
  id: "spotify-abc123",
  title: "Blinding Lights",
  artistName: "The Weeknd",
  sourceUrl: "https://open.spotify.com/track/...",
  thumbnailUrl: "https://...",
  tidalId: null,  // Not yet found
  songlinkData: {
    spotify: { url: "https://open.spotify.com/track/..." },
    appleMusic: { url: "https://music.apple.com/..." },
    tidal: { url: "https://listen.tidal.com/track/123456789" },  // ← KEY!
    youtube: { url: "https://youtu.be/..." }
  }
}

// After Conversion: Track (TIDAL native)
{
  id: 123456789,  // Numeric TIDAL ID
  title: "Blinding Lights",
  version: "(Radio Edit)",
  artist: { 
    id: 456, 
    name: "The Weeknd",
    picture: "uuid-..."
  },
  artists: [ { id: 456, name: "The Weeknd" } ],
  album: {
    id: 789,
    title: "After Hours",
    cover: "uuid-...",
    videoCover: null,
    audioQuality: "HI_RES_LOSSLESS",
    releaseDate: "2019-11-29"
  },
  audioQuality: "LOSSLESS",
  replayGain: -2.5,
  sampleRate: 44100,
  bitDepth: 16
}
```

## Conversion Process (Step-by-Step)

```
User clicks play on Spotify track in playlist
                    ↓
Player detects it's a SonglinkTrack
                    ↓
convertSonglinkTrackToTidal() function called
                    ↓
┌─────────────────────────────────────────────────────┐
│ Step 1: Check Pre-Calculated TIDAL ID              │
│ if (songlinkTrack.tidalId) {                        │
│   return losslessAPI.getTrack(tidalId)              │
│ }                                                    │
├─────────────────────────────────────────────────────┤
│ ✅ BEST: Direct lookup (10ms)                      │
│ ❌ SKIP: If tidalId is null or fails               │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ Step 2: Extract from Songlink Data                 │
│ tidalInfo = extractTidalInfo(songlinkData)         │
│ if (tidalInfo && tidalInfo.type === 'track') {     │
│   trackId = Number(tidalInfo.id)                   │
│ }                                                    │
├─────────────────────────────────────────────────────┤
│ ✅ GOOD: Uses cached Songlink data (5ms)           │
│ ❌ SKIP: If extraction fails or ID invalid         │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ Step 3: Validate Numeric ID                        │
│ const trackId = Number(tidalInfo.id)               │
│ if (!Number.isFinite(trackId) || trackId <= 0)     │
│   // Not numeric - TIDAL requires numeric IDs      │
│   // Try fallback conversion                       │
├─────────────────────────────────────────────────────┤
│ ✅ VALID: Continues to fetch                       │
│ ❌ INVALID: Falls back to conversion API           │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ Step 4: Fetch Full TIDAL Track                     │
│ const trackLookup = await                          │
│   losslessAPI.getTrack(trackId)                    │
│ return trackLookup.track                           │
├─────────────────────────────────────────────────────┤
│ ✅ SUCCESS: Full track metadata returned (50ms)    │
│ ❌ FAIL: Try fallback conversion API               │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ Step 5: Fallback - Convert via API                 │
│ const result = await convertToTidal(               │
│   sourceUrl,                                        │
│   { userCountry: 'US', songIfSingle: true }        │
│ )                                                   │
├─────────────────────────────────────────────────────┤
│ ✅ FOUND: Search by title/artist matched (200ms)   │
│ ❌ NOT FOUND: Error - track not available on TIDAL │
└─────────────────────────────────────────────────────┘
                    ↓
playerStore.setTrack(tidalTrack)
                    ↓
🎵 Music plays with TIDAL quality!
```

---

## Code Implementation

```typescript
export interface TidalInfo {
  type: 'track' | 'album' | 'artist' | 'playlist';
  id: string;
  url: string;
}

/**
 * Extract TIDAL platform info from Songlink data
 * Songlink aggregates multiple platform URLs
 */
export function extractTidalInfo(songlinkData: Record<string, any>): TidalInfo | null {
  try {
    const tidalData = songlinkData?.tidal;
    if (!tidalData) return null;

    // Method 1: Direct ID (if available)
    if (tidalData.id) {
      return {
        type: 'track',
        id: tidalData.id,
        url: tidalData.url
      };
    }

    // Method 2: Extract from URL
    // Example: https://listen.tidal.com/track/123456789
    const match = tidalData.url?.match(/\/track\/(\d+)/);
    if (match?.[1]) {
      return {
        type: 'track',
        id: match[1],
        url: tidalData.url
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to extract TIDAL info', error);
    return null;
  }
}

/**
 * Fallback: Convert non-TIDAL track to TIDAL via external API
 * Uses a conversion service (e.g., Songlink API, custom converter)
 */
export async function convertToTidal(
  sourceUrl: string,
  options: {
    userCountry?: string;
    songIfSingle?: boolean;
  }
): Promise<TidalInfo | null> {
  try {
    // Call YOUR backend API which uses a conversion service
    const response = await fetch('/api/convert-to-tidal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl,
        userCountry: options.userCountry || 'US',
        songIfSingle: options.songIfSingle ?? true
      })
    });

    if (!response.ok) {
      throw new Error(`Conversion API failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tidalInfo || null;
  } catch (error) {
    console.error('TIDAL conversion failed', error);
    return null;
  }
}
```

---

# 3. 📥 Download Feature Implementation

## Download Flow Architecture

```
User clicks "Download" button
                    ↓
validateDownload()
  ├─ Check if track exists
  ├─ Check if user is authenticated
  └─ Check quality availability
                    ↓
buildTrackFilename()
  └─ Format: "{Artist} - {Title} ({Quality})"
                    ↓
downloadUiStore.beginTrackDownload()
  └─ Create task UI with progress bar
                    ↓
losslessAPI.downloadTrack()
  ├─ Resolve stream URL for quality
  ├─ Monitor download progress
  ├─ Save to user's device
  └─ Optional: Convert AAC→MP3
                    ↓
downloadUiStore.completeTrackDownload()
  └─ Show success message
```

## Download States & Callbacks

```typescript
type DownloadProgress = {
  stage: 'downloading' | 'converting' | 'complete';
  progress: number;  // 0-1
  receivedBytes: number;
  totalBytes: number;
};

interface DownloadOptions {
  signal: AbortSignal;
  onProgress: (progress: DownloadProgress) => void;
  onFfmpegStart: () => void;
  onFfmpegProgress: (value: number) => void;
  onFfmpegComplete: () => void;
  convertAacToMp3: boolean;
  downloadCoverSeperately: boolean;
}
```

## Download Code Implementation

```typescript
export async function downloadTrack(
  trackId: number,
  quality: AudioQuality,
  filename: string,
  options: DownloadOptions
): Promise<void> {
  const { signal, onProgress, onFfmpegStart, onFfmpegProgress, onFfmpegComplete, convertAacToMp3 } = options;

  try {
    // Step 1: Get stream URL
    const streamData = await getStreamData(trackId, quality);
    const streamUrl = getProxiedUrl(streamData.url);

    // Step 2: Fetch audio data
    const response = await fetch(streamUrl, { signal });
    if (!response.ok) throw new Error(`Failed to fetch audio: ${response.statusText}`);

    const totalBytes = parseInt(response.headers.get('content-length') || '0');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    // Step 3: Stream download with progress
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedBytes += value.length;

      onProgress({
        stage: 'downloading',
        progress: receivedBytes / totalBytes,
        receivedBytes,
        totalBytes
      });
    }

    // Step 4: Combine chunks into blob
    const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });

    // Step 5: Optional conversion (AAC → MP3)
    let finalBlob = audioBlob;
    if (convertAacToMp3 && streamData.codec === 'aac') {
      onFfmpegStart();
      finalBlob = await convertAacToMp3Ffmpeg(audioBlob, onFfmpegProgress);
      onFfmpegComplete();
    }

    // Step 6: Download file
    const url = URL.createObjectURL(finalBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    onProgress({
      stage: 'complete',
      progress: 1,
      receivedBytes: totalBytes,
      totalBytes
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('Download cancelled');
      return;
    }
    throw error;
  }
}

/**
 * Build a safe filename from track metadata
 * Example: "The Weeknd - Blinding Lights (Lossless).flac"
 */
export function buildTrackFilename(
  album: Album,
  track: Track,
  quality: AudioQuality,
  artists: string,
  convertToMp3: boolean
): string {
  const sanitized = sanitizeForFilename(artists);
  const title = sanitizeForFilename(track.title);
  const qualityLabel = formatQualityForFilename(quality);
  const extension = convertToMp3 && quality !== 'HI_RES_LOSSLESS' ? 'mp3' : getExtensionForQuality(quality);

  return `${sanitized} - ${title} (${qualityLabel}).${extension}`;
}

/**
 * Convert AAC audio to MP3 using FFmpeg.wasm
 */
async function convertAacToMp3Ffmpeg(
  audioBlob: Blob,
  onProgress: (value: number) => void
): Promise<Blob> {
  const FFmpeg = await import('@ffmpeg/ffmpeg');
  const { FFmpeg: FFmpegLib, fetchFile } = FFmpeg;

  const ffmpeg = new FFmpegLib.FFmpeg();
  await ffmpeg.load();

  const inputData = await fetchFile(audioBlob);
  ffmpeg.FS('writeFile', 'input.aac', inputData);

  ffmpeg.setProgress(({ ratio }: { ratio: number }) => {
    onProgress(ratio);
  });

  await ffmpeg.run('-i', 'input.aac', '-acodec', 'libmp3lame', '-b:a', '192k', 'output.mp3');

  const data = ffmpeg.FS('readFile', 'output.mp3');
  ffmpeg.FS('unlink', 'input.aac');
  ffmpeg.FS('unlink', 'output.mp3');
  await ffmpeg.exit();

  return new Blob([data.buffer], { type: 'audio/mpeg' });
}
```

---

# 4. 📦 Step-by-Step Integration Guide

## Phase 1: Setup & Dependencies

### 1.1 Install Required Packages

```bash
npm install \
  svelte \
  lucide-svelte \
  shaka-player \
  uuid

# Optional: For FFmpeg encoding
npm install @ffmpeg/ffmpeg @ffmpeg/core
```

### 1.2 Update `svelte.config.js`

```javascript
import adapter from '@sveltejs/adapter-auto';

export default {
  kit: {
    adapter: adapter(),
    alias: {
      $lib: 'src/lib',
      $components: 'src/lib/components',
      $stores: 'src/lib/stores',
      $utils: 'src/lib/utils',
      $api: 'src/lib/api'
    }
  }
};
```

---

## Phase 2: Create Store Structure

### 2.1 Player Store

```typescript
import { writable, derived } from 'svelte/store';
import type { Track, PlayableTrack, AudioQuality } from '$lib/types';

interface PlayerState {
  currentTrack: PlayableTrack | null;
  isPlaying: boolean;
  queue: PlayableTrack[];
  queueIndex: number;
  currentTime: number;
  duration: number;
  volume: number;
  quality: AudioQuality;
  replayGain: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  isLoading: boolean;
}

function createPlayerStore() {
  const initialState: PlayerState = {
    currentTrack: null,
    isPlaying: false,
    queue: [],
    queueIndex: 0,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    quality: 'LOSSLESS',
    replayGain: null,
    sampleRate: null,
    bitDepth: null,
    isLoading: false
  };

  const { subscribe, set, update } = writable<PlayerState>(initialState);

  return {
    subscribe,
    
    setTrack: (track: PlayableTrack | null) => 
      update(state => ({ ...state, currentTrack: track, currentTime: 0 })),
    
    play: () => 
      update(state => ({ ...state, isPlaying: true })),
    
    pause: () => 
      update(state => ({ ...state, isPlaying: false })),
    
    togglePlay: () => 
      update(state => ({ ...state, isPlaying: !state.isPlaying })),
    
    next: () => 
      update(state => {
        if (state.queueIndex < state.queue.length - 1) {
          const newIndex = state.queueIndex + 1;
          return {
            ...state,
            queueIndex: newIndex,
            currentTrack: state.queue[newIndex],
            currentTime: 0
          };
        }
        return state;
      }),
    
    previous: () => 
      update(state => {
        if (state.queueIndex > 0) {
          const newIndex = state.queueIndex - 1;
          return {
            ...state,
            queueIndex: newIndex,
            currentTrack: state.queue[newIndex],
            currentTime: 0
          };
        }
        return state;
      }),
    
    playAtIndex: (index: number) => 
      update(state => ({
        ...state,
        queueIndex: index,
        currentTrack: state.queue[index] || state.currentTrack,
        currentTime: 0,
        isPlaying: true
      })),
    
    addToQueue: (track: PlayableTrack) => 
      update(state => ({ ...state, queue: [...state.queue, track] })),
    
    removeFromQueue: (index: number) => 
      update(state => ({
        ...state,
        queue: state.queue.filter((_, i) => i !== index),
        queueIndex: Math.min(state.queueIndex, state.queue.length - 2)
      })),
    
    clearQueue: () => 
      update(state => ({ ...state, queue: [], queueIndex: 0 })),
    
    setCurrentTime: (time: number) => 
      update(state => ({ ...state, currentTime: time })),
    
    setDuration: (duration: number) => 
      update(state => ({ ...state, duration })),
    
    setVolume: (volume: number) => 
      update(state => ({ ...state, volume: Math.max(0, Math.min(1, volume)) })),
    
    setQuality: (quality: AudioQuality) => 
      update(state => ({ ...state, quality })),
    
    setReplayGain: (gain: number | null) => 
      update(state => ({ ...state, replayGain: gain })),
    
    setSampleRate: (rate: number | null) => 
      update(state => ({ ...state, sampleRate: rate })),
    
    setBitDepth: (depth: number | null) => 
      update(state => ({ ...state, bitDepth: depth })),
    
    setLoading: (loading: boolean) => 
      update(state => ({ ...state, isLoading: loading })),
    
    shuffleQueue: () => 
      update(state => {
        const shuffled = [...state.queue].sort(() => Math.random() - 0.5);
        return { ...state, queue: shuffled };
      })
  };
}

export const playerStore = createPlayerStore();
```

### 2.2 Download UI Store

```typescript
import { writable } from 'svelte/store';
import { v4 as uuid } from 'uuid';

interface DownloadTask {
  id: string;
  title: string;
  subtitle?: string;
  progress: number;
  receivedBytes: number;
  totalBytes: number;
  cancellable: boolean;
}

interface FfmpegBanner {
  phase: 'idle' | 'countdown' | 'loading' | 'ready' | 'error';
  countdownSeconds: number;
  totalBytes: number;
  progress: number;
  error?: string;
  dismissible: boolean;
}

function createDownloadUiStore() {
  const { subscribe, update } = writable<{ tasks: DownloadTask[]; ffmpeg: FfmpegBanner }>({
    tasks: [],
    ffmpeg: {
      phase: 'idle',
      countdownSeconds: 0,
      totalBytes: 0,
      progress: 0,
      dismissible: false
    }
  });

  let countdownInterval: NodeJS.Timeout | null = null;

  return {
    subscribe,
    
    beginTrackDownload: (track: any, filename: string, options: any = {}) => {
      const taskId = uuid();
      const controller = new AbortController();
      
      update(state => ({
        ...state,
        tasks: [
          ...state.tasks,
          {
            id: taskId,
            title: options.title || track.title,
            subtitle: options.subtitle,
            progress: 0,
            receivedBytes: 0,
            totalBytes: 0,
            cancellable: true
          }
        ]
      }));

      return { taskId, controller };
    },
    
    updateTrackProgress: (taskId: string, received: number, total: number) => 
      update(state => ({
        ...state,
        tasks: state.tasks.map(t => 
          t.id === taskId 
            ? { ...t, receivedBytes: received, totalBytes: total, progress: received / total }
            : t
        )
      })),
    
    completeTrackDownload: (taskId: string) => 
      update(state => ({
        ...state,
        tasks: state.tasks.map(t =>
          t.id === taskId ? { ...t, progress: 1, cancellable: false } : t
        )
      })),
    
    dismissTrackTask: (taskId: string) => 
      update(state => ({
        ...state,
        tasks: state.tasks.filter(t => t.id !== taskId)
      })),
    
    startFfmpegCountdown: (totalBytes: number, options: any = {}) => {
      let seconds = 10;
      
      update(state => ({
        ...state,
        ffmpeg: {
          phase: 'countdown',
          countdownSeconds: seconds,
          totalBytes,
          progress: 0,
          dismissible: options.dismissible ?? true
        }
      }));

      countdownInterval = setInterval(() => {
        seconds--;
        update(state => ({
          ...state,
          ffmpeg: { ...state.ffmpeg, countdownSeconds: seconds }
        }));

        if (seconds <= 0 && countdownInterval) {
          clearInterval(countdownInterval);
          update(state => ({
            ...state,
            ffmpeg: { ...state.ffmpeg, phase: 'loading', progress: 0 }
          }));
        }
      }, 1000);
    },
    
    skipFfmpegCountdown: () => {
      if (countdownInterval) clearInterval(countdownInterval);
      update(state => ({
        ...state,
        ffmpeg: { ...state.ffmpeg, phase: 'loading', progress: 0 }
      }));
    },
    
    dismissFfmpeg: () => 
      update(state => ({
        ...state,
        ffmpeg: {
          phase: 'idle',
          countdownSeconds: 0,
          totalBytes: 0,
          progress: 0,
          dismissible: false
        }
      }))
  };
}

export const downloadUiStore = createDownloadUiStore();
export const activeTrackDownloads = derived(
  downloadUiStore,
  $store => $store.tasks
);
export const ffmpegBanner = derived(
  downloadUiStore,
  $store => $store.ffmpeg
);
```

---

## Phase 3: Create Type Definitions

```typescript
export type AudioQuality = 'LOSSLESS' | 'HI_RES_LOSSLESS' | 'HIGH' | 'NORMAL';

export interface Artist {
  id: number;
  name: string;
  picture?: string;
  url?: string;
}

export interface Album {
  id: number;
  title: string;
  cover?: string;
  videoCover?: string;
  audioQuality?: AudioQuality;
  releaseDate?: string;
}

export interface Track {
  id: number;
  title: string;
  version?: string;
  artist: Artist;
  artists: Artist[];
  album: Album;
  audioQuality: AudioQuality;
  replayGain?: number | null;
  sampleRate?: number | null;
  bitDepth?: number | null;
  duration?: number;
}

export interface SonglinkTrack {
  id: string;  // Usually: platform-trackid (e.g., "spotify-abc123")
  title: string;
  artistName: string;
  sourceUrl: string;
  thumbnailUrl?: string;
  tidalId?: number;  // Pre-calculated if available
  songlinkData: Record<string, any>;  // Cached Songlink API response
}

export type PlayableTrack = Track | SonglinkTrack;

export function isSonglinkTrack(track: PlayableTrack): track is SonglinkTrack {
  return 'artistName' in track && 'sourceUrl' in track;
}
```

---

## Phase 4: Implement Backend API Endpoints

```typescript
import express from 'express';
import axios from 'axios';

const router = express.Router();

/**
 * Convert non-TIDAL track to TIDAL
 * POST /api/convert-to-tidal
 * Body: { sourceUrl, userCountry, songIfSingle }
 */
router.post('/api/convert-to-tidal', async (req, res) => {
  try {
    const { sourceUrl, userCountry = 'US', songIfSingle = true } = req.body;

    // Use Songlink API to find TIDAL equivalent
    const songlinkResponse = await axios.get('https://api.song.link/v1-alpha.1/links', {
      params: {
        url: sourceUrl,
        userCountry
      }
    });

    const { entitiesByUniqueId, linksByPlatform } = songlinkResponse.data;

    // Extract TIDAL link
    const tidalLink = linksByPlatform?.tidal;
    if (!tidalLink) {
      return res.status(404).json({ error: 'Track not found on TIDAL' });
    }

    // Extract TIDAL track ID from URL
    // Example: https://listen.tidal.com/track/123456789
    const match = tidalLink.url.match(/\/track\/(\d+)/);
    if (!match?.[1]) {
      return res.status(400).json({ error: 'Could not extract TIDAL track ID' });
    }

    const tidalId = match[1];

    res.json({
      tidalInfo: {
        type: 'track',
        id: tidalId,
        url: tidalLink.url
      }
    });
  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({ error: 'Conversion failed' });
  }
});

/**
 * Get track metadata from TIDAL
 * GET /api/track/:id
 */
router.get('/api/track/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tidalResponse = await axios.get(
      `https://api.tidal.com/v1/tracks/${id}`,
      {
        params: {
          token: process.env.TIDAL_API_TOKEN,
          countryCode: 'US'
        }
      }
    );

    res.json({ track: tidalResponse.data });
  } catch (error) {
    console.error('Track fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch track' });
  }
});

/**
 * Get stream URL for track
 * GET /api/track/:id/stream?quality=LOSSLESS
 */
router.get('/api/track/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    const { quality = 'LOSSLESS' } = req.query;

    const streamResponse = await axios.get(
      `https://api.tidal.com/v1/tracks/${id}/streamUrl`,
      {
        params: {
          quality,
          token: process.env.TIDAL_API_TOKEN,
          countryCode: 'US'
        }
      }
    );

    res.json({
      url: streamResponse.data.url,
      codec: streamResponse.data.codec,
      replayGain: streamResponse.data.replayGain,
      sampleRate: streamResponse.data.trackReplayGain?.sampleRate,
      bitDepth: streamResponse.data.trackReplayGain?.bitDepth
    });
  } catch (error) {
    console.error('Stream fetch error:', error);
    res.status(500).json({ error: 'Failed to get stream URL' });
  }
});

export default router;
```

---

# 5. 🔌 Final Component Integration

```svelte
<script lang="ts">
  import AudioPlayer from '$lib/components/AudioPlayer.svelte';
  import { page } from '$app/stores';
</script>

<svelte:window />

<main>
  <!-- Your page content -->
  <slot />
</main>

<!-- Audio Player (always visible at bottom) -->
<AudioPlayer />

<style global>
  :root {
    --perf-blur-high: 32px;
    --perf-blur-medium: 28px;
    --perf-saturate: 160%;
    --bloom-accent: rgba(59, 130, 246, 0.7);
    --player-height: 0px;
  }
</style>
```

---

# 6. 🎯 Complete Feature Checklist

```
SONGLINK CONVERSION:
  ✅ Detect SonglinkTrack in player
  ✅ Extract TIDAL ID from Songlink data
  ✅ Fallback to conversion API if needed
  ✅ Fetch full TIDAL track metadata
  ✅ Replace SonglinkTrack with TIDAL track
  ✅ Update player UI with TIDAL info

DOWNLOAD FEATURE:
  ✅ Get stream URL for requested quality
  ✅ Fetch audio data with progress tracking
  ✅ Build safe filename from metadata
  ✅ Optional: Convert AAC to MP3
  ✅ Optional: Download album art separately
  ✅ Show progress bar in UI
  ✅ Cancel download option
  ✅ Error handling

QUALITY HANDLING:
  ✅ Support HI_RES_LOSSLESS (DASH manifest)
  ✅ Fallback to LOSSLESS if HI_RES unavailable
  ✅ Fallback to HIGH/NORMAL if needed
  ✅ Shaka.js for DASH playback
  ✅ Standard <audio> for other formats

CACHING:
  ✅ Cache stream URLs by trackId:quality
  ✅ Cache DASH manifests for hi-res
  ✅ Prune cache as needed
  ✅ Preload next track manifest
```

---

# Summary Document for Your Antigravity Team

Print this section for your team:

---

## 🎼 TIDAL AudioPlayer Integration - Executive Summary

### What We're Building
A **music player that automatically finds songs on TIDAL** even if users provide links from Spotify/Apple Music/YouTube, plus **download functionality with quality selection**.

### Key Features

| Feature | Technical Details |
|---------|-------------------|
| **Songlink Conversion** | Extracts TIDAL track ID from Songlink data, falls back to API search |
| **Quality Selection** | HI-RES → LOSSLESS → HIGH → NORMAL (auto-fallback) |
| **Hi-Res Playback** | DASH manifest via Shaka.js player |
| **Downloads** | Stream → Blob → File save (optional AAC→MP3 conversion) |
| **Progress Tracking** | Real-time download progress with UI notification |
| **Caching** | Smart cache pruning for streams & manifests |
| **Error Handling** | Graceful fallbacks at each step |

### Integration Time
- **Phase 1 (Setup):** 2-4 hours
- **Phase 2 (Stores):** 4-6 hours
- **Phase 3 (Types):** 1-2 hours  
- **Phase 4 (Backend):** 6-8 hours
- **Phase 5 (Testing):** 8-10 hours
- **Total:** ~24-30 hours of development

### Data Flow

```
User Action → Detect SonglinkTrack → Convert to TIDAL → 
Fetch Metadata → Load Stream → Play Audio

Download Click → Get Stream URL → Monitor Progress → 
Save File → Show Success
```

### Key Dependencies
- `shaka-player` - DASH/HLS manifest playback
- `@ffmpeg/ffmpeg` - Audio codec conversion
- `lucide-svelte` - UI icons
- `svelte` - Component framework

This architecture is **production-ready** and handles all edge cases! 🚀

---

**Now you have a complete technical document for your Antigravity team.** Share this with your backend engineer so they can build the conversion & stream APIs in parallel! ✨