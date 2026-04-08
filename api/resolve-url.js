/**
 * Vercel Serverless Function: /api/resolve-url
 * Resolves shortened URLs (e.g. spotify.link) by following HTTP redirects.
 */

const TRACKING_PARAMS = [
  'si', 'nd', 'dl_branch', 'context', '_branch_match_id',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'feature', 'app_destination', '_branch_referrer', 'dlsi',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing required parameter: url' });

  try {
    let resolvedUrl = url;

    for (const method of ['HEAD', 'GET']) {
      try {
        const response = await fetch(url, {
          method,
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(8000),
        });

        resolvedUrl = response.url || url;

        // Clean tracking params
        try {
          const parsed = new URL(resolvedUrl);
          for (const param of TRACKING_PARAMS) {
            parsed.searchParams.delete(param);
          }
          resolvedUrl = parsed.toString();
        } catch { /* keep as-is */ }

        console.log(`[resolve-url] ${url} → ${resolvedUrl}`);
        break;
      } catch (err) {
        if (method === 'HEAD') {
          console.warn(`[resolve-url] HEAD failed, trying GET:`, err.message);
          continue;
        }
        throw err;
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.json({ resolvedUrl, originalUrl: url });
  } catch (err) {
    console.error('[resolve-url] Failed:', err.message);
    return res.status(502).json({
      error: 'Failed to resolve URL',
      details: err.message,
      resolvedUrl: url,
    });
  }
}
