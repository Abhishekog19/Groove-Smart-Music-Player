import { Play, TrendingUp, Clock, Headphones, Disc3 } from 'lucide-react';
import { usePlayerStore, useLibraryStore } from '../store/store.js';

function CoverArt({ song, size = 40 }) {
  const s = { width: size, height: size, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: size * 0.45 };
  if (song?.cover?.startsWith?.('http')) return <div style={s}><img src={song.cover} alt={song.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  return <div style={s}>{song?.cover || '🎵'}</div>;
}

function StatCard({ icon: Icon, value, label, delay, color = 'var(--accent)' }) {
  return (
    <div className={`animate-fade-up delay-${delay}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, background: color + '22', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const { playSong, isPlaying, currentSong } = usePlayerStore();
  const { songs, playlists } = useLibraryStore();

  const recentSongs = songs.slice(0, 6);
  const topSongs    = songs.slice(0, 8);
  const totalMins   = Math.floor(songs.reduce((a, s) => a + (s.durationSeconds || 0), 0) / 60);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {/* ── Hero ── */}
      <section className="animate-fade-up">
        <p className="section-title" style={{ marginBottom: '0.4rem' }}>{greeting()}</p>
        <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: '0.5rem' }}>
          Welcome Back
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {songs.length > 0 ? `${songs.length} tracks in your library` : 'Your library is empty — upload music or use the Search tab'}
        </p>
      </section>

      {/* ── Stats ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        <StatCard icon={TrendingUp} value={songs.length} label="Total Tracks"  delay={1} color="#7c3aed" />
        <StatCard icon={Clock}      value={`${totalMins}m`} label="Total Time" delay={2} color="#0ea5e9" />
        <StatCard icon={Headphones} value={playlists.length} label="Playlists"  delay={3} color="#22c55e" />
      </section>

      {/* ── Now playing ── */}
      {currentSong && (
        <section className="animate-fade-up">
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>Now Playing</p>
          <div
            onClick={() => playSong(currentSong)}
            style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(167,139,250,0.08))', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(124,58,237,0.25)'}
          >
            <CoverArt song={currentSong} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-light)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                {isPlaying && <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 10 }}><span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" /></span>}
                Now Playing
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentSong.title}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentSong.artist} {currentSong.album ? `· ${currentSong.album}` : ''}</div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Play size={15} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
            </div>
          </div>
        </section>
      )}

      {/* ── Recent tracks ── */}
      {recentSongs.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Disc3 size={18} style={{ color: 'var(--accent-light)' }} />
            <p className="section-title">Recent</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
            {recentSongs.map((song, i) => (
              <div
                key={song.id}
                onClick={() => playSong(song)}
                className={`animate-fade-up delay-${Math.min(i+1, 4)}`}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '0.75rem', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s', position: 'relative', overflow: 'hidden' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ width: '100%', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: '0.6rem', position: 'relative' }}>
                  {song.cover?.startsWith?.('http')
                    ? <img src={song.cover} alt={song.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : song.cover || '🎵'}
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.4)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0)'}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = 0; }}>
                      <Play size={13} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
                    </div>
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{song.artist}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Top tracks list ── */}
      {topSongs.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <TrendingUp size={18} style={{ color: 'var(--accent-light)' }} />
            <p className="section-title">Your Library</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {topSongs.map((song, idx) => {
              const active = currentSong?.id === song.id && isPlaying;
              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.55rem 0.75rem', borderRadius: 10, cursor: 'pointer', transition: 'background 0.12s', background: active ? 'rgba(124,58,237,0.12)' : 'transparent' }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 22, textAlign: 'center', fontSize: '0.72rem', color: active ? 'var(--accent-light)' : 'var(--text-subtle)', fontWeight: 600, flexShrink: 0 }}>
                    {active ? <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 10 }}><span className="eq-bar" /><span className="eq-bar" /></span> : String(idx+1).padStart(2,'0')}
                  </span>
                  <CoverArt song={song} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: active ? 'var(--accent-light)' : 'var(--text-primary)' }}>{song.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', flexShrink: 0 }}>{song.duration}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {songs.length === 0 && (
        <section style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎧</div>
          <h2 style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: '0.5rem' }}>Your library is empty</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Upload audio files, scan a folder, or search TIDAL to get started.</p>
        </section>
      )}
    </div>
  );
}
