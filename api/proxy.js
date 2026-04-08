/**
 * Vercel Serverless Function: /api/proxy
 * Proxies requests to TIDAL/Spotify APIs with caching headers.
 */

const ALLOWED_HOSTS = new Set([
  'api.tidal.com',
  'listen.tidal.com',
  'api.spotify.com',
  'open.spotify.com',
  'api-partner.spotify.com',
  'open.spotifycdn.com',
  'clienttoken.spotify.com',
  'musicbrainz.org',
]);

function isAllowedHost(url) {
  const hostname = url.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(hostname)) return true;
  for (const allowed of ALLOWED_HOSTS) {
    if (hostname.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing url parameter' });

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid target URL' });
  }

  if (!isAllowedHost(parsedUrl)) {
    return res.status(400).json({ error: 'Target host not allowed' });
  }

  const upstreamHeaders = {
    'user-agent': 'Antigravity/1.0',
    'accept-encoding': 'identity',
    'accept': req.headers.accept || 'application/json',
  };
  if (req.headers.authorization) {
    upstreamHeaders['authorization'] = req.headers.authorization;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(parsedUrl.toString(), {
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const buffer = await response.arrayBuffer();
    const bodyText = Buffer.from(buffer).toString();

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return res.status(response.status).send(bodyText);
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(response.status).json(body);
  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(502).json({ error: 'Proxy request failed', details: err.message });
  }
}
