# Smusic Implementation Plan: Making It Work Like tidal-ui-main

## Executive Summary

Your Smusic player stopped working because it relies on **hardcoded proxy mirrors that are now dead**. The new `tidal-ui-main` repository implements a **dynamic, self-healing architecture** with:

1. ✅ Dynamic API mirror fetching (updates every 15 minutes)
2. ✅ Sophisticated manifest parsing (DASH XML + JSON)
3. ✅ Quality fallback chains (HI_RES → LOSSLESS → HIGH → LOW)
4. ✅ Proper error handling with mirror rotation
5. ✅ Complete metadata + lyrics + download support

This plan shows you how to implement these features in Smusic's React/JavaScript architecture.

---

## Current State vs. Target State

| Feature | Current (Broken) | Target (Working) | Priority |
|---------|---|---|---|
| **API Mirrors** | Static hardcoded (dead) | Dynamic fetched | 🔴 P1 |
| **Manifest Parsing** | Basic JSON only | Advanced DASH + JSON | 🔴 P1 |
| **Quality Fallback** | Single quality | Full chain | 🟡 P2 |
| **Lyrics Support** | Exists but broken | Fully functional | 🟡 P2 |
| **Metadata Extraction** | Partial | Complete with cover art | 🟡 P2 |
| **Download Feature** | Basic | Full with metadata embedding | 🟡 P2 |
| **Error Recovery** | Fails on first error | Automatic mirror rotation | 🔴 P1 |

---

## Implementation Steps

### PHASE 1: Core API Infrastructure (Priority 1)

#### Step 1.1: Create Dynamic API Target Fetcher
**File**: `src/lib/apiMirrors.js`

Replace the hardcoded mirror list with a dynamic fetcher that:
- Fetches fresh API endpoints every 15 minutes
- Tests endpoints for availability
- Rotates on failure automatically
- Caches results for performance

**Key Functions**:
```javascript
// Fetch latest API mirrors from a reliable source
async function fetchApiMirrors() {
  // Option 1: From tidal-ui-main's worker endpoints
  // Option 2: From a community-maintained mirror list
  // Option 3: Self-hosted mirror discovery service
}

// Select best API target for region + quality
function selectApiTarget(region, quality) {
  // Implements weighted selection
  // Prioritizes working mirrors
  // Falls back gracefully
}

// Test if a mirror is still alive
async function testMirrorHealth(mirrorUrl) {
  // Quick health check
  // Cache result for 15 mins
}
```

**Reference**: `tidal-ui-main/src/lib/config.ts` lines 1-150

---

#### Step 1.2: Implement Intelligent Manifest Parser
**File**: `src/lib/manifestParser.js`

Create a unified parser that handles:

**DASH Manifests (XML)**:
```xml
<MPD>
  <Period>
    <AdaptationSet>
      <Representation codecs="flac">
        <SegmentTemplate media="$Number$.m4s" initialization="init.mp4" />
        <BaseURL>https://some-cdn.com/</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
```

**JSON Manifests**:
```json
{
  "urls": ["https://direct-stream.com/track.flac"],
  "manifest": "base64-encoded-manifest"
}
```

**Key Functions**:
```javascript
// Parse any manifest type and return playable URLs
async function parseManifest(manifestPayload, contentType) {
  // 1. Detect manifest type (DASH XML or JSON)
  // 2. If DASH: extract BaseURL + SegmentTemplate
  // 3. If segmented: build segment URLs
  // 4. If direct URL: return immediately
  // 5. Handle errors gracefully
  return { 
    type: 'dash' | 'direct', 
    urls: [], 
    quality: 'HI_RES' | 'LOSSLESS',
    isSegmented: boolean
  };
}

// Detect if manifest uses DASH segmentation
function isSegmentedDashManifest(xmlString) {
  return /<SegmentTemplate/i.test(xmlString);
}

// Parse FLAC URL from DASH manifest
function parseFlacUrlFromMpd(xmlString) {
  // Uses DOMParser to extract <BaseURL> from DASH
  // Filters for valid FLAC URLs
  // Scores URLs by quality indicators
}
```

**Reference**: `tidal-ui-main/src/lib/api.ts` lines 300-500

---

#### Step 1.3: Fix the Tidal Service Layer
**File**: `src/lib/tidal/api.js` (UPDATE)

Current problems:
- ❌ Hardcoded API base URL pointing to dead mirror
- ❌ No fallback mechanism
- ❌ Basic error handling

Changes needed:
```javascript
// OLD (broken):
const TIDAL_API_BASE = 'https://api.tidal.com'; // DEAD

// NEW (working):
class TidalAPI {
  constructor() {
    this.apiTarget = null;
    this.apiTargets = [];
    this.currentTargetIndex = 0;
  }

  async initialize() {
    this.apiTargets = await fetchApiMirrors();
    this.apiTarget = this.apiTargets[0];
  }

  async fetch(path, options = {}) {
    let lastError;
    
    for (let attempt = 0; attempt < this.apiTargets.length; attempt++) {
      try {
        const url = `${this.apiTarget}${path}`;
        const response = await fetchWithCORS(url, options);
        
        if (response.status === 429) {
          // Rate limited - rotate to next mirror
          this.rotateTarget();
          continue;
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        return response;
      } catch (error) {
        lastError = error;
        this.rotateTarget(); // Try next mirror
      }
    }
    
    throw lastError;
  }

  rotateTarget() {
    this.currentTargetIndex = 
      (this.currentTargetIndex + 1) % this.apiTargets.length;
    this.apiTarget = this.apiTargets[this.currentTargetIndex];
  }
}
```

**Reference**: `tidal-ui-main/src/lib/api.ts` lines 1-100

---

### PHASE 2: Metadata & Lyrics (Priority 2)

#### Step 2.1: Enhance Metadata Extraction
**File**: `src/lib/metadata.js` (NEW)

```javascript
export async function extractTrackMetadata(trackId) {
  const manifest = await tidalAPI.getTrackInfo(trackId);
  
  return {
    trackId,
    title: manifest.title,
    artists: manifest.artists,
    album: {
      title: manifest.album?.title,
      cover: {
        original: `https://resources.tidal.com/images/${manifest.album?.cover}/1280x1280.jpg`,
        small: `https://resources.tidal.com/images/${manifest.album?.cover}/240x240.jpg`,
      },
      releaseDate: manifest.album?.releaseDate,
    },
    duration: manifest.duration,
    explicit: manifest.explicit,
    audioQuality: {
      current: manifest.audioQuality,
      available: ['HI_RES_LOSSLESS', 'LOSSLESS', 'HIGH', 'LOW'],
    },
    bitDepth: manifest.bitDepth,
    sampleRate: manifest.sampleRate,
    codec: manifest.audioMode,
  };
}
```

---

#### Step 2.2: Fix Lyrics Integration
**File**: `src/lib/tidal/lyrics.js` (UPDATE)

Current issue:
```javascript
// OLD - Uses dead API directly
async getLyrics(id) {
  const response = await this.fetch(`${this.baseUrl}/lyrics/?id=${id}`);
  if (!response.ok) throw new Error("Failed to get lyrics");
  return response.json();
}
```

Solution:
```javascript
// NEW - Routes through dynamic API mirror system
async getLyrics(trackId) {
  // Try all available mirrors with fallback
  for (const mirror of this.apiTargets) {
    try {
      const url = `${mirror}/lyrics/?id=${trackId}`;
      const response = await fetchWithCORS(url);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn(`Lyrics fetch failed on mirror: ${error.message}`);
      continue;
    }
  }
  
  // Fallback: return no lyrics
  return { 
    lyrics: [],
    synced: false,
    error: 'Lyrics not available'
  };
}
```

---

### PHASE 3: Downloads with Metadata (Priority 2)

#### Step 3.1: Enhance Download Handler
**File**: `src/lib/downloads.js` (UPDATE/CREATE)

Current issues:
- ❌ No metadata embedding
- ❌ No quality detection
- ❌ Single quality only

New implementation:
```javascript
export async function downloadTrack(trackId, options = {}) {
  const {
    quality = 'LOSSLESS',
    embedMetadata = true,
    includeCovers = false,
    onProgress = null,
    retryCount = 3,
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      // Get metadata
      const metadata = await extractTrackMetadata(trackId);
      
      // Get manifest and parse to playable URL
      const manifest = await tidalAPI.getDashManifest(trackId, quality);
      const { urls, isSegmented } = await parseManifest(
        manifest.manifestPayload,
        manifest.contentType
      );

      // Download audio
      let audioBlob;
      if (isSegmented) {
        audioBlob = await downloadSegmentedDash(urls, onProgress);
      } else {
        audioBlob = await downloadDirectUrl(urls[0], onProgress);
      }

      // Embed metadata if needed
      if (embedMetadata && quality === 'LOSSLESS') {
        audioBlob = await embedFlacMetadata(audioBlob, metadata);
      }

      // Generate filename with metadata
      const filename = `${metadata.artists[0].name} - ${metadata.title}.flac`;
      
      // Trigger download
      triggerBrowserDownload(audioBlob, filename);
      
      return { success: true, filename };
    } catch (error) {
      lastError = error;
      console.warn(`Download attempt ${attempt} failed:`, error);
      
      if (attempt < retryCount) {
        // Try lower quality on retry
        options.quality = downgradeQuality(options.quality);
        await delay(1000 * attempt);
      }
    }
  }
  
  throw lastError;
}

function downgradeQuality(current) {
  const chain = ['HI_RES_LOSSLESS', 'LOSSLESS', 'HIGH', 'LOW'];
  const index = chain.indexOf(current);
  return index < chain.length - 1 ? chain[index + 1] : 'LOW';
}
```

---

## File Structure After Implementation

```
src/
├── lib/
│   ├── apiMirrors.js              ← NEW: Dynamic mirror fetcher
│   ├── manifestParser.js           ← NEW: Advanced manifest parsing
│   ├── metadata.js                 ← NEW: Metadata extraction
│   ├── downloads.js                ← UPDATED: Better downloads
│   └── tidal/
│       ├── api.js                  ← UPDATED: Use dynamic mirrors
│       ├── lyrics.js               ← UPDATED: Better error handling
│       └── index.js                ← UPDATED: Initialize mirrors
├── hooks/
│   ├── useLyrics.js                ← Already exists (may need fixes)
│   ├── useDownload.js              ← UPDATED: Better progress
│   └── useSearch.js                ← May need mirror routing
└── pages/
    └── Player.jsx                  ← Already integrated
```

---

## Testing Checklist

### Unit Tests

```javascript
// Test 1: Can fetch and parse mirrors
test('fetchApiMirrors returns valid endpoints', async () => {
  const mirrors = await fetchApiMirrors();
  expect(mirrors.length).toBeGreaterThan(0);
  expect(mirrors[0]).toMatch(/^https:\/\//);
});

// Test 2: DASH manifest parsing
test('parseManifest handles DASH XML', async () => {
  const dashXml = '<MPD>...</MPD>';
  const result = await parseManifest(dashXml, 'application/dash+xml');
  expect(result.type).toBe('dash');
  expect(result.urls.length).toBeGreaterThan(0);
});

// Test 3: Quality fallback
test('downgradeQuality reduces quality tier', () => {
  expect(downgradeQuality('HI_RES_LOSSLESS')).toBe('LOSSLESS');
  expect(downgradeQuality('LOSSLESS')).toBe('HIGH');
});

// Test 4: Mirror rotation on failure
test('API rotates mirror on 429 status', async () => {
  // Mock a mirror that returns 429
  // Verify it switches to next mirror
});
```

### Integration Tests

```javascript
// Test: Full playback flow
test('Can search, load, and play track', async () => {
  const results = await tidalAPI.searchTracks('Never Gonna Give You Up');
  const track = results.items[0];
  
  const manifest = await tidalAPI.getDashManifest(track.id);
  expect(manifest).toBeDefined();
  
  const { urls } = await parseManifest(manifest.payload);
  expect(urls.length).toBeGreaterThan(0);
});

// Test: Lyrics loading
test('Can fetch lyrics with fallback', async () => {
  const lyrics = await tidalAPI.getLyrics(123456);
  expect(lyrics).toBeDefined();
  // Should not throw even if lyrics unavailable
});

// Test: Download with quality fallback
test('Download retries with lower quality on failure', async () => {
  await downloadTrack(123456, { quality: 'HI_RES_LOSSLESS' });
  // Should degrade to LOSSLESS if HI_RES not available
});
```

---

## Implementation Timeline

| Phase | Tasks | Est. Time | Complexity |
|-------|-------|-----------|-----------|
| **Phase 1** | API mirrors + manifest parser | 4-6 hours | High |
| **Phase 2** | Metadata + lyrics fixes | 2-3 hours | Medium |
| **Phase 3** | Enhanced downloads | 2-3 hours | Medium |
| **Testing** | Unit + integration tests | 3-4 hours | Medium |
| **Debugging** | Edge cases + fixes | 2-3 hours | Variable |
| **Total** | | **13-19 hours** | — |

---

## Key Differences from Old Approach

### OLD (Broken)
```
Browser Request
  → Hardcoded Mirror #1 (DEAD) 
  → Hardcoded Mirror #2 (DEAD)
  → Hardcoded Mirror #3 (DEAD)
  → ERROR ❌
```

### NEW (Working)
```
Browser Request
  → Fetch Fresh Mirrors (15 min cache)
  → Select Best Available Mirror
  → Send Request
  ↓ (if 429 rate limit)
  → Rotate to Next Mirror (automatic)
  ↓ (if manifest is DASH XML)
  → Parse SegmentTemplate
  ↓
  → Download Segments (automatic)
  ↓ (if high quality unavailable)
  → Downgrade Quality & Retry
  → Success ✅
```

---

## Critical Success Factors

1. **Mirror discovery must be automated** - No more hardcoding URLs
2. **Manifest parsing must be intelligent** - Handle both DASH XML and JSON
3. **Error handling must be robust** - Automatic fallbacks at every level
4. **Quality degradation must be transparent** - User gets something playable
5. **Rate limiting must be handled** - Rotate mirrors on 429 errors

---

## Next Steps

1. **Start with Phase 1.1**: Implement `apiMirrors.js`
2. **Then Phase 1.2**: Implement `manifestParser.js`  
3. **Then Phase 1.3**: Update `src/lib/tidal/api.js` to use both
4. **Test**: Verify basic search and playback works
5. **Phase 2 & 3**: Add metadata, lyrics, downloads
6. **Final testing**: Full integration test suite

Would you like me to implement Phase 1 right now?
