# Copy-Paste Starter Code Templates

Use these templates to quickly set up your core files. Copy and paste directly into your project.

---

## 1. Install Commands (Run First)

```bash
npm install zustand react-router-dom howler dexie music-metadata-browser axios clsx date-fns
npm install -D @types/howler
```

---

## 2. Main App Setup

### `src/main.jsx`
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

### `src/App.jsx`
```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Library from './pages/Library';
import Player from './pages/Player';
import Playlists from './pages/Playlists';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useLibraryStore } from './store/libraryStore';

function App() {
  // Initialize audio player
  useAudioPlayer();
  
  // Load songs on app start
  const fetchSongs = useLibraryStore((state) => state.fetchSongs);
  
  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);
  
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/library" replace />} />
          <Route path="library" element={<Library />} />
          <Route path="player" element={<Player />} />
          <Route path="playlists" element={<Playlists />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### `src/components/Layout.jsx`
```jsx
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import MiniPlayer from './player/MiniPlayer';

export default function Layout() {
  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="pb-24">
        <Outlet />
      </main>
      <MiniPlayer />
    </div>
  );
}
```

### `src/components/Navigation.jsx`
```jsx
import { NavLink } from 'react-router-dom';

export default function Navigation() {
  const navItems = [
    { path: '/library', label: 'LIBRARY' },
    { path: ' /player', label: 'PLAYER' },
    { path: '/playlists', label: 'PLAYLISTS' },
  ];
  
  return (
    <nav className="max-w-7xl mx-auto mb-8 flex items-center justify-between p-8">
      <h1 className="text-5xl font-bold text-orange-900">GROOVE</h1>
      <div className="flex gap-6">
        {navItems.map(({ path, label }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `text-xl px-6 py-2 transition-all ${
                isActive
                  ? 'bg-orange-600 text-white'
                  : 'text-orange-800 hover:text-orange-600'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
```

---

## 3. Zustand Stores (Copy All Three)

### `src/store/playerStore.js`
```javascript
import { create } from 'zustand';

export const usePlayerStore = create((set, get) => ({
  // State
  currentSong: null,
  queue: [],
  isPlaying: false,
  volume: 0.7,
  currentTime: 0,
  duration: 0,
  repeat: 'none',
  shuffle: false,
  
  // Actions
  setCurrentSong: (song) => set({ currentSong: song }),
  setQueue: (songs) => set({ queue: songs }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setVolume: (volume) => set({ volume }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  
  nextSong: () => {
    const { queue, currentSong } = get();
    if (!currentSong || queue.length === 0) return;
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    const nextIndex = (currentIndex + 1) % queue.length;
    set({ currentSong: queue[nextIndex] });
  },
  
  previousSong: () => {
    const { queue, currentSong, currentTime } = get();
    if (!currentSong || queue.length === 0) return;
    
    if (currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }
    
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    const prevIndex = currentIndex - 1;
    
    if (prevIndex >= 0) {
      set({ currentSong: queue[prevIndex] });
    }
  },
  
  playSong: (song, queue = []) => {
    set({
      currentSong: song,
      queue: queue.length > 0 ? queue : [song],
      isPlaying: true
    });
  },
}));
```

### `src/store/libraryStore.js`
```javascript
import { create } from 'zustand';
import { db } from '../lib/db/indexedDB';

export const useLibraryStore = create((set, get) => ({
  songs: [],
  isLoading: false,
  searchQuery: '',
  
  fetchSongs: async () => {
    set({ isLoading: true });
    try {
      const songs = await db.songs.toArray();
      set({ songs, isLoading: false });
    } catch (error) {
      console.error('Error fetching songs:', error);
      set({ isLoading: false });
    }
  },
  
  addSong: (song) => {
    set((state) => ({ songs: [...state.songs, song] }));
  },
  
  removeSong: async (songId) => {
    try {
      await db.songs.delete(songId);
      await db.audioFiles.where('songId').equals(songId).delete();
      set((state) => ({
        songs: state.songs.filter(s => s.id !== songId)
      }));
    } catch (error) {
      console.error('Error removing song:', error);
    }
  },
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  getFilteredSongs: () => {
    const { songs, searchQuery } = get();
    if (!searchQuery) return songs;
    
    const query = searchQuery.toLowerCase();
    return songs.filter(song =>
      song.title.toLowerCase().includes(query) ||
      song.artist.toLowerCase().includes(query) ||
      song.album.toLowerCase().includes(query)
    );
  },
}));
```

### `src/store/playlistStore.js`
```javascript
import { create } from 'zustand';
import { db } from '../lib/db/indexedDB';

export const usePlaylistStore = create((set) => ({
  playlists: [],
  isLoading: false,
  
  fetchPlaylists: async () => {
    set({ isLoading: true });
    try {
      const playlists = await db.playlists.toArray();
      set({ playlists, isLoading: false });
    } catch (error) {
      console.error('Error fetching playlists:', error);
      set({ isLoading: false });
    }
  },
  
  createPlaylist: async (name, description = '') => {
    try {
      const id = await db.playlists.add({
        name,
        description,
        songs: [],
        createdAt: new Date(),
      });
      const newPlaylist = { id, name, description, songs: [], createdAt: new Date() };
      set((state) => ({ playlists: [...state.playlists, newPlaylist] }));
      return newPlaylist;
    } catch (error) {
      console.error('Error creating playlist:', error);
      throw error;
    }
  },
}));
```

---

## 4. IndexedDB Setup

### `src/lib/db/indexedDB.js`
```javascript
import Dexie from 'dexie';

export const db = new Dexie('SmartMusicPlayer');

db.version(1).stores({
  songs: '++id, title, artist, album, genre, dateAdded',
  audioFiles: '++id, songId, blob',
  playlists: '++id, name, createdAt',
});

export async function saveSongWithAudio(songData, audioBlob) {
  try {
    const songId = await db.songs.add(songData);
    await db.audioFiles.add({ songId, blob: audioBlob });
    return songId;
  } catch (error) {
    console.error('Error saving song:', error);
    throw error;
  }
}

export async function getAudioBlob(songId) {
  try {
    const audioFile = await db.audioFiles
      .where('songId')
      .equals(songId)
      .first();
    return audioFile?.blob;
  } catch (error) {
    console.error('Error getting audio blob:', error);
    return null;
  }
}
```

---

## 5. Audio Player Integration

### `src/lib/audio/audioPlayer.js`
```javascript
import { Howl, Howler } from 'howler';
import { getAudioBlob } from '../db/indexedDB';

class AudioPlayerManager {
  constructor() {
    this.sound = null;
    this.onPlay = null;
    this.onPause = null;
    this.onEnd = null;
    this.onTimeUpdate = null;
  }
  
  async loadSong(songId) {
    try {
      this.stop();
      const audioBlob = await getAudioBlob(songId);
      if (!audioBlob) throw new Error('Audio file not found');
      
      const audioUrl = URL.createObjectURL(audioBlob);
      
      this.sound = new Howl({
        src: [audioUrl],
        html5: true,
        onplay: () => {
          this.startTimeUpdate();
          this.onPlay?.();
        },
        onpause: () => {
          this.stopTimeUpdate();
          this.onPause?.();
        },
        onend: () => {
          this.stopTimeUpdate();
          this.onEnd?.();
        },
      });
      
      return true;
    } catch (error) {
      console.error('Error loading song:', error);
      return false;
    }
  }
  
  play() {
    if (this.sound) this.sound.play();
  }
  
  pause() {
    if (this.sound) this.sound.pause();
  }
  
  stop() {
    if (this.sound) {
      this.sound.stop();
      this.sound.unload();
      this.sound = null;
    }
    this.stopTimeUpdate();
  }
  
  seek(time) {
    if (this.sound) this.sound.seek(time);
  }
  
  setVolume(volume) {
    Howler.volume(volume);
  }
  
  getCurrentTime() {
    return this.sound ? this.sound.seek() : 0;
  }
  
  getDuration() {
    return this.sound ? this.sound.duration() : 0;
  }
  
  startTimeUpdate() {
    this.stopTimeUpdate();
    this.timeUpdateInterval = setInterval(() => {
      if (this.sound && this.sound.playing()) {
        this.onTimeUpdate?.(this.getCurrentTime());
      }
    }, 100);
  }
  
  stopTimeUpdate() {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }
}

export const audioPlayer = new AudioPlayerManager();
```

### `src/hooks/useAudioPlayer.js`
```javascript
import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { audioPlayer } from '../lib/audio/audioPlayer';

export function useAudioPlayer() {
  const {
    currentSong,
    isPlaying,
    volume,
    setPlaying,
    setCurrentTime,
    setDuration,
    nextSong,
  } = usePlayerStore();
  
  useEffect(() => {
    if (!currentSong) return;
    
    const loadAndPlay = async () => {
      const loaded = await audioPlayer.loadSong(currentSong.id);
      if (loaded) {
        setDuration(audioPlayer.getDuration());
        if (isPlaying) audioPlayer.play();
      }
    };
    
    loadAndPlay();
    return () => audioPlayer.stop();
  }, [currentSong?.id]);
  
  useEffect(() => {
    if (!currentSong) return;
    if (isPlaying) audioPlayer.play();
    else audioPlayer.pause();
  }, [isPlaying, currentSong]);
  
  useEffect(() => {
    audioPlayer.setVolume(volume);
  }, [volume]);
  
  useEffect(() => {
    audioPlayer.onPlay = () => setPlaying(true);
    audioPlayer.onPause = () => setPlaying(false);
    audioPlayer.onEnd = () => {
      setPlaying(false);
      nextSong();
    };
    audioPlayer.onTimeUpdate = (time) => setCurrentTime(time);
    
    return () => {
      audioPlayer.onPlay = null;
      audioPlayer.onPause = null;
      audioPlayer.onEnd = null;
      audioPlayer.onTimeUpdate = null;
    };
  }, []);
  
  return { seek: (time) => audioPlayer.seek(time) };
}
```

---

## 6. File Upload

### `src/lib/audio/metadataExtractor.js`
```javascript
import * as mm from 'music-metadata-browser';

export async function extractMetadata(file) {
  try {
    const metadata = await mm.parseBlob(file);
    
    let coverArt = null;
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const picture = metadata.common.picture[0];
      const blob = new Blob([picture.data], { type: picture.format });
      coverArt = URL.createObjectURL(blob);
    }
    
    return {
      title: metadata.common.title || file.name.replace(/\.[^/.]+$/, ''),
      artist: metadata.common.artist || 'Unknown Artist',
      album: metadata.common.album || 'Unknown Album',
      genre: metadata.common.genre?.[0] || 'Unknown',
      year: metadata.common.year || null,
      duration: metadata.format.duration || 0,
      format: metadata.format.container || 'unknown',
      coverArt,
      dateAdded: new Date(),
    };
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return {
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      genre: 'Unknown',
      year: null,
      duration: 0,
      format: 'unknown',
      coverArt: null,
      dateAdded: new Date(),
    };
  }
}
```

### `src/hooks/useFileUpload.js`
```javascript
import { useState } from 'react';
import { useLibraryStore } from '../store/libraryStore';
import { extractMetadata } from '../lib/audio/metadataExtractor';
import { saveSongWithAudio } from '../lib/db/indexedDB';

export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const addSong = useLibraryStore((state) => state.addSong);
  
  const uploadFiles = async (files) => {
    setIsUploading(true);
    setProgress(0);
    
    const totalFiles = files.length;
    let processedFiles = 0;
    
    try {
      for (const file of files) {
        if (!file.type.startsWith('audio/')) {
          processedFiles++;
          continue;
        }
        
        const metadata = await extractMetadata(file);
        const songId = await saveSongWithAudio(metadata, file);
        addSong({ ...metadata, id: songId });
        
        processedFiles++;
        setProgress((processedFiles / totalFiles) * 100);
      }
      
      setIsUploading(false);
      return true;
    } catch (error) {
      console.error('Error uploading files:', error);
      setIsUploading(false);
      return false;
    }
  };
  
  return { uploadFiles, isUploading, progress };
}
```

### `src/components/library/UploadButton.jsx`
```jsx
import { useRef } from 'react';
import { Plus } from 'lucide-react';
import { useFileUpload } from '../../hooks/useFileUpload';

export default function UploadButton() {
  const fileInputRef = useRef(null);
  const { uploadFiles, isUploading, progress } = useFileUpload();
  
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      await uploadFiles(files);
      e.target.value = '';
    }
  };
  
  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="bg-orange-600 text-white px-8 py-4 hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
      >
        {isUploading ? (
          <span>Uploading... {Math.round(progress)}%</span>
        ) : (
          <>
            <Plus size={24} />
            Upload Songs
          </>
        )}
      </button>
    </div>
  );
}
```

---

## 7. Mini Player Component

### `src/components/player/MiniPlayer.jsx`
```jsx
import { usePlayerStore } from '../../store/playerStore';
import { Play, Pause, SkipBack, SkipForward, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function MiniPlayer() {
  const navigate = useNavigate();
  const { currentSong, isPlaying, togglePlay, nextSong, previousSong } = usePlayerStore();
  
  if (!currentSong) return null;
  
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-orange-900 border-t-4 border-orange-950 p-4 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-14 h-14 bg-gradient-to-br from-orange-200 to-red-200 border-2 border-orange-950" />
          <div>
            <h4 className="text-xl text-white font-bold">{currentSong.title}</h4>
            <p className="text-orange-200">{currentSong.artist}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button onClick={previousSong} className="text-white hover:text-orange-200">
            <SkipBack size={24} />
          </button>
          <button
            onClick={togglePlay}
            className="bg-orange-600 text-white p-3 hover:bg-orange-700 rounded"
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button onClick={nextSong} className="text-white hover:text-orange-200">
            <SkipForward size={24} />
          </button>
        </div>

        <div className="flex items-center gap-4 flex-1 justify-end">
          <button className="text-white hover:text-orange-200">
            <Heart size={24} />
          </button>
          <button
            onClick={() => navigate('/player')}
            className="text-white hover:text-orange-200 text-sm"
          >
            Expand
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Quick Start Instructions

1. **Create all folders first:**
```bash
mkdir -p src/store src/lib/audio src/lib/db src/hooks src/components/player src/components/library
```

2. **Copy files in this order:**
   - indexedDB.js
   - All 3 stores (playerStore, libraryStore, playlistStore)
   - audioPlayer.js
   - metadataExtractor.js
   - Both hooks (useAudioPlayer, useFileUpload)
   - All components (Layout, Navigation, MiniPlayer, UploadButton)
   - Update App.jsx

3. **Test after each major section:**
   - After stores: Check if state updates in console
   - After IndexedDB: Check Application tab in DevTools
   - After audio: Try playing from console
   - After upload: Upload a song and verify it works

4. **Debug tips:**
   - Add console.logs liberally
   - Check browser console for errors
   - Use React DevTools to inspect state
   - Check IndexedDB in Application tab

---

Ready to start coding! Copy these files and let's build! 🚀
