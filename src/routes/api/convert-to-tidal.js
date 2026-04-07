import express from 'express';
import axios from 'axios';

const router = express.Router();

// In-memory cache for conversions (1 hour TTL)
const conversionCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function getCacheKey(sourceUrl, userCountry) {
  return `${sourceUrl}:${userCountry}`;
}

function getCachedResult(sourceUrl, userCountry) {
  const key = getCacheKey(sourceUrl, userCountry);
  const cached = conversionCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[Cache HIT]', sourceUrl);
    return cached.data;
  }

  return null;
}

function setCachedResult(sourceUrl, userCountry, data) {
  const key = getCacheKey(sourceUrl, userCountry);
  conversionCache.set(key, {
    data,
    timestamp: Date.now()
  });

  // Clean up old entries if cache gets too large
  if (conversionCache.size > 1000) {
    const oldestKey = conversionCache.keys().next().value;
    conversionCache.delete(oldestKey);
  }
}

router.post('/convert-to-tidal', async (req, res) => {
  try {
    const { sourceUrl, userCountry = 'US', songIfSingle = true } = req.body;

    // ✅ Check cache first
    const cached = getCachedResult(sourceUrl, userCountry);
    if (cached) {
      return res.json(cached);
    }

    // Call Songlink API
    console.log('[Songlink] Converting:', sourceUrl);
    const songlinkResponse = await axios.get(
      'https://api.song.link/v1-alpha.1/links',
      {
        params: { url: sourceUrl, userCountry },
        timeout: 10000 // 10 second timeout
      }
    );

    const { entitiesByUniqueId, linksByPlatform } = songlinkResponse.data;

    // Extract TIDAL link
    const tidalLink = linksByPlatform?.tidal;
    if (!tidalLink) {
      return res.status(404).json({
        error: 'Track not found on TIDAL',
        tidalInfo: null
      });
    }

    // Extract TIDAL track ID
    const match = tidalLink.url.match(/\/track\/(\d+)/);
    if (!match?.[1]) {
      return res.status(400).json({
        error: 'Could not extract TIDAL track ID',
        tidalInfo: null
      });
    }

    const result = {
      tidalInfo: {
        type: 'track',
        id: match[1],
        url: tidalLink.url
      }
    };

    // ✅ Cache the result
    setCachedResult(sourceUrl, userCountry, result);

    return res.json(result);
  } catch (error) {
    const code = error?.response?.status || error?.code || 500;
    const message = error?.message || 'Conversion failed';

    console.error('[Songlink Error]', code, message);

    // Return 429 if rate limited
    if (code === 429) {
      return res.status(429).json({
        error: 'Rate limited, please try again later',
        tidalInfo: null
      });
    }

    return res.status(code).json({
      error: message,
      tidalInfo: null
    });
  }
});

export default router;
