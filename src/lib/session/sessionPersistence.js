/**
 * sessionPersistence.js
 *
 * Saves / restores the player's last session to localStorage so the app can
 * resume where the user left off after a page refresh.
 *
 * Stored key: "smusic_session"
 * Stored shape:
 * {
 *   songId:      number,       // ID of the last playing song
 *   currentTime: number,       // seconds into the track
 *   queueIds:    number[],     // IDs of songs in the queue at that moment
 *   volume:      number,       // 0–1
 *   repeat:      string,       // 'none' | 'one' | 'all'
 *   shuffle:     boolean,
 * }
 */

const SESSION_KEY = 'smusic_session';

/** Write the current playback state to localStorage. */
export function saveSession({ songId, currentTime, queueIds, volume, repeat, shuffle }) {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            songId,
            currentTime: Math.floor(currentTime), // whole seconds is plenty
            queueIds,
            volume,
            repeat,
            shuffle,
        }));
    } catch {
        // Silently ignore — storage might be full or disabled
    }
}

/** Read the saved session. Returns null if nothing is saved or data is invalid. */
export function loadSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        // Basic validation
        if (typeof data.songId !== 'number') return null;
        return data;
    } catch {
        return null;
    }
}

/** Remove saved session (e.g. when library is cleared). */
export function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
