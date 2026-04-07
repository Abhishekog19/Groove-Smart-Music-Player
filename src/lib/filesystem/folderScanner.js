import { extractMetadata } from '../audio/metadataExtractor';

// Supported audio file extensions
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.opus', '.wma'];

/**
 * Check if a filename is an audio file
 */
function isAudioFile(filename) {
    const lower = filename.toLowerCase();
    return AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Get the last folder name from a path string
 */
function getFolderName(path) {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'Root';
}

/**
 * Format duration seconds to "m:ss" string
 */
function formatDuration(seconds) {
    const totalSecs = Math.floor(seconds || 0);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Recursively scan a directory handle and collect all audio files.
 *
 * @param {FileSystemDirectoryHandle} dirHandle  - Root directory handle
 * @param {function} onProgress                  - Optional progress callback (scannedCount, currentFile)
 * @returns {{ songs: Array, folderNames: Set<string> }}
 */
export async function scanMusicFolder(dirHandle, onProgress = null) {
    const songs = [];
    let scanned = 0;

    async function scanDirectory(handle, path) {
        for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
                if (isAudioFile(entry.name)) {
                    try {
                        const file = await entry.getFile();
                        const metadata = await extractMetadata(file);

                        const filePath = path ? `${path}/${entry.name}` : entry.name;
                        const folderName = path ? getFolderName(path) : 'Root';

                        const song = {
                            // Metadata fields
                            title: metadata.title || entry.name.replace(/\.[^/.]+$/, ''),
                            artist: metadata.artist || 'Unknown Artist',
                            album: metadata.album || 'Unknown Album',
                            genre: metadata.genre || 'Unknown',
                            year: metadata.year || null,
                            duration: formatDuration(metadata.duration),
                            durationSeconds: Math.floor(metadata.duration || 0),
                            format: metadata.format || 'unknown',
                            coverArt: metadata.coverArt || null,
                            cover: metadata.coverArt ? '🎧' : '🎵',
                            dateAdded: new Date(),

                            // Filesystem fields
                            filePath,
                            folderName,
                            fileHandle: entry,   // FileSystemFileHandle — stored in IndexedDB
                            sourceType: 'folder', // Distinguish from old blob uploads
                        };

                        songs.push(song);
                        scanned++;
                        onProgress?.(scanned, entry.name);
                    } catch (err) {
                        console.warn(`[folderScanner] Skipped "${entry.name}":`, err);
                    }
                }
            } else if (entry.kind === 'directory') {
                const subPath = path ? `${path}/${entry.name}` : entry.name;
                await scanDirectory(entry, subPath);
            }
        }
    }

    await scanDirectory(dirHandle, '');

    const folderNames = new Set(songs.map((s) => s.folderName).filter(Boolean));

    return { songs, folderNames };
}
