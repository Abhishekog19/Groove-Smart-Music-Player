import { Play, Pause, SkipBack, SkipForward, Heart, Volume2, VolumeX, ChevronUp, AlertCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../store/store.js';
import { audioPlayer } from '../lib/audio/audioPlayer';
import { useEffect } from 'react';

function CoverArt({ song, size = 44 }) {
  const style = { width: size, height: size, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  if (song.cover && song.cover.startsWith('http')) {
    return <div style={style}><img src={song.cover} alt={song.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  }
  return <div style={{ ...style, fontSize: size * 0.45 }}>{song.cover || '🎵'}</div>;
}

export default function PlayerBar() {
  const navigate = useNavigate();
  const { currentSong, isPlaying, volume, likedSongs, currentTime, duration, togglePlay, toggleLike, nextSong, previousSong, setVolume, setCurrentTime, streamError, clearStreamError } = usePlayerStore();

  // Auto-dismiss stream error after 8 seconds
  useEffect(() => {
    if (!streamError) return;
    const t = setTimeout(clearStreamError, 8000);
    return () => clearTimeout(t);
  }, [streamError, clearStreamError]);

  if (!currentSong) return null;

  const totalSecs   = duration || currentSong.durationSeconds || 0;
  const progressPct = totalSecs > 0 ? Math.min(100, (currentTime / totalSecs) * 100) : 0;

  const fmt = (s) => { const n = Math.floor(s || 0); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioPlayer.seekFraction(fraction);
    setCurrentTime(fraction * totalSecs);
  };

  const liked = likedSongs?.has?.(currentSong.id);

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50 }}>
      {/* Stream error toast */}
      {streamError && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(220,38,38,0.92), rgba(185,28,28,0.92))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '0.5rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '0.8rem',
          color: '#fff',
          borderTop: '1px solid rgba(255,255,255,0.15)',
          animation: 'slideUp 0.2s ease',
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0, opacity: 0.9 }} />
          <span style={{ flex: 1 }}>{streamError}</span>
          <button
            onClick={clearStreamError}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px', opacity: 0.8, display: 'flex', alignItems: 'center' }}
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {/* Seek bar */}
      <div
        onClick={handleSeek}
        style={{ height: 3, background: 'rgba(255,255,255,0.08)', cursor: 'pointer', position: 'relative' }}
      >
        <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-light))', transition: 'width 0.1s linear' }} />
      </div>

      <div style={{ background: 'rgba(7,8,15,0.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid var(--border)', padding: '0.6rem 1.5rem', height: 76 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '1rem', height: '100%' }}>

          {/* ── Song info ── */}
          <div
            onClick={() => navigate('/player')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', minWidth: 0 }}
          >
            <CoverArt song={currentSong} size={44} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentSong.title}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentSong.artist}
              </div>
            </div>
            {isPlaying && (
              <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14, flexShrink: 0 }}>
                <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
              </span>
            )}
          </div>

          {/* ── Controls ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn-icon" onClick={previousSong} title="Previous"><SkipBack size={19} /></button>
            <button
              onClick={togglePlay}
              style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s, transform 0.1s', flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.background = '#6d28d9'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
            </button>
            <button className="btn-icon" onClick={nextSong} title="Next"><SkipForward size={19} /></button>
          </div>

          {/* ── Volume + Like + Time ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'right' }}>
              {fmt(currentTime)} / {totalSecs > 0 ? fmt(totalSecs) : currentSong.duration || '0:00'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} className="hide-mobile">
              <button className="btn-icon" onClick={() => setVolume(volume > 0 ? 0 : 0.7)}>
                {volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <input
                type="range" min="0" max="1" step="0.01"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                style={{ width: 80 }}
              />
            </div>
            <button
              className="btn-icon"
              onClick={() => toggleLike(currentSong.id)}
              style={{ color: liked ? '#f43f5e' : undefined }}
            >
              <Heart size={18} fill={liked ? '#f43f5e' : 'none'} />
            </button>
            <button className="btn-icon hide-mobile" onClick={() => navigate('/player')} title="Open player">
              <ChevronUp size={18} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .hide-mobile { display: flex; }
        @media (max-width: 600px) { .hide-mobile { display: none !important; } }
      `}</style>
    </div>
  );
}
