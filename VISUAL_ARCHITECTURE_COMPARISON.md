# Visual Architecture Comparison

## Architecture Overview Diagrams

### tidal-ui-main (SvelteKit) - Clean, Unified Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER INTERFACE (Svelte)                      │
│                                                                 │
│  Browser: <audio src={streamUrl} />                             │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              Frontend API Client (LosslessAPI)                  │
│                                                                 │
│  • selectApiTarget() → picks weighted mirror                    │
│  • getTrack() → fetch + manifest parsing                        │
│  • getStreamUrl() → extracts URL from manifest                  │
│  • Quality fallback: HI_RES → LOSSLESS → HIGH → LOW             │
│  • Manifest parsing:                                            │
│    ├─ JSON with .urls array                                     │
│    ├─ DASH XML with BaseURL                                     │
│    ├─ FLAC manifests                                            │
│    └─ SegmentTemplate detection                                 │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                  /api/proxy Endpoint                            │
│                                                                 │
│  • Detects if target requires proxy                             │
│  • Routes to local proxy or direct fetch                        │
│  • Redis caching (TTL by content type)                          │
│  • Sanitizes headers, handles CORS                              │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              API Mirror Cluster (Weighted)                      │
│                                                                 │
│  ┌──────────────────┐                                           │
│  │  squid-api       │ ◄─ Selected via random(totalWeight)       │
│  │  weight: 15      │                                           │
│  └──────────────────┘                                           │
│                                                                 │
│  ┌──────────────────┐                                           │
│  │ spotisaver-1     │                                           │
│  │  weight: 15      │                                           │
│  └──────────────────┘                                           │
│                                                                 │
│  ... 8 more mirrors with weight:15 each ...                     │
│                                                                 │
│  DYNAMIC: Updates every 15 minutes from worker endpoints        │
│  FAILOVER: Next request picks different mirror if one fails     │
└─────────────────────────────────────────────────────────────────┘

API calls ────────────────► All routed through unified stack
Audio streaming ───────────► Direct to CDN via /api/audio-proxy
```

**Key Points:**
- ✅ Single code path - no branching logic
- ✅ Automatic mirror rotation
- ✅ Dynamic target updates
- ✅ Comprehensive error handling

---

### Smusic (React + Express) - Complex, Dual-Path Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER INTERFACE (React)                       │
│                                                                 │
│  Browser: new Howl({ src: [streamUrl] })                        │
└────────────────┬────────────────────────────────────────────────┘
                 │
          ┌──────┴──────┐
          │             │
          ▼             ▼
    PATH A:      PATH B:
    BACKEND      FALLBACK
    
┌──────────────────────┐    ┌──────────────────────┐
│ /api/tidal-download/ │    │ Frontend tidalAPI    │
│ resolve              │    │ (Howler.js player)   │
│                      │    │                      │
│ Tries:               │    │ If backend fails:    │
│ • searchTidal()      │    │ • getTrack()         │
│ • getTidalStreamUrl()│    │ • extractFromMani... │
│ • Returns streamUrl  │    │ • JSON.parse fallback│
│                      │    │                      │
│ ✅ Good parsing      │    │ ⚠️  Basic parsing    │
│ ❌ May fail/timeout  │    │ ❌ Fails on XML      │
└──────────────────────┘    └──────────────────────┘
          │                        │
          └──────────┬─────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  /api/audio-proxy         │
        │  (CORS bypass)            │
        └────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  /api/proxy (if needed)    │
        └────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  API Mirror Cluster        │
        │  (Static 10 mirrors)       │
        │                            │
        │  ❌ NO dynamic updates     │
        │  ❌ Hardcoded list         │
        │  ✅ Weighted selection     │
        │  ⚠️  Backend retry logic   │
        └────────────────────────────┘

PROBLEM: Two different code paths with different parsing logic
```

**Key Problems:**
- ❌ Dual path increases failure surface
- ❌ Backend timeout → fragile fallback
- ❌ Static mirror list
- ❌ Frontend fallback parsing incomplete
- ⚠️ Different error handling per path

---

## Execution Flow Comparison

### tidal-ui-main Flow (Single Path)

```
[User Click] 
      ▼
[AudioPlayer.loadSong(trackId)]
      ▼
[tidalAPI.getStreamUrl(trackId, 'LOSSLESS')]
      ▼
[selectApiTarget()] ──────────► Weighted random from mirror list
      ▼
[buildRegionalUrl('/track/?id=123&quality=LOSSLESS')] ──► /track/?id=123&quality=LOSSLESS
      ▼
[fetchWithCORS(url)] ──────────► Check if requires proxy ──► /api/proxy?url=...
      ▼
[Fetch to mirror] ──────────────► Response with manifest
      ▼
[extractStreamUrlFromManifest(manifest)]
      ├─ Decode base64
      ├─ Try JSON.parse() ──────► Found .urls[0]? Return ✓
      ├─ Try SegmentTemplate? ──► Skip (segmented DASH)
      ├─ Try parseFlacUrlFromMpd() ──► Found BaseURL? Return ✓
      ├─ Try regex extraction ──► Found valid audio URL? Return ✓
      └─ Return null if not found
      ▼
[Wrap TIDAL CDN URL] ──────────► /api/audio-proxy?url=...
      ▼
[<audio src={streamUrl} />] ───► Browser plays

RESULT: ✅ Deterministic, comprehensive, single code path
```

### Smusic Flow (Dual Path with Fallback)

```
[User Click]
      ▼
[AudioPlayer.loadSong(trackId)]
      ▼
[fetch('/api/tidal-download/resolve?title=X&artist=Y&quality=LOSSLESS')]
      ▼
      ┌─ Backend responds 200 OK?
      │
  YES │
      ▼
   [Backend: searchTidal()]
      ▼
   [Backend: getTidalStreamUrl(trackId)]
      ▼
   [Backend: extractFromManifest()]
      ├─ Decode base64
      ├─ Try JSON.parse() ──────► Found .urls[0]? Return ✓
      ├─ Try XML BaseURL match ──► Found? Return ✓
      ├─ Try regex extraction ──► Found? Return ✓
      └─ Return null
      ▼
   [Response: {streamUrl, ...}]
      ▼
   [Frontend wraps URL for CORS]
      ▼
   [new Howl({src: [streamUrl]})]
      
  NO │
      ├─ Timeout / 404 / 502 / error
      │
      ▼
   [Fallback to: tidalAPI.getTrack(trackId, 'LOSSLESS')]
      ▼
   [tidalAPI.extractStreamUrlFromManifest(manifest)]
      ├─ Decode base64
      ├─ Try JSON.parse() ──────► Found .urls[0]? Return ✓
      ├─ If error: try custom extraction
      │  └─ const decoded = atob(manifest.replace(/-/g, '+').replace(/_/g, '/'));
      │  └─ JSON.parse(decoded)?.urls?.[0]
      │  └─ ❌ FAILS if manifest is DASH XML
      └─ Return null or undefined
      ▼
   [If no streamUrl: onLoadError('Could not resolve TIDAL stream URL')]
      ▼
   [new Howl({src: [null]})  ──► ❌ PLAY FAILS

RESULT: ⚠️ Two code paths, fragile fallback, parsing mismatch
```

---

## Manifest Parsing Logic Comparison

### tidal-ui-main (Comprehensive)

```
Input: base64-encoded manifest

Step 1: Decode base64
└─ Handle padding issues
└─ Result: XML or JSON string

Step 2: Try JSON parsing
├─ JSON.parse(decoded)
├─ Check for .urls array
└─ Return parsed.urls[0] ✓

Step 3: Check for segmented DASH
├─ Regex: /<SegmentTemplate/i
└─ If found: return null (don't extract single URL)

Step 4: Parse DASH XML for FLAC URL
├─ Extract <BaseURL> element
├─ Check if URL is valid and starts with http
└─ Return BaseURL ✓

Step 5: Regex URL extraction
├─ Find all URLs in content
├─ Exclude $Number$ (segment template)
├─ Exclude /\d+\.mp4 (segment files)
├─ Validate via isValidMediaUrl()
└─ Return first valid URL ✓

Output: Stream URL string or null
```

### Smusic Backend (Good)

```
Input: base64-encoded manifest

Step 1: Decode base64
└─ Similar to tidal-ui-main

Step 2: Try JSON parsing
├─ JSON.parse(decoded)
├─ Check for .urls array
└─ Return urls[0] ✓

Step 3: Try XML BaseURL
├─ Regex: /<BaseURL[^>]*>([^<]+)<\/BaseURL>/i
├─ Trim and validate
└─ Return BaseURL ✓

Step 4: Regex extraction (basic)
├─ Find URLs
├─ Exclude $Number$
├─ Exclude /\d+\.mp4
├─ Check if contains: .flac, .mp4, .m4a, token=, /audio/
└─ Return first match ✓

Output: Stream URL string or null

✅ Decent coverage
⚠️ No SegmentTemplate detection
⚠️ No isValidMediaUrl validation
```

### Smusic Frontend (Fragile)

```
Input: Manifest from tidalAPI response

Attempted Step 1: Direct extraction
├─ Call tidalAPI.extractStreamUrlFromManifest?.(manifest)
└─ May succeed ✓

If failed, Attempted Step 2: Manual JSON parsing
├─ const decoded = atob(manifest.replace(/-/g, '+').replace(/_/g, '/'));
├─ JSON.parse(decoded)
├─ Access .urls[0]
└─ If JSON error: caught and ignored
   
✅ Works for: JSON manifests
❌ Fails for: DASH XML manifests
❌ Fails for: FLAC URLs in XML
❌ No regex extraction fallback

Output: URL or null (mostly null if XML)
```

---

## Failure Analysis Matrix

|  Scenario | tidal-ui-main | Smusic Backend | Smusic Frontend | Smusic Overall |
|-----------|---|---|---|---|
| **JSON manifest** | ✅ | ✅ | ✅ | ✅ |
| **DASH XML + BaseURL** | ✅ | ✅ | ❌ | ❌ |
| **DASH + SegmentTemplate** | ✅ (detects) | ⚠️ (extracts) | ❌ | ❌ |
| **Segmented DASH play** | ✅ | ❌ | ❌ | ❌ |
| **Backend timeout** | N/A | N/A | ❌ (fallback) | ❌ |
| **All mirrors rate-limited** | ✅ (backs off) | ❌ (fails) | ❌ (fails) | ❌ |
| **Mirror goes down** | ✅ (dynamic) | ⚠️ (static) | ⚠️ (static) | ❌ |
| **Quality fallback** | ✅ (auto) | N/A | ❌ (manual) | ❌ |

---

## Code Complexity Comparison

### tidal-ui-main Code Structure

```
src/lib/
├── api.ts (150+ KB)
│   ├── class LosslessAPI
│   │   ├── searchTracks()
│   │   ├── getTrack() ◄── SINGLE ENTRY POINT
│   │   ├── getStreamUrl()
│   │   ├── getDashManifest()
│   │   ├── extractStreamUrlFromManifest() ◄── ONE MANIFEST PARSER
│   │   │   ├── decodeBase64Manifest()
│   │   │   ├── isSegmentedDashManifest()
│   │   │   ├── parseFlacUrlFromMpd()
│   │   │   └── isValidMediaUrl()
│   │   └── [25+ more methods]
│   └── [Comprehensive error handling]
│
├── config.ts (25 KB)
│   ├── V2_API_TARGETS[] ◄── Updated dynamically
│   ├── fetchApiTargets() ◄── Worker polling
│   ├── selectApiTarget()
│   └── buildWeightedTargets()
│
├── components/
│   └── AudioPlayer.svelte
│       └── Uses: tidalAPI.getStreamUrl()
│
└── routes/api/proxy/+server.ts
    └── Single proxy endpoint with caching
    
COMPLEXITY: ✅ Organized, single responsibilities
```

### Smusic Code Structure

```
src/lib/tidal/
├── api.js (minified)
│   └── class LosslessAPI (converted from TypeScript)
│       └── [Same as tidal-ui-main but JavaScript]
│
├── config.js (static)
│   └── V2_API_TARGETS[] ◄── HARDCODED, NO UPDATES
│
src/lib/audio/
└── audioPlayer.js (COMPLEX)
    └── loadSong(song)
        ├── Strategy 1: Folder scan
        ├── Strategy 2: TIDAL stream
        │   ├── fetch('/api/tidal-download/resolve')
        │   ├── IF success: use backend result
        │   ├── IF failure: fallback to tidalAPI
        │   │   └── Manual quality loop
        │   │   └── Manual manifest parsing
        │   │   └── Different logic than backend
        │   └── Wrap URL for CORS
        ├── Strategy 3: Blob upload
        └── Create Howl instance
        
Smusic-backend/server/
├── routes/tidal-download.js
│   ├── /resolve (search + stream)
│   │   ├── searchTidal()
│   │   ├── getTidalStreamUrl()
│   │   └── extractFromManifest() ◄── Different from frontend
│   ├── /stream (audio proxy)
│   ├── /download (zip packaging)
│   └── ... 4 more routes ...
│
├── routes/proxy.js (API proxy)
├── routes/audio-proxy.js (Audio streaming)
└── lib/proxyConfig.js (Config)

COMPLEXITY: ⚠️ Scattered, mixed responsibilities, duplicated logic
```

---

## Decision Tree: Which Path Succeeds?

```
                          ┌─ User clicks play ─────┐
                          │                         │
                          ▼                         ▼
                    [Smusic]                  [tidal-ui-main]
                          │                         │
                    [Try backend]              [tidalAPI.getStreamUrl()]
                          │                         │
            ┌─────────────┼─────────────┐           │
            │             │             │           │
    Success │        Timeout │       Error           │
        ✅  │             │             │           │
            │         ❓ │             │           │
            ▼         ▼ ▼             ▼           ▼
        Use URL  [Fallback]     [Error]      [Parse manifest]
            │         │             │           │
            │    ┌────┴─────────┐   │      ┌────┴─────────┬──────┐
            │    │              │   │      │              │      │
            │    ▼              ▼   ▼      ▼              ▼      ▼
            │  Manual       If XML    [Could be     [JSON]  [DASH XML]
            │  parsing      fails     200 w/error]      │        │
            │    │         ❌         ❌                │        │
            │    │              │                       │        │
            │    └──────┬───────┘                  ✅  │   ✅  │
            │           │                              │        │
            │           ▼                              │        │
            │     ❌ PLAY FAILS                        │        │
            │                                          │        │
            └──────────────────┬───────────────────────┴────────┴─
                               │
                               ▼
                        ✅ Stream URL
                               │
                               ▼
                        ✅ PLAY SUCCEEDS
```

---

## Summary Scorecard

### tidal-ui-main
- **Code Organization**: ⭐⭐⭐⭐⭐
- **Error Handling**: ⭐⭐⭐⭐⭐
- **Manifest Parsing**: ⭐⭐⭐⭐⭐
- **Failover Mechanism**: ⭐⭐⭐⭐⭐
- **Complexity for User**: ⭐ (simple)
- **Production Readiness**: ⭐⭐⭐⭐⭐

### Smusic
- **Code Organization**: ⭐⭐ (scattered)
- **Error Handling**: ⭐⭐ (generic)
- **Manifest Parsing**: ⭐⭐ (fragile frontend)
- **Failover Mechanism**: ⭐ (fallback only works if backend running)
- **Complexity for User**: ⭐⭐ (simpler with backend)
- **Production Readiness**: ⭐⭐ (needs work)

### tidal (Docs)
- **Completeness**: ⭐⭐⭐⭐⭐
- **Clarity**: ⭐⭐⭐⭐
- **Reference Value**: ⭐⭐⭐⭐⭐
