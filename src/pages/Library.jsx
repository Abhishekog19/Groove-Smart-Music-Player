import { useState } from 'react';
import { Play, Heart, Search, Filter, X, Trash2, AlertTriangle, RefreshCw, Music2 } from 'lucide-react';
import { usePlayerStore, useLibraryStore } from '../store/store.js';
import UploadButton from '../components/library/UploadButton';

function CoverArt({ song, size = 40, active = false }) {
  const s = {
    width: size, height: size, borderRadius: 8, overflow: 'hidden',
    background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0, fontSize: size * 0.45,
    boxShadow: active ? '0 0 0 2px var(--accent)' : 'none',
    transition: 'box-shadow 0.2s',
  };
  if (song?.cover?.startsWith?.('http')) {
    return <div style={s}><img src={song.cover} alt={song.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  }
  return <div style={s}>{song?.cover || '🎵'}</div>;
}

function DeleteModal({ song, onConfirm, onCancel }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.75rem', maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
        className="animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={20} style={{ color: '#ef4444' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>Remove from library?</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>This cannot be undone.</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CoverArt song={song} size={40} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{song.artist} · {song.album}</div>
          </div>
        </div>

        <div style={{ fontSize: '0.77rem', color: 'var(--text-subtle)', lineHeight: 1.5 }}>
          {song.sourceType === 'folder'
            ? 'The entry will be removed from your library. The original file on disk is NOT deleted.'
            : 'The uploaded audio data stored in the browser will be permanently erased.'}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button id={`cancel-delete-${song.id}`} className="btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Keep it</button>
          <button
            id={`confirm-delete-${song.id}`}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.6rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
            onClick={onConfirm}
          >
            <Trash2 size={15} /> Remove
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Library() {
  const { playSong, likedSongs, toggleLike, isPlaying, currentSong, removeFromQueue } = usePlayerStore();
  const { songs, searchQuery, setSearchQuery, filterGenre, setFilterGenre, removeSong, syncFolderSongs } = useLibraryStore();

  const [showFilters, setShowFilters] = useState(false);
  const [songToDelete, setSongToDelete] = useState(null);
  const [removingIds, setRemovingIds]   = useState(new Set());
  const [isResyncing, setIsResyncing]   = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncToast, setSyncToast]       = useState(null);

  const showToast = (msg, type = 'success') => {
    setSyncToast({ msg, type });
    setTimeout(() => setSyncToast(null), 3500);
  };

  const hasFolderSongs = songs.some(s => s.sourceType === 'folder');

  const handleRescan = async () => {
    setIsResyncing(true); setSyncProgress(0);
    try {
      const result = await syncFolderSongs(count => setSyncProgress(count));
      if (result.needsSetup) showToast('No folder linked yet. Use Scan Folder to add music.', 'info');
      else if (result.added === 0 && result.removed === 0) showToast('Library is up to date ✓');
      else {
        const parts = [];
        if (result.added   > 0) parts.push(`+${result.added} added`);
        if (result.removed > 0) parts.push(`-${result.removed} removed`);
        showToast(`Synced: ${parts.join(', ')}`);
      }
    } catch { showToast('Sync failed — check folder permission', 'error'); }
    finally { setIsResyncing(false); setSyncProgress(0); }
  };

  const genres = ['all', ...new Set(songs.map(s => s.genre).filter(Boolean))];

  const filteredSongs = songs.filter(song => {
    if (removingIds.has(song.id)) return false;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q) || song.album?.toLowerCase().includes(q);
    const matchGenre  = filterGenre === 'all' || song.genre === filterGenre;
    return matchSearch && matchGenre;
  });

  const requestDelete = (e, song) => { e.stopPropagation(); setSongToDelete(song); };

  const confirmDelete = () => {
    const song = songToDelete;
    setSongToDelete(null);
    setRemovingIds(p => new Set([...p, song.id]));
    removeFromQueue?.(song.id);
    removeSong(song.id);
    setTimeout(() => setRemovingIds(p => { const n = new Set(p); n.delete(song.id); return n; }), 400);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Toast */}
      {syncToast && (
        <div className="animate-fade-up" style={{
          position: 'fixed', bottom: 96, right: 20, zIndex: 60,
          background: syncToast.type === 'error' ? 'rgba(239,68,68,0.15)' : syncToast.type === 'info' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
          border: `1px solid ${syncToast.type === 'error' ? 'rgba(239,68,68,0.4)' : syncToast.type === 'info' ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.4)'}`,
          color: 'var(--text-primary)', padding: '0.65rem 1rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 500,
          boxShadow: 'var(--shadow-lg)',
        }}>
          {syncToast.msg}
        </div>
      )}

      {/* Header */}
      <div className="animate-fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1 }}>Your Library</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>{songs.length} tracks</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {hasFolderSongs && (
            <button className="btn-ghost" onClick={handleRescan} disabled={isResyncing} style={{ fontSize: '0.82rem', padding: '0.5rem 0.875rem' }}>
              <RefreshCw size={15} style={isResyncing ? { animation: 'spin 0.8s linear infinite' } : {}} />
              {isResyncing ? `Scanning${syncProgress > 0 ? ` (${syncProgress})` : '…'}` : 'Re-scan'}
            </button>
          )}
          <UploadButton />
        </div>
      </div>

      {/* Search + filter row */}
      <div className="animate-fade-up delay-1" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input
            type="text"
            placeholder="Search title, artist or album…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="s-input"
            style={{ paddingLeft: '2.4rem', paddingRight: searchQuery ? '2.2rem' : undefined }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="btn-icon" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}><X size={14} /></button>
          )}
        </div>
        <button
          className="btn-ghost"
          onClick={() => setShowFilters(!showFilters)}
          style={{ padding: '0.65rem 0.875rem', background: showFilters ? 'var(--accent-dim)' : undefined, borderColor: showFilters ? 'var(--border-accent)' : undefined, color: showFilters ? 'var(--accent-light)' : undefined }}
        >
          <Filter size={16} />
        </button>
      </div>

      {/* Genre pills */}
      {showFilters && genres.length > 1 && (
        <div className="animate-fade-in" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {genres.map(g => (
            <button key={g} onClick={() => setFilterGenre(g)} className={`genre-pill ${filterGenre === g ? 'genre-pill-active' : 'genre-pill-inactive'}`}>
              {g === 'all' ? 'All' : g}
            </button>
          ))}
        </div>
      )}

      {/* Track count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Music2 size={13} style={{ color: 'var(--text-subtle)' }} />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
          {filteredSongs.length} {filteredSongs.length === 1 ? 'track' : 'tracks'}
          {filterGenre !== 'all' && ` in ${filterGenre}`}
          {searchQuery && ` matching "${searchQuery}"`}
        </span>
      </div>

      {/* Track list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {filteredSongs.map((song, idx) => {
          const active = currentSong?.id === song.id && isPlaying;
          const liked  = likedSongs?.has?.(song.id);
          return (
            <div
              key={song.id}
              className={`animate-fade-up delay-${Math.min(idx+1, 4)}`}
              onClick={() => playSong(song)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.875rem',
                padding: '0.6rem 0.875rem', borderRadius: 10, cursor: 'pointer',
                background: active ? 'rgba(124,58,237,0.1)' : 'transparent',
                border: `1px solid ${active ? 'rgba(124,58,237,0.25)' : 'transparent'}`,
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.querySelector('.track-actions').style.opacity = 1; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.querySelector('.track-actions').style.opacity = 0; } }}
            >
              {/* Index */}
              <span style={{ width: 22, textAlign: 'center', fontSize: '0.7rem', color: active ? 'var(--accent-light)' : 'var(--text-subtle)', fontWeight: 600, flexShrink: 0 }}>
                {active
                  ? <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 10 }}><span className="eq-bar" /><span className="eq-bar" /></span>
                  : String(idx + 1).padStart(2, '0')}
              </span>

              <CoverArt song={song} size={38} active={active} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: active ? 'var(--accent-light)' : 'var(--text-primary)' }}>
                  {song.title}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                  {song.artist}{song.album ? ` · ${song.album}` : ''}
                </div>
              </div>

              {song.genre && (
                <span className="genre-pill genre-pill-inactive" style={{ fontSize: '0.65rem', padding: '0.15rem 0.55rem' }} data-hideonmobile>
                  {song.genre}
                </span>
              )}

              <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 32, textAlign: 'right' }}>
                {song.duration}
              </span>

              {/* Actions */}
              <div className="track-actions" style={{ display: 'flex', alignItems: 'center', gap: 2, opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}>
                <button
                  id={`like-song-${song.id}`}
                  className="btn-icon"
                  onClick={e => { e.stopPropagation(); toggleLike(song.id); }}
                  style={{ color: liked ? '#f43f5e' : undefined }}
                >
                  <Heart size={16} fill={liked ? '#f43f5e' : 'none'} />
                </button>
                <button
                  id={`play-song-${song.id}`}
                  className="btn-icon"
                  onClick={e => { e.stopPropagation(); playSong(song); }}
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent-light)' }}
                >
                  <Play size={15} />
                </button>
                <button
                  id={`delete-song-${song.id}`}
                  className="btn-icon"
                  onClick={e => requestDelete(e, song)}
                  style={{ color: 'var(--text-subtle)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-subtle)'}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}

        {filteredSongs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }} className="animate-fade-in">
            {songs.length === 0 ? (
              <>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎵</div>
                <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.4rem' }}>Your library is empty</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Upload audio files or scan a folder to get started</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
                <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.4rem' }}>No tracks found</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1rem' }}>Try adjusting your search or filters</p>
                <button className="btn-ghost" onClick={() => { setSearchQuery(''); setFilterGenre('all'); }}>Clear filters</button>
              </>
            )}
          </div>
        )}
      </div>

      {songToDelete && <DeleteModal song={songToDelete} onConfirm={confirmDelete} onCancel={() => setSongToDelete(null)} />}

      <style>{`
        @media (max-width: 520px) { [data-hideonmobile] { display: none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
