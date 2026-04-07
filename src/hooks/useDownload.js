import { useState } from 'react';
import { tidalAPI } from '../lib/tidal';
import JSZip from 'jszip';

/**
 * useDownload — downloads TIDAL tracks via proxy endpoints.
 * - downloadTrack: single track download
 * - downloadPlaylistAsZip: all tracks bundled into a ZIP named after the playlist
 */
export function useDownload() {
  const [downloads, setDownloads] = useState(new Map());
  const [zipProgress, setZipProgress] = useState(null); // { current, total, name, status }

  const updateTask = (taskId, updates) => {
    setDownloads(prev => {
      const updated = new Map(prev);
      const task = updated.get(taskId);
      if (task) Object.assign(task, updates);
      return updated;
    });
  };

  // ── Single track download ────────────────────────────────────────────────
  const downloadTrack = async (track, quality = 'LOSSLESS') => {
    const trackId = track.tidalId || track.id;

    if (!trackId) {
      alert('Cannot download — TIDAL ID not found for this track');
      return;
    }

    const taskId = `${trackId}-${Date.now()}`;
    const artistName = track.artist?.name || track.artist || 'Unknown';
    const trackTitle = track.title || 'Unknown';
    const filename = `${artistName} - ${trackTitle}.flac`;

    setDownloads(prev => new Map(prev).set(taskId, {
      id: taskId,
      title: trackTitle,
      progress: 0,
      status: 'downloading',
    }));

    try {
      await tidalAPI.downloadTrack(trackId, quality, filename, {
        skipEmbedding: true,
        onProgress: ({ stage, receivedBytes, totalBytes }) => {
          if (stage === 'downloading' && totalBytes) {
            const percent = Math.round((receivedBytes / totalBytes) * 100);
            updateTask(taskId, { progress: Math.min(percent, 99), status: 'downloading' });
          }
        },
      });

      updateTask(taskId, { status: 'complete', progress: 100 });

      setTimeout(() => {
        setDownloads(prev => {
          const updated = new Map(prev);
          updated.delete(taskId);
          return updated;
        });
      }, 3000);

    } catch (error) {
      console.error('Download failed:', error);
      updateTask(taskId, { status: 'error' });
    }
  };

  // ── Playlist ZIP download ────────────────────────────────────────────────
  /**
   * Downloads all tracks in `tracks` as a single ZIP file.
   * ZIP filename: "{playlistName}.zip"
   * Contents: "{index:02} - {Artist} - {Title}.flac"
   */
  const downloadPlaylistAsZip = async (tracks, playlistName = 'Playlist', quality = 'LOSSLESS') => {
    const downloadable = tracks.filter(t => t.canDownload && (t.tidalId || t.id));
    if (downloadable.length === 0) {
      alert('No downloadable tracks found in this playlist.');
      return;
    }

    const safeName = playlistName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Playlist';

    setZipProgress({ current: 0, total: downloadable.length, name: safeName, status: 'downloading' });

    const zip = new JSZip();
    const failed = [];

    for (let i = 0; i < downloadable.length; i++) {
      const track = downloadable[i];
      const trackId = track.tidalId || track.id;
      const artistName = (track.artist?.name || track.artist || 'Unknown').replace(/[\\/:*?"<>|]/g, '_');
      const trackTitle = (track.title || 'Unknown').replace(/[\\/:*?"<>|]/g, '_');
      const index = String(i + 1).padStart(2, '0');
      const filename = `${index} - ${artistName} - ${trackTitle}.flac`;

      setZipProgress(prev => ({
        ...prev,
        current: i + 1,
        currentTrack: track.title,
        status: 'downloading',
      }));

      try {
        const { blob } = await tidalAPI.fetchTrackBlob(trackId, quality, filename, {
          skipEmbedding: true,
          onProgress: ({ stage, receivedBytes, totalBytes }) => {
            if (stage === 'downloading' && totalBytes) {
              const innerPercent = Math.round((receivedBytes / totalBytes) * 100);
              setZipProgress(prev => prev ? { ...prev, trackPercent: innerPercent } : prev);
            }
          },
        });
        zip.file(filename, blob);
      } catch (err) {
        console.warn(`[ZIP] Failed to download "${track.title}":`, err.message);
        failed.push(track.title);
      }

      // Small delay to avoid rate-limiting
      if (i < downloadable.length - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    // Add error log if any tracks failed
    if (failed.length > 0) {
      zip.file('_FAILED_TRACKS.txt', `The following tracks could not be downloaded:\n\n${failed.map((t, i) => `${i + 1}. ${t}`).join('\n')}`);
    }

    setZipProgress(prev => ({ ...prev, status: 'zipping', trackPercent: null }));

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'STORE', // No compression for audio — faster
    }, (meta) => {
      setZipProgress(prev => prev ? { ...prev, zipPercent: Math.round(meta.percent) } : prev);
    });

    // Trigger ZIP download
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setZipProgress(prev => ({ ...prev, status: 'complete', zipPercent: 100 }));

    // Clear after 4s
    setTimeout(() => setZipProgress(null), 4000);
  };

  return { downloads, downloadTrack, downloadPlaylistAsZip, zipProgress };
}
