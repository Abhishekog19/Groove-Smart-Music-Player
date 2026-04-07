import { useState } from 'react';
import { scanMusicFolder } from '../lib/filesystem/folderScanner';
import { storeFolderHandle, storeFileHandle } from '../lib/db/indexedDB';
import { useLibraryStore } from '../store/store';
import { db } from '../lib/db/indexedDB';

/**
 * useFolderPicker
 *
 * Provides a function to open the browser's folder picker (File System Access API),
 * scan all audio files recursively, save them to IndexedDB with file handles,
 * and add them to the library store.
 *
 * After each scan, auto-generates playlists named after the scanned sub-folders
 * so they appear immediately in the Playlists page.
 *
 * Compatible browsers: Chrome 86+, Edge 86+, Opera 72+
 */
export function useFolderPicker() {
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress]     = useState({ count: 0, currentFile: '' });
    const [error, setError]           = useState(null);
    const [duplicates, setDuplicates] = useState([]);

    const addSong = useLibraryStore((state) => state.addSong);

    /**
     * Open folder picker and scan music.
     * Returns { added: number, skipped: string[] } on success, or null if cancelled.
     */
    const pickFolder = async () => {
        if (!('showDirectoryPicker' in window)) {
            setError('Your browser does not support folder scanning. Please use Chrome or Edge.');
            return null;
        }

        setError(null);
        setDuplicates([]);
        setIsScanning(true);
        setProgress({ count: 0, currentFile: '' });

        try {
            // 1. Ask user to select a folder
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });

            // 2. Persist folder handle for future visits
            await storeFolderHandle(dirHandle);

            // 3. Scan the folder recursively
            const { songs } = await scanMusicFolder(dirHandle, (count, currentFile) => {
                setProgress({ count, currentFile });
            });

            if (songs.length === 0) {
                setIsScanning(false);
                setError('No audio files found in the selected folder.');
                return { added: 0, skipped: [] };
            }

            // 4. Build duplicate-detection sets from DB
            const existingSongs  = await db.songs.toArray();
            const existingPaths  = new Set(existingSongs.map(s => s.filePath).filter(Boolean));
            const existingTitles = new Set(
                existingSongs.map(s => s.title?.toLowerCase().trim()).filter(Boolean)
            );

            let addedCount = 0;
            const skippedNames = [];

            // Map<folderName, number[]>  — tracks song IDs per folder for auto-playlists
            const folderMap = new Map();

            // 5. Save new songs to IndexedDB and Zustand
            for (const song of songs) {
                const titleKey = song.title?.toLowerCase().trim();

                if (existingPaths.has(song.filePath) || existingTitles.has(titleKey)) {
                    skippedNames.push(song.title || song.filePath);
                    continue;
                }

                const { fileHandle, ...songData } = song;

                const songId = await db.songs.add(songData);
                await storeFileHandle(song.filePath, fileHandle);
                addSong({ ...songData, id: songId });

                existingPaths.add(song.filePath);
                existingTitles.add(titleKey);

                // Group by folder for playlist generation
                const key = song.folderName?.trim() || 'Scanned Music';
                if (!folderMap.has(key)) folderMap.set(key, []);
                folderMap.get(key).push(songId);

                addedCount++;
            }

            // 6. Auto-generate playlists from folder groups
            if (folderMap.size > 0) {
                await createAutoPlaylists(folderMap);
            }

            setIsScanning(false);
            setDuplicates(skippedNames);
            setProgress({ count: addedCount, currentFile: '' });
            return { added: addedCount, skipped: skippedNames };

        } catch (err) {
            setIsScanning(false);
            if (err.name === 'AbortError') return null;
            console.error('[useFolderPicker] Error:', err);
            setError('Failed to scan folder. Please try again.');
            return null;
        }
    };

    return {
        pickFolder,
        isScanning,
        progress,
        error,
        duplicates,
        isSupported: 'showDirectoryPicker' in window,
    };
}

// ── Emoji pool for auto-generated playlists ───────────────────────────────────
const FOLDER_EMOJIS = ['📁', '🎵', '🎶', '🎸', '🎹', '🎺', '🎻', '🥁', '🎷', '🎙️'];
let _emojiIdx = 0;
const nextEmoji = () => FOLDER_EMOJIS[_emojiIdx++ % FOLDER_EMOJIS.length];

/**
 * For each folder in the map, create a new playlist OR update an existing
 * auto-generated one with the COMPLETE set of songs for that folder.
 *
 * Crucially: instead of only adding the newly-inserted song IDs, we re-query
 * the DB for every song whose folderName matches — so the playlist always has
 * all songs even when some were already present from a previous scan.
 *
 * @param {Map<string, number[]>} folderMap  folderName → newly-added songIds[]
 */
async function createAutoPlaylists(folderMap) {
    // All folder songs now in DB (including ones added moments ago)
    const allFolderSongs = await db.songs.where('sourceType').equals('folder').toArray();

    // Load existing auto-generated playlists
    const dbPlaylists = await db.playlists.toArray();

    for (const [folderName] of folderMap) {
        // Full ID list for this folder from the DB
        const allIds = allFolderSongs
            .filter(s => (s.folderName?.trim() || 'Scanned Music') === folderName)
            .map(s => s.id);

        if (allIds.length === 0) continue;

        const existing = dbPlaylists.find(
            p => p.isAutoGenerated && p.name.toLowerCase() === folderName.toLowerCase()
        );

        if (existing) {
            // Merge: keep any manually-added IDs + all current folder songs
            const merged = [...new Set([...existing.songIds, ...allIds])];
            await db.playlists.put({ ...existing, songIds: merged });
        } else {
            await db.playlists.add({
                name:            folderName,
                description:     `Auto-generated from folder: ${folderName}`,
                emoji:           nextEmoji(),
                songIds:         allIds,
                isAutoGenerated: true,
                createdAt:       new Date(),
            });
        }
    }

    // Reload playlists into the Zustand store from DB
    await useLibraryStore.getState().fetchPlaylists();
}
