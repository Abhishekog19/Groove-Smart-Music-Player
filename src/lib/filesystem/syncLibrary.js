import { db, getFolderHandle, storeFileHandle } from '../db/indexedDB';
import { scanMusicFolder } from './folderScanner';

/**
 * syncLibrary
 *
 * Re-scans the previously selected music folder and reconciles it with
 * what is currently stored in IndexedDB:
 *  - New files  → added to songs + fileHandles tables, returned in `added`
 *  - Missing files → removed from songs + fileHandles tables, returned in `removed`
 *  - Unchanged files → left alone
 *
 * Must be called inside a user-gesture context (button click) because
 * getFolderHandle() may call requestPermission() internally.
 *
 * @param {function} [onProgress]  Optional (count, currentFile) progress callback
 * @returns {Promise<{
 *   needsSetup: boolean,   // true if no folder has ever been selected
 *   added:      number,
 *   removed:    number,
 *   addedSongs: Array,     // full song objects newly added (with DB id)
 *   removedIds: number[]   // DB ids of songs removed
 * }>}
 */
export async function syncLibrary(onProgress = null) {
    // ── 1. Get the stored folder handle ─────────────────────────────────────
    const dirHandle = await getFolderHandle();

    if (!dirHandle) {
        return { needsSetup: true, added: 0, removed: 0, addedSongs: [], removedIds: [] };
    }

    // ── 2. Scan the folder right now ─────────────────────────────────────────
    const { songs: scannedSongs } = await scanMusicFolder(dirHandle, onProgress);

    // ── 3. Load what is already in IndexedDB (folder songs only) ─────────────
    const existingSongs = await db.songs
        .where('sourceType')
        .equals('folder')
        .toArray();

    // Build fast lookup sets
    const existingByPath = new Map(existingSongs.map(s => [s.filePath, s]));
    const scannedPaths   = new Set(scannedSongs.map(s => s.filePath));

    // ── 4. Compute diff ───────────────────────────────────────────────────────
    const toAdd    = scannedSongs.filter(s => !existingByPath.has(s.filePath));
    const toRemove = existingSongs.filter(s => !scannedPaths.has(s.filePath));

    // ── 5. Add new songs ──────────────────────────────────────────────────────
    const addedSongs = [];

    // Build duplicate-title guard using existing songs
    const existingTitles = new Set(
        existingSongs.map(s => s.title?.toLowerCase().trim()).filter(Boolean)
    );

    for (const song of toAdd) {
        const titleKey = song.title?.toLowerCase().trim();
        if (existingTitles.has(titleKey)) continue; // skip title-level duplicates

        const { fileHandle, ...songData } = song;
        const newId = await db.songs.add(songData);
        await storeFileHandle(song.filePath, fileHandle);

        existingTitles.add(titleKey);
        addedSongs.push({ ...songData, id: newId });
    }

    // ── 6. Remove stale songs ─────────────────────────────────────────────────
    const removedIds = [];

    for (const song of toRemove) {
        await db.songs.delete(song.id);
        await db.fileHandles.delete(song.filePath).catch(() => {});
        removedIds.push(song.id);
    }

    // ── 7. Update auto-generated playlists ────────────────────────────────────
    //    Re-run the folder→playlist grouping for newly added songs only,
    //    handled by the caller (store action) so we keep DB logic separate here.

    return {
        needsSetup: false,
        added:      addedSongs.length,
        removed:    removedIds.length,
        addedSongs,
        removedIds,
    };
}
