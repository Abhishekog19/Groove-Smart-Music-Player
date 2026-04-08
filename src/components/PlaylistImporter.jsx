import { useState } from 'react';
import { usePlaylistImport } from '../hooks/usePlaylistImport';
import { useDownload } from '../hooks/useDownload';
import { Play, Upload, Music, Download, AlertCircle, CheckCircle, Loader, FolderDown, Package } from 'lucide-react';
import { usePlayerStore } from '../store/store';

export default function PlaylistImporter() {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const { importPlaylist, isImporting, progress, importedTracks, playlistName, error, reset } = usePlaylistImport();
  const { downloads, downloadTrack, downloadPlaylistAsZip, zipProgress } = useDownload();
  const playSong = usePlayerStore(state => state.playSong);

  const handleImport = () => importPlaylist(playlistUrl);
  const handlePlayTrack = (track) => track.hasLocalFile && playSong(track.localMatch);
  const handleDownloadTrack = (track) => downloadTrack(track, 'LOSSLESS');
  const handleDownloadAll = () => {
    const downloadable = importedTracks.filter(t => t.canDownload);
    downloadPlaylistAsZip(downloadable, playlistName || 'Spotify Playlist', 'LOSSLESS');
  };
  const handlePreview = (url) => url && new Audio(url).play();

  const stats = {
    total: importedTracks.length,
    matched: importedTracks.filter(t => t.hasLocalFile).length,
    canDownload: importedTracks.filter(t => t.canDownload).length,
    needsUpload: importedTracks.filter(t => !t.hasLocalFile && !t.canDownload).length,
  };

  const isZipping = zipProgress && zipProgress.status !== 'complete';
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Header */}
      <div className="animate-fade-up">
        <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 6 }}>
          Import from Spotify
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          Paste a Spotify link below — works with share links from the mobile app too.
        </p>

        {/* URL input */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="Paste Spotify link (playlist, track, or album)"
            className="s-input"
            style={{ flex: 1 }}
            disabled={isImporting}
          />
          <button
            className="btn-accent"
            onClick={handleImport}
            disabled={isImporting || !playlistUrl.trim()}
            style={{ opacity: isImporting || !playlistUrl.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}
          >
            {isImporting ? 'Importing…' : 'Import'}
          </button>
        </div>

        {/* Progress */}
        {isImporting && (
          <div style={{ marginTop: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{progress.message}</span>
              <span style={{ color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>{progress.current}/{progress.total}</span>
            </div>
            <div className="progress-track" style={{ height: 4 }}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, color: '#fca5a5', fontSize: '0.85rem' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} /> {error}
          </div>
        )}
      </div>

      {/* ZIP progress */}
      {zipProgress && (
        <div className="animate-fade-up" style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 14, padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {zipProgress.status === 'complete' ? <CheckCircle size={18} style={{ color: '#22c55e' }} /> : <Loader size={18} style={{ color: '#0ea5e9', animation: 'spin 1s linear infinite' }} />}
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {zipProgress.status === 'complete' ? `✅ "${zipProgress.name}.zip" downloaded!`
                : zipProgress.status === 'zipping' ? `📦 Creating "${zipProgress.name}.zip"…`
                : `⬇️ Downloading "${zipProgress.name}" — ${zipProgress.current}/${zipProgress.total}`}
            </span>
          </div>
          {zipProgress.status !== 'complete' && (
            <>
              <div className="progress-track" style={{ marginBottom: 6 }}>
                <div className="progress-fill" style={{
                  width: zipProgress.status === 'zipping' ? `${zipProgress.zipPercent || 0}%` : `${Math.round(((zipProgress.current-1)/zipProgress.total)*100)}%`,
                  background: '#0ea5e9'
                }} />
              </div>
              {zipProgress.currentTrack && zipProgress.status === 'downloading' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 250 }}>{zipProgress.currentTrack}</span>
                  <span>{zipProgress.trackPercent != null ? `${zipProgress.trackPercent}%` : '…'}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Results */}
      {importedTracks.length > 0 && (
        <div className="animate-fade-up">
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[
              { val: stats.total,       label: 'Total',        color: 'var(--accent)' },
              { val: stats.matched,     label: 'In Library',   color: '#22c55e' },
              { val: stats.canDownload, label: 'Can Download', color: '#0ea5e9' },
              { val: stats.needsUpload, label: 'Need Upload',  color: '#f59e0b' },
            ].map(({ val, label, color }) => (
              <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>{val}</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Download all ZIP */}
          {stats.canDownload > 0 && (
            <button
              className="btn-accent"
              onClick={handleDownloadAll}
              disabled={isZipping}
              style={{ width: '100%', padding: '1rem', fontSize: '0.95rem', borderRadius: 12, marginBottom: '1.5rem', opacity: isZipping ? 0.6 : 1, background: '#0ea5e9', boxShadow: '0 4px 20px rgba(14,165,233,0.3)' }}
              onMouseEnter={e => { if(!isZipping) e.currentTarget.style.background = '#0284c7' }}
              onMouseLeave={e => e.currentTarget.style.background = '#0ea5e9'}
            >
              {isZipping ? (
                <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Building ZIP… {zipProgress?.current}/{zipProgress?.total}</>
              ) : (
                <><FolderDown size={18} /> Download All as ZIP ({stats.canDownload} tracks) — {playlistName || 'Playlist'}.zip</>
              )}
            </button>
          )}

          {/* Track list header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontWeight: 800, fontSize: '1.15rem' }}>{playlistName ? `"${playlistName}"` : 'Imported Tracks'}</h2>
            <button className="btn-ghost" onClick={reset} style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>Clear</button>
          </div>

          {/* Tracks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {importedTracks.map((track, idx) => {
              const dl = Array.from(downloads.values()).find(d => d.title === track.title);
              return (
                <div key={track.spotifyId || idx} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, transition: 'border-color 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  {/* Art */}
                  <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elevated)', flexShrink: 0 }}>
                    {track.albumArt ? <img src={track.albumArt} alt={track.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🎵</span>}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{track.artist}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {track.hasLocalFile && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', fontSize: '0.62rem', fontWeight: 700, color: '#22c55e' }}>
                          <CheckCircle size={10} /> IN LIBRARY
                        </span>
                      )}
                      {track.canDownload && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', fontSize: '0.62rem', fontWeight: 700, color: '#0ea5e9' }}>
                          <Download size={10} /> TIDAL FLAC
                        </span>
                      )}
                      {isZipping && track.canDownload && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', fontSize: '0.62rem', fontWeight: 700, color: '#0ea5e9', animation: 'pulse-accent 2s infinite' }}>
                          <Package size={10} /> In ZIP
                        </span>
                      )}
                    </div>

                    {/* Download progress bar */}
                    {dl?.status === 'downloading' && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-subtle)', marginBottom: 3 }}>
                          <span>Downloading…</span><span>{dl.progress}%</span>
                        </div>
                        <div className="progress-track" style={{ height: 3 }}>
                          <div className="progress-fill" style={{ width: `${dl.progress}%`, background: '#0ea5e9' }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    {track.previewUrl && (
                      <button className="btn-icon" onClick={() => handlePreview(track.previewUrl)} title="Preview"><Music size={16} /></button>
                    )}
                    {track.hasLocalFile && (
                      <button className="btn-accent" onClick={() => handlePlayTrack(track)} style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem', background: '#22c55e', boxShadow: 'none' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#16a34a'}
                        onMouseLeave={e => e.currentTarget.style.background = '#22c55e'}>
                        <Play size={14} fill="currentColor" /> Play
                      </button>
                    )}
                    {track.canDownload && !track.hasLocalFile && (
                      <button className="btn-accent" onClick={() => handleDownloadTrack(track)}
                        disabled={dl?.status === 'downloading' || isZipping}
                        style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem', background: '#0ea5e9', boxShadow: 'none', opacity: (dl?.status === 'downloading' || isZipping) ? 0.5 : 1 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#0284c7'}
                        onMouseLeave={e => e.currentTarget.style.background = '#0ea5e9'}>
                        {dl?.status === 'downloading' ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> {dl.progress}%</> : <><Download size={14} /> Download</>}
                      </button>
                    )}
                    {!track.hasLocalFile && !track.canDownload && (
                      <button className="btn-accent" style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem', background: '#f59e0b', boxShadow: 'none' }}>
                        <Upload size={14} /> Upload
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
