import { create } from 'zustand';
import { db, deleteFileHandle } from '../lib/db/indexedDB';

export const useLibraryStore = create((set, get) => ({
    songs: [],
    isLoading: false,
    searchQuery: '',

    // ─── Fetch ───────────────────────────────────────────────────────────────

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

    // ─── Mutations ────────────────────────────────────────────────────────────

    addSong: (song) => {
        set((state) => ({ songs: [...state.songs, song] }));
    },

    /**
     * Remove a song from the library.
     * - For blob-uploaded songs: deletes the audioFiles blob row.
     * - For folder-scanned songs (sourceType === 'folder'): deletes the fileHandle row.
     */
    removeSong: async (songId) => {
        try {
            const song = await db.songs.get(songId);

            if (song?.sourceType === 'folder' && song.filePath) {
                // Clean up the stored FileSystemFileHandle
                await deleteFileHandle(song.filePath);
            } else {
                // Clean up the legacy audio blob
                await db.audioFiles.where('songId').equals(songId).delete();
            }

            await db.songs.delete(songId);

            set((state) => ({
                songs: state.songs.filter((s) => s.id !== songId),
            }));
        } catch (error) {
            console.error('Error removing song:', error);
        }
    },

    // ─── Search ───────────────────────────────────────────────────────────────

    setSearchQuery: (query) => set({ searchQuery: query }),

    getFilteredSongs: () => {
        const { songs, searchQuery } = get();
        if (!searchQuery) return songs;

        const query = searchQuery.toLowerCase();
        return songs.filter(
            (song) =>
                song.title?.toLowerCase().includes(query) ||
                song.artist?.toLowerCase().includes(query) ||
                song.album?.toLowerCase().includes(query),
        );
    },

    // ─── Computed ─────────────────────────────────────────────────────────────

    /** Songs from folder scans */
    getFolderSongs: () => get().songs.filter((s) => s.sourceType === 'folder'),

    /** Songs from legacy blob uploads */
    getUploadedSongs: () => get().songs.filter((s) => s.sourceType === 'upload'),
}));
