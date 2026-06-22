# Groove — Smart Music Player

> Your personal music library, made intelligent. Local-first, offline-capable, and actually learns what you like.

**🌐 Live Demo: [groove-smart-music-player.vercel.app](https://groove-smart-music-player.vercel.app)**

---

## What It Is

Groove is a Progressive Web App that turns your music library into a smart, personalized listening experience. It runs entirely in the browser, stores your music files locally using IndexedDB, works offline, and builds a genuine understanding of your listening habits over time — without sending your files anywhere.

The core idea: you shouldn't need a subscription to have a music player that actually knows what you want to hear.

---

## Features

### 🎵 Audio Player
- Full playback controls — play, pause, seek, volume, shuffle, repeat
- Built on **Howler.js** for cross-browser audio reliability
- Lock screen and notification controls via the **Media Session API**
- Crossfade between tracks
- Audio visualizer (frequency bars)
- Sleep timer

### 📥 Music Acquisition & Library Pipeline

Groove doesn't just play music — it manages the complete lifecycle of discovering, importing, storing, organizing, and recommending songs.

**Local File Import**
- Drag-and-drop upload with multi-file batch import
- Supports MP3, WAV, FLAC, M4A, AAC, and OGG
- Files stored locally in IndexedDB for offline playback

**Online Song Search**
- Search songs, albums, artists, and playlists
- Real-time search suggestions
- Unified search interface across multiple providers

**Song Download Pipeline**

When a user downloads a song, Groove runs a structured 9-step pipeline:

```
1. User searches for a track
2. Groove fetches matching results from configured providers
3. User selects a song
4. Audio stream is retrieved
5. Metadata is extracted
6. Cover artwork is downloaded
7. Song is stored locally in IndexedDB
8. Library indexes are updated
9. Recommendation engine receives updated listening data
```

Downloaded songs behave exactly like locally uploaded tracks — same offline availability, same recommendation signals, same library management.

### 🎼 Metadata Processing Engine

Every imported song passes through a metadata enrichment pipeline that extracts:

- Title, Artist, Album, Genre
- Duration, Release Year, Track Number
- Album Artwork
- Embedded ID3 Tags

Metadata extraction runs inside dedicated **Web Workers** using `music-metadata-browser` with background processing queues — large batch imports never block the UI.

### 📁 Local Library Management
- Browse by song, album, artist, or genre
- Search and filter across your entire library
- Batch operations
- Duplicate detection

### 🔄 Library Synchronization

Whenever a new song is added, Groove keeps everything in sync automatically:

```
Song stored locally → Metadata indexed → Search index updated
→ Playlist references updated → Recommendation scores recalculated
→ Listening analytics refreshed
```

### 📋 Playlists
- Create, edit, and delete playlists
- Drag-and-drop reordering
- Playlist cover image upload
- System playlists: Favorites, Recently Played
- Collaborative playlists with friends
- Smart playlist rules

### 🧠 Recommendation Engine

Groove continuously learns from user behavior through a structured data pipeline:

```
User Activity → Behavior Collection → Feature Extraction
→ Scoring Engine → Habit Mix Calculation → Personalized Recommendations
```

The engine updates incrementally rather than recalculating the entire library each time, ensuring it stays fast even for large collections.

**Signals tracked:**
- Play count, skip count, completion percentage
- Repeat frequency
- Time of day
- Playlist additions, favorites
- Listening session context

**Habit Mix** — scores your songs by actual listening behavior:
```
habit_score = (play_count × 0.4) + (avg_completion × 0.3) + (non_skip_rate × 0.3)
```
Recalculates weekly from your last 30 days of history. Songs you finish score higher than songs you've clicked and skipped.

**Mood-Based Playlists** — maps audio features (tempo, energy, valence, acousticness, danceability) to moods: Happy, Chill, Workout, Sad, Focus.

**Similar Song Recommendations** — cosine similarity across audio feature vectors + Jaccard similarity for genre matching.

**Skip Intelligence** — tracks skip events with timestamps. Songs skipped before 30% completion are down-weighted significantly.

**Time-Based Playlists** — morning, evening, and night profiles generated automatically.

### 📊 Listening Statistics
- Weekly and monthly listening summaries
- Most played songs and artists
- Listening trends over time
- Per-song stats: total plays, average completion, skip rate

### 👥 Social Features
- Friend system with follow/accept
- Real-time "Now Playing" status via **Socket.io**
- Activity feed showing what friends are listening to
- View and copy friends' public playlists
- Friend Habit Mix — a shared playlist based on music both of you actually listen to
- Shared listening rooms
- Live collaborative playlists
- Playlist sharing links
- Privacy controls

### 📱 PWA — Installable, Offline-First

Groove is built offline-first. Core playback works without internet.

**IndexedDB stores everything locally:**
- Audio files
- Song metadata and album artwork
- User playlists
- Listening history
- Recommendation cache
- Recently played tracks

**Benefits:** works without internet, fast local playback, reduced network usage, user retains ownership of music files.

**PWA features:**
- Installable on mobile and desktop
- Service worker with **Workbox** for intelligent caching strategies
- Background sync — listening history queues offline and syncs when you reconnect
- Background audio playback
- Lock screen controls

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool |
| Zustand | State management |
| React Router v6 | Routing |
| TailwindCSS | Styling |
| Howler.js | Cross-browser audio engine |
| Dexie.js | IndexedDB wrapper for local storage |
| music-metadata-browser | ID3 tag extraction (Web Worker) |
| Workbox | Service worker / PWA caching |
| Socket.io client | Real-time friend activity |

### Backend
| Technology | Purpose |
|---|---|
| Node.js 20 + Express | API server |
| TypeScript | Type safety |
| PostgreSQL 15 | Primary database |
| Prisma | Type-safe ORM |
| Redis | Session cache + real-time pub/sub |
| Passport.js | Authentication |
| Bull | Background job queue |
| Socket.io | WebSocket server |

### Infrastructure
- **Frontend**: Vercel
- **Backend**: Railway / Render
- **Database**: Supabase (PostgreSQL)
- **Cache**: Upstash (Redis)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser/PWA)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   React UI   │  │  Howler.js   │  │   IndexedDB     │  │
│  │  + Zustand   │  │ Audio Engine │  │  (Audio Files)  │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Service     │  │  Web Workers │  │  Cache Storage  │  │
│  │  Worker/PWA  │  │  (Metadata)  │  │  (Offline Data) │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ REST API + WebSocket
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Auth (JWT)  │  │  Recommend.  │  │  Social         │  │
│  │  + Passport  │  │  Engine      │  │  (Socket.io)    │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL (metadata, history, social) │ Redis (cache/RT)  │
└─────────────────────────────────────────────────────────────┘
```

**Design principles:**
- **Offline-first** — core playback works with zero network
- **Privacy-centric** — music files stay local in IndexedDB by default
- **Progressive enhancement** — features degrade gracefully when offline
- **Incremental updates** — recommendation engine updates on new data, not full recalculation

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis

### Installation

```bash
# Clone the repo
git clone https://github.com/Abhishekog19/GrooveWeb.git
cd GrooveWeb

# Install frontend dependencies
npm install

# Install backend dependencies
cd Smusic-backend && npm install && cd ..

# Set up environment variables
cp .env.example .env
# Fill in your values

# Run database migrations
cd Smusic-backend && npx prisma migrate dev && cd ..

# Start both servers
npm run dev                           # Frontend on :5173
cd Smusic-backend && npm run dev      # Backend on :5000
```

### Environment Variables

```env
# Frontend
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=ws://localhost:5000

# Backend
DATABASE_URL=postgresql://user:pass@localhost:5432/groove
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
PORT=5000
NODE_ENV=development
```

---

## Project Structure

```
GrooveWeb/
├── src/
│   ├── components/
│   │   ├── audio/          # AudioPlayer, PlaybackControls, ProgressBar, Visualizer
│   │   ├── library/        # SongList, SongCard, AlbumGrid, ArtistList
│   │   ├── playlist/       # PlaylistCard, PlaylistEditor, PlaylistDetails
│   │   ├── social/         # FriendsList, ActivityFeed, NowPlaying
│   │   └── common/         # Button, Modal, SearchBar, Toast
│   ├── features/
│   │   ├── player/         # Hooks, services, Zustand store
│   │   ├── library/        # Import pipeline, metadata processing
│   │   ├── recommendations/# Scoring engine, mood profiles, skip intelligence
│   │   └── social/         # Friend system, real-time activity
│   ├── lib/
│   │   ├── audio/          # Howler.js wrapper, visualizer, metadata
│   │   ├── db/             # Dexie.js IndexedDB setup + migrations
│   │   └── hooks/          # useAudioPlayer, useMediaSession, useOnlineStatus
│   ├── pages/              # Home, Library, Playlists, Discover, Friends, Stats
│   └── workers/            # metadata-extractor.worker.ts, audio-processor.worker.ts
├── Smusic-backend/
│   ├── src/
│   │   ├── routes/         # auth, songs, playlists, recommendations, social, stats
│   │   ├── services/       # recommendation engine, analytics, socket events
│   │   └── prisma/         # Schema and migrations
└── dist/                   # Production build
```

---

## API Overview

**Auth** — register, login, refresh token, logout

**Songs** — CRUD, search, bulk upload, similar-song lookup

**Playlists** — create/edit/delete, add/remove/reorder, system playlists (Habit Mix, mood-based, time-based)

**History** — record listening sessions, bulk sync offline history

**Recommendations** — personalized feed, similar-to-song, mood-based, time-based, instant playlist from text prompt

**Social** — friend requests, friend activity, public playlists, community playlists, shared rooms

**Stats** — weekly/monthly summaries, top songs/artists, listening trends

**WebSocket Events** — `friend:now_playing`, `friend:online`, `friend:offline`, `notification:new`

---

## Screenshots

*Coming soon.*

---

## Roadmap

**Recommendations**
- AI-generated playlists from natural language prompts
- Cross-user collaborative filtering
- Better mood detection using Web Audio API feature extraction

**Social**
- Shared listening rooms
- Live friend activity feed
- Playlist sharing links

**Music Management**
- Automatic artwork enhancement
- Lyrics synchronization
- Smart playlist rules engine

**Performance**
- Faster metadata indexing for large imports
- Streaming cache optimization
- Background recommendation pre-computation

---

## Author

**Abhishek** — [@Abhishekog19](https://github.com/Abhishekog19)
