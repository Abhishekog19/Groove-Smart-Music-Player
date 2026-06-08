# Music Player Architecture Analysis: tidal-ui-main vs Smusic vs tidal

## Executive Summary

This analysis examines three music player projects to identify architectural and implementation differences:

1. **tidal-ui-main** (SvelteKit) - ✅ **WORKING REFERENCE IMPLEMENTATION**
2. **Smusic** (React/Vite) - ⚠️ **PARTIALLY IMPLEMENTED, HAS CRITICAL GAPS**
3. **tidal** (Documentation) - 📚 **ORIGINAL PATTERNS & REFERENCE**

The core issue: **Smusic is an incomplete React port of tidal-ui-main** that has working backend infrastructure but relies on a complex frontend integration pattern that may fail under specific conditions.

---

## Part 1: Working Architecture - tidal-ui-main (SvelteKit)

### 1.1 Overview

**Framework**: SvelteKit with TypeScript  
**Backend**: API routes (`src/routes/api/`) + Redis caching  
**Key Innovation**: Sophisticated weighted mirror system with automatic failover

### 1.2 API Mirror System (The Secret Sauce)

#### Configuration: `src/lib/config.ts`

```typescript
// Dynamic fetch of API targets from worker endpoints
export async function fetchApiTargets() {
  const workers = [
    'https://tidal-uptime.jiffy-puffs-1j.workers.dev/',
    'https://tidal-uptime.props-76styles.workers.dev/'
  ];
  // Fetches list of streaming mirrors every 15 minutes
  // Updates V2_API_TARGETS dynamically
}

// Weighted selection system
const V2_API_TARGETS = [
  { name: 'squid-api', baseUrl: 'https://triton.squid.wtf', weight: 15, ... },
  { name: 'spotisaver-1', baseUrl: 'https://hifi-one.spotisaver.net', weight: 15, ... },
  { name: 'spotisaver-2', baseUrl: 'https://hifi-two.spotisaver.net', weight: 15, ... },
  // ... 7 more mirrors
];

// Weighted random selection
function selectApiTarget(): ApiClusterTarget {
  const targets = ensureWeightedTargets();
  const totalWeight = weighted[weighted.length - 1]?.cumulativeWeight;
  const random = Math.random() * totalWeight;
  for (const target of weighted) {
    if (random < target.cumulativeWeight) return target;
  }
}
```

**Why this matters:**
- **Dynamic updates** - Adapts to failing mirrors without code changes
- **Load distribution** - Equal weight (15 each) spreads traffic evenly
- **Automatic failover** - Next request picks different mirror if one fails
- **Region selection** - Supports `auto`, `us`, `eu` preferences

#### The Proxy Pattern: `src/lib/config.ts`

```typescript
export const API_CONFIG = {
  targets: TARGETS,           // Array of mirror endpoints
  baseUrl: TARGETS[0]?.baseUrl,
  useProxy: true,             // ALL requests go through proxy
  proxyUrl: '/api/proxy'      // Local endpoint
};

// Every request uses: buildRegionalUrl(path, region)
// 1. Resolves regional mirror
// 2. Checks if mirror requires proxy
// 3. Routes through /api/proxy if needed
```

#### The Core API Class: `src/lib/api.ts` - LosslessAPI

```typescript
class LosslessAPI {
  async searchTracks(query, region = 'auto'): Promise<SearchResponse<Track>> {
    // 1. buildRegionalUrl() - selects mirror + builds URL
    // 2. fetchWithCORS() - wraps fetch with CORS/proxy handling
    // 3. Returns parsed response with fallback handling
  }

  async getTrack(id, quality = 'HI_RES_LOSSLESS'): Promise<TrackLookup> {
    // 1. Tries requested quality
    // 2. Falls back to LOSSLESS if HI_RES fails
    // 3. Falls back to HIGH if LOSSLESS fails
    // 4. Returns { track, info, originalTrackUrl }
  }

  getDashManifest(trackId, quality): Promise<DashManifestResult> {
    // Returns DASH/MPD manifest for segmented streaming
    // Handles both DASH XML and FLAC JSON manifests
    // Critical for HiFi audio playback
  }

  async downloadTrack(trackId, quality, filename, options) {
    // Sophisticated download with:
    // - Progress tracking
    // - FFmpeg metadata embedding
    // - Album art packaging
    // - Blob-to-file conversion
  }
}
```

**Key Methods for Audio Streaming:**

| Method | Purpose | Returns |
|--------|---------|---------|
| `getTrack()` | Fetch track info + manifest | `{ track, info, originalTrackUrl }` |
| `getDashManifest()` | Get DASH/MPD manifest | DASH XML or FLAC JSON |
| `extractStreamUrlFromManifest()` | Parse manifest for URL | Direct stream URL |
| `getStreamUrl()` | Convenience: get URL directly | Stream URL string |
| `getStreamData()` | URL + metadata | `{ url, replayGain, sampleRate, bitDepth }` |

### 1.3 Proxy Endpoint: `src/routes/api/proxy/+server.ts`

```typescript
// Handles: /api/proxy?url=<target-url>

// Key features:
// 1. Redis caching with TTL strategy
//    - Search queries: 300s TTL
//    - Track metadata: 120s TTL
//    - Default: 300s TTL
//
// 2. Cache key generation:
//    const cacheKey = sha256(`${url}|accept=${accept}|range=${range}`);
//
// 3. Response sanitization:
//    - Removes hop-by-hop headers
//    - Adds CORS headers
//    - Handles Range requests for streaming
//
// 4. Transparent pass-through for uncached responses

const CACHE_NAMESPACE = 'tidal:proxy:v2:';
const DEFAULT_CACHE_TTL_SECONDS = 300;
const SEARCH_CACHE_TTL_SECONDS = 300;
const TRACK_CACHE_TTL_SECONDS = 120;

// Returns cached response if available
// Otherwise fetches from mirror and caches
```

### 1.4 Audio Player: `src/lib/components/AudioPlayer.svelte`

```svelte
<!-- HTML5 audio element with Svelte state binding -->
<audio
  bind:this={audioElement}
  src={streamUrl}
  on:play={() => isPlaying = true}
  on:pause={() => isPlaying = false}
  on:timeupdate={(e) => currentTime = e.target.currentTime}
  on:loadedmetadata={(e) => duration = e.target.duration}
/>

<!-- Flow:
  1. User clicks play
  2. AudioPlayer requests streamUrl via tidalAPI.getStreamUrl()
  3. tidalAPI.getTrack() → extracts manifest
  4. extractStreamUrlFromManifest() → parses for direct URL
  5. If TIDAL CDN URL → wraps in /api/audio-proxy for CORS
  6. Sets <audio src={url}>
  7. Browser plays via HTML5 Audio API
-->
```

### 1.5 Streaming Flow Diagram (tidal-ui-main)

```
User clicks PLAY
    ↓
AudioPlayer.loadSong(trackId)
    ↓
tidalAPI.getTrack(trackId, quality='LOSSLESS')
    ↓
LosslessAPI.buildRegionalUrl('/track/?id=X&quality=LOSSLESS', region='auto')
    ↓
selectApiTarget() → picks mirror from weighted list
    ↓
fetch(mirror_url) with fetchWithCORS wrapper
    ↓
Response includes:
  - track: {id, title, duration, ...}
  - info: {manifest: "base64-encoded-dash-xml"}
  - originalTrackUrl?: string (sometimes)
    ↓
extractStreamUrlFromManifest(manifest)
    ↓
decode base64 → parse XML/JSON → extract URL
    ↓
if (isTidalCdnUrl) {
  streamUrl = '/api/audio-proxy?url=' + cdnUrl
} else {
  streamUrl = cdnUrl  // use directly
}
    ↓
<audio src={streamUrl} /> → Browser plays
```

### 1.6 Key Strengths of tidal-ui-main

✅ **Automatic mirror selection** - No single point of failure  
✅ **Dynamic target updates** - Adapts to failing services  
✅ **Weighted load balancing** - Fair distribution across mirrors  
✅ **Quality fallback** - Graceful degradation (LOSSLESS → HIGH → LOW)  
✅ **Sophisticated manifest parsing** - Handles DASH XML, FLAC JSON, multiple formats  
✅ **Redis caching** - Reduces duplicate requests to mirrors  
✅ **CORS proxy** - Handles browser CORS restrictions automatically  
✅ **Metadata embedding** - FFmpeg integration for downloaded files  
✅ **Error recovery** - Rate limit detection, retry logic  

---

## Part 2: The React Port - Smusic (Incomplete)

### 2.1 Overview

**Framework**: React + Vite (frontend) + Express (backend)  
**Key Issue**: Port from TypeScript SvelteKit to JavaScript React  
**Status**: ~80% implemented, with critical gaps in integration

### 2.2 API Mirror System (Smusic)

#### Configuration: `src/lib/tidal/config.js`

```javascript
// **CRITICAL DIFFERENCE**: Static 10 mirrors (vs dynamic in tidal-ui-main)
const V2_API_TARGETS = [
  { name: 'squid-api', baseUrl: 'https://triton.squid.wtf', weight: 15, requiresProxy: true },
  { name: 'spotisaver-1', baseUrl: 'https://hifi-one.spotisaver.net', weight: 15, requiresProxy: true },
  // ... 8 more (same as tidal-ui-main)
];

// ❌ MISSING: Dynamic target fetching
// ❌ MISSING: fetchApiTargets() - no worker calls to update targets
// ✅ PRESENT: Weighted selection (same as tidal-ui-main)

export const API_CONFIG = {
  targets: TARGETS,
  baseUrl: TARGETS[0]?.baseUrl,
  useProxy: true,
  proxyUrl: '/api/proxy'
};
```

**Problem**: When a mirror goes down, Smusic can't update the mirror list without redeploying.

#### Backend Mirror Retry: `Smusic-backend/server/routes/tidal-download.js`

```javascript
// Backend has retry logic (NEW - not in tidal-ui-main)
async function fetchV2(path, maxAttempts = 10) {
  const tried = new Set();
  let lastError = null;

  for (let i = 0; i < maxAttempts; i++) {
    const target = selectTarget();
    if (tried.has(target.name)) {
      // Already tried this mirror, find another
      const fallback = V2_TARGETS.find(t => !tried.has(t.name));
      if (fallback) {
        const url = `${fallback.baseUrl}${path}`;
        const r = await fetch(url, {
          headers: buildHeaders(fallback),
          signal: AbortSignal.timeout(12000)
        });
        if (r.ok) return { response: r, target: fallback };
      }
    }
    tried.add(target.name);
    // Try this target...
  }
  // Fallback to: https://tidal.401658.xyz
}
```

**Note**: This retry logic is **server-side only** and **NOT used by frontend searches**.

### 2.3 Frontend API Client: `src/lib/api/client.js`

```javascript
/**
 * src/lib/api/client.js - Delegates to tidalAPI
 *
 * NOTE: All TIDAL queries route through tidalAPI (src/lib/tidal)
 * which uses 10 weighted proxy mirrors with automatic failover.
 */

import { tidalAPI } from '../tidal/index.js';

export async function searchTracks(query, limit = 50) {
  const data = await tidalAPI.searchTracks(query);
  // Returns search results
}

export async function getTrack(trackId) {
  return await tidalAPI.getTrack(trackId);
}
```

**Status**: Works but delegates to `tidalAPI`, which may have limitations.

### 2.4 Audio Player: `src/lib/audio/audioPlayer.js`

#### The Complex 3-Strategy Fallback

```javascript
async loadSong(song) {
  // Strategy 1: Folder-scanned songs
  if (song.sourceType === 'folder' && song.filePath) {
    const file = await getAudioFile(song.filePath);
    this.currentObjectUrl = URL.createObjectURL(file);
    audioUrl = this.currentObjectUrl;
  }
  
  // Strategy 2: TIDAL stream (COMPLEX)
  else if (song.sourceType === 'tidal' && song.tidalId) {
    try {
      // Try: /api/tidal-download/resolve
      const resolveRes = await fetch(
        `/api/tidal-download/resolve?title=${song.title}&artist=${song.artist}&quality=LOSSLESS`,
        { cache: 'no-store' }
      );

      let streamUrl = null;
      if (resolveRes.ok) {
        const data = await resolveRes.json();
        streamUrl = data.streamUrl;
      } else {
        // Backend resolve failed — fallback to direct tidalAPI
        const { tidalAPI } = await import('../tidal/index.js');
        
        for (const quality of ['LOSSLESS', 'HIGH', 'LOW']) {
          try {
            const lookup = await tidalAPI.getTrack(song.tidalId, quality);
            const manifest = lookup?.info?.manifest;
            
            if (manifest) {
              streamUrl = tidalAPI.extractStreamUrlFromManifest?.(manifest) || null;
              if (!streamUrl) {
                const decoded = atob(manifest.replace(/-/g, '+').replace(/_/g, '/'));
                streamUrl = JSON.parse(decoded)?.urls?.[0] ?? null;
              }
            }
            if (streamUrl) break;
          } catch { /* try next quality */ }
        }
      }

      if (!streamUrl) {
        this.onLoadError?.('Could not resolve TIDAL stream URL.');
        return false;
      }

      const isTidalCdn = /\.tidal\.com|tidal\.com\/|audio\.tidal/i.test(streamUrl);
      audioUrl = isTidalCdn
        ? `/api/audio-proxy?url=${encodeURIComponent(streamUrl)}`
        : streamUrl;
    } catch (tidalErr) {
      this.onLoadError?.('TIDAL stream failed: ' + tidalErr.message);
      return false;
    }
  }
  
  // Strategy 3: Blob uploads
  else if (song.sourceType === 'upload' || (!song.sourceType && song.id)) {
    // ...
  }
}
```

**Problems with this approach:**

1. ❌ **Assumes `/api/tidal-download/resolve` exists and is deployed**
   - If backend isn't running → fallback to tidalAPI
   - But tidalAPI fallback uses manual manifest parsing
   - Both can fail independently

2. ❌ **Manual manifest extraction on fallback**
   ```javascript
   streamUrl = tidalAPI.extractStreamUrlFromManifest?.(manifest) || null;
   if (!streamUrl) {
     try {
       const decoded = atob(manifest.replace(/-/g, '+').replace(/_/g, '/'));
       streamUrl = JSON.parse(decoded)?.urls?.[0] ?? null;
     } catch { /* ignore */ }
   }
   ```
   - Assumes manifest is JSON with `.urls` array
   - Doesn't handle DASH XML manifests
   - Doesn't handle FLAC URL extraction
   - **LIKELY TO FAIL on newer TIDAL responses**

3. ❌ **No sophisticated DASH parsing**
   - Smusic's manifest extraction is basic
   - Can't handle segmented DASH (SegmentTemplate)
   - Can't extract from FLAC manifests with BaseURL

4. ❌ **Quality loop is redundant**
   - Loops through [LOSSLESS, HIGH, LOW] manually
   - Should use tidalAPI's built-in fallback
   - Inefficient and error-prone

### 2.5 Backend Route: `Smusic-backend/server/routes/tidal-download.js`

#### The `/resolve` Endpoint

```javascript
router.get('/resolve', async (req, res) => {
  const { title, artist, isrc, quality = 'LOSSLESS' } = req.query;
  
  try {
    // Step 1: Search for track
    const track = await searchTidal({ title, artist, isrc });
    
    // Step 2: Get stream URL from track ID
    const { streamUrl, format, quality: resolvedQuality } = await getTidalStreamUrl(track.id, quality);
    
    // Step 3: Return JSON
    return res.json({
      streamUrl,
      tidalTrackId: track.id,
      title: track.title || title,
      artist: artistName,
      album: albumTitle,
      durationMs,
      format,
      quality: resolvedQuality
    });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to resolve TIDAL stream', details: err.message });
  }
});
```

#### Helper: `getTidalStreamUrl(trackId, quality)`

```javascript
async function getTidalStreamUrl(trackId, quality = 'LOSSLESS') {
  const qualityMap = { LOSSLESS: 'LOSSLESS', HI_RES: 'HI_RES_LOSSLESS', HIGH: 'HIGH', LOW: 'LOW' };
  const tidalQuality = qualityMap[quality] || 'LOSSLESS';
  
  const path = `/track/?id=${trackId}&quality=${tidalQuality}`;
  const { response, target } = await fetchV2(path);
  const data = await response.json();
  
  // ❌ CRITICAL: Uses extractFromManifest (backend version)
  const streamUrl = extractStreamUrl(data);
  
  if (!streamUrl) {
    throw new Error(`No stream URL found in ${target.name} response for track ${trackId}`);
  }
  
  const format = tidalQuality.includes('LOSSLESS') ? 'flac' : 'm4a';
  return { streamUrl, format, quality: tidalQuality };
}
```

#### Helper: `extractStreamUrl(data)` (BACKEND VERSION)

```javascript
function extractStreamUrl(data) {
  const container = data?.data ?? data;
  
  if (Array.isArray(container)) {
    for (const entry of container) {
      if (entry?.manifest) return extractFromManifest(entry.manifest);
      if (entry?.url) return entry.url;
      if (entry?.urls?.[0]) return entry.urls[0];
    }
    return null;
  }
  
  if (container?.url) return container.url;
  if (container?.urls?.[0]) return container.urls[0];
  if (container?.manifest) return extractFromManifest(container.manifest);
  
  return null;
}

function extractFromManifest(manifest) {
  const decoded = decodeManifest(manifest);
  
  // Try JSON first
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed.urls) && parsed.urls.length > 0) return parsed.urls[0];
  } catch { /* not JSON */ }
  
  // Try XML BaseURL
  const baseUrlMatch = decoded.match(/<BaseURL[^>]*>([^<]+)<\/BaseURL>/i);
  if (baseUrlMatch?.[1]) {
    const url = baseUrlMatch[1].trim();
    if (url.startsWith('http')) return url;
  }
  
  // Regex URL extraction
  const urlRegex = /https?:\/\/[\w\-.~:?#[\]@!$&'()*+,;=%/]+/g;
  let match;
  while ((match = urlRegex.exec(decoded)) !== null) {
    const url = match[0];
    if (url.includes('$Number$')) continue;
    if (/\/\d+\.mp4/.test(url)) continue;
    if (url.includes('.flac') || url.includes('.mp4') || url.includes('.m4a') ||
      url.includes('token=') || url.includes('/audio/')) {
      return url;
    }
  }
  return null;
}
```

**Status**: Better than frontend extraction, but still simplified vs tidal-ui-main.

### 2.6 Streaming Flow Diagram (Smusic)

```
User clicks PLAY
    ↓
AudioPlayer.loadSong(trackId)
    ↓
fetch('/api/tidal-download/resolve?title=X&artist=Y&quality=LOSSLESS')
    ↓
IF backend is running AND reachable:
    ├→ Backend searchTidal() via fetchV2 with retry
    ├→ Backend getTidalStreamUrl() → extract from mirror
    └→ Return streamUrl to frontend
ELSE:
    └→ Fall back to tidalAPI.getTrack() in browser
            ├→ selectApiTarget() → picks mirror
            ├→ fetch(mirror) → returns manifest
            └→ extractStreamUrlFromManifest() → parse
                    ├→ Try JSON.parse → .urls[0]
                    └→ Fallback to regex extraction (FRAGILE)
    ↓
if (isTidalCdnUrl) {
  streamUrl = '/api/audio-proxy?url=' + cdnUrl
} else {
  streamUrl = cdnUrl
}
    ↓
new Howl({ src: [streamUrl] }) → Browser plays via Howler.js
```

### 2.7 Critical Gaps in Smusic

| Issue | Impact | Severity |
|-------|--------|----------|
| ❌ No dynamic target fetching | Can't adapt when mirrors fail | **HIGH** |
| ❌ Backend resolution not guaranteed | Fall back is fragile | **HIGH** |
| ❌ Basic manifest parsing | Fails on newer DASH formats | **MEDIUM** |
| ❌ No segmented DASH support | Can't handle HiFi DASH streams | **MEDIUM** |
| ❌ Manual quality fallback | Inefficient, duplicates tidalAPI logic | **LOW** |
| ❌ No sophisticated error recovery | Generic error messages | **MEDIUM** |
| ⚠️ Howler.js dependency | Different from tidal-ui-main's HTML5 Audio | **LOW** |

---

## Part 3: Original Patterns - tidal (Documentation)

### 3.1 API Documentation

The `tidal` folder contains:
- **API_ANALYSIS.md** - Complete API method reference
- **API_QUICK_REFERENCE.md** - Data structures and responses
- **API_USAGE_EXAMPLES.md** - Example API calls
- **LYRICS_IMPLEMENTATION_GUIDE.md** - Lyrics integration pattern

### 3.2 Key Insights from Documentation

#### Search Response Structure
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
      "artist": { "id": 1, "name": "Artist Name" },
      "album": { "id": 100, "title": "Album Name", "cover": "cover-id" },
      "isrc": "USRC12345678"
    }
  ]
}
```

#### Track Response Structure (getTrack)
```json
{
  "track": {
    "id": 123456,
    "title": "Song Name",
    "duration": 240,
    "audioQuality": "LOSSLESS",
    "streamReady": true,
    "allowStreaming": true,
    "artist": { "id": 1, "name": "Artist" },
    "album": { "id": 100, "title": "Album", "cover": "cover-id" }
  },
  "info": {
    "trackId": 123456,
    "audioQuality": "LOSSLESS",
    "manifest": "base64-encoded-dash-xml-or-json",
    "manifestMimeType": "application/dash+xml",
    "bitDepth": 16,
    "sampleRate": 44100,
    "trackReplayGain": -2.5,
    "assetPresentation": "FULL"
  },
  "originalTrackUrl": "https://...stream-url..."
}
```

**Note**: `originalTrackUrl` is sometimes present but unreliable. The manifest is the primary source.

### 3.3 Manifest Formats

TIDAL returns manifests in three formats:

1. **JSON with URLs**
   ```json
   {
     "urls": ["https://audio-cdnXX.tidal.com/xxxxxxx.flac?token=..."]
   }
   ```

2. **DASH XML (segmented)**
   ```xml
   <MPD>
     <Period>
       <AdaptationSet>
         <Representation>
           <BaseURL>https://audio-cdnXX.tidal.com/xxxxxxx.mp4</BaseURL>
           <SegmentTemplate media="$Number$.mp4" />
         </Representation>
       </AdaptationSet>
     </Period>
   </MPD>
   ```

3. **FLAC URL Wrapped in XML**
   ```xml
   <MPD>
     <Period>
       <AdaptationSet>
         <Representation>
           <BaseURL>https://audio-cdnXX.tidal.com/xxxxxxx.flac?token=...</BaseURL>
         </Representation>
       </AdaptationSet>
     </Period>
   </MPD>
   ```

---

## Part 4: Comparative Analysis

### 4.1 Feature Comparison Table

| Feature | tidal-ui-main | Smusic | tidal |
|---------|---|---|---|
| **Frontend Framework** | SvelteKit | React | N/A |
| **Dynamic API targets** | ✅ Yes (fetched from workers) | ❌ No (static list) | 📚 Reference |
| **Weighted mirror selection** | ✅ Yes (15 each) | ✅ Yes (15 each) | 📚 Reference |
| **Quality fallback** | ✅ Automatic (via LosslessAPI) | ⚠️ Manual in player | 📚 Reference |
| **DASH manifest parsing** | ✅ Comprehensive (XML, JSON, FLAC) | ⚠️ Basic (JSON + regex) | 📚 Reference |
| **Segmented DASH support** | ✅ Yes (SegmentTemplate detection) | ❌ No | 📚 Reference |
| **Redis caching** | ✅ Yes (proxy-level) | ✅ Yes (but not used by frontend) | ❌ No |
| **CORS proxy** | ✅ Yes (/api/proxy) | ✅ Yes (frontend + backend) | ❌ No |
| **Audio player** | ✅ HTML5 (native) | ✅ Howler.js | N/A |
| **Metadata embedding** | ✅ FFmpeg WASM | ⚠️ Available but limited | N/A |
| **Error recovery** | ✅ Rate limit detection | ⚠️ Generic errors | 📚 Reference |
| **Download support** | ✅ Full (blob → file) | ✅ Backend route exists | N/A |
| **Backend integration** | ✅ SvelteKit routes | ✅ Express routes | N/A |

### 4.2 Streaming Flow Comparison

#### tidal-ui-main (Direct & Simple)
```
Frontend: tidalAPI.getTrack()
    ↓
Mirror API call
    ↓
Parse manifest → extract URL
    ↓
Play via <audio src>
```

**Advantage**: Single code path, sophisticated parsing  
**Disadvantage**: Browser makes direct API calls (may be slow)

#### Smusic (Dual Path & Complex)
```
Frontend: fetch('/api/tidal-download/resolve')
    ↓
Branch 1 (Backend success):
  Backend: fetchV2() → getTidalStreamUrl()
    ↓
  Return streamUrl
    
Branch 2 (Backend fail):
  Frontend: tidalAPI.getTrack()
    ↓
  Manual manifest parsing
    ↓
  Return streamUrl
    ↓
Play via Howler.js
```

**Advantage**: Backend retry logic; reduces browser API calls  
**Disadvantage**: Two code paths with different parsing logic; fallback is fragile

### 4.3 Why Smusic May Fail

#### Scenario 1: Backend Not Deployed
If `/api/tidal-download/resolve` returns 404 or times out:
1. Frontend catches error
2. Falls back to `tidalAPI.getTrack()` in browser
3. Manual manifest extraction runs:
   ```javascript
   streamUrl = tidalAPI.extractStreamUrlFromManifest?.(manifest) || null;
   if (!streamUrl) {
     const decoded = atob(manifest.replace(/-/g, '+').replace(/_/g, '/'));
     streamUrl = JSON.parse(decoded)?.urls?.[0] ?? null;  // ❌ Fails on XML/DASH
   }
   ```
4. If manifest is DASH XML → `JSON.parse()` throws → caught and ignored
5. Regex extraction may fail on newer formats
6. Stream URL is null → **Song won't play**

#### Scenario 2: Mirror Has Different Response Format
If a mirror returns DASH XML manifest with SegmentTemplate:
1. Backend's `extractFromManifest()` tries to parse
2. Finds BaseURL via regex (works)
3. But returns URL to segmented stream
4. Browser tries to play segmented DASH → **Audio player can't handle it**

#### Scenario 3: Rate Limiting
If all 10 mirrors are rate-limited (429 errors):
1. Backend will retry with `AbortSignal.timeout(12000)`
2. Eventually gives up
3. Frontend falls back to browser fetch
4. Same mirrors are rate-limited → **Guaranteed failure**

### 4.4 Why tidal-ui-main Doesn't Fail

1. ✅ **Dynamic targets** - Removes dead mirrors
2. ✅ **Sophisticated parsing** - Handles all manifest formats
3. ✅ **Segmented DASH** - Detects and handles properly
4. ✅ **Single code path** - Consistent behavior
5. ✅ **Quality fallback** - Built into LosslessAPI
6. ✅ **Rate limit detection** - Throws error vs silent fail

---

## Part 5: Architectural Recommendations

### 5.1 If You Want tidal-ui-main Behavior (Recommended)

**Use tidal-ui-main directly** - It's the proven implementation.

Or, if you need React:
1. Port only the `LosslessAPI` class logic
2. Keep the dynamic target fetching
3. Implement sophisticated manifest parsing
4. Avoid dual-path resolution logic

### 5.2 If You Want to Fix Smusic

**Option A: Simplify to Single Path**
```javascript
// Remove backend resolve endpoint
// Have frontend always use tidalAPI.getTrack()
// Wrap tidalAPI calls in error boundaries

async loadSong(song) {
  if (song.sourceType === 'tidal') {
    try {
      for (const quality of ['HI_RES_LOSSLESS', 'LOSSLESS', 'HIGH', 'LOW']) {
        try {
          const lookup = await tidalAPI.getTrack(song.tidalId, quality);
          const streamUrl = tidalAPI.extractStreamUrlFromManifest(lookup.info.manifest);
          if (streamUrl) {
            audioUrl = wrapTidalUrl(streamUrl);
            break;
          }
        } catch (e) {
          console.warn(`Quality ${quality} failed:`, e);
        }
      }
    } catch (err) {
      this.onLoadError?.('All quality levels failed');
    }
  }
}
```

**Option B: Keep Dual Path but Fix Fallback**
1. Enhance frontend manifest parsing to match tidal-ui-main's
2. Copy `extractStreamUrlFromManifest()` implementation
3. Remove manual JSON.parse fallback
4. Test with various mirror response formats

**Option C: Mirror tidal-ui-main (Best)**
1. Copy the entire `src/lib/api.ts` logic (LosslessAPI)
2. Wrap it in React hooks instead of Svelte stores
3. Use same manifest parsing, quality fallback, error handling
4. Implement dynamic target fetching

### 5.3 Key Implementation Points

**Must Have:**
- ✅ Weighted mirror selection with fallback
- ✅ Sophisticated manifest parsing (JSON, XML DASH, FLAC variants)
- ✅ Quality degradation (HI_RES → LOSSLESS → HIGH → LOW)
- ✅ DASH segmented stream detection
- ✅ Rate limit detection (HTTP 429)

**Should Have:**
- ✅ Dynamic target updates (every 15 min)
- ✅ Redis caching for API responses
- ✅ Progress tracking for downloads
- ✅ Metadata embedding via FFmpeg

**Nice to Have:**
- ✅ Lyrics synchronization
- ✅ Album art extraction
- ✅ Format detection and conversion

---

## Part 6: Summary Table - What's Different

### Core Mechanism Differences

| Aspect | tidal-ui-main | Smusic | Why Different |
|--------|---|---|---|
| **API targets** | Dynamic (fetched) | Static (hardcoded) | Smusic didn't implement worker polling |
| **Resolution path** | Direct fetch | Backend → fallback | Smusic tries to offload to backend |
| **Manifest parsing** | Comprehensive class methods | Split: backend/frontend | Different implementation approach |
| **Quality fallback** | Built into API class | Manual loop in player | Smusic reimplemented vs reusing |
| **DASH support** | Full (segmented detection) | Partial (no segmentation) | Smusic simplified for MVP |
| **Error handling** | Structured (known codes) | Generic (catch-all) | Smusic less mature |
| **Caching** | Redis at proxy layer | Redis available but frontend doesn't use | Backend exists, frontend doesn't leverage |

### Critical Failures

**In tidal-ui-main**: Almost impossible. Multiple fallback layers.

**In Smusic**: Likely if:
- Backend not deployed → fallback manifest parsing fails
- All mirrors return DASH XML → frontend can't parse
- Rate limiting occurs → both paths fail equally

---

## Conclusion

**tidal-ui-main** is the production-ready, well-architected reference implementation with sophisticated error recovery and multiple fallback mechanisms.

**Smusic** is an incomplete React port that works in the happy path but has fragile fallback logic. It would fail on:
1. Backend downtime
2. Newer TIDAL response formats
3. Rate limiting across all mirrors

**Recommendation**: Use tidal-ui-main as reference or directly. If you must use Smusic, significantly enhance its error handling and manifest parsing to match tidal-ui-main's robustness.
