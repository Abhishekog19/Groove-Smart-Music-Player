import { create } from 'zustand'
import { db } from '../lib/db/indexedDB'
import { deduplicateLibrary, deduplicateStoreList } from '../lib/db/deduplicator'
import { syncLibrary } from '../lib/filesystem/syncLibrary'

// Player Store - manages audio playback state
export const usePlayerStore = create((set, get) => ({
    // State
    currentSong: null,
    queue: [],
    isPlaying: false,
    volume: 0.7,
    repeat: 'none', // 'none' | 'one' | 'all'
    shuffle: false,
    currentTime: 0,
    duration: 0,
    likedSongs: new Set(),
    // Shows re-authorize banner when folder file handles lose permission after reload
    needsFolderPermission: false,
    setNeedsFolderPermission: (val) => set({ needsFolderPermission: val }),

    // Stream error toast — shown when TIDAL mirrors fail to provide audio
    streamError: null, // null | string
    setStreamError: (msg) => set({ streamError: msg }),
    clearStreamError: () => set({ streamError: null }),

    // Actions
    playSong: (song) => {
        const { songs } = useLibraryStore.getState()
        set({ currentSong: song, isPlaying: true, queue: songs, currentTime: 0 })
    },
    playWithQueue: (song, queue) => {
        set({ currentSong: song, isPlaying: true, queue, currentTime: 0 })
    },
    pauseSong: () => set({ isPlaying: false }),
    resumeSong: () => set({ isPlaying: true }),
    setPlaying: (isPlaying) => set({ isPlaying }),
    togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

    setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
    setCurrentTime: (currentTime) => set({ currentTime }),
    setDuration: (duration) => set({ duration }),

    toggleRepeat: () => set((state) => {
        const modes = ['none', 'one', 'all']
        const currentIndex = modes.indexOf(state.repeat)
        return { repeat: modes[(currentIndex + 1) % modes.length] }
    }),

    toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),

    addToQueue: (song) => set((state) => ({ queue: [...state.queue, song] })),

    removeFromQueue: (songId) => set((state) => ({
        queue: state.queue.filter(s => s.id !== songId)
    })),

    toggleLike: (songId) => set((state) => {
        const newLiked = new Set(state.likedSongs)
        if (newLiked.has(songId)) {
            newLiked.delete(songId)
        } else {
            newLiked.add(songId)
        }
        return { likedSongs: newLiked }
    }),

    nextSong: () => {
        const { queue, currentSong, shuffle } = get()
        if (queue.length === 0) return

        const currentIndex = queue.findIndex(s => s.id === currentSong?.id)
        let nextIndex

        if (shuffle) {
            nextIndex = Math.floor(Math.random() * queue.length)
        } else {
            nextIndex = (currentIndex + 1) % queue.length
        }

        set({ currentSong: queue[nextIndex], isPlaying: true, currentTime: 0 })
    },

    previousSong: () => {
        const { queue, currentSong } = get()
        if (queue.length === 0) return

        const currentIndex = queue.findIndex(s => s.id === currentSong?.id)
        const prevIndex = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1

        set({ currentSong: queue[prevIndex], isPlaying: true, currentTime: 0 })
    },

    /**
     * restoreSession — called once on app startup after fetchSongs() resolves.
     *
     * Reconstructs the player state from a saved session object without
     * auto-playing (isPlaying: false) so the user consciously presses Play.
     *
     * @param {object} session  Value returned by loadSession()
     * @param {Array}  songs    Full song list from the library store
     */
    restoreSession: (session, songs) => {
        if (!session || !songs.length) return

        const currentSong = songs.find(s => s.id === session.songId)
        if (!currentSong) return   // song was deleted, skip restore

        const queue = (session.queueIds || [])
            .map(id => songs.find(s => s.id === id))
            .filter(Boolean)

        set({
            currentSong,
            queue: queue.length ? queue : [currentSong],
            isPlaying:   false,               // paused — user presses Play
            currentTime: session.currentTime ?? 0,
            volume:      session.volume      ?? 0.7,
            repeat:      session.repeat      ?? 'none',
            shuffle:     session.shuffle     ?? false,
            // Flag so useAudioPlayer seeks to the right position after load
            seekOnLoad:  session.currentTime ?? 0,
        })
    },

    // Internal flag consumed by useAudioPlayer to seek after the track loads
    seekOnLoad: null,
    clearSeekOnLoad: () => set({ seekOnLoad: null }),
}))

// Library Store - manages song library and playlists
export const useLibraryStore = create((set, get) => ({
    // Start empty — all songs are loaded from IndexedDB on app init
    songs: [],
    playlists: [],
    nextPlaylistId: 1,

    searchQuery: '',
    filterGenre: 'all',

    setSearchQuery: (query) => set({ searchQuery: query }),
    setFilterGenre: (genre) => set({ filterGenre: genre }),

    addSong: (song) => set((state) => ({ songs: [...state.songs, song] })),

    /**
     * syncFolderSongs — Phase 4
     *
     * Re-scans the stored music folder and reconciles the in-memory song list:
     *  - Added songs  → appended to state.songs
     *  - Removed songs → filtered out of state.songs and every playlist
     *
     * @param {function} [onProgress]  Optional progress callback
     * @returns {Promise<{ needsSetup, added, removed }>}
     */
    syncFolderSongs: async (onProgress = null) => {
        const result = await syncLibrary(onProgress)

        if (result.needsSetup) return result

        // ── 1. Patch songs in-memory ───────────────────────────────────────
        set((state) => {
            const mapped = result.addedSongs.map(s => ({
                ...s,
                cover:  s.cover  || '🎵',
                album:  s.album  || 'Unknown Album',
                genre:  s.genre  || 'Unknown',
            }))
            const removedSet = new Set(result.removedIds)
            return {
                songs: [
                    ...state.songs.filter(s => !removedSet.has(s.id)),
                    ...mapped,
                ],
                // Remove stale song IDs from every playlist immediately
                playlists: state.playlists.map(p => ({
                    ...p,
                    songIds: p.songIds.filter(id => !removedSet.has(id)),
                })),
            }
        })

        // ── 2. Auto-generate / update folder playlists in IndexedDB ───────
        {
            // Collect all folder names touched by this sync (added OR already existing)
            const touchedFolders = new Set(result.addedSongs.map(s => s.folderName?.trim() || 'Scanned Music'))

            // Also include folders from songs that survived the sync (weren't removed)
            const allFolderSongs = await db.songs.where('sourceType').equals('folder').toArray()
            for (const s of allFolderSongs) {
                const key = s.folderName?.trim() || 'Scanned Music'
                touchedFolders.add(key)
            }

            // Load existing auto-generated playlists once
            const dbPlaylists = await db.playlists.toArray()

            for (const folderName of touchedFolders) {
                // Get the COMPLETE set of song IDs in this folder right now
                const allSongsInFolder = allFolderSongs.filter(
                    s => (s.folderName?.trim() || 'Scanned Music') === folderName
                )
                const allIds = allSongsInFolder.map(s => s.id)

                if (allIds.length === 0) continue

                const existing = dbPlaylists.find(
                    p => p.isAutoGenerated && p.name.toLowerCase() === folderName.toLowerCase()
                )
                if (existing) {
                    // Replace with the full current set (deduped)
                    const merged = [...new Set([...existing.songIds, ...allIds])]
                    await db.playlists.put({ ...existing, songIds: merged })
                } else {
                    await db.playlists.add({
                        name:            folderName,
                        description:     `Songs from folder: ${folderName}`,
                        emoji:           '📁',
                        songIds:         allIds,
                        isAutoGenerated: true,
                        createdAt:       new Date(),
                    })
                }
            }
        }

        // ── 3. Hard-reload playlists from DB into the store ───────────────
        await useLibraryStore.getState().fetchPlaylists()

        return result
    },

    // Remove duplicate songs from both IndexedDB and the Zustand store
    deduplicateSongs: async () => {
        const { removedIds } = await deduplicateLibrary()
        if (removedIds.length === 0) return 0
        set((state) => ({
            songs: deduplicateStoreList(state.songs, removedIds),
            // Drop removed IDs from every playlist
            playlists: state.playlists.map(p => ({
                ...p,
                songIds: p.songIds.filter(id => !removedIds.includes(id))
            }))
        }))
        return removedIds.length
    },

    removeSong: (songId) => {
        const song = useLibraryStore.getState().songs.find(s => s.id === songId)
        set((state) => ({
            songs: state.songs.filter(s => s.id !== songId),
            // Also remove from any playlists that contain this song
            playlists: state.playlists.map(p => ({
                ...p,
                songIds: p.songIds.filter(id => id !== songId)
            }))
        }))
        // Clean up IndexedDB — blob for uploaded songs
        db.songs.delete(songId).catch(console.error)
        db.audioFiles.where('songId').equals(songId).delete().catch(console.error)
        // Clean up file handle for folder-scanned songs
        if (song?.filePath) {
            db.fileHandles.delete(song.filePath).catch(console.error)
        }
    },

    // ===== Playlist CRUD (persisted to IndexedDB) =====

    createPlaylist: (name, description, emoji, songIds, isAutoGenerated = false) => {
        const { nextPlaylistId, playlists } = get()
        const newPlaylist = {
            id: nextPlaylistId,
            name,
            description: description || '',
            emoji: emoji || '🎵',
            songIds: songIds || [],
            isAutoGenerated,
        }
        set({
            playlists: [...playlists, newPlaylist],
            nextPlaylistId: nextPlaylistId + 1,
        })
        // Persist to IndexedDB
        db.playlists.put({ ...newPlaylist, createdAt: new Date() }).catch(console.error)
    },

    deletePlaylist: (playlistId) => {
        set((state) => ({
            playlists: state.playlists.filter(p => p.id !== playlistId)
        }))
        // Remove from IndexedDB
        db.playlists.delete(playlistId).catch(console.error)
    },

    renamePlaylist: (playlistId, newName) => {
        set((state) => ({
            playlists: state.playlists.map(p =>
                p.id === playlistId ? { ...p, name: newName } : p
            )
        }))
        // Persist to IndexedDB
        const playlist = get().playlists.find(p => p.id === playlistId)
        if (playlist) {
            db.playlists.put({ ...playlist, createdAt: playlist.createdAt || new Date() }).catch(console.error)
        }
    },

    addSongsToPlaylist: (playlistId, newSongIds) => {
        set((state) => ({
            playlists: state.playlists.map(p =>
                p.id === playlistId
                    ? { ...p, songIds: [...new Set([...p.songIds, ...newSongIds])] }
                    : p
            )
        }))
        // Persist updated playlist to IndexedDB
        const playlist = get().playlists.find(p => p.id === playlistId)
        if (playlist) {
            db.playlists.put({ ...playlist, createdAt: playlist.createdAt || new Date() }).catch(console.error)
        }
    },

    removeSongFromPlaylist: (playlistId, songId) => {
        set((state) => ({
            playlists: state.playlists.map(p =>
                p.id === playlistId
                    ? { ...p, songIds: p.songIds.filter(id => id !== songId) }
                    : p
            )
        }))
        // Persist updated playlist to IndexedDB
        const playlist = get().playlists.find(p => p.id === playlistId)
        if (playlist) {
            db.playlists.put({ ...playlist, createdAt: playlist.createdAt || new Date() }).catch(console.error)
        }
    },

    // ===== Data loading from IndexedDB =====

    fetchSongs: async () => {
        try {
            const dbSongs = await db.songs.toArray()
            const mapped = dbSongs.map(s => {
                const totalSecs = Math.floor(s.durationSeconds || (typeof s.duration === 'number' ? s.duration : 0))
                const mins = Math.floor(totalSecs / 60)
                const secs = totalSecs % 60
                return {
                    ...s,
                    duration: (typeof s.duration === 'string') ? s.duration : `${mins}:${String(secs).padStart(2, '0')}`,
                    durationSeconds: totalSecs,
                    cover: s.cover || '🎵',
                    album: s.album || 'Unknown Album',
                    genre: s.genre || 'Unknown',
                }
            })
            set({ songs: mapped })
        } catch (error) {
            console.error('Error fetching songs from DB:', error)
        }
    },

    fetchPlaylists: async () => {
        try {
            const dbPlaylists = await db.playlists.toArray()
            // Full replace — DB is the single source of truth for playlists
            const maxId = dbPlaylists.length > 0
                ? Math.max(...dbPlaylists.map(p => p.id ?? 0)) + 1
                : 1
            set({
                playlists:      dbPlaylists,
                nextPlaylistId: maxId,
            })
        } catch (error) {
            console.error('Error fetching playlists from DB:', error)
        }
    },
}))
