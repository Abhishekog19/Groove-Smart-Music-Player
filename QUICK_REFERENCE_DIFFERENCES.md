# Quick Reference: tidal-ui-main vs Smusic Implementation Differences

## 1. API Mirror Selection

### tidal-ui-main (SvelteKit)
```typescript
// Dynamic fetching - adapts to failing mirrors
async function fetchApiTargets() {
  // Every 15 minutes, fetches from:
  // - https://tidal-uptime.jiffy-puffs-1j.workers.dev/
  // - https://tidal-uptime.props-76styles.workers.dev/
  // Updates V2_API_TARGETS with latest working mirrors
}

// In production, targets change without code deploy
```

### Smusic (React)
```javascript
// Static hardcoded list - can't adapt
const V2_API_TARGETS = [
  { name: 'squid-api', baseUrl: 'https://triton.squid.wtf', weight: 15 },
  // ... 9 more hardcoded mirrors
];

// If a mirror goes down, stuck with static list until redeploy
// ❌ This is the #1 failure point
```

---

## 2. Stream URL Resolution

### tidal-ui-main (Direct & Clean)
```typescript
// User clicks play
const streamUrl = await tidalAPI.getStreamUrl(trackId, 'LOSSLESS');

// Inside getStreamUrl():
// 1. buildRegionalUrl() - picks mirror
// 2. fetchWithCORS() - wraps fetch with proxy routing
// 3. extractStreamUrlFromManifest() - sophisticated parsing
// Returns: https://audio-cdnXX.tidal.com/xxx.flac?token=...
```

**Key methods in LosslessAPI:**
- `getStreamUrl()` - Simple stream URL
- `getStreamData()` - URL + metadata
- `getDashManifest()` - Full DASH manifest
- `extractStreamUrlFromManifest()` - Handles: JSON, DASH XML, FLAC URLs

### Smusic (Backend → Fallback)
```javascript
// User clicks play
const response = await fetch('/api/tidal-download/resolve?title=X&artist=Y');

if (response.ok) {
  // Backend worked - use its result
  streamUrl = response.json().streamUrl;
} else {
  // Backend failed - fallback to tidalAPI
  const lookup = await tidalAPI.getTrack(trackId, 'LOSSLESS');
  streamUrl = tidalAPI.extractStreamUrlFromManifest(lookup.info.manifest);
  
  // ❌ PROBLEM: Manual extraction here
  if (!streamUrl) {
    const decoded = atob(manifest.replace(/-/g, '+').replace(/_/g, '/'));
    streamUrl = JSON.parse(decoded)?.urls?.[0]; // ❌ Fails on XML manifests
  }
}
```

**Problems:**
- ❌ Two different parsing implementations (backend vs frontend)
- ❌ Backend extraction doesn't handle DASH XML with SegmentTemplate
- ❌ Frontend fallback only tries JSON.parse, doesn't have full parsing

---

## 3. Manifest Parsing - The Critical Difference

### tidal-ui-main (Comprehensive)

```typescript
extractStreamUrlFromManifest(manifest: string): string | null {
  const decoded = this.decodeBase64Manifest(manifest);
  
  // Try 1: JSON with .urls array
  try {
    const parsed = JSON.parse(decoded);
    if (parsed?.urls?.[0]) return parsed.urls[0];
  } catch { /* not JSON */ }
  
  // Try 2: Detect segmented DASH (don't extract URLs from these)
  if (this.isSegmentedDashManifest(decoded)) {
    // Return null - let higher layer handle segmented streaming
    return null;
  }
  
  // Try 3: FLAC URL from DASH XML BaseURL
  const mpdUrl = this.parseFlacUrlFromMpd(decoded);
  if (mpdUrl) return mpdUrl;
  
  // Try 4: Regex extraction with validation
  const urlRegex = /https?:\/\/[\w\-.~:?#[\]@!$&'()*+,;=%/]+/g;
  let match;
  while ((match = urlRegex.exec(decoded)) !== null) {
    const url = match[0];
    if (url.includes('$Number$')) continue;  // Skip segment templates
    if (/\/\d+\.mp4/.test(url)) continue;    // Skip segment files
    if (this.isValidMediaUrl(url)) return url;
  }
  
  return null;
}

// DASH detection method
isSegmentedDashManifest(decoded: string): boolean {
  return /<SegmentTemplate/i.test(decoded);
}

// FLAC extraction method  
private parseFlacUrlFromMpd(mpdContent: string): string | null {
  // Sophisticated parsing that finds BaseURL in DASH XML
  // Returns direct FLAC URL when available
}

// Media URL validation
private isValidMediaUrl(url: string): boolean {
  // Checks if URL points to actual audio (not placeholder)
}
```

### Smusic (Frontend Fallback - Simplified)

```javascript
// In audioPlayer.js fallback (when backend fails)
streamUrl = tidalAPI.extractStreamUrlFromManifest?.(manifest) || null;

if (!streamUrl) {
  // Manual fallback - doesn't match tidalAPI's implementation
  const decoded = atob(manifest.replace(/-/g, '+').replace(/_/g, '/'));
  streamUrl = JSON.parse(decoded)?.urls?.[0] ?? null;
  // ❌ STOPS HERE - doesn't try XML/regex extraction
}
```

### Smusic (Backend Extraction - Different)

```javascript
// In tidal-download.js backend
function extractFromManifest(manifest) {
  const decoded = decodeManifest(manifest);
  
  // Try JSON
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed.urls) && parsed.urls.length > 0) 
      return parsed.urls[0];
  } catch { /* not JSON */ }
  
  // Try XML BaseURL
  const baseUrlMatch = decoded.match(/<BaseURL[^>]*>([^<]+)<\/BaseURL>/i);
  if (baseUrlMatch?.[1]) {
    const url = baseUrlMatch[1].trim();
    if (url.startsWith('http')) return url;
  }
  
  // Regex extraction (basic)
  const urlRegex = /https?:\/\/[\w\-.~:?#[\]@!$&'()*+,;=%/]+/g;
  let match;
  while ((match = urlRegex.exec(decoded)) !== null) {
    const url = match[0];
    if (url.includes('$Number$')) continue;
    if (/\/\d+\.mp4/.test(url)) continue;
    if (url.includes('.flac') || url.includes('.mp4') || 
        url.includes('.m4a') || url.includes('token=') || 
        url.includes('/audio/')) {
      return url;
    }
  }
  return null;
}
```

**Comparison:**
- Backend extraction: JSON, XML, Regex (decent)
- Frontend fallback: Only JSON (FAILS on DASH XML)
- tidal-ui-main: JSON, Segmented detection, XML parsing, Regex with validation

**Result:** If backend returns DASH XML → Smusic frontend fallback fails silently

---

## 4. Quality Fallback Strategy

### tidal-ui-main (Automatic)
```typescript
async getTrack(id: number, quality?: AudioQuality): Promise<TrackLookup> {
  // Tries quality in this order: HI_RES → LOSSLESS → HIGH → LOW
  for (const fallbackQuality of [quality, 'LOSSLESS', 'HIGH', 'LOW']) {
    try {
      const response = await this.fetchWithCORS(
        this.buildRegionalUrl(`/track/?id=${id}&quality=${fallbackQuality}`)
      );
      // Parse and return
    } catch (error) {
      // Try next quality
      if (isRateLimited(error)) throw error;
    }
  }
}

// Single code path - client doesn't need to handle fallback
```

### Smusic (Manual in Player)
```javascript
// In audioPlayer.js
for (const quality of ['LOSSLESS', 'HIGH', 'LOW']) {
  try {
    const lookup = await tidalAPI.getTrack(song.tidalId, quality);
    const manifest = lookup?.info?.manifest;
    
    if (manifest) {
      streamUrl = tidalAPI.extractStreamUrlFromManifest?.(manifest);
      if (!streamUrl) {
        // Manual parsing
        const decoded = atob(manifest.replace(/-/g, '+').replace(/_/g, '/'));
        streamUrl = JSON.parse(decoded)?.urls?.[0];
      }
    }
    if (streamUrl) break;
  } catch { /* try next quality */ }
}

// Problems:
// ❌ Duplicates tidalAPI's internal fallback logic
// ❌ Manual extraction doesn't match tidalAPI.extractStreamUrlFromManifest()
// ❌ Inefficient - two fallback mechanisms
```

---

## 5. Proxy Endpoint Architecture

### tidal-ui-main
```
Browser request
    ↓
Frontend detects: is this a proxy-requiring mirror?
    ↓
Yes → Route through /api/proxy?url=<target>
No → Direct fetch
    ↓
Proxy endpoint (/api/proxy):
  1. Check Redis cache
  2. If miss, fetch from actual mirror
  3. Cache response (TTL varies)
  4. Return to browser
```

### Smusic
```
Browser request (API)
    ↓
Route through /api/proxy (frontend makes this decision)
    ↓
Proxy endpoint handles: JSON/metadata

Browser request (Audio)
    ↓
Route through /api/audio-proxy (if TIDAL CDN URL)
    ↓
Audio proxy endpoint handles: audio streaming with Range support

Server request (Search/resolve)
    ↓
Backend route /api/tidal-download/resolve
    ↓
Uses fetchV2() with automatic retry across mirrors
```

**Difference:** tidal-ui-main has single unified proxy with smart routing. Smusic has split: API proxy vs audio proxy vs backend routes.

---

## 6. Error Handling

### tidal-ui-main
```typescript
// Rate limit detection
private ensureNotRateLimited(response: Response): void {
  if (response.status === 429) {
    throw new Error(RATE_LIMIT_ERROR_MESSAGE);
    // Caller knows to back off
  }
}

// Manifest unavailable error with special code
private createDashUnavailableError(message: string): Error {
  const error = new Error(message);
  error.code = DASH_MANIFEST_UNAVAILABLE_CODE;
  return error;
  // Caller can distinguish this error type
}

// Region-based fallback
private resolveRegionalBase(region = 'auto'): string {
  try {
    const target = selectApiTargetForRegion(region);
    return target.baseUrl;
  } catch (error) {
    console.warn('Falling back to default API base URL', { region, error });
    return this.baseUrl; // Has default fallback
  }
}
```

### Smusic
```javascript
// Generic error handling
try {
  const resolveRes = await fetch('/api/tidal-download/resolve?...');
  if (resolveRes.ok) {
    // Use response
  } else {
    // Not ok - fall back, but no distinction
  }
} catch (err) {
  this.onLoadError?.('TIDAL stream failed: ' + err.message);
  // All errors treated same way
}
```

---

## 7. DASH Segmented Streaming Support

### tidal-ui-main (HAS IT)
```typescript
isSegmentedDashManifest(decoded: string): boolean {
  return /<SegmentTemplate/i.test(decoded);
}

// Detects when manifest contains SegmentTemplate
// Returns null instead of trying to extract single URL
// Lets higher layers handle segmented playback
```

### Smusic (MISSING)
```javascript
// No segmented DASH detection
// If manifest has SegmentTemplate:
// - Backend extracts BaseURL
// - Frontend tries to play BaseURL (without segments)
// - Audio playback FAILS or plays incorrect audio
```

**Impact:** When TIDAL returns HiFi streams with segmented DASH, Smusic may fail or play wrong format.

---

## 8. Summary: Why Each Works or Fails

### tidal-ui-main Succeeds Because:
✅ Dynamic mirrors - can adapt when mirrors fail  
✅ Single code path - LosslessAPI handles everything  
✅ Sophisticated parsing - handles all manifest formats  
✅ Segmented DASH detection - knows what it can't handle  
✅ Quality fallback built-in - automatic degradation  
✅ Error codes - distinguishes between error types  
✅ Rate limit detection - knows when to back off  

### Smusic Fails Because:
❌ Static mirrors - stuck with hardcoded list  
❌ Dual code paths - backend ≠ frontend logic  
❌ Split manifest parsing - different implementations  
❌ No segmented detection - tries to play unsupported format  
❌ Manual fallback loop - inefficient and error-prone  
❌ Generic errors - can't distinguish failure types  
❌ Backend dependency - fallback only works if backend is available  

---

## 9. Specific Failure Scenarios in Smusic

### Scenario A: Backend Offline
```
User clicks Play
  ↓
fetch('/api/tidal-download/resolve')
  ↓
Network error / timeout
  ↓
Fallback to tidalAPI.getTrack()
  ↓
tidalAPI.extractStreamUrlFromManifest(manifest)
  ↓
If manifest is DASH XML:
  - Frontend fallback tries JSON.parse(decoded)
  - Throws error (not JSON)
  - streamUrl stays null
  - **PLAY FAILS**
```

### Scenario B: Mirror Returns DASH XML with SegmentTemplate
```
Backend fetch successful
  ↓
getTidalStreamUrl() extracts from manifest
  ↓
extractFromManifest() finds BaseURL
  ↓
Returns: https://audio-cdnXX.tidal.com/xxx.mp4 (segmented)
  ↓
Frontend passes URL to Howler.js
  ↓
Howler tries to play segmented DASH
  ↓
**AUDIO FAILS or PLAYS INCORRECTLY**
```

### Scenario C: Rate Limiting
```
All 10 mirrors hit rate limit (429)
  ↓
Backend retry loop exhausts attempts
  ↓
fetch('/api/tidal-download/resolve') returns 502
  ↓
Fallback to tidalAPI.getTrack()
  ↓
tidalAPI picks same mirrors (all rate-limited)
  ↓
**GUARANTEED FAILURE**
```

---

## 10. Remediation Priority

### To Make Smusic Work Better:

**Priority 1 (CRITICAL):**
- Implement dynamic API target fetching
- Copy tidal-ui-main's `fetchApiTargets()` logic

**Priority 2 (HIGH):**
- Fix frontend manifest parsing to match backend
- Add DASH segmented detection
- OR: Remove fallback, make backend mandatory

**Priority 3 (MEDIUM):**
- Copy tidal-ui-main's quality fallback into API class
- Add error code detection (rate limits, manifest errors)
- Improve error messages

**Priority 4 (LOW):**
- Add Redis caching at frontend level
- Implement metadata extraction
- Add lyrics support

---

## 11. Code Location Reference

### tidal-ui-main Files
- `src/lib/api.ts` - LosslessAPI (150+ KB) - Core logic
- `src/lib/config.ts` - Mirror config + dynamic fetching
- `src/routes/api/proxy/+server.ts` - Proxy endpoint
- `src/lib/components/AudioPlayer.svelte` - Audio playback

### Smusic Files
- `src/lib/tidal/api.js` - LosslessAPI (minified)
- `src/lib/tidal/config.js` - Mirror config (static)
- `src/lib/audio/audioPlayer.js` - Howler.js player (complex)
- `Smusic-backend/server/routes/tidal-download.js` - Backend routes
- `Smusic-backend/server/routes/proxy.js` - Proxy endpoint
- `Smusic-backend/server/routes/audio-proxy.js` - Audio proxy

### tidal Docs
- `API_ANALYSIS.md` - Complete API reference
- `API_QUICK_REFERENCE.md` - Data structures
- `API_USAGE_EXAMPLES.md` - Example responses
