# TIDAL UI - API Usage Examples

## How to Use the APIs

The main entry point is the `losslessAPI` class exported from `src/lib/api.ts`.

```typescript
import { losslessAPI } from '$lib/api';
```

---

## 1. SEARCH OPERATIONS

### Search for Tracks
```typescript
const searchResults = await losslessAPI.searchTracks('Blinding Lights', 'auto');

console.log(searchResults.totalNumberOfItems); // Total matches
console.log(searchResults.items); // Array of Track objects
console.log(searchResults.items[0]?.title); // First track title
console.log(searchResults.items[0]?.audioQuality); // "LOSSLESS" or "HIGH"
```

### Search for Artists
```typescript
const artists = await losslessAPI.searchArtists('The Weeknd');
console.log(artists.items[0]?.name); // Artist name
console.log(artists.items[0]?.popularity); // 0-100 popularity score
```

### Search for Albums
```typescript
const albums = await losslessAPI.searchAlbums('After Hours');
console.log(albums.items[0]?.numberOfTracks); // Track count
console.log(albums.items[0]?.releaseDate); // Release date
```

### Search for Playlists
```typescript
const playlists = await losslessAPI.searchPlaylists('workout');
console.log(playlists.items[0]?.numberOfTracks);
console.log(playlists.items[0]?.creator.name);
```

---

## 2. GET SPECIFIC CONTENT

### Get Track with Stream Info
```typescript
// Request at specific quality level
const trackLookup = await losslessAPI.getTrack(123456, 'LOSSLESS');

// Access track metadata
const { track, info, originalTrackUrl } = trackLookup;

console.log(track.title); // "Blinding Lights"
console.log(track.duration); // 200 (seconds)
console.log(track.artist.name); // "The Weeknd"
console.log(track.album.title); // "After Hours"

// Access stream/quality info
console.log(info.bitDepth); // 16 or 24
console.log(info.sampleRate); // 44100, 48000, 96000, etc.
console.log(info.trackReplayGain); // ReplayGain value
console.log(info.manifest); // Base64 DASH manifest (segmented audio)

// Direct URL if available
if (originalTrackUrl) {
  console.log(originalTrackUrl); // Ready-to-stream URL
}
```

### Get Album with All Tracks
```typescript
const { album, tracks } = await losslessAPI.getAlbum(100);

console.log(album.title); // "After Hours"
console.log(album.numberOfTracks); // 14
console.log(tracks.length); // 14 Track objects
console.log(tracks[0]?.trackNumber); // 1
console.log(tracks[0]?.duration); // Track duration
```

### Get Artist with Discography
```typescript
const artist = await losslessAPI.getArtist(1); // artistId

console.log(artist.name); // "The Weeknd"
console.log(artist.popularity); // 95
console.log(artist.albums); // Array of albums (sorted by release date)
console.log(artist.tracks); // Top 100 tracks (sorted by popularity)

// Iterate albums
artist.albums.forEach(album => {
  console.log(`${album.title} (${album.releaseDate})`);
});
```

### Get Playlist with Tracks
```typescript
const { playlist, items } = await losslessAPI.getPlaylist('uuid-here');

console.log(playlist.title); // Playlist name
console.log(playlist.numberOfTracks); // Total tracks
console.log(items.length); // Track objects with .item property

items.forEach(entry => {
  const track = entry.item;
  console.log(`${track.title} by ${track.artist.name}`);
});
```

---

## 3. METADATA

### Get Lyrics
```typescript
const lyrics = await losslessAPI.getLyrics(123456);

console.log(lyrics.lyrics); // SRT format: "[00:00.00] First line\n[00:05.00] Second line"
console.log(lyrics.subtitles); // Subtitle text
console.log(lyrics.isRightToLeft); // For Arabic, Hebrew, etc.
console.log(lyrics.lyricsProvider); // "TIDAL", "MUSIXMATCH", etc.

// Parse lyrics with timestamps
const lines = lyrics.lyrics.split('\n');
lines.forEach(line => {
  const match = /\[(\d{2}):(\d{2})\.(\d{2})\] (.+)/.exec(line);
  if (match) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const millis = parseInt(match[3], 10);
    const text = match[4];
    console.log(`${minutes}:${seconds} - ${text}`);
  }
});
```

### Get Track Recommendations
```typescript
const recommendations = await losslessAPI.getRecommendations(123456);

console.log(recommendations.length); // Recommended tracks
recommendations.forEach(track => {
  console.log(`${track.title} - ${track.artist.name}`);
});
```

### Get Album Cover
```typescript
const covers = await losslessAPI.getCover(100); // albumId

console.log(covers[0]?.name); // "Front Cover"
console.log(covers[0]?.['640']); // URL for 640x640 image
console.log(covers[0]?.['1280']); // URL for 1280x1280 image

// Use directly in HTML
const coverUrl = covers[0]?.['640'];
```

### Get Cover URL Directly
```typescript
const coverId = 'abc-def-123'; // From album/track cover field
const coverUrl = losslessAPI.getCoverUrl(coverId, '640'); // Size options: 1280, 640, 320, 160, 80

// Result: https://resources.tidal.com/images/abc/def/123/640x640.jpg
```

---

## 4. STREAMING

### Get Stream URL
```typescript
// Simple method - just get URL
const streamUrl = await losslessAPI.getStreamUrl(123456, 'LOSSLESS');
console.log(streamUrl); // "https://...with-token..."

// More detailed method with metadata
const streamData = await losslessAPI.getStreamData(123456, 'LOSSLESS');

console.log(streamData.url); // Stream URL
console.log(streamData.replayGain); // -2.5 dB
console.log(streamData.sampleRate); // 44100
console.log(streamData.bitDepth); // 16 or 24
```

### Get DASH Manifest (For HiFi Segmented Audio)
```typescript
const dashManifest = await losslessAPI.getDashManifest(123456, 'LOSSLESS');

if (dashManifest.kind === 'dash') {
  // Segmented DASH manifest (XML)
  console.log(dashManifest.manifest); // Full MPD/DASH XML
  console.log(dashManifest.contentType); // "application/dash+xml"
  
  // Parser will extract segment URLs from manifest
} else if (dashManifest.kind === 'flac') {
  // Direct FLAC URLs
  console.log(dashManifest.urls); // ["https://...audio.flac?token=xxx"]
}

// With metadata
const withMeta = await losslessAPI.getDashManifestWithMetadata(123456, 'LOSSLESS');
console.log(withMeta.trackInfo.sampleRate); // 96000 for Hi-Res
console.log(withMeta.trackInfo.bitDepth); // 24 for Hi-Res
console.log(withMeta.trackInfo.replayGain); // -3.0 dB
```

---

## 5. DOWNLOADING

### Download Track with Metadata
```typescript
// Basic download
await losslessAPI.downloadTrack(123456, 'LOSSLESS', 'song.flac');

// With progress tracking and options
await losslessAPI.downloadTrack(
  123456,
  'LOSSLESS',
  'song.flac',
  {
    // Track download progress
    onProgress: (progress) => {
      if (progress.stage === 'downloading') {
        const percent = (progress.receivedBytes / (progress.totalBytes || 1)) * 100;
        console.log(`Downloaded: ${percent.toFixed(1)}%`);
      } else if (progress.stage === 'embedding') {
        console.log(`Embedding metadata: ${(progress.progress * 100).toFixed(1)}%`);
      }
    },
    
    // FFmpeg countdown (before WASM download starts)
    onFfmpegCountdown: (options) => {
      console.log(`FFmpeg needed, downloading: ${options.totalBytes} bytes...`);
    },
    
    // FFmpeg lifecycle events
    onFfmpegStart: () => console.log('FFmpeg processing started'),
    onFfmpegProgress: (progress) => {
      console.log(`FFmpeg: ${(progress * 100).toFixed(1)}%`);
    },
    onFfmpegComplete: () => console.log('FFmpeg complete'),
    onFfmpegError: (error) => console.error('FFmpeg error:', error),
    
    // Convert AAC to MP3
    convertAacToMp3: true,
    
    // Download cover separately
    downloadCoverSeperately: true,
    
    // Abort signal for cancellation
    signal: abortController.signal
  }
);
```

### Get Track Blob (For Manual Handling)
```typescript
// Get just the audio blob without triggering browser download
const { blob, mimeType } = await losslessAPI.fetchTrackBlob(
  123456,
  'LOSSLESS',
  'song.flac',
  {
    onProgress: (progress) => {
      console.log(progress.stage, progress.receivedBytes);
    }
  }
);

// Use blob for custom handling (upload, process, etc.)
const arrayBuffer = await blob.arrayBuffer();
const uint8Array = new Uint8Array(arrayBuffer);

// Upload to server
const formData = new FormData();
formData.append('file', blob, 'song.flac');
await fetch('/api/upload', { method: 'POST', body: formData });
```

---

## 6. URL IMPORTING

### Import from TIDAL URL
```typescript
// Automatically handles: track, album, artist, playlist URLs
const result = await losslessAPI.importFromUrl('https://tidal.com/track/123456');

if (result.type === 'track') {
  console.log(result.data.title); // Track object
}

if (result.type === 'album') {
  console.log(result.data.numberOfTracks); // Album object
}

if (result.type === 'artist') {
  console.log(result.data.albums.length); // ArtistDetails object
}

if (result.type === 'playlist') {
  console.log(result.data.playlist.numberOfTracks);
  console.log(result.data.tracks.length); // Playlist + tracks
}
```

---

## 7. UTILITY METHODS

### Format Duration
```typescript
const duration = 200; // seconds
const formatted = losslessAPI.formatDuration(duration); // "3:20"

// For display
console.log(`Track length: ${formatted}`); // "Track length: 3:20"
```

### Get Image URLs
```typescript
// Album covers
const coverUrl = losslessAPI.getCoverUrl('abc-def-123', '640');
// -> https://resources.tidal.com/images/abc/def/123/640x640.jpg

// Artist pictures
const picUrl = losslessAPI.getArtistPictureUrl('xyz-123', '750');
// -> https://resources.tidal.com/images/xyz/123/750x750.jpg

// Video covers
const videoUrl = losslessAPI.getVideoCoverUrl('vid-123', '640');
// -> https://resources.tidal.com/videos/vid/123/640x640.mp4

// Use in <img> tags
// <img src={coverUrl} alt="Album cover" />
```

---

## 8. ERROR HANDLING

```typescript
try {
  const track = await losslessAPI.getTrack(999999999, 'LOSSLESS');
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('Quality not found')) {
      console.log('Quality unavailable, retrying with fallback...');
      // Handled automatically in getTrack()
    } else if (error.message.includes('Too Many Requests')) {
      console.log('Rate limited, please wait...');
    } else if (error.message.includes('not found')) {
      console.log('Track not found');
    } else if ('code' in error && error.code === 'DASH_MANIFEST_UNAVAILABLE') {
      console.log('DASH manifest not available for this quality');
    } else {
      console.log('Error:', error.message);
    }
  }
}
```

---

## 9. WORKING WITH QUALITY LEVELS

```typescript
// Quality preference chain
async function streamTrackWithFallback(trackId: number) {
  const qualities = ['HI_RES_LOSSLESS', 'LOSSLESS', 'HIGH', 'LOW'] as const;
  
  for (const quality of qualities) {
    try {
      console.log(`Trying quality: ${quality}`);
      const data = await losslessAPI.getStreamData(trackId, quality);
      console.log(`Success! Using ${quality}`);
      console.log(`Sample rate: ${data.sampleRate}Hz`);
      console.log(`Bit depth: ${data.bitDepth}-bit`);
      return data.url;
    } catch (error) {
      console.log(`${quality} failed, trying next...`);
    }
  }
  
  throw new Error('No quality available');
}

// Usage
const streamUrl = await streamTrackWithFallback(123456);
```

---

## 10. EXTERNAL APIS (Backend Routes)

### Songlink (Cross-Platform Links)
```typescript
// Via /api/songlink endpoint
const response = await fetch('/api/songlink', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://tidal.com/track/123456',
    userCountry: 'US'
  })
});

const links = await response.json();
console.log(links.linksByPlatform.spotify); // Spotify link
console.log(links.linksByPlatform.appleMusic); // Apple Music link
```

### Spotify Playlist Conversion
```typescript
// Via /api/spotify-playlist endpoint
const response = await fetch('/api/spotify-playlist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    spotifyPlaylistId: '37i9dQZF1DX0XUsuxWHRQd'
  })
});

const converted = await response.json();
converted.tracks.forEach(track => {
  console.log(`${track.title} → Tidal: ${track.tidalId}`);
});
```

---

## 11. REGIONAL API SELECTION

```typescript
// Current API selection (weighted random)
const autoSelected = await losslessAPI.searchTracks('query', 'auto');

// All 10 endpoints have equal weight (weight: 15 each):
// - squid-api, spotisaver-1, spotisaver-2, kinoplus
// - hund, katze, maus, vogel, wolf, monochrome

// Selection is automatic and random on each request
// This distributes load across all endpoints
```

---

## 12. COMPLETE EXAMPLE: Player Setup

```typescript
import { losslessAPI } from '$lib/api';

// Search for track
const results = await losslessAPI.searchTracks('Blinding Lights');
const track = results.items[0];

// Get stream URL
const streamUrl = await losslessAPI.getStreamUrl(track.id, 'LOSSLESS');

// Get metadata
const trackDetails = await losslessAPI.getTrack(track.id, 'LOSSLESS');
const lyrics = await losslessAPI.getLyrics(track.id);
const coverUrl = losslessAPI.getCoverUrl(track.album.cover, '640');

// Setup audio
const audio = new Audio(streamUrl);
audio.play();

// Display
console.log(`Now Playing: ${track.title}`);
console.log(`Artist: ${track.artist.name}`);
console.log(`Album: ${track.album.title}`);
console.log(`Quality: ${trackDetails.info.bitDepth}-bit/${trackDetails.info.sampleRate}Hz`);
console.log(`ReplayGain: ${trackDetails.info.trackReplayGain}dB`);
console.log(`Lyrics available: ${!!lyrics.lyrics}`);
console.log(`Cover: ${coverUrl}`);
```

---

## 13. COMPLETE EXAMPLE: Download with Progress

```typescript
import { losslessAPI } from '$lib/api';

const trackId = 123456;
const quality = 'LOSSLESS';

let downloadPercent = 0;
let metadataPercent = 0;

try {
  await losslessAPI.downloadTrack(trackId, quality, 'song.flac', {
    onProgress: ({ stage, receivedBytes, totalBytes }) => {
      if (stage === 'downloading') {
        downloadPercent = totalBytes 
          ? (receivedBytes / totalBytes) * 100 
          : 0;
        console.log(`Downloading: ${downloadPercent.toFixed(1)}%`);
      } else if (stage === 'embedding') {
        console.log(`Embedding metadata...`);
      }
    },
    
    onFfmpegCountdown: ({ totalBytes, autoTriggered }) => {
      console.log(`FFmpeg needed (${autoTriggered ? 'auto' : 'user'} triggered)`);
      if (totalBytes) {
        console.log(`Downloading FFmpeg: ${(totalBytes / 1024 / 1024).toFixed(1)}MB`);
      }
    },
    
    onFfmpegProgress: (progress) => {
      metadataPercent = progress * 100;
      console.log(`Metadata: ${metadataPercent.toFixed(1)}%`);
    },
    
    onFfmpegComplete: () => {
      console.log('Download complete! File downloaded with metadata.');
    },
    
    onFfmpegError: (error) => {
      console.warn('Metadata embedding failed:', error);
      console.log('File downloaded without metadata.');
    },
    
    convertAacToMp3: false,
    downloadCoverSeperately: true
  });
} catch (error) {
  console.error('Download failed:', error);
}
```

