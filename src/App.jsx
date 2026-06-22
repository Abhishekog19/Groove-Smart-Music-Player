import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import Layout from './components/Layout';
import Library from './pages/Library';
import Player from './pages/Player';
import Playlists from './pages/Playlists';
import Import from './pages/Import';
import TestApi from './pages/TestApi';
import Search from './pages/Search';
import Landing from './pages/Landing';
import Home from './pages/Home';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useLibraryStore, usePlayerStore } from './store/store';
import { db } from './lib/db/indexedDB';
import { checkFolderPermission } from './lib/db/indexedDB';
import FolderSetupScreen from './components/setup/FolderSetupScreen';
import AppLoadingScreen from './components/setup/AppLoadingScreen';
import { loadSession } from './lib/session/sessionPersistence';
import AmazonTurnstile from './components/AmazonTurnstile';

function App() {
    // Initialize audio player (must always run, even during loading/setup)
    useAudioPlayer();

    const [amazonReady, setAmazonReady] = useState(false);
    const handleAmazonReady = useCallback(() => setAmazonReady(true), []);
    const handleAmazonError = useCallback((msg) => {
        // Non-fatal: Amazon unavailable, will fall back to Qobuz/Deezer
        console.warn('[App] Amazon Music unavailable:', msg);
    }, []);

    const fetchSongs               = useLibraryStore((s) => s.fetchSongs);
    const fetchPlaylists           = useLibraryStore((s) => s.fetchPlaylists);
    const setNeedsFolderPermission = usePlayerStore((s)  => s.setNeedsFolderPermission);
    const restoreSession           = usePlayerStore((s)  => s.restoreSession);

    // 'loading' | 'setup' | 'app'
    const [appState, setAppState] = useState('loading');

    useEffect(() => {
        const init = async () => {
            try {
                // Load everything from IndexedDB first
                await fetchSongs();
                await fetchPlaylists();

                // Restore last session (paused at saved timestamp)
                const session = loadSession();
                if (session) {
                    const { songs } = useLibraryStore.getState();
                    restoreSession(session, songs);
                }

                // Check total song count
                const totalSongs = await db.songs.count().catch(() => 0);

                if (totalSongs === 0) {
                    // Check if this looks like a true first-time user
                    // (no folder handle stored either)
                    const folderRecord = await db.folderHandle.get('music-folder').catch(() => null);
                    if (!folderRecord) {
                        // First-time user — show setup screen
                        setAppState('setup');
                        return;
                    }
                }

                // Returning user — silently check if folder permission is still valid.
                // Only show the banner when queryPermission returns 'prompt' or 'denied'.
                // NEVER call requestPermission here — it requires a user gesture.
                const folderSongs = await db.songs.where('sourceType').equals('folder').count().catch(() => 0);
                if (folderSongs > 0) {
                    const permStatus = await checkFolderPermission();
                    // 'granted' → permission still valid, no banner needed
                    // 'prompt' | 'denied' | null → permission expired, show banner
                    if (permStatus !== 'granted') {
                        setNeedsFolderPermission(true);
                    }
                }

                setAppState('app');
            } catch {
                // Fallback — just enter the app normally
                setAppState('app');
            }
        };

        init();
    }, [fetchSongs, fetchPlaylists, setNeedsFolderPermission]);

    // ── Loading screen ─────────────────────────────────────────────────────
    if (appState === 'loading') {
        return <AppLoadingScreen />;
    }

    // ── First-time setup ───────────────────────────────────────────────────
    if (appState === 'setup') {
        return (
            <FolderSetupScreen
                onComplete={() => {
                    // After setup, check folder songs for permission banner
                    db.songs.where('sourceType').equals('folder').count()
                        .then((n) => { if (n > 0) setNeedsFolderPermission(true); })
                        .catch(() => {});
                    setAppState('app');
                }}
            />
        );
    }

    // ── Normal app ──────────────────────────────────────────────────────
    return (
        <BrowserRouter>
            {/* Amazon Music Turnstile — runs silently in background, no UI unless challenge needed */}
            <AmazonTurnstile onReady={handleAmazonReady} onError={handleAmazonError} />
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="library"   element={<Library />} />
                    <Route path="player"    element={<Player />} />
                    <Route path="playlists" element={<Playlists />} />
                    <Route path="import"    element={<Import />} />
                    <Route path="test-api"  element={<TestApi />} />
                    <Route path="search"    element={<Search />} />
                </Route>
                <Route path="/landing" element={<Landing />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;