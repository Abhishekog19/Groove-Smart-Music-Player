# Smusic Fixes: Complete Technical Guide

## Table of Contents
1. [What's Broken](#whats-broken)
2. [Why It's Broken](#why-its-broken)
3. [How tidal-ui-main Fixes It](#how-tidal-ui-main-fixes-it)
4. [Technical Mechanisms](#technical-mechanisms)
5. [Implementation Strategy](#implementation-strategy)

---

## What's Broken

### Problem 1: Dead Hardcoded API Mirrors
**Location**: `src/lib/tidal/api.js` lines 1-50

**Current Code**:
```javascript
const TIDAL_API_BASE = 'https://api.tidal.com';  // DEAD
const API_MIRRORS = [
  'https://listen.tidal.com',
  'https://api.tidal.401658.xyz',
  // ... more dead mirrors
];
```

**Why It Fails**:
- These mirrors were maintained by enthusiasts who have since taken them down
- The mirrors that still exist rotate their URLs frequently
- No automatic detection when a mirror goes down
- No fallback system to discover new mirrors

**Impact**: 
- Every API call fails immediately with network error
- User gets "Failed to load" message
- No playback, no search, no lyrics

---

### Problem 2: Broken Manifest Parsing
**Location**: `src/lib/tidal/api.js` line 1150+ (`getTrackStreamUrl`)

**Current Code**:
```javascript
async getTrackStreamUrl(trackId, quality) {
  const response = await this.fetch(`${this.baseUrl}/dash/?id=${trackId}`);
  if (!response.ok) throw new Error("Failed to fetch manifest");
  
  const data = await response.json();
  
  // PROBLEM: Assumes manifest is always JSON with direct URLs
  // WRONG: Many manifests are DASH XML with SegmentTemplate
  return data?.urls?.[0] || data?.url;
}
```

**Why It Fails**:

The manifest returned from the API comes in TWO formats:

**Format A: Direct URL (JSON)**
```json
{
  "urls": ["https://cdn.example.com/track.flac"],
  "manifest": "base64-encoded-data"
}
```
✅ Works with current code

**Format B: DASH Manifest (XML, Base64 encoded)**
```json
{
  "manifest": "PG1wZD48QWRhcHRhdGlvblNldD4...",  // Base64 XML
  "manifestMimeType": "application/dash+xml"
}
```

When you base64 decode it:
```xml
<MPD>
  <Period>
    <AdaptationSet>
      <Representation codecs="flac">
        <SegmentTemplate 
          media="segment-$Number$.m4s" 
          initialization="init.mp4"
          startNumber="1"
        />
        <BaseURL>https://cdn.example.com/segments/</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
```

❌ Current code tries to parse this as JSON, fails

**What Happens**:
1. `JSON.parse(dashXmlString)` throws error
2. Code crashes or returns null
3. Player tries to play undefined URL
4. Howler.js fails silently

---

### Problem 3: No Quality Fallback System
**Location**: `src/lib/tidal/api.js` line 1140

**Current Code**:
```javascript
async getTrackStreamUrl(trackId, quality = 'LOSSLESS') {
  // Requests EXACTLY this quality
  // If not available: ERROR
  // No retry with lower quality
}
```

**Why It Fails**:

Some tracks don't have HI_RES_LOSSLESS quality available. Instead of:
- ✅ Falling back to LOSSLESS
- ✅ Then falling back to HIGH
- ✅ Then falling back to LOW

Current code:
- ❌ Throws error
- ❌ User gets nothing

Quality chain should be:
```
HI_RES_LOSSLESS (24-bit/192kHz)
    ↓ (if not available)
LOSSLESS (16-bit/44.1kHz FLAC)
    ↓ (if not available)
HIGH (320kbps AAC/MP4)
    ↓ (if not available)
LOW (96kbps AAC/MP4)
```

---

### Problem 4: No Mirror Rotation on Rate Limit
**Location**: `src/lib/tidal/api.js` line 1150

**Current Code**:
```javascript
async fetch(path) {
  const response = await fetch(`${this.baseUrl}${path}`);
  
  if (response.status === 429) {  // Rate limited
    throw new Error('Too Many Requests');
    // STOPS HERE - No retry with different mirror
  }
  
  return response;
}
```

**Why It Fails**:

When you hit rate limit (429 status):
- The API is telling you: "Try a different server"
- Current code: Throws error immediately
- tidal-ui-main: Rotates to next mirror and retries

If user or script makes 1000 requests, and you have 10 mirrors:
- ❌ Current: Fails after 100 requests total (1 mirror exhausted)
- ✅ tidal-ui-main: Works for 1000 requests (10 mirrors × 100 each)

---

### Problem 5: Broken Lyrics Implementation
**Location**: `src/lib/tidal/api.js` line 1142

**Current Code**:
```javascript
async getLyrics(id) {
  const response = await this.fetch(`${this.baseUrl}/lyrics/?id=${id}`);
  if (!response.ok) throw new Error("Failed to get lyrics");
  return response.json();
}
```

**Why It Fails**:
- Uses `this.baseUrl` which points to dead mirror
- No mirror fallback
- No graceful error handling (component receives error, not empty lyrics)
- No retry logic

---

## Why It's Broken

### Root Cause: Static vs Dynamic

**Static Approach (Current - Broken)**:
```
Deployment → Hardcode URLs → Deploy to production → URLs die → No code changes possible → STUCK
```

**Dynamic Approach (tidal-ui-main - Working)**:
```
Deployment → Fetch URLs at runtime → URLs die → Fetch new URLs → Auto-recovery → ALWAYS WORKS
```

### The Key Insight

tidal-ui-main doesn't hardcode ANY URLs. Instead:

1. **On startup**: Fetch list of working mirrors from a **worker service**
2. **Cache it**: Keep in memory for 15 minutes
3. **On request**: Use first mirror
4. **On failure**: Automatically try next mirror
5. **On success**: Update cache timestamp

---

## How tidal-ui-main Fixes It

### Fix 1: Dynamic Mirror Discovery

**What it does** (`src/lib/config.ts` lines 20-50):

```typescript
// Hardcoded STARTING point (fallback only)
let V2_API_TARGETS: ApiClusterTarget[] = [
  {
    name: 'squid-api',
    baseUrl: 'https://triton.squid.wtf',
    weight: 15,
    category: 'auto-only'
  }
];

let lastTargetFetch = 0;

export async function fetchApiTargets() {
  // Only fetch if cache expired (every 15 minutes)
  if (Date.now() - lastTargetFetch < 15 * 60 * 1000) {
    return;  // Use cached list
  }

  // Pick random worker that maintains mirror list
  const workers = [
    'https://tidal-uptime.jiffy-puffs-1j.workers.dev/',
    'https://tidal-uptime.props-76styles.workers.dev/'
  ];
  const worker = workers[Math.floor(Math.random() * workers.length)];

  try {
    // Fetch fresh list of working mirrors
    const response = await fetch(worker);
    const data = await response.json();
    
    // Example response:
    // {
    //   "streaming": [
    //     { "url": "https://new-mirror-1.example.com" },
    //     { "url": "https://new-mirror-2.example.com" },
    //     ...
    //   ]
    // }

    if (data?.streaming && Array.isArray(data.streaming)) {
      // Update the list with fresh URLs
      V2_API_TARGETS = data.streaming.map((t, i) => ({
        name: `worker-streaming-${i}`,
        baseUrl: t.url,
        weight: 15,
        category: 'auto-only'
      }));
      
      lastTargetFetch = Date.now();
      API_CONFIG.baseUrl = V2_API_TARGETS[0].baseUrl;
    }
  } catch (error) {
    console.error('Failed to fetch targets, using fallback');
    // If worker down, use hardcoded squid-api as fallback
  }
}
```

**How to Use It**:
```javascript
// In your API initialization:
await fetchApiTargets();

// Now V2_API_TARGETS contains fresh mirrors
// Updated automatically every 15 minutes
```

---

### Fix 2: Weighted Target Selection

**What it does** (`src/lib/config.ts` lines 80-120):

Implements **weighted random selection** so you don't just use mirror #1:

```typescript
interface WeightedTarget extends ApiClusterTarget {
  cumulativeWeight: number;
}

function buildWeightedTargets(targets) {
  const withWeights = targets
    .filter(t => t.baseUrl && t.weight > 0)
    .map(t => ({
      ...t,
      cumulativeWeight: t.weight
    }));

  // Build cumulative weights
  // Example: weights [15, 15, 10] become [15, 30, 40]
  for (let i = 1; i < withWeights.length; i++) {
    withWeights[i].cumulativeWeight += withWeights[i - 1].cumulativeWeight;
  }

  return withWeights;
}

function selectRandomTarget(targets) {
  const weighted = buildWeightedTargets(targets);
  const totalWeight = weighted[weighted.length - 1].cumulativeWeight;
  const random = Math.random() * totalWeight;
  
  // Find which bucket it falls into
  for (const target of weighted) {
    if (random <= target.cumulativeWeight) {
      return target;
    }
  }
  
  return weighted[0];  // Fallback
}
```

**Why weights matter**:
- Different mirrors have different reliability
- You can give more weight to reliable ones
- Still tries all mirrors eventually
- Spreads load across multiple endpoints

---

### Fix 3: Intelligent Manifest Parsing

**What it does** (`src/lib/api.ts` lines 350-450):

Handles BOTH manifest types seamlessly:

```javascript
function parseManifest(manifest, contentType) {
  // Step 1: Decode base64 if needed
  const decoded = decodeBase64Manifest(manifest);
  
  // Step 2: Detect what we have
  
  // Is it DASH XML?
  if (isDashManifestPayload(decoded, contentType)) {
    return parseDashManifest(decoded);
  }
  
  // Is it JSON with direct URLs?
  try {
    const json = JSON.parse(decoded);
    if (json.urls && Array.isArray(json.urls)) {
      return {
        type: 'direct',
        urls: json.urls,
        isSegmented: false
      };
    }
  } catch (e) {
    // Not JSON, continue
  }
  
  // Give up
  throw new Error('Unknown manifest format');
}

// For DASH manifests specifically:
function parseDashManifest(xmlString) {
  // Check if it uses segmentation
  if (/<SegmentTemplate/i.test(xmlString)) {
    // Parse segment template
    const template = parseMpdSegmentTemplate(xmlString);
    return {
      type: 'dash',
      isSegmented: true,
      template: template
    };
  }
  
  // Look for direct FLAC URL in BaseURL
  const baseUrl = extractBaseUrl(xmlString);
  if (baseUrl) {
    return {
      type: 'dash',
      isSegmented: false,
      urls: [baseUrl]
    };
  }
  
  throw new Error('DASH manifest has no playable URL');
}

function parseMpdSegmentTemplate(xmlString) {
  // Parse the SegmentTemplate XML element
  // Example:
  // <SegmentTemplate 
  //   media="segment-$Number$.m4s"
  //   initialization="init.mp4"
  //   startNumber="1"
  // />
  
  const mediaMatch = /media="([^"]+)"/.exec(xmlString);
  const initMatch = /initialization="([^"]+)"/.exec(xmlString);
  const startMatch = /startNumber="(\d+)"/.exec(xmlString);
  
  const baseUrl = extractBaseUrl(xmlString);
  
  return {
    mediaTemplate: mediaMatch?.[1],
    initialization: initMatch?.[1],
    startNumber: parseInt(startMatch?.[1] || '1'),
    baseUrl: baseUrl
  };
}

function extractBaseUrl(xmlString) {
  // Find <BaseURL>https://cdn.example.com/</BaseURL>
  const match = /<BaseURL[^>]*>([^<]+)<\/BaseURL>/i.exec(xmlString);
  return match?.[1];
}

function decodeBase64Manifest(manifest) {
  if (typeof manifest !== 'string') return '';
  
  try {
    // Handle URL-safe base64 (- and _ instead of + and /)
    const normalized = manifest
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      // Add padding if needed
      .padEnd(manifest.length + (4 - manifest.length % 4) % 4, '=');
    
    return atob(normalized);
  } catch (e) {
    return manifest;  // Return as-is if decode fails
  }
}
```

**Real Example**:

Manifest received from API:
```json
{
  "manifest": "PG1wZD48QWRhcHRhdGlvblNldD4KICAgIDxSZXByZXNlbnRhdGlvbiBjb2RlY3M9ImZsYWMiPgogICAgICAgIDxTZWdtZW50VGVtcGxhdGUgbWVkaWE9InNlZ21lbnQtJE51bWJlciQubTRzIiBpbml0aWFsaXphdGlvbj0iaW5pdC5tcDQiIHN0YXJ0TnVtYmVyPSIxIiAvPgogICAgICAgIDxCYXNlVVJMPmh0dHBzOi8vY2RuLnRpZGFsLmNvbS9zZWdtZW50cy88L0Jhc2VVUkw+CiAgICA8L1JlcHJlc2VudGF0aW9uPgogIDwvQWRhcHRhdGlvblNldD4KPC9NUEQh",
  "manifestMimeType": "application/dash+xml"
}
```

Processing:
1. Base64 decode: `PG1wZD4...` → `<MPD><AdaptationSet>...`
2. Detect DASH: Find `<SegmentTemplate` → Yes, it's DASH
3. Extract: `media="segment-$Number$.m4s"`, `baseUrl="https://cdn.tidal.com/segments/"`
4. Determine: Segmented format, need to download multiple segments
5. Return structure:
   ```javascript
   {
     type: 'dash',
     isSegmented: true,
     template: {
       mediaTemplate: 'segment-$Number$.m4s',
       initialization: 'init.mp4',
       startNumber: 1,
       baseUrl: 'https://cdn.tidal.com/segments/'
     }
   }
   ```

---

### Fix 4: Automatic Quality Fallback

**What it does** (`src/lib/api.ts` lines 600-700):

```typescript
async getTrack(trackId, quality = 'LOSSLESS') {
  // Try to get exact quality
  // If fails, retry with lower quality
  
  const qualityChain = [
    'HI_RES_LOSSLESS',
    'LOSSLESS',
    'HIGH',
    'LOW'
  ];
  
  // Start from requested quality
  const startIndex = qualityChain.indexOf(quality);
  const chainToTry = qualityChain.slice(startIndex);
  
  let lastError;
  
  for (const tryQuality of chainToTry) {
    try {
      const url = `${this.baseUrl}/track/?id=${trackId}&quality=${tryQuality}`;
      const response = await fetch(url);
      
      if (response.status === 429) {
        // Rate limited - rotate mirror
        this.rotateTarget();
        continue;
      }
      
      if (!response.ok) {
        // Quality not available, try next
        lastError = new Error(`Quality ${tryQuality} not available`);
        continue;
      }
      
      // Success
      const data = await response.json();
      return {
        ...data,
        actualQuality: tryQuality  // Track what we got
      };
    } catch (error) {
      lastError = error;
    }
  }
  
  // All qualities exhausted
  throw lastError || new Error('No playable quality available');
}
```

**Key Points**:
- Don't ask for HI_RES, fail
- Ask for HI_RES → if fails, try LOSSLESS → if fails, try HIGH → etc.
- User gets something playable instead of nothing
- UI can show what quality was actually delivered

---

### Fix 5: Mirror Rotation on Failure

**What it does** (`src/lib/api.ts` lines 200-250):

```typescript
class LosslessAPI {
  constructor() {
    this.baseUrl = API_CONFIG.baseUrl;
    this.targetIndex = 0;
    this.targets = API_CONFIG.targets;
  }

  rotateTarget() {
    this.targetIndex = (this.targetIndex + 1) % this.targets.length;
    this.baseUrl = this.targets[this.targetIndex].baseUrl;
    console.log(`Rotated to mirror: ${this.baseUrl}`);
  }

  async fetch(url, options = {}) {
    const maxRetries = this.targets.length;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const fullUrl = `${this.baseUrl}${url}`;
        const response = await fetch(fullUrl, options);
        
        // Success
        if (response.ok) {
          return response;
        }
        
        // Rate limited
        if (response.status === 429) {
          console.warn(`Rate limited on ${this.baseUrl}, rotating...`);
          this.rotateTarget();
          continue;
        }
        
        // Other error
        if (response.status >= 500) {
          console.warn(`Server error on ${this.baseUrl}, rotating...`);
          this.rotateTarget();
          continue;
        }
        
        // Client error or unknown - return as-is
        return response;
      } catch (error) {
        console.error(`Network error on ${this.baseUrl}:`, error);
        this.rotateTarget();
        
        if (attempt === maxRetries - 1) {
          throw error;
        }
      }
    }
    
    throw new Error('All mirrors exhausted');
  }
}
```

**What This Achieves**:

```
Request to /search/
  ├─ Try Mirror 1 → 429 Rate Limit
  │  └─ Rotate to Mirror 2
  ├─ Try Mirror 2 → 500 Server Error
  │  └─ Rotate to Mirror 3
  ├─ Try Mirror 3 → 200 OK ✅
  │  └─ Return response
```

Without rotation: Fails at Mirror 1
With rotation: Succeeds at Mirror 3

---

### Fix 6: Graceful Lyrics Fallback

**What it does** (`src/lib/api.ts` lines 1150-1180):

```typescript
async getLyrics(trackId) {
  try {
    // Try to fetch lyrics
    const response = await this.fetch(`/lyrics/?id=${trackId}`);
    
    if (response.ok) {
      return await response.json();
    }
    
    // If not found, return empty lyrics (not error)
    return {
      lines: [],
      synced: false,
      available: false
    };
  } catch (error) {
    console.warn('Failed to fetch lyrics:', error);
    
    // Return empty lyrics instead of throwing
    return {
      lines: [],
      synced: false,
      available: false,
      error: 'Lyrics temporarily unavailable'
    };
  }
}
```

**UI can then do**:
```jsx
if (!lyrics.available) {
  return <div>Lyrics not available</div>;
}
return <LyricsDisplay lines={lyrics.lines} />;
```

Instead of:
```jsx
// Current broken approach
try {
  const lyrics = await getLyrics();
  return <LyricsDisplay lines={lyrics} />;
} catch (error) {
  return <div>Error: {error.message}</div>;
}
```

---

## Technical Mechanisms

### Mechanism 1: Base64 Manifest Decoding

**Why needed**:
API sends manifests as base64 to compress them (XML is large)

**What you need to know**:

```javascript
// Input:
const base64Manifest = "PG1wZD4...";  // Looks like gibberish

// Decode to see what's inside:
const decoded = atob(base64Manifest);
console.log(decoded);
// Output:
// <MPD>
//   <AdaptationSet>
//     <Representation codecs="flac">
//       <BaseURL>https://cdn.tidal.com/track.flac</BaseURL>
//     </Representation>
//   </AdaptationSet>
// </MPD>
```

**Common Issue**: URL-safe base64
```javascript
// Standard base64: uses + and /
// URL-safe base64: uses - and _

// So before decoding:
const normalized = manifest
  .replace(/-/g, '+')  // Convert - to +
  .replace(/_/g, '/') // Convert _ to /
  .padEnd(/* add = padding */, '=');

const decoded = atob(normalized);
```

---

### Mechanism 2: DASH SegmentTemplate Parsing

**Why needed**:
Some streams don't give you a direct URL. Instead they give you:
- Base URL: `https://cdn.tidal.com/segments/`
- Template: `segment-$Number$.m4s`
- Count: 100 segments

You need to manually construct URLs and download them:

```
https://cdn.tidal.com/segments/init.mp4    (initialization)
https://cdn.tidal.com/segments/segment-1.m4s
https://cdn.tidal.com/segments/segment-2.m4s
https://cdn.tidal.com/segments/segment-3.m4s
... (100 segments total)
```

Then concatenate them into one FLAC file.

**DASH Manifest XML structure**:
```xml
<MPD>
  <Period>
    <AdaptationSet>
      <Representation codecs="flac">
        <!-- CRITICAL: This tells us how to build URLs -->
        <SegmentTemplate 
          media="segment-$Number$.m4s"     <!-- URL template -->
          initialization="init.mp4"         <!-- First file to download -->
          startNumber="1"                    <!-- Segment numbering starts at 1 -->
        />
        <SegmentTimeline>
          <!-- Optional: Exact segment durations for seeking -->
          <S d="32000" r="99" />  <!-- First segment 32000ms, then repeat 99 times -->
        </SegmentTimeline>
        <BaseURL>https://cdn.tidal.com/segments/</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
```

**What you extract**:
1. `BaseURL`: `https://cdn.tidal.com/segments/`
2. `media` template: `segment-$Number$.m4s`
3. `initialization`: `init.mp4`
4. `startNumber`: `1`
5. `SegmentTimeline`: Duration info

**How to build segment URLs**:
```javascript
const baseUrl = 'https://cdn.tidal.com/segments/';
const template = 'segment-$Number$.m4s';
const startNumber = 1;

// Build segment 1 URL:
const url1 = baseUrl + template.replace('$Number$', '1');
// Result: https://cdn.tidal.com/segments/segment-1.m4s

// Build segment 2 URL:
const url2 = baseUrl + template.replace('$Number$', '2');
// Result: https://cdn.tidal.com/segments/segment-2.m4s
```

---

### Mechanism 3: Weighted Random Selection

**Why needed**:
Distribute load across mirrors instead of always using #1

**Algorithm**:

Say you have 3 mirrors with weights [15, 15, 10]:

```
Step 1: Build cumulative weights
Mirror 1: weight 15 → cumulative 15
Mirror 2: weight 15 → cumulative 15+15=30
Mirror 3: weight 10 → cumulative 30+10=40

Step 2: Generate random number 0-40
random = Math.random() * 40;

Step 3: Find which bucket it falls into
if (random <= 15) → Select Mirror 1  (66% × 15/30 = 37.5% chance)
if (random <= 30) → Select Mirror 2  (66% × 15/30 = 37.5% chance)
if (random <= 40) → Select Mirror 3  (33% × 10/30 = 25% chance)
```

**Result**: 
- Mirror 1: ~37.5% of requests
- Mirror 2: ~37.5% of requests
- Mirror 3: ~25% of requests

Mirrors get load balanced, but some can be more preferred.

---

### Mechanism 4: Retry Logic with Exponential Backoff

**Why needed**:
If a mirror is temporarily slow/overloaded, wait before retrying

**Algorithm**:

```javascript
async function getTrackWithRetry(trackId, maxAttempts = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await api.getTrack(trackId);
    } catch (error) {
      lastError = error;
      
      if (attempt < maxAttempts) {
        // Wait before retry: 1s, 2s, 4s
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        console.log(`Attempt ${attempt} failed, waiting ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}
```

**Timing**:
- Attempt 1 fails → Wait 1 second
- Attempt 2 fails → Wait 2 seconds
- Attempt 3 fails → Throw error

Why backoff? Gives the server time to recover instead of hammering it.

---

### Mechanism 5: Response Validation

**Why needed**:
Sometimes API returns 200 OK but with invalid data

```javascript
async function validateResponse(response) {
  if (!response.ok) {
    return false;
  }
  
  try {
    const data = await response.json();
    
    // Check for actual errors in response body
    if (data.detail === 'Not found') {
      return false;
    }
    
    if (data.status === 'error') {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}
```

**Example of misleading 200 OK**:
```json
{
  "status": 200,
  "detail": "Quality not found"
}
```

Looks successful (HTTP 200) but tells you quality unavailable. Your code needs to check the body.

---

## Implementation Strategy

### Step-by-Step Approach

#### Phase 1: Foundations (No Playback Changes)

**Goal**: Get API working, nothing else

1. **Create `src/lib/apiMirrors.js`**
   - Copy `fetchApiTargets()` logic from tidal-ui-main
   - Export a `getMirrors()` function
   - Implement 15-minute cache
   - Add fallback to hardcoded squid-api

2. **Create `src/lib/manifestParser.js`**
   - Implement `decodeBase64Manifest()`
   - Implement `detectManifestType()` (DASH vs JSON)
   - Implement `parseDashManifest()`
   - Implement `parseJsonManifest()`
   - Implement `parseSegmentTemplate()`

3. **Update `src/lib/tidal/api.js`**
   - Import mirrors from apiMirrors
   - Import parser functions from manifestParser
   - Add `rotateTarget()` method
   - Modify `fetch()` to use mirror rotation
   - Update all methods to retry on 429

**Test these**:
- Can search for tracks (uses `fetch()`)
- Manifest parsing works for both formats
- Mirror rotation happens on 429

---

#### Phase 2: Quality Fallback

**Goal**: Get different qualities working

4. **Update `getTrack()` method**
   - Implement quality chain
   - Try HI_RES, then LOSSLESS, then HIGH, then LOW
   - Return which quality was delivered

5. **Update `getDashManifest()` method**
   - Same quality fallback logic
   - Return both manifest and quality delivered

**Test these**:
- Requesting HI_RES on unavailable track returns LOSSLESS
- Requesting LOSSLESS on unavailable track returns HIGH
- Etc.

---

#### Phase 3: Graceful Error Handling

**Goal**: Don't crash, return empty data instead

6. **Update `getLyrics()`**
   - Wrap in try-catch
   - Return `{ lines: [], available: false }` on error
   - Don't throw errors

7. **Update `getTrackStreamUrl()`**
   - Parse manifest correctly
   - Handle both DASH and JSON
   - Return playable URL or empty string (not error)

**Test these**:
- Lyrics endpoint down → returns empty, no crash
- Invalid manifest → returns empty URL, no crash

---

#### Phase 4: Metadata & Downloads

**Goal**: Get full metadata and download support

8. **Create `src/lib/metadata.js`**
   - Extract complete track info
   - Get cover art URLs
   - Get all quality tiers available

9. **Update downloads**
   - Add metadata embedding
   - Add filename generation with artist/album
   - Add progress callbacks

---

### Code Organization Pattern

**How tidal-ui-main does it**:

```javascript
// config.ts - Configuration and setup
export async function fetchApiTargets() { ... }
export const selectApiTargetForRegion = () => { ... }

// api.ts - Main API class
class LosslessAPI {
  constructor(baseUrl) { ... }
  
  private fetch(url) { ... }  // Core fetch with mirror rotation
  private rotateTarget() { ... }  // Switch to next mirror
  
  async getTrack(id) { ... }  // High-level methods
  async searchTracks(query) { ... }
  async getLyrics(id) { ... }
}

export const losslessAPI = new LosslessAPI();

// downloads.ts - Download-specific logic
export async function downloadTrack(trackId, options) { ... }
export function buildTrackFilename(track, quality) { ... }
```

**Apply this pattern to Smusic**:

```javascript
// src/lib/apiMirrors.js
export async function fetchApiMirrors() { ... }

// src/lib/manifestParser.js
export function parseManifest(payload, contentType) { ... }
export function parseDashXml(xmlString) { ... }

// src/lib/tidal/api.js (UPDATE)
class TidalAPI {
  private async fetch() { ... }  // With mirror rotation
  async getTrack() { ... }       // With quality fallback
  async getLyrics() { ... }      // With error handling
}

// src/lib/tidal/index.js (UPDATE)
export const tidalAPI = new TidalAPI();
```

---

### Error Handling Pattern

**Current (Broken)**:
```javascript
try {
  const track = await api.getTrack(123);
  return track;  // If error, entire component crashes
} catch (error) {
  return <Error>{error.message}</Error>;  // User sees red error box
}
```

**New (Graceful)**:
```javascript
const result = await api.getTrack(123);

if (!result || !result.streamUrl) {
  // Return empty/placeholder instead of error
  return <NoStream />;
}

// Use result
```

---

### Cache Strategy

**What to cache**:

1. **API Mirrors** (15 minutes)
   ```javascript
   const cache = {
     mirrors: [...],
     lastFetch: Date.now()
   };
   ```

2. **Track Metadata** (1 hour)
   ```javascript
   const trackCache = new Map();  // trackId → metadata
   ```

3. **Manifest** (5 minutes)
   ```javascript
   const manifestCache = new Map();  // trackId → manifest
   ```

**Why different TTLs**:
- Mirrors change rarely → long cache (15 min)
- Metadata rarely changes → medium cache (1 hour)
- Manifest can change if track is remastered → short cache (5 min)

---

### Testing Strategy

**Unit tests to write**:

1. **Mirror Discovery**
   ```javascript
   test('fetchApiMirrors returns array of mirrors', async () => {
     const mirrors = await fetchApiMirrors();
     expect(Array.isArray(mirrors)).toBe(true);
     expect(mirrors[0]).toMatch(/^https:\/\//);
   });
   ```

2. **Manifest Parsing**
   ```javascript
   test('parseManifest handles DASH XML', async () => {
     const dashXml = '<MPD>...</MPD>';
     const result = parseManifest(dashXml, 'application/dash+xml');
     expect(result.type).toBe('dash');
   });
   ```

3. **Quality Fallback**
   ```javascript
   test('Quality falls back from HI_RES to LOSSLESS', async () => {
     // Mock API to return 404 for HI_RES
     // Verify it tries LOSSLESS next
   });
   ```

4. **Mirror Rotation**
   ```javascript
   test('API rotates mirror on 429', async () => {
     // Mock first mirror returns 429
     // Verify second mirror is tried
   });
   ```

---

## Critical Implementation Notes

### Note 1: Always Have Fallback URLs

```javascript
// WRONG: If mirrors down, user stuck
const API_BASE = 'https://api.tidal.com';

// RIGHT: Fallback to squid-api
const DEFAULT_MIRRORS = [
  'https://triton.squid.wtf',
  'https://tidal-api.example.com'
];
```

### Note 2: Never Throw on Missing Metadata

```javascript
// WRONG: Crashes if lyrics unavailable
const lyrics = await api.getLyrics(trackId);
renderLyrics(lyrics);  // Error if undefined

// RIGHT: Return empty data
const lyrics = await api.getLyrics(trackId);
if (!lyrics.lines.length) {
  renderNoLyrics();
} else {
  renderLyrics(lyrics);
}
```

### Note 3: Respect Rate Limits

```javascript
// WRONG: Keep hammering same server
for (let i = 0; i < 1000; i++) {
  await api.getTrack(trackIds[i]);
}

// RIGHT: Rotate mirrors to spread load
const api = new TidalAPI();
for (let i = 0; i < 1000; i++) {
  if (i % 100 === 0) {
    api.rotateTarget();  // Rotate every 100 requests
  }
  await api.getTrack(trackIds[i]);
}
```

### Note 4: Validate Response Bodies

```javascript
// WRONG: Assume 200 OK means success
const response = await fetch(url);
if (response.ok) {
  return await response.json();
}

// RIGHT: Check response body too
const response = await fetch(url);
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}

const data = await response.json();
if (data.detail === 'Not found' || !data.urls) {
  throw new Error('Invalid response format');
}

return data;
```

### Note 5: Implement Request Deduplication

```javascript
// WRONG: Same request twice hits API twice
const lyrics1 = await api.getLyrics(123);
const lyrics2 = await api.getLyrics(123);  // API call again

// RIGHT: Cache in-flight requests
class TidalAPI {
  private inflightRequests = new Map();
  
  async getLyrics(trackId) {
    const cacheKey = `lyrics:${trackId}`;
    
    // If already fetching, return same promise
    if (this.inflightRequests.has(cacheKey)) {
      return this.inflightRequests.get(cacheKey);
    }
    
    const promise = this._fetchLyrics(trackId);
    this.inflightRequests.set(cacheKey, promise);
    
    try {
      return await promise;
    } finally {
      this.inflightRequests.delete(cacheKey);
    }
  }
}
```

---

## Summary Table

| Problem | Solution | Where to Implement |
|---------|----------|-------------------|
| Dead mirrors | Dynamic fetching every 15 min | `src/lib/apiMirrors.js` |
| Wrong manifest format | DASH XML parser | `src/lib/manifestParser.js` |
| Single quality fails | Quality chain fallback | `src/lib/tidal/api.js` |
| Rate limit crashes | Mirror rotation on 429 | `src/lib/tidal/api.js` |
| Lyrics crash component | Return empty, not error | `src/lib/tidal/api.js` |
| No metadata | Extract all fields | `src/lib/metadata.js` |
| Basic download | Metadata embedding | `src/lib/downloads.js` |

---

This guide gives you everything you need to understand the fixes without reading tidal-ui-main's entire codebase. You can now implement each piece independently.
