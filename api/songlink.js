/**
 * Vercel Serverless Function: /api/songlink
 * Converts Spotify track URLs to TIDAL via multiple strategies:
 *   1. Spotify session API (ISRC) + oEmbed fallback
 *   2. song.link API
 *   3. Search query fallback for client-side TIDAL search
 */
import crypto from 'crypto';

const BROWSER_VERSION = '131';
const COMMON_HEADERS = {
  'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${BROWSER_VERSION}.0.0.0 Safari/537.36`,
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Sec-Ch-Ua': `"Chromium";v="${BROWSER_VERSION}", "Not(A:Brand";v="24", "Google Chrome";v="${BROWSER_VERSION}"`,
};

const FALLBACK_SECRET = [
  44, 55, 47, 42, 70, 40, 34, 114, 76, 74, 50, 111, 120, 97, 75, 76, 94, 102,
  43, 69, 49, 120, 118, 80, 64, 78,
];

function generateTotp(secret = FALLBACK_SECRET) {
  const transformed = secret.map((e, t) => e ^ ((t % 33) + 9));
  const joined = transformed.map(n => n.toString()).join('');
  const hexStr = Buffer.from(joined, 'ascii').toString('hex');
  const base32Secret = Buffer.from(hexStr, 'hex').toString('base64').replace(/=/g, '');
  const timeStep = Math.floor(Date.now() / 1000 / 30);
  const timeHex = timeStep.toString(16).padStart(16, '0');
  const hmac = crypto.createHmac('sha1', Buffer.from(base32Secret, 'base64'));
  hmac.update(Buffer.from(timeHex, 'hex'));
  const digest = hmac.digest();
  const offset = digest[19] & 0xf;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6, '0');
}

// ── Spotify session (stateless for serverless) ──────────────────────────────
async function getSpotifySession() {
  const totp = generateTotp();
  const params = new URLSearchParams({
    reason: 'init', productType: 'web-player',
    totp, totpVer: '61', totpServer: totp,
  });

  const tokenRes = await fetch(`https://open.spotify.com/api/token?${params}`, {
    headers: { ...COMMON_HEADERS, Accept: 'application/json' },
  });
  if (!tokenRes.ok) throw new Error(`Spotify token failed: ${tokenRes.status}`);
  const tokenData = await tokenRes.json();

  const deviceId = crypto.randomUUID().replace(/-/g, '');
  const clientPayload = {
    client_data: {
      client_version: `1.2.${BROWSER_VERSION}.0.ge-xyz`,
      client_id: tokenData.clientId,
      js_sdk_data: { device_type: 'computer', os: 'windows', device_id: deviceId },
    },
  };

  let clientToken = '';
  try {
    const ctRes = await fetch('https://clienttoken.spotify.com/v1/clienttoken', {
      method: 'POST',
      headers: { ...COMMON_HEADERS, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(clientPayload),
    });
    if (ctRes.ok) {
      const ctData = await ctRes.json();
      clientToken = ctData.granted_token?.token || '';
    }
  } catch { /* clientToken optional */ }

  return { accessToken: tokenData.accessToken, clientToken };
}

async function getSpotifyTrack(trackId) {
  const { accessToken, clientToken } = await getSpotifySession();

  const r = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'client-token': clientToken,
      'app-platform': 'WebPlayer',
      Accept: 'application/json',
    },
  });

  if (!r.ok) throw new Error(`Spotify track API failed: ${r.status}`);

  const track = await r.json();
  return {
    name: track.name || '',
    artists: (track.artists || []).map(a => a.name),
    isrc: track.external_ids?.isrc || null,
    albumArt: track.album?.images?.[0]?.url || null,
  };
}

// ── oEmbed fallback ─────────────────────────────────────────────────────────
async function getSpotifyOEmbed(spotifyUrl) {
  const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
  const r = await fetch(oembedUrl, {
    headers: { 'User-Agent': COMMON_HEADERS['User-Agent'], Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.title ? { title: data.title, artistName: data.author_name || null } : null;
}

// ── Build Spotify-direct response ───────────────────────────────────────────
async function convertViaSpotify(spotifyUrl) {
  const trackId = spotifyUrl.match(/track\/([a-zA-Z0-9]+)/)?.[1];
  if (!trackId) throw new Error('Not a Spotify track URL');

  let name = null, artists = [], isrc = null, albumArt = null;

  try {
    const track = await getSpotifyTrack(trackId);
    name = track.name;
    artists = track.artists;
    isrc = track.isrc;
    albumArt = track.albumArt;
  } catch (err) {
    console.warn('[songlink] Spotify session skipped:', err.message);
  }

  if (!name) {
    try {
      const oembed = await getSpotifyOEmbed(spotifyUrl);
      if (oembed?.title) {
        name = oembed.title;
        if (oembed.artistName) artists = [oembed.artistName];
      }
    } catch { /* skip */ }
  }

  const enriched = !!name;
  const searchQuery = isrc ? `isrc:${isrc}` : name ? `${name} ${artists[0] || ''}`.trim() : trackId;

  return {
    entityUniqueId: `SPOTIFY_SONG::${trackId}`,
    userCountry: 'US',
    pageUrl: `https://song.link/s/${trackId}`,
    title: name || `Spotify Track ${trackId.slice(0, 8)}`,
    artistName: artists.join(', ') || '',
    thumbnailUrl: albumArt || null,
    linksByPlatform: {
      spotify: { url: spotifyUrl, nativeAppUriMobile: `spotify:track:${trackId}`, entityUniqueId: `SPOTIFY_SONG::${trackId}` },
      tidal: { url: `https://listen.tidal.com/search?q=${encodeURIComponent(searchQuery)}`, entityUniqueId: isrc ? `TIDAL_SONG::isrc:${isrc}` : `TIDAL_SEARCH::${trackId}` },
    },
    entitiesByUniqueId: {
      [`SPOTIFY_SONG::${trackId}`]: { id: trackId, type: 'song', title: name || '', artistName: artists.join(', ') || '', thumbnailUrl: albumArt || null, apiProvider: 'spotify', platforms: ['spotify'], isrc },
    },
    _source: 'spotify-direct', _isrc: isrc || null, _enriched: enriched, _searchQuery: searchQuery,
  };
}

// ── song.link fallback ──────────────────────────────────────────────────────
const PRIMARY_SONGLINK = 'https://api.song.link/v1-alpha.1/links';
const BACKUP_SONGLINK = 'https://tracks.monochrome.tf/api/links';

function buildSonglinkUrl(params, useBackup = false) {
  const url = new URL(useBackup ? BACKUP_SONGLINK : PRIMARY_SONGLINK);
  url.searchParams.set('url', params.url);
  if (params.userCountry) url.searchParams.set('userCountry', params.userCountry);
  return url.toString();
}

async function fetchFromSonglink(primaryUrl, backupUrl, headers) {
  for (const [url, sourceName] of [[primaryUrl, 'primary'], [backupUrl, 'backup']]) {
    try {
      const r = await fetch(url, { headers });
      if (r.ok) return { data: await r.json(), source: sourceName, status: r.status };
      if (r.status === 404) return { data: await r.json(), source: sourceName, status: 404 };
    } catch (err) {
      console.warn(`[songlink] ${sourceName} threw: ${err.message}`);
    }
  }
  throw Object.assign(new Error('All Songlink APIs failed'), { status: 429 });
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const params = {
    url: req.query.url || '',
    userCountry: req.query.userCountry || 'US',
  };

  if (!params.url) return res.status(400).json({ error: 'Missing required parameter: url' });

  // ── Resolve shortened URLs ──
  if (params.url.includes('spotify.link/') || (params.url.includes('spotify') && !params.url.includes('open.spotify.com/'))) {
    try {
      const resolved = await fetch(params.url, {
        method: 'HEAD', redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36' },
        signal: AbortSignal.timeout(8000),
      });
      if (resolved.url && resolved.url !== params.url) {
        console.log(`[songlink] Resolved: ${params.url} → ${resolved.url}`);
        params.url = resolved.url;
      }
    } catch (err) {
      console.warn('[songlink] URL resolve failed:', err.message);
    }
  }

  const isSpotifyTrack = params.url.includes('open.spotify.com/track/');

  // Strategy 1: Spotify Direct
  let spotifyDirectData = null;
  if (isSpotifyTrack) {
    try {
      spotifyDirectData = await convertViaSpotify(params.url);
      if (spotifyDirectData._enriched) {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
        return res.json(spotifyDirectData);
      }
    } catch (err) {
      console.warn('[songlink] Spotify direct failed:', err.message);
    }
  }

  // Strategy 2: song.link
  try {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '127.0.0.1';
    const headers = { 'User-Agent': 'Antigravity/1.0', Accept: 'application/json', 'X-Forwarded-For': clientIp };
    const primary = buildSonglinkUrl(params, false);
    const backup = buildSonglinkUrl(params, true);
    const { data, source, status } = await fetchFromSonglink(primary, backup, headers);

    if (spotifyDirectData && !data.linksByPlatform?.tidal) {
      data.title = data.title || spotifyDirectData.title;
      data.artistName = data.artistName || spotifyDirectData.artistName;
      data.thumbnailUrl = data.thumbnailUrl || spotifyDirectData.thumbnailUrl;
    }

    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.status(status).json(data);
  } catch (err) {
    console.warn('[songlink] song.link failed:', err.message);

    if (spotifyDirectData) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.json(spotifyDirectData);
    }

    return res.status(err.status || 502).json({
      error: err.status === 429 ? 'Rate limited — please retry in a few seconds' : 'Failed to convert URL',
      details: err.message,
    });
  }
}
