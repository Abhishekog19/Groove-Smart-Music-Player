# TIDAL UI - Complete API Analysis

## Overview
The tidal-ui-main project is a web application that interfaces with music streaming APIs to provide track search, playback, and downloading capabilities. It uses a combination of external APIs, custom backend endpoints, and internal client-side API classes.

---

## 1. MAIN INTERNAL API - LosslessAPI Class (`src/lib/api.ts`)

The core of the project is the `LosslessAPI` class which provides all the functionality to interact with the TIDAL HiFi API. It's instantiated as `losslessAPI` and used throughout the application.

### Core Methods

#### **Search Operations**

1. **`searchTracks(query: string, region?: RegionOption): Promise<SearchResponse<Track>>`**
   - Searches for tracks by query string
   - Returns paginated results with: `items`, `limit`, `offset`, `totalNumberOfItems`
   - Endpoint: `/search/?s={query}`

2. **`searchArtists(query: string, region?: RegionOption): Promise<SearchResponse<Artist>>`**
   - Searches for artists by name
   - Endpoint: `/search/?a={query}`

3. **`searchAlbums(query: string, region?: RegionOption): Promise<SearchResponse<Album>>`**
   - Searches for albums
   - Endpoint: `/search/?al={query}`

4. **`searchPlaylists(query: string, region?: RegionOption): Promise<SearchResponse<Playlist>>`**
   - Searches for playlists
   - Endpoint: `/search/?p={query}`

#### **Track Information & Metadata**

5. **`getTrack(id: number, quality?: AudioQuality): Promise<TrackLookup>`**
   - Fetches track information with stream manifest and audio metadata
   - Returns: `{ track: Track, info: TrackInfo, originalTrackUrl?: string }`
   - Supports quality fallback (tries 3 times for quality degradation)
   - Endpoint: `/track/?id={id}&quality={quality}`
   - Quality options: `HI_RES_LOSSLESS`, `LOSSLESS`, `HIGH`, `LOW`

6. **`getRecommendations(trackId: number): Promise<Track[]>`**
   - Gets recommended tracks based on a track ID
   - Endpoint: `/recommendations/?id={trackId}`

7. **`getLyrics(id: number): Promise<Lyrics>`**
   - Fetches synchronized lyrics for a track
   - Returns: `{ trackId, lyricsProvider, lyrics, subtitles, isRightToLeft }`
   - Endpoint: `/lyrics/?id={id}`

8. **`getCover(id?: number, query?: string): Promise<CoverImage[]>`**
   - Gets album cover images in multiple sizes
   - Returns images with: `id`, `name`, `1280`, `640`, `80` (URLs for sizes)
   - Endpoint: `/cover/?id={id}&q={query}`

#### **Album Operations**

9. **`getAlbum(id: number): Promise<{ album: Album, tracks: Track[] }>`**
   - Fetches complete album with all tracks
   - Returns album metadata and track listing
   - Endpoint: `/album/?id={id}`

#### **Artist Operations**

10. **`getArtist(id: number): Promise<ArtistDetails>`**
    - Fetches artist overview with discography and top tracks
    - Returns: `{ Artist properties + albums: Album[], tracks: Track[] }`
    - Extracts data from nested modules (discography, top tracks)
    - Endpoint: `/artist/?f={id}` or `/artist/?id={id}`

#### **Playlist Operations**

11. **`getPlaylist(uuid: string): Promise<{ playlist: Playlist, items: Array<{ item: Track }> }>`**
    - Fetches playlist with all tracks
    - Endpoint: `/playlist/?id={uuid}`

#### **URL Import**

12. **`importFromUrl(url: string): Promise<{ type: 'track' | 'album' | 'artist' | 'playlist', data: ... }>`**
    - Parses TIDAL URLs and imports content
    - Supports: Track, Album, Artist, Playlist URLs
    - Returns appropriate data structure based on URL type

#### **Stream Information**

13. **`getSong(query: string, quality?: AudioQuality): Promise<StreamData>`**
    - Gets song with stream info
    - Endpoint: `/song/?q={query}&quality={quality}`

14. **`getStreamData(trackId: number, quality?: AudioQuality): Promise<{ url: string, replayGain: number | null, sampleRate: number | null, bitDepth: number | null }>`**
    - Gets stream URL with audio metadata (replay gain, sample rate, bit depth)
    - Handles HI_RES quality via DASH manifests
    - Falls back to LOSSLESS if HI_RES fails

15. **`getStreamUrl(trackId: number, quality?: AudioQuality): Promise<string>`**
    - Gets just the stream URL (convenience method)

16. **`getTrackStreamUrl(trackId: number, quality?: AudioQuality): Promise<string>`**
    - Gets stream URL with quality handling

#### **DASH Manifest Operations** (for HiFi streaming)

17. **`getDashManifest(trackId: number, quality?: AudioQuality): Promise<DashManifestResult>`**
    - Gets DASH/MPD manifest for segmented audio streaming
    - Returns either:
      - `{ kind: 'dash', manifest: string, contentType: string }`
      - `{ kind: 'flac', manifestText: string, urls: string[], contentType: string }`
    - Supports segmented DASH manifests

18. **`getDashManifestWithMetadata(trackId: number, quality?: AudioQuality): Promise<DashManifestWithMetadata>`**
    - Same as above but also returns: `{ sampleRate, bitDepth, replayGain }`

#### **Download Operations**

19. **`fetchTrackBlob(trackId: number, quality?: AudioQuality, filename: string, options?: DownloadTrackOptions): Promise<{ blob: Blob, mimeType?: string }>`**
    - Fetches audio as a Blob with optional metadata embedding via FFmpeg
    - Options include:
      - `onProgress`: Track download/embedding progress
      - `convertAacToMp3`: Convert AAC to MP3
      - `downloadCoverSeperately`: Download album art separately
      - Signal for abort control
    - Automatically embeds metadata: title, artist, album, lyrics, ReplayGain

20. **`downloadTrack(trackId: number, quality?: AudioQuality, filename: string, options?: DownloadTrackOptions): Promise<void>`**
    - Downloads and saves track to disk
    - Triggers browser download dialog
    - Can optionally download cover art separately

#### **Metadata Operations**

21. **`getPreferredTrackMetadata(trackId: number, quality?: AudioQuality): Promise<TrackLookup>`**
    - Gets track metadata for embedding purposes

#### **URL Helpers**

22. **`getCoverUrl(coverId: string, size?: '1280' | '640' | '320' | '160' | '80'): string`**
    - Constructs Tidal CDN URL for album covers
    - Default size: 640x640

23. **`getVideoCoverUrl(videoCoverId: string, size?: '1280' | '640' | '320' | '160' | '80'): string`**
    - Constructs Tidal CDN URL for video covers

24. **`getArtistPictureUrl(pictureId: string, size?: '750'): string`**
    - Constructs Tidal CDN URL for artist pictures

#### **Utility Methods**

25. **`formatDuration(seconds: number): string`**
    - Formats duration from seconds to MM:SS format

---

## 2. DATA TYPES & STRUCTURES (`src/lib/types.ts`)

### **Track**
```typescript
{
  id: number
  title: string
  duration: number
  replayGain?: number
  peak?: number
  allowStreaming: boolean
  streamReady: boolean
  streamStartDate?: string
  premiumStreamingOnly: boolean
  trackNumber: number
  volumeNumber: number
  version: string | null
  popularity: number
  copyright?: string
  url: string
  isrc?: string
  editable: boolean
  explicit: boolean
  audioQuality: string ('HI_RES_LOSSLESS' | 'LOSSLESS' | 'HIGH' | 'LOW')
  audioModes: string[]
  artist: Artist
  artists: Artist[]
  album: Album
  mixes?: Record<string, string>
  mediaMetadata?: { tags: string[] }
}
```

### **Album**
```typescript
{
  id: number
  title: string
  cover: string (cover image ID)
  videoCover: string | null
  releaseDate?: string
  duration?: number
  numberOfTracks?: number
  numberOfVideos?: number
  numberOfVolumes?: number
  explicit?: boolean
  popularity?: number
  type?: string
  upc?: string
  copyright?: string
  artist?: Artist
  artists?: Artist[]
  audioQuality?: string
  audioModes?: string[]
  url?: string
  vibrantColor?: string
  streamReady?: boolean
  allowStreaming?: boolean
  mediaMetadata?: { tags: string[] }
}
```

### **Artist**
```typescript
{
  id: number
  name: string
  type: string
  picture?: string (picture ID)
  url?: string
  popularity?: number
  artistTypes?: string[]
  artistRoles?: Array<{ category: string, categoryId: number }>
  mixes?: Record<string, string>
}
```

### **Playlist**
```typescript
{
  uuid: string
  title: string
  description: string
  image: string (cover image ID)
  squareImage?: string
  duration: number
  numberOfTracks: number
  numberOfVideos: number
  creator: {
    id: number
    name: string
    picture: string | null
  }
  created: string (ISO date)
  lastUpdated: string (ISO date)
  type: string
  publicPlaylist: boolean
  url: string
  popularity: number
  promotedArtists?: Artist[]
}
```

### **TrackInfo** (Stream manifest info)
```typescript
{
  trackId: number
  audioQuality: string
  audioMode: string ('STEREO' | etc)
  manifest: string (base64-encoded DASH manifest)
  manifestMimeType: string
  manifestHash?: string
  assetPresentation: string ('FULL' | 'PREVIEW')
  albumReplayGain?: number
  albumPeakAmplitude?: number
  trackReplayGain?: number
  trackPeakAmplitude?: number
  bitDepth?: number (16, 24)
  sampleRate?: number (44100, 48000, 96000, 192000)
}
```

### **Lyrics**
```typescript
{
  trackId: number
  lyricsProvider: string
  providerCommontrackId: string
  providerLyricsId: string
  lyrics: string (SRT format with timing)
  subtitles: string
  isRightToLeft: boolean
}
```

### **CoverImage**
```typescript
{
  id: number
  name: string
  '1280': string (URL)
  '640': string (URL)
  '80': string (URL)
}
```

### **SearchResponse**
```typescript
{
  limit: number
  offset: number
  totalNumberOfItems: number
  items: T[] (Track | Album | Artist | Playlist)
}
```

---

## 3. EXTERNAL BACKEND APIS

### **A. Proxy Endpoint** (`src/routes/api/proxy/+server.ts`)

**Purpose**: Routes requests through a server-side proxy with Redis caching to bypass CORS issues and rate limiting.

- **Endpoint**: `/api/proxy`
- **Cache Namespaces**:
  - Default tracks: 120 seconds
  - Search results: 300 seconds
  - Other: 300 seconds
- **Cache Size Limit**: 200KB per entry
- **Features**:
  - Redis-based caching with TTL
  - Header sanitization (removes hop-by-hop headers)
  - CORS header injection
  - Content-Type based cache decisions
  - Smart cache key generation using SHA256

### **B. Songlink API Endpoint** (`src/routes/api/songlink/+server.ts`)

**Purpose**: Cross-platform music link resolution (finds tracks on multiple services).

- **Primary Endpoint**: `https://api.song.link/v1-alpha.1/links`
- **Fallback Endpoint**: `https://tracks.monochrome.tf/api/links`
- **Query Parameters**:
  - `url`: Track/Album URL to resolve
  - `userCountry`: User's country code
  - `songIfSingle`: Return song for single tracks
  - `platform`: Specific platform filter
  - `type`: Content type
  - `id`: Track/Content ID
  - `key`: API key
- **Cache**: 30 days browser-side cache
- **Returns**: Links to the same content on: Spotify, Apple Music, YouTube Music, Amazon Music, etc.

### **C. Spotify Playlist API Endpoint** (`src/routes/api/spotify-playlist/+server.ts`)

**Purpose**: Converts Spotify playlists to Tidal format.

- **Base URL**: `https://open.spotify.com`
- **Features**:
  - Dynamic session extraction from Spotify
  - TOTP (Time-based One-Time Password) generation for authentication
  - Client version detection from HTML
  - JavaScript bundle analysis
  - Converts Spotify tracks to Tidal equivalents
- **Key Functions**:
  - `getSessionData()`: Extracts device ID and client version
  - `generateTotp()`: Creates authentication tokens
  - `getAccessToken()`: Obtains Spotify API access
  - Playlist track extraction and conversion

### **D. Artwork API Endpoint** (`src/routes/api/artwork/[type]/[id]/[size]/+server.ts`)

**Purpose**: Serves artwork from Tidal CDN with proper headers and caching.

- **Route Parameters**:
  - `type`: 'track', 'album', 'artist'
  - `id`: Content ID
  - `size`: Image size (1280, 640, 320, 160, 80)
- **Implements**: Image proxy with cache headers

---

## 4. EXTERNAL MUSIC APIS

### **A. TIDAL HiFi API Cluster**

Multiple public proxy endpoints for API load distribution:

1. **squid-api**: `https://triton.squid.wtf`
2. **spotisaver-1**: `https://hifi-one.spotisaver.net`
3. **spotisaver-2**: `https://hifi-two.spotisaver.net`
4. **kinoplus**: `https://tidal.kinoplus.online`
5. **hund**: `https://hund.qqdl.site`
6. **katze**: `https://katze.qqdl.site`
7. **maus**: `https://maus.qqdl.site`
8. **vogel**: `https://vogel.qqdl.site`
9. **wolf**: `https://wolf.qqdl.site`
10. **monochrome**: `https://arran.monochrome.tf`

Each endpoint supports the same `/search/`, `/track/`, `/album/`, `/artist/`, `/playlist/`, `/lyrics/`, `/recommendations/`, `/cover/` endpoints with load balancing via weighted random selection.

### **B. Spotify API**

- **Base URL**: `https://open.spotify.com`
- **Used for**: Playlist conversion and track data
- **Authentication**: Device ID + TOTP token + access token flow

### **C. Songlink/Song.link API**

- **Purpose**: Find tracks across music platforms
- **Supported Platforms**: Spotify, Apple Music, YouTube Music, Amazon Music, Tidal, etc.
- **Features**: Cross-platform track linking and discovery

---

## 5. DATA SOURCES & MANIFEST FORMATS

### **DASH Manifests**

The API returns audio streams in DASH (Dynamic Adaptive Streaming over HTTP) format:

**Two types supported:**

1. **Segmented DASH (MPD/XML)**
   - Contains `<SegmentTemplate>` with initialization segment and media segment templates
   - Used for HiFi lossless streams
   - Parser extracts segment URLs and constructs full file from parts

2. **Direct FLAC URLs (JSON)**
   ```json
   {
     "urls": ["https://...audio.flac?token=xxx"]
   }
   ```

**Manifest metadata includes:**
- `audioQuality`: Stream quality level
- `audioMode`: STEREO, MONO, etc.
- `bitDepth`: 16, 24-bit
- `sampleRate`: 44.1kHz, 48kHz, 96kHz, 192kHz
- `trackReplayGain`: ReplayGain tags in dB
- `albumReplayGain`: Album-level ReplayGain

---

## 6. AUDIO QUALITY LEVELS

The system supports 4 quality tiers:

| Quality | Codec | Bitrate | Use Case |
|---------|-------|---------|----------|
| `LOW` | AAC | ~96 kbps | Mobile/Preview |
| `HIGH` | AAC | ~320 kbps | Standard streaming |
| `LOSSLESS` | FLAC | ~1200 kbps | HiFi (16-bit/44.1kHz) |
| `HI_RES_LOSSLESS` | FLAC | Variable | Hi-Res Audio (24-bit/96-192kHz) |

---

## 7. METADATA EMBEDDING

When downloading tracks, the system can embed:

**Track Metadata:**
- Title, Artist, Album Artist
- Album name, Track number, Disc number
- Release date/year
- ISRC code, Copyright info

**Audio Metadata:**
- ReplayGain (Track & Album level)
- ReplayGain peak values
- Bit depth, Sample rate

**Artwork:**
- Embedded album cover image (JPG/PNG)
- Multiple size fallbacks (1280x1280, 640x640, 320x320)

**Embedding Tool:** FFmpeg WASM (runs in browser)

---

## 8. CACHING STRATEGY

| Resource | TTL | Storage |
|----------|-----|---------|
| Track info | 120 seconds | Redis (server-side) |
| Search results | 300 seconds | Redis (server-side) |
| Other API responses | 300 seconds | Redis (server-side) |
| Songlink results | 30 days | Browser cache |

---

## 9. REGIONAL API SELECTION

The system supports regional API targets (currently all point to same cluster):

```typescript
type RegionPreference = 'auto' | 'us' | 'eu'

// 'auto' includes all 10 endpoints with weighted load balancing
// Selected randomly with cumulative weight distribution
```

---

## 10. ERROR HANDLING

**Rate Limiting:**
- Status 429 triggers: `"Too Many Requests. Please wait a moment and try again."`
- Exponential backoff: 200ms × attempt number

**Quality Fallback:**
- HI_RES → LOSSLESS → HIGH → LOW (with retries)
- Dashboard manifest errors trigger fallback to alternative endpoints

**Download Errors:**
- Memory errors: Browser limitations detected
- Timeout errors: 3-minute FFmpeg processing limit
- Proxy requirement: Automatic fallback suggestion

---

## 11. AUTHENTICATION & SECURITY

- **TIDAL API**: No explicit authentication (public endpoints)
- **Spotify**: Time-based OTP token generation + device ID
- **Songlink**: No authentication required

**Security Features:**
- CORS proxy for cross-origin requests
- Header sanitization (removes sensitive headers)
- Signal-based request cancellation
- Timeout protection on downloads

---

## 12. SUMMARY TABLE OF ALL API CALLS

| Category | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| **Search** | searchTracks | `/search/?s=` | SearchResponse<Track> |
| | searchArtists | `/search/?a=` | SearchResponse<Artist> |
| | searchAlbums | `/search/?al=` | SearchResponse<Album> |
| | searchPlaylists | `/search/?p=` | SearchResponse<Playlist> |
| **Track** | getTrack | `/track/?id=&quality=` | TrackLookup |
| | getRecommendations | `/recommendations/?id=` | Track[] |
| | getLyrics | `/lyrics/?id=` | Lyrics |
| | getSong | `/song/?q=&quality=` | StreamData |
| | getStreamData | (via getTrack) | URL + Metadata |
| | getStreamUrl | (via getTrack) | string |
| **Album** | getAlbum | `/album/?id=` | {album, tracks} |
| **Artist** | getArtist | `/artist/?f=` | ArtistDetails |
| **Playlist** | getPlaylist | `/playlist/?id=` | {playlist, items} |
| **Artwork** | getCover | `/cover/?id=&q=` | CoverImage[] |
| | getCoverUrl | (local) | string (CDN URL) |
| | getVideoCoverUrl | (local) | string (CDN URL) |
| | getArtistPictureUrl | (local) | string (CDN URL) |
| **DASH** | getDashManifest | `/track/?...` | DashManifestResult |
| | getDashManifestWithMetadata | `/track/?...` | DashManifestWithMetadata |
| **Download** | fetchTrackBlob | `/track/?...` | {blob, mimeType} |
| | downloadTrack | `/track/?...` | void |
| **Import** | importFromUrl | (parsed + above) | Parsed content |
| **External** | (Songlink) | api.song.link | Cross-platform links |
| | (Spotify) | open.spotify.com | Playlist conversion |

---

## 13. KEY INSIGHTS

1. **Distributed Load Balancing**: Uses 10 different proxy endpoints for the TIDAL API with weighted random selection to prevent rate limiting

2. **HiFi Audio Support**: Full support for lossless (FLAC) and Hi-Res (up to 192kHz/24-bit) audio via DASH manifests

3. **Browser-Based Processing**: FFmpeg WASM allows metadata embedding and AAC-to-MP3 conversion entirely in the browser

4. **Cross-Platform Integration**: Can link to and import content from Spotify, Apple Music, YouTube Music, Amazon Music, and more

5. **Smart Caching**: Dual caching strategy with server-side Redis for API responses and browser cache for long-term data

6. **Segmented Streaming**: Supports both direct stream URLs and segmented DASH manifests for adaptive bitrate streaming

7. **Comprehensive Metadata**: Extracts and embeds ID3v2 tags, ReplayGain, ISRC, and artwork automatically

8. **Regional Support**: Infrastructure ready for regional API selection (currently all same, but extensible)

