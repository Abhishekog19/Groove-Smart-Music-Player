import { useNavigate } from 'react-router-dom';
import { Play, Pause, SkipBack, SkipForward, Heart, Shuffle, Repeat, Volume2, VolumeX, ChevronLeft, ListMusic } from 'lucide-react';
import { usePlayerStore } from '../store/store.js';
import { audioPlayer } from '../lib/audio/audioPlayer';

function fmt(secs) {
  const s = Math.floor(secs || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function CoverArt({ song }) {
  const base = {
    width: '100%', aspectRatio: '1/1', borderRadius: 16, overflow: 'hidden',
    background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '4rem',
    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
  };
  if (song?.cover?.startsWith?.('http')) {
    return <div style={base}><img src={song.cover} alt={song.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  }
  return <div style={base}>{song?.cover || '🎵'}</div>;
}

function ControlBtn({ onClick, children, active, title, size = 'md' }) {
  const dim = size === 'lg' ? 56 : size === 'sm' ? 36 : 44;
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: dim, height: dim, borderRadius: '50%',
        background: size === 'lg' ? 'var(--accent)' : active ? 'var(--accent-dim)' : 'transparent',
        border: size === 'lg' ? 'none' : '1px solid ' + (active ? 'var(--border-accent)' : 'transparent'),
        color: size === 'lg' ? '#fff' : active ? 'var(--accent-light)' : 'var(--text-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
        boxShadow: size === 'lg' ? 'var(--shadow-accent)' : 'none',
      }}
      onMouseEnter={e => { if (size !== 'lg') e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; else e.currentTarget.style.background = '#6d28d9'; }}
      onMouseLeave={e => { if (size !== 'lg') e.currentTarget.style.background = active ? 'var(--accent-dim)' : 'transparent'; else e.currentTarget.style.background = 'var(--accent)'; }}
    >
      {children}
    </button>
  );
}

export default function Player() {
  const navigate = useNavigate();
  const {
    currentSong, isPlaying, volume, repeat, shuffle, likedSongs,
    currentTime, duration,
    togglePlay, toggleLike, nextSong, previousSong,
    toggleShuffle, toggleRepeat, setVolume, setCurrentTime,
  } = usePlayerStore();

  if (!currentSong) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '4rem' }}>🎧</div>
      <p style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Nothing playing</p>
      <p style={{ fontSize: '0.875rem' }}>Go to the Library or Search and pick a song</p>
      <button className="btn-accent" onClick={() => navigate('/library')}>Open Library</button>
    </div>
  );

  const totalSecs   = duration || currentSong.durationSeconds || 0;
  const progressPct = totalSecs > 0 ? Math.min(100, (currentTime / totalSecs) * 100) : 0;
  const liked       = likedSongs?.has?.(currentSong.id);

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioPlayer.seekFraction(f);
    setCurrentTime(f * totalSecs);
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }} className="animate-fade-up">

      {/* Back */}
      <button className="btn-icon" onClick={() => navigate(-1)} style={{ alignSelf: 'flex-start', gap: '0.4rem', display: 'flex', alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.4rem 0.75rem', borderRadius: 8 }}>
        <ChevronLeft size={16} /> Back
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem', alignItems: 'center' }}>

        {/* ── Cover ── */}
        <div style={{ position: 'relative' }}>
          <CoverArt song={currentSong} />
          {isPlaying && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: 16, boxShadow: '0 0 60px rgba(124,58,237,0.25)', pointerEvents: 'none' }} />
          )}
        </div>

        {/* ── Info + controls ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Song info */}
          <div>
            <div style={{ fontSize: 'clamp(1.1rem, 3vw, 1.6rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: '0.4rem' }}>
              {currentSong.title}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{currentSong.artist}</div>
            {currentSong.album && <div style={{ color: 'var(--text-subtle)', fontSize: '0.8rem', marginTop: 2 }}>{currentSong.album}</div>}
          </div>

          {/* Progress */}
          <div>
            <div
              className="progress-track"
              onClick={handleSeek}
              style={{ height: 5, marginBottom: '0.5rem', cursor: 'pointer' }}
            >
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>
              <span>{fmt(currentTime)}</span>
              <span>{totalSecs > 0 ? fmt(totalSecs) : currentSong.duration || '0:00'}</span>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <ControlBtn onClick={toggleShuffle} active={shuffle} title="Shuffle" size="sm"><Shuffle size={17} /></ControlBtn>
            <ControlBtn onClick={previousSong} title="Previous"><SkipBack size={20} /></ControlBtn>
            <ControlBtn onClick={togglePlay} size="lg" title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: 3 }} />}
            </ControlBtn>
            <ControlBtn onClick={nextSong} title="Next"><SkipForward size={20} /></ControlBtn>
            <div style={{ position: 'relative' }}>
              <ControlBtn onClick={toggleRepeat} active={repeat !== 'none'} title={`Repeat: ${repeat}`} size="sm">
                <Repeat size={17} />
              </ControlBtn>
              {repeat === 'one' && (
                <span style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: '0.55rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
              )}
            </div>
          </div>

          {/* Volume + like */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => setVolume(volume > 0 ? 0 : 0.7)} className="btn-icon" style={{ flexShrink: 0 }}>
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(parseFloat(e.target.value))} style={{ flex: 1 }} />
            <button
              onClick={() => toggleLike(currentSong.id)}
              className="btn-icon"
              style={{ flexShrink: 0, color: liked ? '#f43f5e' : undefined }}
            >
              <Heart size={18} fill={liked ? '#f43f5e' : 'none'} />
            </button>
            <button onClick={() => navigate('/library')} className="btn-icon" style={{ flexShrink: 0 }}>
              <ListMusic size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile single-column fallback */}
      <style>{`
        @media (max-width: 580px) {
          .player-grid { grid-template-columns: 1fr !important; max-width: 320px; margin: 0 auto; }
        }
      `}</style>
    </div>
  );
}
