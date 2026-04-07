import { useState } from 'react';
import { useLibraryStore } from '../store/store';
import { extractMetadata } from '../lib/audio/metadataExtractor';
import { saveSongWithAudio } from '../lib/db/indexedDB';

export function useFileUpload() {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duplicates, setDuplicates] = useState([]); // names that were skipped
    const addSong = useLibraryStore((state) => state.addSong);

    /**
     * Upload audio files, skipping any whose title already exists in the library.
     * Returns { added: number, skipped: string[] }
     */
    const uploadFiles = async (files) => {
        setIsUploading(true);
        setProgress(0);
        setDuplicates([]);

        const totalFiles = files.length;
        let processedFiles = 0;
        const skippedNames = [];

        // Build a set of existing titles (lowercased) for O(1) lookup
        const existingSongs = useLibraryStore.getState().songs;
        const existingTitles = new Set(
            existingSongs.map(s => s.title?.toLowerCase().trim()).filter(Boolean)
        );

        try {
            for (const file of files) {
                if (!file.type.startsWith('audio/')) {
                    processedFiles++;
                    setProgress((processedFiles / totalFiles) * 100);
                    continue;
                }

                const metadata = await extractMetadata(file);
                const songTitle = metadata.title || file.name.replace(/\.[^/.]+$/, '');
                const titleKey = songTitle.toLowerCase().trim();

                // ── Duplicate check ──────────────────────────────────
                if (existingTitles.has(titleKey)) {
                    skippedNames.push(songTitle);
                    processedFiles++;
                    setProgress((processedFiles / totalFiles) * 100);
                    continue;
                }

                const songId = await saveSongWithAudio(metadata, file);

                // Format duration for display
                const totalSecs = Math.floor(metadata.duration || 0);
                const mins = Math.floor(totalSecs / 60);
                const secs = totalSecs % 60;
                const durationStr = `${mins}:${String(secs).padStart(2, '0')}`;

                addSong({
                    ...metadata,
                    id: songId,
                    sourceType: 'upload',
                    duration: durationStr,
                    durationSeconds: totalSecs,
                    cover: metadata.coverArt ? '🎧' : '🎵',
                });

                // Add to the in-memory set so further files in the same batch are checked too
                existingTitles.add(titleKey);

                processedFiles++;
                setProgress((processedFiles / totalFiles) * 100);
            }

            setIsUploading(false);
            setDuplicates(skippedNames);
            return { added: processedFiles - skippedNames.length, skipped: skippedNames };
        } catch (error) {
            console.error('Error uploading files:', error);
            setIsUploading(false);
            return { added: 0, skipped: [] };
        }
    };

    return { uploadFiles, isUploading, progress, duplicates };
}
