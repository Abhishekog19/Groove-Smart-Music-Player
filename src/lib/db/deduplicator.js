import { db } from './indexedDB';

/**
 * deduplicateLibrary
 *
 * Scans all songs in IndexedDB and removes duplicates by title (case-insensitive).
 * When a duplicate pair is found, we prefer to KEEP the song that:
 *   1. Has a sourceType of 'folder' (real file on disk)
 *   2. Has a sourceType of 'upload' (blob in DB)
 *   3. Is a demo song (no sourceType / id ≤ 1010) — lowest priority
 *
 * Within the same tier, we keep the one with the LOWER id (added first).
 *
 * Returns { removedIds: number[], removedTitles: string[] }
 */
export async function deduplicateLibrary() {
    try {
        const allSongs = await db.songs.toArray();

        // Group by normalized title
        const byTitle = new Map();
        for (const song of allSongs) {
            const key = (song.title || '').toLowerCase().trim();
            if (!byTitle.has(key)) byTitle.set(key, []);
            byTitle.get(key).push(song);
        }

        const removedIds    = [];
        const removedTitles = [];

        for (const [, group] of byTitle) {
            if (group.length <= 1) continue; // no duplicate

            // Sort: folder > upload > demo, then by id ascending
            group.sort((a, b) => {
                const tier = (s) => {
                    if (s.sourceType === 'folder') return 0;
                    if (s.sourceType === 'upload') return 1;
                    return 2; // demo / unknown
                };
                const t = tier(a) - tier(b);
                if (t !== 0) return t;
                return (a.id || Infinity) - (b.id || Infinity);
            });

            // Keep index 0, delete the rest
            const [, ...dupes] = group;
            for (const dupe of dupes) {
                removedIds.push(dupe.id);
                removedTitles.push(dupe.title || `(id ${dupe.id})`);

                // Remove from DB
                await db.songs.delete(dupe.id);

                // Remove blob if it was an upload
                await db.audioFiles.where('songId').equals(dupe.id).delete();

                // Remove file handle if it was a folder song
                if (dupe.filePath) {
                    await db.fileHandles.delete(dupe.filePath).catch(() => {});
                }
            }
        }

        return { removedIds, removedTitles };
    } catch (err) {
        console.error('[deduplicator] Error:', err);
        return { removedIds: [], removedTitles: [] };
    }
}

/**
 * deduplicateStoreList
 *
 * Pure function — takes the current in-memory songs array and returns
 * a deduplicated version using the same priority rules.
 * Used to clean up the Zustand store after deduplicateLibrary() runs.
 *
 * @param {Array} songs
 * @param {Set<number>} removedIds  - IDs already deleted from DB by deduplicateLibrary()
 * @returns {Array}
 */
export function deduplicateStoreList(songs, removedIds) {
    const idSet = new Set(removedIds);
    return songs.filter(s => !idSet.has(s.id));
}
