const MUSICBRAINZ_BASE_URL = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'SmartMusicPlayer/1.0.0 (contact@yourapp.com)';

let lastRequestTime = 0;

async function throttledFetch(url) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < 1000) {
    await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) throw new Error(`MusicBrainz API error: ${response.statusText}`);
  return response.json();
}

export async function searchByISRC(isrc) {
  if (!isrc) return null;
  
  try {
    const url = `${MUSICBRAINZ_BASE_URL}/recording?query=isrc:${isrc}&fmt=json`;
    const data = await throttledFetch(url);
    
    if (!data.recordings || data.recordings.length === 0) return null;
    
    const recording = data.recordings[0];
    
    return {
      mbid: recording.id,
      title: recording.title,
      artistCredit: recording['artist-credit']?.map(ac => ac.name).join(', '),
      length: recording.length,
      firstReleaseDate: recording['first-release-date'],
      tags: recording.tags?.map(t => t.name) || [],
      isrc: isrc
    };
  } catch (error) {
    console.error('MusicBrainz search error:', error);
    return null;
  }
}
