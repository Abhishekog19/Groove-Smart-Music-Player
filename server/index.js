import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

import express from 'express';
import cors from 'cors';

import proxyRoute from './routes/proxy.js';
import songlinkRoute from './routes/songlink.js';
import spotifyPlaylistRoute from './routes/spotify-playlist.js';

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors({
  origin: (origin, callback) => callback(null, true), // Per-route CORS handled in routes
  credentials: true,
}));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), port: PORT });
});

// API Routes
app.use('/api/proxy', proxyRoute);
app.use('/api/songlink', songlinkRoute);
app.use('/api/spotify-playlist', spotifyPlaylistRoute);

// 404 handler
app.use('/api/{*path}', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Antigravity API server running on http://localhost:${PORT}`);
  console.log(`   /api/proxy              → TIDAL/Spotify proxy + caching`);
  console.log(`   /api/songlink           → Spotify → TIDAL URL conversion`);
  console.log(`   /api/spotify-playlist   → Playlist track extractor`);
  console.log(`   /api/health             → Health check\n`);
});

export default app;
