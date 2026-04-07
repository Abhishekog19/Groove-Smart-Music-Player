import * as mm from 'music-metadata-browser';

/**
 * Extract audio metadata from a File (or Blob) object.
 *
 * Uses parseBuffer with a Uint8Array instead of parseBlob to avoid the
 * "Buffer is not defined" error — Buffer is a Node.js global that isn't
 * available in the browser. Uint8Array works in all browsers natively.
 *
 * @param {File} file  A File or Blob representing an audio file.
 */
export async function extractMetadata(file) {
    try {
        // Read the file as an ArrayBuffer and wrap as Uint8Array (browser-safe)
        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        const metadata = await mm.parseBuffer(uint8, {
            mimeType:  file.type || mimeTypeFromName(file.name),
            size:      file.size,
        });

        let coverArt = null;
        if (metadata.common.picture?.length > 0) {
            const picture = metadata.common.picture[0];
            const blob    = new Blob([picture.data], { type: picture.format });
            coverArt      = URL.createObjectURL(blob);
        }

        return {
            title:     metadata.common.title  || file.name.replace(/\.[^/.]+$/, ''),
            artist:    metadata.common.artist  || 'Unknown Artist',
            album:     metadata.common.album   || 'Unknown Album',
            genre:     metadata.common.genre?.[0] || 'Unknown',
            year:      metadata.common.year    || null,
            duration:  metadata.format.duration || 0,
            format:    metadata.format.container || 'unknown',
            coverArt,
            dateAdded: new Date(),
        };
    } catch (error) {
        console.warn('[metadataExtractor] Falling back to filename for:', file.name, error.message);
        // Graceful fallback — scanner continues even if one file has bad tags
        return {
            title:     file.name.replace(/\.[^/.]+$/, ''),
            artist:    'Unknown Artist',
            album:     'Unknown Album',
            genre:     'Unknown',
            year:      null,
            duration:  0,
            format:    file.name.split('.').pop()?.toLowerCase() || 'unknown',
            coverArt:  null,
            dateAdded: new Date(),
        };
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Derive a MIME type from the file extension when file.type is empty string. */
function mimeTypeFromName(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const map = {
        mp3:  'audio/mpeg',
        m4a:  'audio/mp4',
        mp4:  'audio/mp4',
        aac:  'audio/aac',
        ogg:  'audio/ogg',
        oga:  'audio/ogg',
        flac: 'audio/flac',
        wav:  'audio/wav',
        wave: 'audio/wav',
        webm: 'audio/webm',
        opus: 'audio/opus',
    };
    return map[ext] || 'audio/mpeg';
}
