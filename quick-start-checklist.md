# Smart Music Player - Quick Start Checklist

Use this checklist to track your progress as you build the app.

## 📦 Phase 1: Setup (Day 1)

### Dependencies
- [ ] Install Zustand: `npm install zustand`
- [ ] Install React Router: `npm install react-router-dom`
- [ ] Install Howler: `npm install howler`
- [ ] Install Dexie: `npm install dexie`
- [ ] Install music-metadata: `npm install music-metadata-browser`
- [ ] Install axios: `npm install axios`
- [ ] Install utilities: `npm install clsx date-fns`

### Project Structure
- [ ] Create `src/store/` folder
- [ ] Create `src/lib/` folder
- [ ] Create `src/hooks/` folder
- [ ] Create `src/components/common/` folder
- [ ] Create `src/components/player/` folder
- [ ] Create `src/components/library/` folder

---

## 🎯 Phase 2: State Management (Day 2-3)

### Player Store
- [ ] Create `src/store/playerStore.js`
- [ ] Add state: currentSong, queue, isPlaying, volume
- [ ] Add actions: togglePlay, nextSong, previousSong, setVolume
- [ ] Test: Can you toggle isPlaying state?

### Library Store
- [ ] Create `src/store/libraryStore.js`
- [ ] Add state: songs, isLoading, searchQuery
- [ ] Add actions: fetchSongs, addSong, removeSong
- [ ] Test: Can you add/remove songs from state?

### Playlist Store
- [ ] Create `src/store/playlistStore.js`
- [ ] Add state: playlists
- [ ] Add actions: createPlaylist, deletePlaylist
- [ ] Test: Can you create a playlist?

---

## 💾 Phase 3: IndexedDB (Day 3-4)

### Database Setup
- [ ] Create `src/lib/db/indexedDB.js`
- [ ] Define Dexie database schema
- [ ] Create tables: songs, audioFiles, playlists
- [ ] Test: Open DevTools → Application → IndexedDB (can you see the DB?)

### Helper Functions
- [ ] Create `saveSongWithAudio()` function
- [ ] Create `getAudioBlob()` function
- [ ] Test: Can you save and retrieve a song?

---

## 🎵 Phase 4: Audio Player (Day 4-6)

### Audio Manager
- [ ] Create `src/lib/audio/audioPlayer.js`
- [ ] Implement loadSong() method
- [ ] Implement play(), pause(), seek() methods
- [ ] Implement volume control
- [ ] Test: Can you play a local audio file?

### Audio Hook
- [ ] Create `src/hooks/useAudioPlayer.js`
- [ ] Connect to playerStore
- [ ] Handle song changes
- [ ] Handle play/pause state
- [ ] Test: Does audio play when you toggle isPlaying?

### Integration
- [ ] Add useAudioPlayer() to App.jsx
- [ ] Test: Play a song from browser console: 
  ```js
  usePlayerStore.getState().playSong(yourSong)
  ```

---

## 📤 Phase 5: File Upload (Day 6-7)

### Metadata Extraction
- [ ] Create `src/lib/audio/metadataExtractor.js`
- [ ] Implement extractMetadata() function
- [ ] Extract: title, artist, album, duration, cover art
- [ ] Test: Upload a file and console.log the metadata

### Upload Hook
- [ ] Create `src/hooks/useFileUpload.js`
- [ ] Implement uploadFiles() function
- [ ] Add progress tracking
- [ ] Connect to libraryStore
- [ ] Test: Upload a song and check if it appears in IndexedDB

### Upload Button
- [ ] Create `src/components/library/UploadButton.jsx`
- [ ] Add file input (hidden)
- [ ] Show upload progress
- [ ] Test: Click button, select files, verify they upload

---

## 🔗 Phase 6: Connect Everything (Day 7-10)

### Routing
- [ ] Setup React Router in App.jsx
- [ ] Create Layout component with Navigation
- [ ] Add routes: /library, /player, /playlists
- [ ] Test: Can you navigate between pages?

### Library Page
- [ ] Update Library.jsx to fetch songs on mount
- [ ] Display songs from libraryStore
- [ ] Add search functionality
- [ ] Add UploadButton
- [ ] Test: Can you see uploaded songs?

### Mini Player
- [ ] Create `src/components/player/MiniPlayer.jsx`
- [ ] Show current song info
- [ ] Add play/pause button
- [ ] Add skip buttons
- [ ] Add "Expand" button to go to /player
- [ ] Test: Does mini player appear when song is playing?

### Full Player Page
- [ ] Update Player.jsx with full controls
- [ ] Show progress bar
- [ ] Show volume control
- [ ] Test: Can you control playback from player page?

---

## ✅ Testing Checklist

### Core Functionality
- [ ] Can upload audio files
- [ ] Files are stored in IndexedDB
- [ ] Metadata is extracted correctly
- [ ] Songs appear in library
- [ ] Can search songs
- [ ] Can click a song to play it
- [ ] Audio plays correctly
- [ ] Can pause/resume
- [ ] Progress bar updates in real-time
- [ ] Volume control works
- [ ] Next/Previous buttons work
- [ ] Mini player shows current song
- [ ] Can navigate to full player

### Edge Cases
- [ ] Multiple files upload correctly
- [ ] Files without metadata use filename as title
- [ ] Playing while uploading doesn't break
- [ ] Can play immediately after upload
- [ ] Queue works with shuffle off
- [ ] Repeat modes work correctly

### Browser Testing
- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Mobile responsive

---

## 🐛 Debugging Tips

If something doesn't work:

1. **Check Browser Console**
   - Look for red errors
   - Check for warnings

2. **Check IndexedDB**
   - DevTools → Application → IndexedDB
   - Verify data is saved

3. **Check Zustand State**
   - Install Redux DevTools extension
   - Add to playerStore: `devtools: true`
   - Inspect state changes

4. **Check Network Tab**
   - See if files are loading
   - Check for failed requests

5. **Add Console Logs**
   ```js
   console.log('Current song:', currentSong);
   console.log('Is playing:', isPlaying);
   ```

---

## 🎯 Daily Goals

### Day 1: Setup
- Install all dependencies
- Create folder structure
- Setup routing

### Day 2-3: State
- Create all Zustand stores
- Test state management

### Day 4: Database
- Setup IndexedDB
- Test saving/loading data

### Day 5-6: Audio
- Integrate Howler.js
- Get basic playback working

### Day 7-8: Upload
- Implement file upload
- Extract metadata
- Save to IndexedDB

### Day 9-10: Integration
- Connect all pieces
- Build library view
- Build mini player
- Test end-to-end

---

## 📝 Notes Section

Use this space to track issues, ideas, or things to remember:

```
Example:
- Bug: Audio doesn't play on iPhone Safari
  Solution: Need to add user gesture to start audio
  
- Todo: Add loading spinner when uploading files

- Idea: Add drag-and-drop upload
```

---

## 🎉 Completion Criteria

You're done with MVP when:
- ✅ Can upload audio files
- ✅ Files persist after refresh
- ✅ Can play uploaded songs
- ✅ Playback controls all work
- ✅ Queue/shuffle/repeat work
- ✅ Mini player appears
- ✅ No critical bugs

---

## Next Steps After MVP

- [ ] Add playlist management
- [ ] Implement favorites
- [ ] Add listening history
- [ ] Build statistics dashboard
- [ ] Setup backend (Express + PostgreSQL)
- [ ] Add user authentication
- [ ] Implement recommendations
- [ ] Convert to PWA

---

Keep this checklist open and mark items as you complete them! 🚀
