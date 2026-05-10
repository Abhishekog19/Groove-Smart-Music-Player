# TIDAL UI - Quick API Reference

## What Data You Get From Each API Call

### 1. SEARCH OPERATIONS

#### searchTracks(query)
```json
{
  "limit": 20,
  "offset": 0,
  "totalNumberOfItems": 150,
  "items": [
    {
      "id": 123456,
      "title": "Song Name",
      "duration": 240,
      "audioQuality": "LOSSLESS",
      "audioModes": ["STEREO"],
      "artist": { "id": 1, "name": "Artist Name" },
      "album": { "id": 100, "title": "Album Name", "cover": "cover-id" },
      "popularity": 85,
      "explicit": false,
      "isrc": "USRC12345678"
    }
  ]
}
```

#### searchArtists(query)
```json
{
  "items": [
    {
      "id": 1,
      "name": "Artist Name",
      "type": "ARTIST",
      "picture": "picture-id",
      "popularity": 90,
      "url": "https://tidal.com/artist/1"
    }
  ]
}
```

#### searchAlbums(query)
```json
{
  "items": [
    {
      "id": 100,
      "title": "Album Title",
      "cover": "cover-id",
      "releaseDate": "2024-01-15",
      "numberOfTracks": 12,
      "popularity": 75,
      "audioQuality": "LOSSLESS"
    }
  ]
}
```

#### searchPlaylists(query)
```json
{
  "items": [
    {
      "uuid": "uuid-string",
      "title": "Playlist Name",
      "description": "Description",
      "image": "cover-id",
      "numberOfTracks": 50,
      "creator": {
        "id": 123,
        "name": "Creator Name",
        "picture": "picture-id"
      },
      "popularity": 60,
      "created": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### 2. TRACK INFORMATION

#### getTrack(trackId, quality)
```json
{
  "track": {
    "id": 123456,
    "title": "Song Name",
    "duration": 240,
    "version": "Album Version",
    "trackNumber": 3,
    "volumeNumber": 1,
    "audioQuality": "LOSSLESS",
    "audioModes": ["STEREO"],
    "streamReady": true,
    "allowStreaming": true,
    "explicit": false,
    "popularity": 85,
    "copyright": "© 2024 Record Label",
    "isrc": "USRC12345678",
    "replayGain": -2.5,
    "peak": 0.95,
    "artist": { "id": 1, "name": "Artist" },
    "artists": [{ "id": 1, "name": "Artist" }],
    "album": {
      "id": 100,
      "title": "Album",
      "cover": "cover-id",
      "numberOfTracks": 12
    }
  },
  "info": {
    "trackId": 123456,
    "audioQuality": "LOSSLESS",
    "audioMode": "STEREO",
    "manifest": "base64-encoded-dash-xml-or-json",
    "manifestMimeType": "application/dash+xml",
    "bitDepth": 16,
    "sampleRate": 44100,
    "trackReplayGain": -2.5,
    "trackPeakAmplitude": 0.95,
    "albumReplayGain": -3.0,
    "albumPeakAmplitude": 0.98,
    "assetPresentation": "FULL"
  },
  "originalTrackUrl": "https://...stream-url..." // sometimes present
}
```

#### getRecommendations(trackId)
```json
[
  {
    "id": 654321,
    "title": "Similar Track",
    "artist": { "id": 2, "name": "Similar Artist" },
    "audioQuality": "LOSSLESS",
    "duration": 250
  }
  // ... more tracks
]
```

---

### 3. LYRICS

#### getLyrics(trackId)
```json
{
  "trackId": 123456,
  "lyrics": "[00:00.00] First line\n[00:05.00] Second line\n...",
  "subtitles": "[00:00.00] First line\n[00:05.00] Second line\n...",
  "lyricsProvider": "TIDAL",
  "providerLyricsId": "lyrics-id-123",
  "providerCommontrackId": "commontrack-id",
  "isRightToLeft": false
}
```

---

### 4. ALBUM

#### getAlbum(albumId)
```json
{
  "album": {
    "id": 100,
    "title": "Album Title",
    "cover": "cover-id",
    "videoCover": "video-cover-id",
    "releaseDate": "2024-01-15",
    "numberOfTracks": 12,
    "numberOfVolumes": 1,
    "numberOfVideos": 0,
    "popularity": 75,
    "explicit": true,
    "audioQuality": "LOSSLESS",
    "audioModes": ["STEREO"],
    "copyright": "© 2024 Label",
    "upc": "123456789",
    "vibrantColor": "#FF5733",
    "artist": { "id": 1, "name": "Artist" },
    "artists": [{ "id": 1, "name": "Artist" }]
  },
  "tracks": [
    {
      "id": 123456,
      "title": "Track 1",
      "trackNumber": 1,
      "duration": 240,
      "audioQuality": "LOSSLESS",
      "artists": [{ "id": 1, "name": "Artist" }]
      // ... all track fields
    },
    // ... more tracks
  ]
}
```

---

### 5. ARTIST

#### getArtist(artistId)
```json
{
  "id": 1,
  "name": "Artist Name",
  "type": "ARTIST",
  "picture": "picture-id",
  "popularity": 90,
  "url": "https://tidal.com/artist/1",
  "albums": [
    {
      "id": 100,
      "title": "Album 1",
      "cover": "cover-id",
      "releaseDate": "2024-01-15",
      "numberOfTracks": 12
    },
    // ... more albums sorted by release date, most recent first
  ],
  "tracks": [
    {
      "id": 123456,
      "title": "Top Track 1",
      "duration": 240,
      "audioQuality": "LOSSLESS",
      "popularity": 95
      // ... limited to top 100 tracks
    }
  ]
}
```

---

### 6. PLAYLIST

#### getPlaylist(playlistUuid)
```json
{
  "playlist": {
    "uuid": "uuid-string",
    "title": "Playlist Name",
    "description": "Playlist description",
    "image": "cover-id",
    "squareImage": "cover-id",
    "numberOfTracks": 50,
    "numberOfVideos": 0,
    "duration": 12000,
    "creator": {
      "id": 123,
      "name": "Creator Name",
      "picture": "picture-id"
    },
    "created": "2024-01-01T00:00:00Z",
    "lastUpdated": "2024-02-15T10:30:00Z",
    "type": "USER",
    "publicPlaylist": true,
    "popularity": 60,
    "url": "https://tidal.com/playlist/uuid"
  },
  "items": [
    {
      "item": {
        "id": 123456,
        "title": "Track 1",
        "duration": 240,
        "audioQuality": "LOSSLESS",
        "artist": { "id": 1, "name": "Artist" }
        // ... all track fields
      }
    },
    // ... more tracks
  ]
}
```

---

### 7. COVER IMAGES

#### getCover(id || query)
```json
[
  {
    "id": 1,
    "name": "Front Cover",
    "1280": "https://resources.tidal.com/images/.../1280x1280.jpg",
    "640": "https://resources.tidal.com/images/.../640x640.jpg",
    "80": "https://resources.tidal.com/images/.../80x80.jpg"
  }
]
```

#### getCoverUrl(coverId, size)
```
Returns direct URL:
https://resources.tidal.com/images/{coverId-path}/{size}x{size}.jpg
```

---

### 8. STREAM INFORMATION

#### getStreamData(trackId, quality)
```json
{
  "url": "https://...stream-url-with-token...",
  "replayGain": -2.5,
  "sampleRate": 44100,
  "bitDepth": 16
}
```

#### getStreamUrl(trackId, quality)
```
Returns: "https://...stream-url-with-token..."
```

---

### 9. DASH MANIFESTS (For HiFi/Lossless)

#### getDashManifest(trackId, quality)

**Type 1: Segmented DASH (XML)**
```json
{
  "kind": "dash",
  "manifest": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><MPD><Period>...</Period></MPD>",
  "contentType": "application/dash+xml"
}
```

**Type 2: Direct FLAC URLs (JSON)**
```json
{
  "kind": "flac",
  "manifestText": "{\"urls\": [\"https://...audio.flac?token=xxx\"]}",
  "urls": ["https://...audio.flac?token=xxx"],
  "contentType": "application/json"
}
```

#### getDashManifestWithMetadata(trackId, quality)
```json
{
  "result": { /* same as getDashManifest */ },
  "trackInfo": {
    "sampleRate": 44100,
    "bitDepth": 16,
    "replayGain": -2.5
  }
}
```

---

### 10. DOWNLOAD BLOB

#### fetchTrackBlob(trackId, quality, filename)
```json
{
  "blob": Blob (audio/flac, audio/mpeg, audio/mp4, etc.),
  "mimeType": "audio/flac"
}
```

**Metadata Embedded in File:**
- Title, Artist, Album Artist
- Album name, Track number, Disc number
- Release date, ISRC code
- ReplayGain (Track & Album level)
- Embedded album cover image (JPG/PNG)

---

### 11. IMPORT FROM URL

#### importFromUrl(url)

**Track URL Returns:**
```json
{
  "type": "track",
  "data": { /* Track object */ }
}
```

**Album URL Returns:**
```json
{
  "type": "album",
  "data": { /* Album object */ }
}
```

**Artist URL Returns:**
```json
{
  "type": "artist",
  "data": { /* ArtistDetails object */ }
}
```

**Playlist URL Returns:**
```json
{
  "type": "playlist",
  "data": {
    "playlist": { /* Playlist object */ },
    "tracks": [ /* Track[] */ ]
  }
}
```

---

### 12. EXTERNAL APIS

#### Songlink API (Cross-Platform Links)
```json
{
  "entityUniqueId": "spotify_track_id",
  "userCountry": "US",
  "pageUrl": "https://song.link/...",
  "entitiesByUniqueId": {
    "spotify_track_...": { "apiProvider": "spotify", "url": "..." }
  },
  "linksByPlatform": {
    "spotify": { "country": "US", "url": "https://open.spotify.com/track/..." },
    "appleMusic": { "country": "US", "url": "https://music.apple.com/..." },
    "youtubeMusic": { "country": "US", "url": "https://music.youtube.com/..." },
    "amazonMusic": { "country": "US", "url": "https://music.amazon.com/..." }
    // ... more platforms
  }
}
```

#### Spotify Playlist Endpoint
```json
{
  "tracks": [
    {
      "spotifyId": "...",
      "title": "...",
      "artist": "...",
      "tidalId": 123456, // mapped
      "tidalTrack": { /* Track object */ }
    }
  ]
}
```

---

## Quality Levels & Audio Details

| Quality | Codec | Bitrate | Bit Depth | Sample Rate | Use Case |
|---------|-------|---------|-----------|-------------|----------|
| LOW | AAC | ~96 kbps | 16-bit | 44.1 kHz | Preview/Mobile |
| HIGH | AAC | ~320 kbps | 16-bit | 44.1 kHz | Standard Streaming |
| LOSSLESS | FLAC | ~1200 kbps | 16-bit | 44.1 kHz | HiFi |
| HI_RES_LOSSLESS | FLAC | Variable | 24-bit | 96-192 kHz | Hi-Res Audio |

---

## Error Responses

### Rate Limiting (429)
```
"Too Many Requests. Please wait a moment and try again."
```

### Not Found (404)
```
"Track/Album/Artist/Playlist not found"
```

### Quality Not Available (400)
```
"Quality not found for this track" → Falls back to lower quality
```

### Manifest Errors
```json
{
  "detail": "not found",
  "code": "DASH_MANIFEST_UNAVAILABLE"
}
```

---

## Caching Strategy

**Server-Side (Redis):**
- Track metadata: 120 seconds
- Search results: 300 seconds
- Album/Artist/Playlist: 300 seconds
- Max size per entry: 200 KB

**Browser-Side:**
- Songlink results: 30 days

---

## Regional API Endpoints (10 Load-Balanced)

All endpoints support the same API structure:
- `https://triton.squid.wtf` (squid-api)
- `https://hifi-one.spotisaver.net` (spotisaver-1)
- `https://hifi-two.spotisaver.net` (spotisaver-2)
- `https://tidal.kinoplus.online` (kinoplus)
- `https://hund.qqdl.site` (hund)
- `https://katze.qqdl.site` (katze)
- `https://maus.qqdl.site` (maus)
- `https://vogel.qqdl.site` (vogel)
- `https://wolf.qqdl.site` (wolf)
- `https://arran.monochrome.tf` (monochrome)

