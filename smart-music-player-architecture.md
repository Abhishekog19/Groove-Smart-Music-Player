# Smart Music Player - Technical Architecture & Development Roadmap

## Executive Summary

A progressive web application that combines local music library management with intelligent recommendations and social features. Built with React and Node.js, the platform prioritizes user privacy, offline capabilities, and personalized music discovery.

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser/PWA)                    │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   React UI   │  │  Audio Engine│  │  IndexedDB      │  │
│  │  Components  │  │  (Howler.js) │  │  (Local Songs)  │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   State Mgmt │  │  Service     │  │  Cache Storage  │  │
│  │   (Zustand)  │  │  Worker      │  │  (Offline Data) │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ REST API
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                 │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │     API      │  │  Auth        │  │  Recommendation │  │
│  │   Routes     │  │  Service     │  │     Engine      │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Social     │  │  Analytics   │  │  External API   │  │
│  │   Service    │  │  Service     │  │  Integrations   │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  PostgreSQL  │  │    Redis     │  │   File Storage  │  │
│  │  (Metadata)  │  │   (Cache)    │  │   (Optional)    │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Architecture Principles

1. **Offline-First**: Core playback functionality works without internet
2. **Progressive Enhancement**: Features degrade gracefully when offline
3. **Privacy-Centric**: User music files stay local by default
4. **Scalable**: Microservice-ready architecture for future growth
5. **Modular**: Features can be developed and deployed independently

---

## 2. Technology Stack

### 2.1 Frontend Stack

| Technology | Purpose | Justification |
|------------|---------|---------------|
| **React 18** | UI Framework | Virtual DOM, hooks, component reusability |
| **TypeScript** | Type Safety | Catches errors early, better IDE support |
| **Vite** | Build Tool | Fast HMR, optimized production builds |
| **Zustand** | State Management | Lightweight, simple API, no boilerplate |
| **React Router v6** | Routing | Standard routing with data loading |
| **TailwindCSS** | Styling | Utility-first, consistent design system |
| **Howler.js** | Audio Playback | Cross-browser audio, advanced controls |
| **music-metadata-browser** | Metadata Extraction | Parse ID3 tags from audio files |
| **Dexie.js** | IndexedDB Wrapper | Simplified local database operations |
| **Workbox** | Service Worker | PWA caching strategies, offline support |

### 2.2 Backend Stack

| Technology | Purpose | Justification |
|------------|---------|---------------|
| **Node.js 20+** | Runtime | Event-driven, large ecosystem |
| **Express.js** | Web Framework | Minimal, flexible, well-documented |
| **TypeScript** | Type Safety | Shared types with frontend |
| **PostgreSQL 15+** | Primary Database | ACID compliance, JSON support |
| **Prisma** | ORM | Type-safe queries, migrations |
| **Redis** | Caching | Session storage, real-time features |
| **Passport.js** | Authentication | Multiple auth strategies |
| **Bull** | Job Queue | Background processing (analytics) |
| **Socket.io** | Real-time | Friend activity, notifications |

### 2.3 DevOps & Tools

- **Docker** - Containerization
- **GitHub Actions** - CI/CD
- **ESLint + Prettier** - Code quality
- **Jest + React Testing Library** - Testing
- **Sentry** - Error tracking
- **Vercel/Netlify** - Frontend hosting (Phase 1)
- **Railway/Render** - Backend hosting

---

## 3. Database Design

### 3.1 PostgreSQL Schema

```sql
-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    settings JSONB DEFAULT '{}'::jsonb
);

-- Songs Table (Metadata only - files stored locally)
CREATE TABLE songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255),
    album VARCHAR(255),
    genre VARCHAR(100),
    duration INTEGER, -- seconds
    year INTEGER,
    track_number INTEGER,
    file_hash VARCHAR(64) UNIQUE, -- SHA-256 of file
    file_size BIGINT,
    format VARCHAR(10), -- mp3, wav, flac
    bitrate INTEGER,
    sample_rate INTEGER,
    cover_art_url TEXT,
    lyrics TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Playlists Table
CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    is_public BOOLEAN DEFAULT false,
    is_collaborative BOOLEAN DEFAULT false,
    is_system_generated BOOLEAN DEFAULT false, -- for Habit Mix, etc.
    playlist_type VARCHAR(50), -- favorites, habit_mix, custom, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Playlist Items Table
CREATE TABLE playlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT NOW(),
    added_by_user_id UUID REFERENCES users(id),
    UNIQUE(playlist_id, song_id)
);

-- Listening History Table
CREATE TABLE listening_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
    played_at TIMESTAMP DEFAULT NOW(),
    duration_played INTEGER, -- seconds actually played
    completion_percentage DECIMAL(5,2), -- 0-100
    was_skipped BOOLEAN DEFAULT false,
    skip_time INTEGER, -- when skipped (seconds)
    device_type VARCHAR(50), -- web, mobile, desktop
    context_type VARCHAR(50), -- playlist, album, search, radio
    context_id UUID -- reference to playlist, album, etc.
);

-- User Interactions Table
CREATE TABLE user_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
    interaction_type VARCHAR(50) NOT NULL, -- like, dislike, skip, repeat
    created_at TIMESTAMP DEFAULT NOW()
);

-- Friendships Table
CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, blocked
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, friend_id),
    CHECK (user_id != friend_id)
);

-- Activity Feed Table
CREATE TABLE activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- now_playing, liked_song, created_playlist
    song_id UUID REFERENCES songs(id) ON DELETE SET NULL,
    playlist_id UUID REFERENCES playlists(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP -- for temporary activities
);

-- User Statistics Table
CREATE TABLE user_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    period_type VARCHAR(20) NOT NULL, -- daily, weekly, monthly, all_time
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_listening_time INTEGER, -- seconds
    songs_played INTEGER,
    unique_songs_played INTEGER,
    unique_artists_played INTEGER,
    most_played_song_id UUID REFERENCES songs(id),
    most_played_artist VARCHAR(255),
    top_genre VARCHAR(100),
    stats_data JSONB DEFAULT '{}'::jsonb, -- detailed stats
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, period_type, period_start)
);

-- Recommendations Cache Table
CREATE TABLE recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recommendation_type VARCHAR(50) NOT NULL, -- similar_songs, mood_based, time_based
    source_song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
    recommended_song_ids UUID[] NOT NULL,
    score DECIMAL(5,4), -- confidence score
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
);

-- Indexes for Performance
CREATE INDEX idx_songs_user_id ON songs(user_id);
CREATE INDEX idx_songs_artist ON songs(artist);
CREATE INDEX idx_songs_genre ON songs(genre);
CREATE INDEX idx_playlists_user_id ON playlists(user_id);
CREATE INDEX idx_playlist_items_playlist_id ON playlist_items(playlist_id);
CREATE INDEX idx_listening_history_user_id ON listening_history(user_id);
CREATE INDEX idx_listening_history_song_id ON listening_history(song_id);
CREATE INDEX idx_listening_history_played_at ON listening_history(played_at DESC);
CREATE INDEX idx_friendships_user_id ON friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX idx_activity_feed_user_id ON activity_feed(user_id);
CREATE INDEX idx_activity_feed_created_at ON activity_feed(created_at DESC);
```

### 3.2 IndexedDB Schema (Client-Side)

```typescript
// Dexie.js Schema
const db = new Dexie('SmartMusicPlayer');

db.version(1).stores({
    // Actual audio file blobs
    audioFiles: 'fileHash, userId, blob, metadata',
    
    // Cached song metadata
    songs: 'id, userId, title, artist, album, genre',
    
    // Local playlists (synced with server)
    playlists: 'id, userId, name, isSystemGenerated',
    
    // Playback queue
    queue: '++id, songId, position',
    
    // Offline listening history (synced periodically)
    offlineHistory: '++id, songId, playedAt, wasSynced',
    
    // Cached recommendations
    cachedRecommendations: 'userId, recommendationType, data, expiresAt'
});
```

---

## 4. API Design

### 4.1 API Architecture

**Base URL**: `https://api.smartmusicplayer.com/v1`

**Authentication**: JWT tokens (access + refresh)

**Response Format**: JSON with consistent structure

```json
{
    "success": true,
    "data": { ... },
    "error": null,
    "metadata": {
        "timestamp": "2024-03-09T10:30:00Z",
        "requestId": "uuid"
    }
}
```

### 4.2 Core API Endpoints

#### Authentication

```
POST   /auth/register          - Create new user account
POST   /auth/login             - Login and get JWT tokens
POST   /auth/refresh           - Refresh access token
POST   /auth/logout            - Invalidate refresh token
GET    /auth/me                - Get current user info
```

#### Songs

```
POST   /songs                  - Create song metadata
GET    /songs                  - List user's songs (paginated)
GET    /songs/:id              - Get song details
PUT    /songs/:id              - Update song metadata
DELETE /songs/:id              - Delete song metadata
POST   /songs/bulk             - Bulk create song metadata
POST   /songs/search           - Search user's library
GET    /songs/:id/similar      - Get similar songs
```

#### Playlists

```
POST   /playlists              - Create playlist
GET    /playlists              - List user's playlists
GET    /playlists/:id          - Get playlist details
PUT    /playlists/:id          - Update playlist
DELETE /playlists/:id          - Delete playlist
POST   /playlists/:id/songs    - Add song to playlist
DELETE /playlists/:id/songs/:songId - Remove song
PUT    /playlists/:id/reorder  - Reorder playlist items
GET    /playlists/system/:type - Get system playlist (habit mix, etc.)
```

#### Listening History

```
POST   /history                - Record listening session
GET    /history                - Get listening history
GET    /history/recent         - Get recently played songs
POST   /history/bulk           - Bulk upload offline history
```

#### Recommendations

```
GET    /recommendations/for-you          - Personalized recommendations
GET    /recommendations/similar/:songId  - Similar to song
GET    /recommendations/mood/:mood       - Mood-based recommendations
GET    /recommendations/time-based       - Time-based playlist
POST   /recommendations/instant          - Generate playlist from prompt
```

#### Social Features

```
POST   /friends/request        - Send friend request
PUT    /friends/:id/accept     - Accept friend request
DELETE /friends/:id            - Remove friend
GET    /friends                - List friends
GET    /friends/:id/activity   - Get friend's current activity
GET    /friends/:id/playlists  - Get friend's public playlists
GET    /friends/:id/stats      - Get friend's music stats
```

#### Statistics

```
GET    /stats/overview         - Overall stats summary
GET    /stats/weekly           - This week's stats
GET    /stats/monthly          - This month's stats
GET    /stats/top-songs        - Most played songs
GET    /stats/top-artists      - Most played artists
GET    /stats/listening-trends - Listening patterns over time
```

#### External Integration

```
POST   /external/youtube/search   - Search YouTube
GET    /external/youtube/:id      - Get YouTube song info
POST   /external/soundcloud/search - Search SoundCloud
GET    /external/trending         - Get trending songs
```

### 4.3 WebSocket Events (Socket.io)

```typescript
// Client -> Server
'user:start_playing'     // User starts playing a song
'user:stop_playing'      // User stops playing
'user:update_status'     // Update online status

// Server -> Client
'friend:now_playing'     // Friend started playing a song
'friend:online'          // Friend came online
'friend:offline'         // Friend went offline
'notification:new'       // New notification
```

---

## 5. Frontend Architecture

### 5.1 Project Structure

```
src/
├── app/                        # Application setup
│   ├── App.tsx
│   ├── router.tsx
│   └── store.ts
├── components/                 # Reusable components
│   ├── audio/
│   │   ├── AudioPlayer.tsx     # Main player UI
│   │   ├── PlaybackControls.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── VolumeControl.tsx
│   │   └── QueueManager.tsx
│   ├── library/
│   │   ├── SongList.tsx
│   │   ├── SongCard.tsx
│   │   ├── AlbumGrid.tsx
│   │   └── ArtistList.tsx
│   ├── playlist/
│   │   ├── PlaylistCard.tsx
│   │   ├── PlaylistEditor.tsx
│   │   └── PlaylistDetails.tsx
│   ├── upload/
│   │   ├── FileUploader.tsx
│   │   ├── UploadProgress.tsx
│   │   └── MetadataExtractor.tsx
│   ├── social/
│   │   ├── FriendsList.tsx
│   │   ├── ActivityFeed.tsx
│   │   └── NowPlaying.tsx
│   └── common/
│       ├── Button.tsx
│       ├── Modal.tsx
│       ├── SearchBar.tsx
│       └── Toast.tsx
├── features/                   # Feature modules
│   ├── auth/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── store/
│   ├── player/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── store/
│   ├── library/
│   ├── recommendations/
│   └── social/
├── pages/                      # Route pages
│   ├── Home.tsx
│   ├── Library.tsx
│   ├── Playlists.tsx
│   ├── Discover.tsx
│   ├── Friends.tsx
│   ├── Stats.tsx
│   └── Settings.tsx
├── services/                   # API clients
│   ├── api.ts                  # Axios instance
│   ├── auth.service.ts
│   ├── songs.service.ts
│   ├── playlists.service.ts
│   └── recommendations.service.ts
├── lib/                        # Utilities
│   ├── audio/
│   │   ├── player.ts           # Howler.js wrapper
│   │   ├── metadata.ts         # Metadata extraction
│   │   └── visualizer.ts       # Audio visualization
│   ├── db/
│   │   ├── indexedDB.ts        # Dexie.js setup
│   │   └── migrations.ts
│   ├── utils/
│   │   ├── format.ts
│   │   ├── validation.ts
│   │   └── helpers.ts
│   └── hooks/
│       ├── useAudioPlayer.ts
│       ├── useMediaSession.ts
│       └── useOnlineStatus.ts
├── types/                      # TypeScript types
│   ├── song.types.ts
│   ├── playlist.types.ts
│   └── user.types.ts
└── workers/                    # Web Workers
    ├── audio-processor.worker.ts
    └── metadata-extractor.worker.ts
```

### 5.2 State Management (Zustand)

```typescript
// Player Store
interface PlayerState {
    currentSong: Song | null;
    queue: Song[];
    isPlaying: boolean;
    volume: number;
    repeat: 'none' | 'one' | 'all';
    shuffle: boolean;
    currentTime: number;
    duration: number;
    
    // Actions
    playSong: (song: Song) => void;
    pauseSong: () => void;
    nextSong: () => void;
    previousSong: () => void;
    setVolume: (volume: number) => void;
    toggleRepeat: () => void;
    toggleShuffle: () => void;
    addToQueue: (song: Song) => void;
}

// Library Store
interface LibraryState {
    songs: Song[];
    playlists: Playlist[];
    isLoading: boolean;
    filters: LibraryFilters;
    
    // Actions
    fetchSongs: () => Promise<void>;
    addSong: (song: Song) => void;
    removeSong: (songId: string) => void;
    updateFilters: (filters: Partial<LibraryFilters>) => void;
}

// Auth Store
interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    
    // Actions
    login: (credentials: LoginCredentials) => Promise<void>;
    logout: () => void;
    refreshToken: () => Promise<void>;
}
```

### 5.3 Audio Player Implementation

```typescript
// lib/audio/player.ts
import { Howl, Howler } from 'howler';

class AudioPlayer {
    private sound: Howl | null = null;
    private queue: Song[] = [];
    private currentIndex: number = 0;
    private onStateChange?: (state: PlayerState) => void;
    
    constructor() {
        // Setup media session for lock screen controls
        if ('mediaSession' in navigator) {
            this.setupMediaSession();
        }
    }
    
    async loadSong(song: Song): Promise<void> {
        // Get audio blob from IndexedDB
        const audioBlob = await db.audioFiles
            .where('fileHash')
            .equals(song.fileHash)
            .first();
        
        if (!audioBlob) {
            throw new Error('Audio file not found locally');
        }
        
        // Create URL from blob
        const audioUrl = URL.createObjectURL(audioBlob.blob);
        
        // Initialize Howler
        this.sound = new Howl({
            src: [audioUrl],
            html5: true,
            format: [song.format],
            onplay: () => this.handlePlay(),
            onpause: () => this.handlePause(),
            onend: () => this.handleEnd(),
            onseek: () => this.handleSeek(),
        });
    }
    
    play(): void {
        this.sound?.play();
    }
    
    pause(): void {
        this.sound?.pause();
    }
    
    seek(time: number): void {
        this.sound?.seek(time);
    }
    
    setVolume(volume: number): void {
        Howler.volume(volume);
    }
    
    private setupMediaSession(): void {
        navigator.mediaSession.setActionHandler('play', () => this.play());
        navigator.mediaSession.setActionHandler('pause', () => this.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
        navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    }
    
    private updateMediaSession(song: Song): void {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.title,
                artist: song.artist,
                album: song.album,
                artwork: [
                    { src: song.coverArtUrl || '/default-cover.png', sizes: '512x512', type: 'image/png' }
                ]
            });
        }
    }
}

export const audioPlayer = new AudioPlayer();
```

---

## 6. Recommendation Engine

### 6.1 Algorithm Overview

The recommendation system uses a hybrid approach:

1. **Content-Based Filtering**: Recommend songs similar to what user likes
2. **Collaborative Filtering**: Recommend songs liked by similar users
3. **Context-Aware**: Consider time of day, mood, activity
4. **Skip Intelligence**: Learn from user skipping behavior

### 6.2 Content-Based Recommendations

```typescript
// Recommendation Algorithm
interface SongFeatures {
    genre: string[];
    tempo: number;          // BPM
    energy: number;         // 0-1
    valence: number;        // 0-1 (happiness)
    acousticness: number;   // 0-1
    danceability: number;   // 0-1
}

function calculateSimilarity(song1: SongFeatures, song2: SongFeatures): number {
    // Cosine similarity between feature vectors
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    // Genre similarity (Jaccard)
    const genreIntersection = song1.genre.filter(g => song2.genre.includes(g));
    const genreUnion = [...new Set([...song1.genre, ...song2.genre])];
    const genreSimilarity = genreIntersection.length / genreUnion.length;
    
    // Numeric features similarity
    const features = ['tempo', 'energy', 'valence', 'acousticness', 'danceability'];
    features.forEach(feature => {
        const val1 = song1[feature];
        const val2 = song2[feature];
        dotProduct += val1 * val2;
        magnitude1 += val1 * val1;
        magnitude2 += val2 * val2;
    });
    
    const cosineSim = dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
    
    // Weighted combination
    return 0.3 * genreSimilarity + 0.7 * cosineSim;
}
```

### 6.3 Habit Mix Generation

```sql
-- SQL Query for Habit Mix
WITH song_stats AS (
    SELECT 
        song_id,
        COUNT(*) as play_count,
        AVG(completion_percentage) as avg_completion,
        SUM(CASE WHEN was_skipped THEN 1 ELSE 0 END) as skip_count,
        MAX(played_at) as last_played
    FROM listening_history
    WHERE user_id = $1
        AND played_at > NOW() - INTERVAL '30 days'
    GROUP BY song_id
),
scored_songs AS (
    SELECT 
        s.id,
        s.title,
        s.artist,
        ss.play_count,
        ss.avg_completion,
        ss.skip_count,
        -- Scoring formula
        (
            (ss.play_count * 0.4) +
            (ss.avg_completion * 0.3) +
            ((1 - (ss.skip_count::float / NULLIF(ss.play_count, 0))) * 0.3)
        ) as habit_score
    FROM songs s
    JOIN song_stats ss ON s.id = ss.song_id
)
SELECT * FROM scored_songs
ORDER BY habit_score DESC
LIMIT 50;
```

### 6.4 Mood-Based Recommendations

```typescript
// Mood to audio features mapping
const moodProfiles = {
    happy: {
        valence: { min: 0.6, max: 1.0 },
        energy: { min: 0.5, max: 1.0 },
        tempo: { min: 120, max: 180 },
    },
    chill: {
        valence: { min: 0.3, max: 0.7 },
        energy: { min: 0.2, max: 0.5 },
        tempo: { min: 80, max: 120 },
    },
    workout: {
        energy: { min: 0.7, max: 1.0 },
        tempo: { min: 130, max: 180 },
        danceability: { min: 0.6, max: 1.0 },
    },
    sad: {
        valence: { min: 0.0, max: 0.4 },
        energy: { min: 0.1, max: 0.4 },
        acousticness: { min: 0.4, max: 1.0 },
    },
    focus: {
        energy: { min: 0.3, max: 0.6 },
        acousticness: { min: 0.5, max: 1.0 },
        speechiness: { min: 0.0, max: 0.3 }, // instrumental preferred
    },
};

function getMoodPlaylist(mood: string, userSongs: Song[]): Song[] {
    const profile = moodProfiles[mood];
    
    return userSongs.filter(song => {
        return Object.entries(profile).every(([feature, range]) => {
            const value = song.features[feature];
            return value >= range.min && value <= range.max;
        });
    }).sort(() => Math.random() - 0.5); // Shuffle
}
```

---

## 7. Progressive Web App (PWA)

### 7.1 Service Worker Strategy

```typescript
// service-worker.ts (using Workbox)
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache app shell
precacheAndRoute(self.__WB_MANIFEST);

// Cache audio files (Cache First)
registerRoute(
    ({ request }) => request.destination === 'audio',
    new CacheFirst({
        cacheName: 'audio-cache',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
            }),
        ],
    })
);

// Cache API responses (Network First)
registerRoute(
    ({ url }) => url.pathname.startsWith('/api/'),
    new NetworkFirst({
        cacheName: 'api-cache',
        networkTimeoutSeconds: 3,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 5 * 60, // 5 minutes
            }),
        ],
    })
);

// Cache images (Stale While Revalidate)
registerRoute(
    ({ request }) => request.destination === 'image',
    new StaleWhileRevalidate({
        cacheName: 'image-cache',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
            }),
        ],
    })
);

// Background Sync for offline listening history
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-listening-history') {
        event.waitUntil(syncListeningHistory());
    }
});

async function syncListeningHistory() {
    const offlineHistory = await db.offlineHistory
        .where('wasSynced')
        .equals(0)
        .toArray();
    
    if (offlineHistory.length > 0) {
        await fetch('/api/history/bulk', {
            method: 'POST',
            body: JSON.stringify(offlineHistory),
        });
        
        // Mark as synced
        await db.offlineHistory
            .where('id')
            .anyOf(offlineHistory.map(h => h.id))
            .modify({ wasSynced: 1 });
    }
}
```

### 7.2 Manifest Configuration

```json
{
    "name": "Smart Music Player",
    "short_name": "MusicPlayer",
    "description": "Personal music player with smart recommendations",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#000000",
    "theme_color": "#1DB954",
    "orientation": "portrait",
    "icons": [
        {
            "src": "/icons/icon-72x72.png",
            "sizes": "72x72",
            "type": "image/png"
        },
        {
            "src": "/icons/icon-96x96.png",
            "sizes": "96x96",
            "type": "image/png"
        },
        {
            "src": "/icons/icon-128x128.png",
            "sizes": "128x128",
            "type": "image/png"
        },
        {
            "src": "/icons/icon-144x144.png",
            "sizes": "144x144",
            "type": "image/png"
        },
        {
            "src": "/icons/icon-152x152.png",
            "sizes": "152x152",
            "type": "image/png"
        },
        {
            "src": "/icons/icon-192x192.png",
            "sizes": "192x192",
            "type": "image/png"
        },
        {
            "src": "/icons/icon-384x384.png",
            "sizes": "384x384",
            "type": "image/png"
        },
        {
            "src": "/icons/icon-512x512.png",
            "sizes": "512x512",
            "type": "image/png"
        }
    ],
    "categories": ["music", "entertainment"],
    "shortcuts": [
        {
            "name": "Play Music",
            "short_name": "Play",
            "description": "Start playing music",
            "url": "/play",
            "icons": [{ "src": "/icons/play.png", "sizes": "192x192" }]
        },
        {
            "name": "Library",
            "short_name": "Library",
            "description": "Browse your music library",
            "url": "/library",
            "icons": [{ "src": "/icons/library.png", "sizes": "192x192" }]
        }
    ]
}
```

---

## 8. Development Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Goal**: Basic playback and library management

#### Week 1-2: Project Setup & Authentication
- [ ] Initialize frontend (Vite + React + TypeScript + TailwindCSS)
- [ ] Initialize backend (Express + TypeScript + Prisma)
- [ ] Setup PostgreSQL database
- [ ] Implement user authentication (register, login, JWT)
- [ ] Create basic UI layout (header, sidebar, player bar)
- [ ] Setup IndexedDB with Dexie.js

#### Week 3-4: Audio Player & Upload
- [ ] Implement file upload component (drag & drop)
- [ ] Extract metadata using music-metadata-browser
- [ ] Store audio files in IndexedDB
- [ ] Create audio player with Howler.js
- [ ] Implement playback controls (play, pause, seek, volume)
- [ ] Add progress bar with time display
- [ ] Sync song metadata with backend

**Deliverables**:
- Working authentication system
- File upload with metadata extraction
- Basic audio player with controls
- Local song storage in IndexedDB

### Phase 2: Library & Playlists (Weeks 5-8)

**Goal**: Complete library management and playlist system

#### Week 5-6: Library Features
- [ ] Song list view with search/filter
- [ ] Album view (group by album)
- [ ] Artist view (group by artist)
- [ ] Genre filtering
- [ ] Sort options (title, artist, date added)
- [ ] Batch operations (delete multiple songs)

#### Week 7-8: Playlist System
- [ ] Create/edit/delete playlists
- [ ] Add/remove songs from playlists
- [ ] Drag-and-drop reordering
- [ ] Playlist cover image upload
- [ ] System playlists (Favorites, Recently Played)
- [ ] Playlist details page
- [ ] Playlist sharing (export/import)

**Deliverables**:
- Complete library browsing interface
- Fully functional playlist management
- Search and filtering capabilities

### Phase 3: Smart Features (Weeks 9-12)

**Goal**: Recommendation engine and intelligent playlists

#### Week 9-10: Listening History & Analytics
- [ ] Record listening sessions (play, skip, completion)
- [ ] Background sync for offline history
- [ ] Statistics calculation (weekly, monthly)
- [ ] Most played songs/artists dashboard
- [ ] Listening trends visualization

#### Week 11-12: Recommendations
- [ ] Habit Mix algorithm implementation
- [ ] Similar songs recommendation
- [ ] Mood-based playlist generation
- [ ] Time-based playlists (morning, evening, night)
- [ ] Skip intelligence (learn from skips)
- [ ] Instant playlist generator (text prompt)

**Deliverables**:
- Working recommendation engine
- System-generated playlists
- Statistics dashboard

### Phase 4: Social Features (Weeks 13-16)

**Goal**: Friend system and social interactions

#### Week 13-14: Friend System
- [ ] Send/accept friend requests
- [ ] Friend list management
- [ ] Privacy settings (who can see your activity)
- [ ] Block/unblock users

#### Week 15-16: Social Interactions
- [ ] Real-time "Now Playing" status (Socket.io)
- [ ] Activity feed (friend's music activity)
- [ ] View friend's public playlists
- [ ] Copy friend's playlists
- [ ] Friend Habit Mix generation
- [ ] Community playlists (public playlists)

**Deliverables**:
- Complete friend system
- Real-time activity updates
- Social music discovery features

### Phase 5: PWA & Optimization (Weeks 17-20)

**Goal**: Mobile experience and performance optimization

#### Week 17-18: PWA Implementation
- [ ] Configure service worker with Workbox
- [ ] Implement offline support
- [ ] Add to home screen prompt
- [ ] Background playback support
- [ ] Lock screen controls (Media Session API)
- [ ] Push notifications for friend activity

#### Week 19-20: Optimization & Polish
- [ ] Performance optimization (lazy loading, code splitting)
- [ ] Responsive design refinement
- [ ] Loading states and skeleton screens
- [ ] Error handling and user feedback
- [ ] Accessibility improvements (WCAG 2.1)
- [ ] Cross-browser testing

**Deliverables**:
- Fully functional PWA
- Optimized performance
- Mobile-ready interface

### Phase 6: External Integration (Weeks 21-24)

**Goal**: YouTube and SoundCloud integration

#### Week 21-22: YouTube Integration
- [ ] YouTube Data API integration
- [ ] Search YouTube songs
- [ ] Play YouTube audio in player
- [ ] Add YouTube songs to playlists
- [ ] Handle API rate limits

#### Week 23-24: Additional Features
- [ ] SoundCloud integration
- [ ] Trending songs from social media
- [ ] Audio equalizer
- [ ] Visualizer (frequency bars)
- [ ] Sleep timer
- [ ] Crossfade between songs

**Deliverables**:
- External music streaming support
- Enhanced player features
- Trending music discovery

### Phase 7: Polish & Launch (Weeks 25-28)

**Goal**: Production readiness

#### Week 25-26: Testing & Bug Fixes
- [ ] Comprehensive testing (unit, integration, e2e)
- [ ] Security audit
- [ ] Performance profiling
- [ ] Bug fixing
- [ ] Documentation

#### Week 27-28: Deployment & Launch
- [ ] Setup production infrastructure
- [ ] CI/CD pipeline
- [ ] Monitoring and logging (Sentry)
- [ ] Beta testing with users
- [ ] Launch preparations
- [ ] Marketing materials

**Deliverables**:
- Production-ready application
- Deployed and accessible
- Documentation complete

---

## 9. Technical Considerations

### 9.1 File Storage Strategy

**Option A: Hybrid Storage (Recommended)**
- Store files in IndexedDB (up to 1GB per user)
- Offer optional cloud backup (AWS S3 or Firebase)
- Users choose which songs to sync to cloud

**Option B: Cloud-First**
- Store all files in S3 with CDN
- Cache frequently played songs locally
- Higher infrastructure costs

**Option C: Fully Local**
- All files in IndexedDB only
- No cloud storage
- Limited to browser storage quota

**Recommendation**: Start with Option A for flexibility

### 9.2 Metadata Extraction

Use `music-metadata-browser` library in Web Worker to avoid blocking UI:

```typescript
// workers/metadata-extractor.worker.ts
import * as mm from 'music-metadata-browser';

self.onmessage = async (e: MessageEvent) => {
    const file: File = e.data.file;
    
    try {
        const metadata = await mm.parseBlob(file);
        
        const songData = {
            title: metadata.common.title || file.name,
            artist: metadata.common.artist || 'Unknown Artist',
            album: metadata.common.album || 'Unknown Album',
            genre: metadata.common.genre?.[0] || 'Unknown',
            year: metadata.common.year || null,
            duration: metadata.format.duration || 0,
            trackNumber: metadata.common.track?.no || null,
            format: metadata.format.container || 'unknown',
            bitrate: metadata.format.bitrate || null,
            sampleRate: metadata.format.sampleRate || null,
            coverArt: metadata.common.picture?.[0] || null,
        };
        
        self.postMessage({ success: true, data: songData });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};
```

### 9.3 Audio Features Extraction

For advanced recommendations, extract audio features using Web Audio API:

```typescript
async function extractAudioFeatures(audioBuffer: AudioBuffer): Promise<AudioFeatures> {
    const audioContext = new AudioContext();
    const source = audioContext.createBufferSource();
    const analyser = audioContext.createAnalyser();
    
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    
    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Extract features
    analyser.getByteFrequencyData(dataArray);
    
    // Calculate tempo (BPM) using beat detection
    const tempo = detectTempo(audioBuffer);
    
    // Calculate energy (RMS of signal)
    const energy = calculateEnergy(dataArray);
    
    // Calculate spectral properties
    const spectralCentroid = calculateSpectralCentroid(dataArray);
    
    return {
        tempo,
        energy,
        spectralCentroid,
        // Additional features...
    };
}
```

### 9.4 Performance Optimization

1. **Lazy Loading**: Load songs on-demand
2. **Virtual Scrolling**: For large song lists (react-window)
3. **Image Optimization**: WebP format, lazy loading
4. **Code Splitting**: Route-based splitting
5. **Debouncing**: Search input, progress bar updates
6. **Memoization**: React.memo for expensive components
7. **Web Workers**: Metadata extraction, audio analysis
8. **IndexedDB Indexing**: Proper indexes for queries

### 9.5 Security Best Practices

1. **Authentication**:
   - JWT with short expiry (15 min access, 7 day refresh)
   - HttpOnly cookies for refresh tokens
   - CSRF protection

2. **File Upload**:
   - Validate file types (magic number check)
   - Limit file sizes (max 50MB per song)
   - Scan for malware (ClamAV)

3. **API Security**:
   - Rate limiting (express-rate-limit)
   - Input validation (Zod)
   - SQL injection prevention (Prisma ORM)
   - XSS prevention (sanitize inputs)

4. **Data Privacy**:
   - GDPR compliance
   - User data export feature
   - Account deletion with data cleanup
   - Encryption at rest for sensitive data

### 9.6 Scalability Considerations

1. **Database**:
   - Connection pooling
   - Read replicas for analytics
   - Partitioning for listening_history table

2. **Caching**:
   - Redis for session storage
   - Cache recommendations (TTL: 1 hour)
   - Cache user statistics (TTL: 5 minutes)

3. **Background Jobs**:
   - Bull queue for async tasks
   - Generate statistics daily (cron job)
   - Update recommendations periodically

4. **CDN**:
   - CloudFront or Cloudflare for static assets
   - Edge caching for API responses

---

## 10. Testing Strategy

### 10.1 Frontend Testing

```typescript
// Example: AudioPlayer component test
import { render, screen, fireEvent } from '@testing-library/react';
import { AudioPlayer } from './AudioPlayer';

describe('AudioPlayer', () => {
    it('should play song when play button is clicked', () => {
        const mockSong = {
            id: '1',
            title: 'Test Song',
            artist: 'Test Artist',
        };
        
        render(<AudioPlayer song={mockSong} />);
        
        const playButton = screen.getByRole('button', { name: /play/i });
        fireEvent.click(playButton);
        
        expect(playButton).toHaveAttribute('aria-label', 'pause');
    });
});
```

### 10.2 Backend Testing

```typescript
// Example: Playlist API test
import request from 'supertest';
import app from '../app';

describe('POST /playlists', () => {
    it('should create a new playlist', async () => {
        const response = await request(app)
            .post('/api/playlists')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
                name: 'My Playlist',
                description: 'Test playlist',
            });
        
        expect(response.status).toBe(201);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.name).toBe('My Playlist');
    });
});
```

### 10.3 E2E Testing

Use Playwright for critical user flows:

```typescript
import { test, expect } from '@playwright/test';

test('user can upload and play a song', async ({ page }) => {
    await page.goto('/');
    
    // Login
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Upload song
    await page.setInputFiles('input[type="file"]', 'test-song.mp3');
    await expect(page.locator('.song-item')).toContainText('test-song');
    
    // Play song
    await page.click('.song-item .play-button');
    await expect(page.locator('.player')).toContainText('Playing');
});
```

---

## 11. Deployment Architecture

### 11.1 Infrastructure (Initial)

```
┌─────────────────────────────────────────────────────────┐
│                   Cloudflare / Vercel                    │
│                   (Frontend + CDN)                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   Railway / Render                       │
│                   (Node.js Backend)                      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────┬──────────────────┬──────────────────┐
│   PostgreSQL     │      Redis       │    S3 Storage    │
│   (Supabase)     │   (Upstash)      │   (Optional)     │
└──────────────────┴──────────────────┴──────────────────┘
```

### 11.2 Environment Variables

```env
# Frontend (.env)
VITE_API_URL=https://api.smartmusicplayer.com
VITE_SOCKET_URL=wss://api.smartmusicplayer.com
VITE_YOUTUBE_API_KEY=your_key_here

# Backend (.env)
DATABASE_URL=postgresql://user:pass@host:5432/dbname
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=smart-music-player
YOUTUBE_API_KEY=your_key_here
NODE_ENV=production
PORT=3000
```

---

## 12. Monitoring & Analytics

### 12.1 Application Monitoring

- **Sentry**: Error tracking and performance monitoring
- **LogRocket**: Session replay for debugging
- **Google Analytics**: User behavior tracking
- **Mixpanel**: Product analytics (feature usage)

### 12.2 Key Metrics to Track

**User Engagement**:
- Daily/Monthly Active Users (DAU/MAU)
- Average session duration
- Songs played per session
- Playlist creation rate

**Technical Performance**:
- API response times
- Error rates
- Page load times
- Audio playback failures
- Service worker cache hit rate

**Feature Usage**:
- Recommendation click-through rate
- Social feature engagement
- Upload frequency
- Playlist sharing rate

---

## 13. Legal Considerations

### 13.1 Licensing

1. **Personal Library**: Users uploading their own files is generally legal
2. **YouTube/SoundCloud**: Use official APIs, respect ToS
3. **Lyrics**: License from Genius or LyricFind if displaying lyrics
4. **Cover Art**: Use user-uploaded or fetch from MusicBrainz (CC licensed)

### 13.2 Terms of Service

Must include:
- User responsibility for uploaded content
- Copyright infringement policy
- Data privacy policy (GDPR/CCPA)
- Age restrictions (13+)

### 13.3 DMCA Compliance

- Implement DMCA takedown procedure
- Designate DMCA agent
- Remove infringing content promptly

---

## 14. Next Steps

### Immediate Actions (Week 1)

1. **Setup Development Environment**:
   ```bash
   # Frontend
   npm create vite@latest smart-music-player -- --template react-ts
   cd smart-music-player
   npm install
   
   # Backend
   mkdir backend && cd backend
   npm init -y
   npm install express typescript @types/express prisma
   npx tsc --init
   ```

2. **Create GitHub Repository**:
   - Initialize git
   - Create .gitignore
   - Setup branch protection
   - Configure CI/CD

3. **Design Database Schema**:
   - Create Prisma schema from provided SQL
   - Run initial migration

4. **Create Basic UI Mockups**:
   - Sketch main layouts
   - Define color palette
   - Choose fonts

5. **Setup Project Management**:
   - Create Trello/Linear board
   - Break down Phase 1 into tasks
   - Estimate time for each task

### Learning Resources

**Frontend**:
- React TypeScript: https://react-typescript-cheatsheet.netlify.app/
- Zustand: https://docs.pmnd.rs/zustand/getting-started/introduction
- Howler.js: https://howlerjs.com/
- PWA: https://web.dev/progressive-web-apps/

**Backend**:
- Express + TypeScript: https://blog.logrocket.com/how-to-set-up-node-typescript-express/
- Prisma: https://www.prisma.io/docs/getting-started
- JWT Auth: https://jwt.io/introduction

**Audio Processing**:
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- music-metadata: https://github.com/borewit/music-metadata

---

## 15. Risk Assessment & Mitigation

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Browser storage limits | High | Medium | Implement cloud backup option |
| Audio format compatibility | Medium | Low | Test on multiple browsers, use Howler.js |
| YouTube API rate limits | Medium | High | Implement caching, request quota increase |
| Performance with large libraries | High | Medium | Virtual scrolling, pagination, lazy loading |
| Service worker bugs | High | Low | Thorough testing, gradual rollout |

### Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Copyright issues | High | Medium | Clear ToS, DMCA compliance, legal review |
| Low user adoption | Medium | Medium | MVP validation, user feedback, marketing |
| Infrastructure costs | Medium | Low | Start with free tier, scale gradually |
| Competition from Spotify | Low | High | Focus on privacy, local storage, no ads |

---

## 16. Success Criteria

### Phase 1 Success Metrics
- [ ] Users can upload and play songs
- [ ] Playlists can be created and managed
- [ ] Basic player controls work reliably
- [ ] Songs persist in IndexedDB

### Phase 3 Success Metrics
- [ ] Habit Mix generates relevant songs
- [ ] Skip intelligence improves recommendations
- [ ] Statistics dashboard shows accurate data

### Phase 5 Success Metrics
- [ ] PWA can be installed on mobile
- [ ] Background playback works
- [ ] Offline mode functional
- [ ] Lock screen controls work

### Overall Success (6 months)
- [ ] 100+ active users
- [ ] Average 30+ minutes session duration
- [ ] <1% error rate
- [ ] 90%+ recommendation satisfaction rate

---

## Conclusion

This architecture provides a solid foundation for building a feature-rich, scalable music player. The modular design allows you to implement features incrementally while maintaining code quality and performance.

**Key Takeaways**:
1. Start with core playback functionality (Phase 1-2)
2. Build recommendation engine early (Phase 3) for competitive advantage
3. PWA features are critical for mobile experience (Phase 5)
4. Monitor performance and user behavior from day one
5. Stay compliant with copyright laws

**Estimated Timeline**: 6-7 months for full feature set
**Team Size**: 1-2 developers (intermediate level)
**Budget**: $0-200/month (using free tiers initially)

Good luck with your project! Feel free to ask questions as you progress through each phase.
