/**
 * Vercel Serverless Function: /api/audio-proxy
 *
 * Proxies TIDAL CDN audio to the browser, bypassing CORS and 403 token errors.
 * Supports Range requests for seek/scrub support in Howler (HTML5 audio).
 *
 * This is the Vercel equivalent of server/routes/audio-proxy.js.
 * It is needed because Vercel only runs serverless functions — the Express
 * server in /server is not started on the deployed platform.
 */

// Only allow TIDAL CDN domains
const TIDAL_DOMAIN_RE = /^([a-z0-9-]+\.)*tidal\.com$/i;

function isTidalUrl(urlString) {
  try {
    const u = new URL(urlString);
    return TIDAL_DOMAIN_RE.test(u.hostname);
  } catch {
    return false;
  }
}

export const config = {
  maxDuration: 60, // seconds — audio files can be large
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Content-Type, Accept-Ranges'
  );

  if (req.method === 'OPTIONS') return res.status(204).end();

  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  if (!isTidalUrl(targetUrl)) {
    console.warn(`[audio-proxy] Rejected non-TIDAL URL: ${targetUrl.substring(0, 80)}`);
    return res.status(400).json({ error: 'Only TIDAL audio URLs are allowed' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const upstreamHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'audio/flac, audio/mp4, audio/*, */*',
    'Accept-Encoding': 'identity', // No compression — raw bytes
    Connection: 'keep-alive',
  };

  // Forward Range header for seek support
  if (req.headers['range']) {
    upstreamHeaders['Range'] = req.headers['range'];
  }

  try {
    const controller = new AbortController();
    // 55s timeout (under Vercel's 60s function limit)
    const timeout = setTimeout(() => controller.abort(), 55000);

    const upstream = await fetch(parsedUrl.toString(), {
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const status = upstream.status;

    // Reject non-audio error responses with a JSON error body
    if (status >= 400) {
      const body = await upstream.text().catch(() => '');
      console.error(
        `[audio-proxy] CDN error ${status} for ${parsedUrl.hostname}${parsedUrl.pathname.substring(0, 40)}`
      );
      return res.status(status).json({
        error: `TIDAL CDN returned HTTP ${status}`,
        hint:
          status === 401 || status === 403
            ? 'Stream token may have expired — reload and try again'
            : undefined,
      });
    }

    // Forward status and safe audio headers
    res.status(status);

    const FORWARD_HEADERS = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'last-modified',
      'etag',
    ];

    for (const h of FORWARD_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    res.setHeader('Cache-Control', 'no-store, no-cache');

    const ct = upstream.headers.get('content-type') || 'audio/flac';
    const cl = upstream.headers.get('content-length') || '?';
    console.log(
      `[audio-proxy] ▶ ${status} ${ct} ${cl} bytes from ${parsedUrl.hostname}`
    );

    // Stream the audio bytes back to the browser
    // Vercel serverless functions support streaming via arrayBuffer for small files,
    // but for large audio we buffer and send — this works for most tracks.
    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));

    console.log(`[audio-proxy] ✓ Sent ${buffer.byteLength} bytes`);
  } catch (err) {
    console.error('[audio-proxy] Fetch error:', err.message);
    if (!res.headersSent) {
      return res.status(502).json({
        error: 'Failed to connect to TIDAL CDN',
        details: err.message,
      });
    }
  }
}
