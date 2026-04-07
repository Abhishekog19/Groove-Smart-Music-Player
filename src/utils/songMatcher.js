import { db } from '../lib/db/indexedDB';

function stringSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

function normalize(str) {
  return str.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

export async function matchToLocalLibrary(importedTrack) {
  const localSongs = await db.songs.toArray();
  
  if (importedTrack.isrc) {
    const isrcMatch = localSongs.find(song => song.isrc && song.isrc === importedTrack.isrc);
    if (isrcMatch) return { match: isrcMatch, confidence: 1.0, method: 'isrc' };
  }
  
  const importedTitle = normalize(importedTrack.title);
  const importedArtist = normalize(importedTrack.artist);
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const song of localSongs) {
    const titleSim = stringSimilarity(importedTitle, normalize(song.title));
    const artistSim = stringSimilarity(importedArtist, normalize(song.artist));
    const score = (titleSim * 0.6) + (artistSim * 0.4);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = song;
    }
  }
  
  if (bestScore >= 0.7) {
    return { match: bestMatch, confidence: bestScore, method: 'fuzzy' };
  }
  
  return { match: null, confidence: 0, method: null };
}

export async function batchMatchTracks(importedTracks) {
  const results = [];
  for (const track of importedTracks) {
    const matchResult = await matchToLocalLibrary(track);
    results.push({
      ...track,
      localMatch: matchResult.match,
      matchConfidence: matchResult.confidence,
      matchMethod: matchResult.method,
      hasLocalFile: !!matchResult.match,
      needsUpload: !matchResult.match && !track.canDownload
    });
  }
  return results;
}
