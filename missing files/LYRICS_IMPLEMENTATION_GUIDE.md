# Synchronized Lyrics Implementation Alternatives

## Current Implementation

The project currently:
1. **Fetches lyrics** via `losslessAPI.getLyrics(trackId)` → `/lyrics/?id={trackId}`
2. **Displays them** using the `@uimaxbai/am-lyrics` web component (Apple Music Lyrics)
3. **Problem**: Proxy mirrors don't support the `/lyrics/` endpoint

---

## Solution 1: Use Direct TIDAL Credentials (If Available)

If you have direct TIDAL API access, bypass the proxy mirrors:

```typescript
// src/lib/api.ts - Add to LosslessAPI class

private directTidalApiUrl = 'https://api.tidal.com'; // Direct TIDAL endpoint
private tidalAuth = { // Store securely in env vars
  clientId: env.TIDAL_CLIENT_ID,
  clientSecret: env.TIDAL_CLIENT_SECRET,
  accessToken: env.TIDAL_ACCESS_TOKEN
};

async getLyricsFromTidal(trackId: number): Promise<Lyrics> {
  // Direct endpoint might work where proxy doesn't
  const response = await fetch(
    `${this.directTidalApiUrl}/v1/tracks/${trackId}/lyrics?token=${this.tidalAuth.accessToken}`,
    {
      headers: {
        'Authorization': `Bearer ${this.tidalAuth.accessToken}`,
        'X-Tidal-Token': this.tidalAuth.clientId
      }
    }
  );
  
  if (!response.ok) throw new Error('Failed to get lyrics');
  return response.json();
}
```

**Pros:** Official TIDAL lyrics, best quality
**Cons:** Requires TIDAL credentials, may have rate limits

---

## Solution 2: Use Lyrics.ovh (Free & No Auth)

Simplest alternative - no API key required:

```typescript
// src/lib/lyrics-providers.ts

export interface LyricsProvider {
  name: string;
  getLyrics(title: string, artist: string): Promise<SyncedLyrics>;
}

interface SyncedLyrics {
  lyrics: string; // SRT format: [00:00.00] Text
  provider: string;
  isRightToLeft: boolean;
}

// Lyrics.ovh provider
export const lyricsOvhProvider: LyricsProvider = {
  name: 'Lyrics.ovh',
  async getLyrics(title: string, artist: string): Promise<SyncedLyrics> {
    const response = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    );

    if (!response.ok) {
      throw new Error('Lyrics not found on Lyrics.ovh');
    }

    const data = await response.json() as { lyrics: string };
    
    // Convert plain lyrics to timestamped format
    const syncedLyrics = convertPlainToSynced(data.lyrics, title);

    return {
      lyrics: syncedLyrics,
      provider: 'Lyrics.ovh',
      isRightToLeft: false
    };
  }
};

function convertPlainToSynced(plainText: string, _title: string): string {
  const lines = plainText.split('\n').filter(l => l.trim());
  let time = 0;
  
  return lines
    .map(line => {
      const timestamped = `[${formatTime(time)}] ${line}`;
      time += 3000; // Increment 3 seconds per line (rough estimate)
      return timestamped;
    })
    .join('\n');
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}
```

**Pros:** Free, no auth, simple
**Cons:** Lyrics aren't synced, need to estimate timings

---

## Solution 3: Use Musixmatch API (Has Sync Lyrics)

Musixmatch provides synchronized lyrics:

```typescript
// src/lib/lyrics-providers.ts

export const musixmatchProvider: LyricsProvider = {
  name: 'Musixmatch',
  async getLyrics(title: string, artist: string, duration?: number): Promise<SyncedLyrics> {
    const apiKey = env.MUSIXMATCH_API_KEY; // Get from https://developer.musixmatch.com
    
    if (!apiKey) {
      throw new Error('Musixmatch API key not configured');
    }

    // Step 1: Search for the song
    const searchUrl = new URL('https://api.musixmatch.com/ws/1.1/matcher.track.get');
    searchUrl.searchParams.set('q_track', title);
    searchUrl.searchParams.set('q_artist', artist);
    searchUrl.searchParams.set('apikey', apiKey);

    const searchResponse = await fetch(searchUrl.toString());
    const searchData = await searchResponse.json() as { message: { body: { track: { track_id: number } } } };

    const trackId = searchData.message.body.track.track_id;

    // Step 2: Get synced lyrics (requires premium or special endpoint)
    const lyricsUrl = new URL('https://api.musixmatch.com/ws/1.1/track.lyrics.get');
    lyricsUrl.searchParams.set('track_id', trackId.toString());
    lyricsUrl.searchParams.set('apikey', apiKey);

    const lyricsResponse = await fetch(lyricsUrl.toString());
    const lyricsData = await lyricsResponse.json() as {
      message: {
        body: {
          lyrics: {
            lyrics_body: string;
            sync_type: 'LINE' | 'WORD';
          };
        };
      };
    };

    const lyricsBody = lyricsData.message.body.lyrics.lyrics_body;

    return {
      lyrics: lyricsBody, // Already in SRT format
      provider: 'Musixmatch',
      isRightToLeft: false
    };
  }
};
```

**Pros:** Synchronized lyrics, extensive database
**Cons:** Requires API key (paid), rate limits

---

## Solution 4: Create a Backend Lyrics Service

Create a backend endpoint that aggregates multiple sources:

```typescript
// src/routes/api/lyrics/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { lyricsOvhProvider, musixmatchProvider } from '$lib/lyrics-providers';

export const GET: RequestHandler = async ({ url }) => {
  const title = url.searchParams.get('title');
  const artist = url.searchParams.get('artist');
  const trackId = url.searchParams.get('id');

  if (!title || !artist) {
    return json({ error: 'title and artist required' }, { status: 400 });
  }

  try {
    // Try TIDAL first (if we have credentials)
    // try {
    //   const tidalLyrics = await getTidalLyrics(parseInt(trackId || '0'));
    //   return json(tidalLyrics);
    // } catch {}

    // Try Musixmatch (premium/synced)
    try {
      const musixmatchLyrics = await musixmatchProvider.getLyrics(title, artist);
      return json({
        trackId: parseInt(trackId || '0'),
        lyrics: musixmatchLyrics.lyrics,
        lyricsProvider: musixmatchLyrics.provider,
        subtitles: musixmatchLyrics.lyrics,
        isRightToLeft: musixmatchLyrics.isRightToLeft
      });
    } catch (error) {
      console.warn('Musixmatch failed:', error);
    }

    // Fallback to Lyrics.ovh
    const ovhLyrics = await lyricsOvhProvider.getLyrics(title, artist);
    return json({
      trackId: parseInt(trackId || '0'),
      lyrics: ovhLyrics.lyrics,
      lyricsProvider: ovhLyrics.provider,
      subtitles: ovhLyrics.lyrics,
      isRightToLeft: ovhLyrics.isRightToLeft
    });
  } catch (error) {
    return json(
      { error: 'Lyrics not found', details: error instanceof Error ? error.message : String(error) },
      { status: 404 }
    );
  }
};
```

Then update the API to use this endpoint:

```typescript
// src/lib/api.ts - Modify getLyrics

async getLyrics(id: number, title?: string, artist?: string): Promise<Lyrics> {
  // Try original endpoint first
  try {
    const response = await this.fetch(`${this.baseUrl}/lyrics/?id=${id}`);
    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data) ? data[0] : data;
    }
  } catch {
    // Continue to fallback
  }

  // Fallback to our backend lyrics service
  const params = new URLSearchParams({
    id: id.toString(),
    ...(title && { title }),
    ...(artist && { artist })
  });

  const response = await fetch(`/api/lyrics?${params}`);
  if (!response.ok) throw new Error('Failed to get lyrics');
  return response.json();
}
```

**Pros:** Automatic fallback, aggregates multiple sources, server-side caching possible
**Cons:** Slightly slower (server round-trip), needs backend logic

---

## Solution 5: Use Genius API (Best Quality)

Genius has high-quality lyrics with some timing data:

```typescript
// src/lib/lyrics-providers.ts

export const geniusProvider: LyricsProvider = {
  name: 'Genius',
  async getLyrics(title: string, artist: string): Promise<SyncedLyrics> {
    const accessToken = env.GENIUS_ACCESS_TOKEN; // Get from https://genius.com/api-clients
    
    if (!accessToken) {
      throw new Error('Genius API token not configured');
    }

    // Step 1: Search Genius API
    const searchUrl = new URL('https://api.genius.com/search');
    searchUrl.searchParams.set('q', `${title} ${artist}`);

    const searchResponse = await fetch(searchUrl.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const searchData = await searchResponse.json() as {
      response: {
        hits: Array<{ result: { url: string; title: string } }>;
      };
    };

    if (searchData.response.hits.length === 0) {
      throw new Error('Song not found on Genius');
    }

    const songUrl = searchData.response.hits[0]!.result.url;

    // Step 2: Scrape lyrics from HTML (or use genius-lyrics library)
    const lyrics = await scrapeLyricsFromGenius(songUrl);

    return {
      lyrics: convertToSrtFormat(lyrics),
      provider: 'Genius',
      isRightToLeft: false
    };
  }
};

async function scrapeLyricsFromGenius(url: string): Promise<string> {
  // Use a library like: npm install genius-lyrics
  // Or implement basic HTML scraping
  const response = await fetch(url);
  const html = await response.text();
  
  // Simple regex-based extraction
  const lyricsRegex = /<div data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g;
  const matches = [...html.matchAll(lyricsRegex)];
  
  if (matches.length === 0) {
    throw new Error('Could not extract lyrics from Genius');
  }

  return matches.map(m => m[1]!.replace(/<[^>]*>/g, '').trim()).join('\n');
}

function convertToSrtFormat(plainLyrics: string): string {
  const lines = plainLyrics.split('\n').filter(l => l.trim());
  let timeMs = 0;
  
  return lines
    .map(line => {
      const formatted = `[${formatTime(timeMs)}] ${line}`;
      timeMs += 4000; // 4 seconds per line
      return formatted;
    })
    .join('\n');
}
```

**Pros:** High quality lyrics, extensive database
**Cons:** Requires scraping (fragile), rate limited

---

## Solution 6: Implement a Lyrics Cache

Cache lyrics locally to reduce API calls:

```typescript
// src/lib/lyrics-cache.ts

import { openDB, type IDBPDatabase } from 'idb';

interface CachedLyrics {
  trackId: number;
  title: string;
  artist: string;
  lyrics: string;
  provider: string;
  timestamp: number; // When cached
}

let db: IDBPDatabase | null = null;

async function getDatabase() {
  if (db) return db;

  db = await openDB('tidal-lyrics-cache', 1, {
    upgrade(db) {
      db.createObjectStore('lyrics', { keyPath: 'trackId' });
    }
  });

  return db;
}

export async function getCachedLyrics(trackId: number): Promise<CachedLyrics | null> {
  if (typeof indexedDB === 'undefined') return null;

  const database = await getDatabase();
  const cached = (await database.get('lyrics', trackId)) as CachedLyrics | undefined;

  if (!cached) return null;

  // Cache for 30 days
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - cached.timestamp > thirtyDaysMs) {
    await database.delete('lyrics', trackId);
    return null;
  }

  return cached;
}

export async function cacheLyrics(lyrics: CachedLyrics): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  const database = await getDatabase();
  await database.put('lyrics', {
    ...lyrics,
    timestamp: Date.now()
  });
}
```

Usage:

```typescript
// src/lib/api.ts

async getLyrics(id: number, title?: string, artist?: string): Promise<Lyrics> {
  // Check cache first
  const cached = await getCachedLyrics(id);
  if (cached) {
    return {
      trackId: id,
      lyrics: cached.lyrics,
      lyricsProvider: cached.provider,
      subtitles: cached.lyrics,
      isRightToLeft: false
    };
  }

  // Fetch from providers...
  const lyrics = await fetchLyricsFromProviders(id, title, artist);
  
  // Cache result
  await cacheLyrics({
    trackId: id,
    title: title || '',
    artist: artist || '',
    lyrics: lyrics.lyrics,
    provider: lyrics.provider
  });

  return lyrics;
}
```

---

## Solution 7: Implement Fallback Chain

Try multiple providers in order:

```typescript
// src/lib/lyrics-providers.ts

export class LyricsProviderChain {
  private providers: LyricsProvider[];

  constructor(providers: LyricsProvider[] = []) {
    // Order by preference
    this.providers = providers || [
      // musixmatchProvider, // Synced but requires API key
      lyricsOvhProvider,    // Free, simple lyrics
      // geniusProvider,     // High quality but scraping
    ];
  }

  async getLyrics(title: string, artist: string, duration?: number): Promise<SyncedLyrics> {
    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of this.providers) {
      try {
        console.log(`Trying lyrics provider: ${provider.name}`);
        const lyrics = await provider.getLyrics(title, artist, duration);
        console.log(`Success! Got lyrics from ${provider.name}`);
        return lyrics;
      } catch (error) {
        errors.push({
          provider: provider.name,
          error: error instanceof Error ? error.message : String(error)
        });
        console.warn(`${provider.name} failed:`, error);
      }
    }

    throw new Error(
      `All lyrics providers failed:\n${errors.map(e => `${e.provider}: ${e.error}`).join('\n')}`
    );
  }
}

export const lyricsChain = new LyricsProviderChain();
```

---

## Implementation Checklist

Choose your strategy:

- [ ] **Option 1**: Use direct TIDAL API if you have credentials
- [ ] **Option 2**: Use Lyrics.ovh (simplest, no sync)
- [ ] **Option 3**: Use Musixmatch (need API key)
- [ ] **Option 4**: Create backend lyrics endpoint
- [ ] **Option 5**: Use Genius API (need to scrape)
- [ ] **Option 6**: Add lyrics caching with IndexedDB
- [ ] **Option 7**: Implement provider fallback chain

---

## Recommended Setup (Best UX)

Combine multiple solutions:

```typescript
// src/lib/api.ts

private lyricsChain = new LyricsProviderChain([
  // musixmatchProvider, // If you have API key - has sync
  lyricsOvhProvider,    // Free fallback
]);

async getLyrics(id: number, title?: string, artist?: string): Promise<Lyrics> {
  // Check IndexedDB cache
  const cached = await getCachedLyrics(id);
  if (cached) return cached;

  // Try backend endpoint first (aggregated)
  try {
    if (title && artist) {
      const response = await fetch(
        `/api/lyrics?id=${id}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
      );
      if (response.ok) {
        const lyrics = await response.json();
        await cacheLyrics(lyrics);
        return lyrics;
      }
    }
  } catch (error) {
    console.warn('Backend lyrics endpoint failed:', error);
  }

  // Fallback to provider chain
  if (title && artist) {
    const result = await this.lyricsChain.getLyrics(title, artist);
    const lyrics = {
      trackId: id,
      lyrics: result.lyrics,
      lyricsProvider: result.provider,
      subtitles: result.lyrics,
      isRightToLeft: result.isRightToLeft
    };
    await cacheLyrics(lyrics);
    return lyrics;
  }

  throw new Error('Could not fetch lyrics');
}
```

This provides:
✅ Fast cached retrieval
✅ Server-side aggregation
✅ Multiple provider fallbacks
✅ Graceful degradation
✅ No API key required (uses free options)

