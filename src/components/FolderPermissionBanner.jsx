import { useState } from 'react';
import { FolderOpen, X, RefreshCw } from 'lucide-react';
import { getFolderHandle } from '../lib/db/indexedDB';
import { usePlayerStore, useLibraryStore } from '../store/store';
import { audioPlayer } from '../lib/audio/audioPlayer';

/**
 * FolderPermissionBanner
 *
 * The File System Access API loses folder permission after every page reload.
 * This banner appears when that happens, lets the user re-grant access with
 * one click, then immediately syncs the library (Phase 4) and retries playback.
 */
export default function FolderPermissionBanner() {
    const { needsFolderPermission, setNeedsFolderPermission, currentSong, isPlaying } = usePlayerStore();
    const syncFolderSongs = useLibraryStore((state) => state.syncFolderSongs);

    const [isRequesting, setIsRequesting] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null); // { added, removed } after sync
    const [error, setError] = useState(null);

    if (!needsFolderPermission) return null;

    const handleReAuthorize = async () => {
        setIsRequesting(true);
        setError(null);
        setSyncStatus(null);

        try {
            // Step 1: Restore folder permission (triggers browser dialog)
            const handle = await getFolderHandle();
            if (!handle) {
                setError('Permission not granted. Please try again.');
                setIsRequesting(false);
                return;
            }

            // Step 2: Sync library — picks up new/removed songs (Phase 4)
            const result = await syncFolderSongs();

            setSyncStatus({ added: result.added, removed: result.removed });

            // Step 3: Dismiss banner
            setNeedsFolderPermission(false);

            // Step 4: Retry playing the current song now that permission is restored
            if (currentSong?.sourceType === 'folder') {
                const loaded = await audioPlayer.loadSong(currentSong);
                if (loaded && isPlaying) {
                    audioPlayer.play();
                }
            }

        } catch (err) {
            console.error('[FolderPermissionBanner]', err);
            setError('Could not restore access. Try scanning the folder again.');
        } finally {
            setIsRequesting(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0,
                zIndex: 1000,
                background: 'rgba(10,11,18,0.97)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(124,58,237,0.3)',
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                animation: 'slideDown 0.3s ease',
            }}
        >
            <style>{`
                @keyframes slideDown {
                    from { transform: translateY(-100%); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
                @keyframes spin-banner { to { transform: rotate(360deg); } }
            `}</style>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                <FolderOpen size={18} style={{ color: 'var(--accent-light, #a78bfa)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, color: '#fff', fontFamily: 'var(--font, Inter, sans-serif)', fontSize: '0.82rem', fontWeight: 700 }}>
                        Folder access needed
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-muted, #94a3b8)', fontSize: '0.72rem', marginTop: '1px' }}>
                        {error
                            ? error
                            : isRequesting
                                ? 'Requesting permission & syncing library…'
                                : 'Browser cleared folder permission after reload. Click to restore access.'}
                    </p>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                    onClick={handleReAuthorize}
                    disabled={isRequesting}
                    className="btn-accent"
                    style={{ fontSize: '0.78rem', padding: '0.4rem 0.875rem', opacity: isRequesting ? 0.7 : 1 }}
                >
                    <RefreshCw
                        size={13}
                        style={isRequesting ? { animation: 'spin-banner 0.8s linear infinite' } : {}}
                    />
                    {isRequesting ? 'Syncing…' : 'Restore & Sync'}
                </button>

                <button
                    onClick={() => setNeedsFolderPermission(false)}
                    className="btn-icon"
                    title="Dismiss"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
