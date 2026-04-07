const TIDAL_API_BASE = 'https://api.tidal.com/v1';
const TIDAL_TOKEN = 'your_tidal_token'; // User must replace this for downloads

/**
 * All TIDAL API calls go through /api/proxy to avoid CORS issues.
 */
async function tidalProxyFetch(path) {
  const url = `${TIDAL_API_BASE}${path}`;
  const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
  if (!response.ok) return null;
  return response.json();
}

export async function searchTIDALByISRC(isrc) {
  try {
    const data = await tidalProxyFetch(
      `/search/tracks?query=isrc:${isrc}&countryCode=US&token=${TIDAL_TOKEN}`
    );
    return data?.items?.[0] ?? null;
  } catch (error) {
    console.error('TIDAL search error:', error);
    return null;
  }
}

export async function getTIDALStreamUrl(trackId, quality = 'LOSSLESS') {
  try {
    const response = await fetch(
      `${TIDAL_API_BASE}/tracks/${trackId}/streamUrl?quality=${quality}&countryCode=US&token=${TIDAL_TOKEN}`
    );
    
    if (!response.ok) return null;
    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error('TIDAL stream error:', error);
    return null;
  }
}

export async function downloadTrackFromTIDAL(trackId, quality, filename, onProgress) {
  try {
    const streamUrl = await getTIDALStreamUrl(trackId, quality);
    if (!streamUrl) throw new Error('Failed to get stream URL');
    
    const response = await fetch(streamUrl);
    if (!response.ok) throw new Error('Failed to fetch audio');
    
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    const reader = response.body.getReader();
    
    const chunks = [];
    let receivedBytes = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunks.push(value);
      receivedBytes += value.length;
      
      if (onProgress) {
        onProgress(receivedBytes / contentLength);
      }
    }
    
    const blob = new Blob(chunks, { type: 'audio/flac' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}
