import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Pause, SkipBack, SkipForward, Heart, Shuffle, Repeat,
  Volume2, VolumeX, ChevronLeft, ListMusic, Mic2, Music2,
} from 'lucide-react';
import { usePlayerStore } from '../store/store.js';
import { audioPlayer } from '../lib/audio/audioPlayer';
import { useLyrics } from '../hooks/useLyrics.js';
import { useRecommendations } from '../hooks/useRecommendations.js';
import { useTrackEnrichment } from '../hooks/useTrackEnrichment.js';
import { LyricsPanel } from '../components/player/LyricsPanel.jsx';
import { RecommendationsPanel } from '../components/player/RecommendationsPanel.jsx';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function fmt(secs) {
  const s = Math.floor(secs || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * CoverArt
 *
 * Renders the track cover in one of three ways (priority order):
 *   1. Animated video cover (MP4 loop) — from getVideoCoverUrl, if available
 *   2. Static cover image — from getCoverUrl (640px enriched) or search thumbnail
 *   3. Emoji fallback — when no URL is available
 *
 * The video cover plays silently and loops, giving a subtle animated feel
 * for tracks that have TIDAL video covers without any quality indicators.
 */
function CoverArt({ song, glowing, coverUrl, videoCoverUrl }) {
  const [videoError, setVideoError] = useState(false);

  const shadow = glowing
    ? '0 24px 60px rgba(0,0,0,0.5), 0 0 60px rgba(124,58,237,0.25)'
    : '0 24px 60px rgba(0,0,0,0.5)';

  const base = {
    width: '100%', aspectRatio: '1/1', borderRadius: 16, overflow: 'hidden',
    background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '4rem',
    boxShadow: shadow,
    transition: 'box-shadow 0.6s ease',
    position: 'relative',
  };

  // Resolve which image to show: enriched 640px cover > search thumbnail
  const imgUrl = coverUrl || (song?.cover?.startsWith?.('http') ? song.cover : null);

  // Video cover — only show if we have a URL and it hasn't errored
  const showVideo = videoCoverUrl && !videoError;

  return (
    <div style={base}>
      {/* Video cover (MP4 loop) — rendered behind the still image */}
      {showVideo && (
        <video
          key={videoCoverUrl}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setVideoError(true)}
          style={{
            position:   'absolute',
            inset:      0,
            width:      '100%',
            height:     '100%',
            objectFit:  'cover',
            zIndex:     1,
          }}
        >
          <source src={videoCoverUrl} type="video/mp4" />
        </video>
      )}

      {/* Still image cover — shown when no video, or as poster behind fading video */}
      {imgUrl && !showVideo && (
        <img
          src={imgUrl}
          alt={song?.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
        />
      )}

      {/* Emoji fallback */}
      {!imgUrl && !showVideo && (
        <span style={{ zIndex: 2 }}>{song?.cover || '🎵'}</span>
      )}
    </div>
  );
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
      onMouseEnter={e => {
        if (size !== 'lg') e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
        else e.currentTarget.style.background = '#6d28d9';
      }}
      onMouseLeave={e => {
        if (size !== 'lg') e.currentTarget.style.background = active ? 'var(--accent-dim)' : 'transparent';
        else e.currentTarget.style.background = 'var(--accent)';
      }}
    >
      {children}
    </button>
  );
}

/* ─── View tab toggle ────────────────────────────────────────────────────── */

function ViewToggle({ view, onChange }) {
  const tabs = [
    { id: 'cover',  icon: Music2, label: 'Cover'  },
    { id: 'lyrics', icon: Mic2,   label: 'Lyrics' },
  ];
  return (
    <div style={{
      display: 'inline-flex', background: 'rgba(255,255,255,0.05)',
      border: '1px solid var(--border)', borderRadius: 99,
      padding: '3px', gap: '2px', alignSelf: 'center',
    }}>
      {tabs.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.3rem 0.9rem', borderRadius: 99, border: 'none',
            cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
            transition: 'all 0.18s',
            background:  view === id ? 'var(--accent)' : 'transparent',
            color:       view === id ? '#fff'          : 'var(--text-muted)',
            boxShadow:   view === id ? 'var(--shadow-accent)' : 'none',
          }}
        >
          <Icon size={13} />{label}
        </button>
      ))}
    </div>
  );
}

/* ─── Player page ─────────────────────────────────────────────────────────── */

export default function Player() {
  const navigate = useNavigate();
  const [view, setView] = useState('cover'); // 'cover' | 'lyrics'

  const {
    currentSong, isPlaying, volume, repeat, shuffle, likedSongs,
    currentTime, duration,
    togglePlay, toggleLike, nextSong, previousSong,
    toggleShuffle, toggleRepeat, setVolume, setCurrentTime,
    playWithQueue,
  } = usePlayerStore();

  // ── Lyrics ──────────────────────────────────────────────────────────────────
  const { lines, activeIndex, status: lyricsStatus, isSynced } = useLyrics(currentSong, currentTime);

  // ── Recommendations ─────────────────────────────────────────────────────────
  const { tracks: recTracks, status: recStatus } = useRecommendations(currentSong);

  // ── Track metadata enrichment (cover upgrade + video cover + artist pic) ────
  // Uses getPreferredTrackMetadata → getCoverUrl + getVideoCoverUrl silently.
  // No quality badges — purely visual: better cover art and animated covers.
  const { coverUrl, videoCoverUrl } = useTrackEnrichment(currentSong);

  // ── Nothing playing ─────────────────────────────────────────────────────────
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

  const handleLyricSeek = (time) => {
    if (!totalSecs) return;
    audioPlayer.seekFraction(time / totalSecs);
    setCurrentTime(time);
  };

  // Play a recommendation — push it to front of queue and play immediately
  const handlePlayRecommendation = (song) => {
    playWithQueue(song, [song, ...recTracks.filter(t => t.id !== song.id)]);
  };

  return (
    <div
      style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}
      className="animate-fade-up"
    >
      {/* ── Back ── */}
      <button
        className="btn-icon"
        onClick={() => navigate(-1)}
        style={{ alignSelf: 'flex-start', gap: '0.4rem', display: 'flex', alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.4rem 0.75rem', borderRadius: 8 }}
      >
        <ChevronLeft size={16} /> Back
      </button>

      {/* ── View toggle ── */}
      <ViewToggle view={view} onChange={setView} />

      {/* ── Main grid: cover/lyrics + controls ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem', alignItems: 'start' }}>

        {/* Left panel */}
        <div style={{ position: 'relative' }}>
          {view === 'cover' ? (
            <CoverArt
              song={currentSong}
              glowing={isPlaying}
              coverUrl={coverUrl}
              videoCoverUrl={videoCoverUrl}
            />
          ) : (
            <LyricsPanel
              lines={lines}
              activeIndex={activeIndex}
              status={lyricsStatus}
              isRightToLeft={false}
              isSynced={isSynced}
              songTitle={currentSong.title}
              onSeek={handleLyricSeek}
            />
          )}
        </div>

        {/* Right panel: info + controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Song info */}
          <div>
            <div style={{ fontSize: 'clamp(1.1rem,3vw,1.55rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: '0.4rem' }}>
              {currentSong.title}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{currentSong.artist}</div>
            {currentSong.album && (
              <div style={{ color: 'var(--text-subtle)', fontSize: '0.8rem', marginTop: 2 }}>{currentSong.album}</div>
            )}

            {/* Lyrics badge */}
            {lyricsStatus === 'ready' && view === 'cover' && (
              <button
                onClick={() => setView('lyrics')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  marginTop: '0.6rem', padding: '0.25rem 0.65rem', borderRadius: 99,
                  border: '1px solid rgba(167,139,250,0.35)', background: 'rgba(124,58,237,0.12)',
                  color: 'var(--accent-light)', fontSize: '0.7rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.22)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(124,58,237,0.12)'}
              >
                <Mic2 size={11} /> {isSynced ? 'Synced lyrics — view' : 'Lyrics available — view'}
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div>
            <div className="progress-track" onClick={handleSeek} style={{ height: 5, marginBottom: '0.5rem', cursor: 'pointer' }}>
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>
              <span>{fmt(currentTime)}</span>
              <span>{totalSecs > 0 ? fmt(totalSecs) : currentSong.duration || '0:00'}</span>
            </div>
          </div>

          {/* Playback controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <ControlBtn onClick={toggleShuffle} active={shuffle}           title="Shuffle" size="sm"><Shuffle     size={17}/></ControlBtn>
            <ControlBtn onClick={previousSong}                             title="Previous"           ><SkipBack    size={20}/></ControlBtn>
            <ControlBtn onClick={togglePlay}    size="lg"                  title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause size={24}/> : <Play size={24} style={{ marginLeft: 3 }}/>}
            </ControlBtn>
            <ControlBtn onClick={nextSong}                                 title="Next"               ><SkipForward size={20}/></ControlBtn>
            <div style={{ position: 'relative' }}>
              <ControlBtn onClick={toggleRepeat} active={repeat !== 'none'} title={`Repeat: ${repeat}`} size="sm"><Repeat size={17}/></ControlBtn>
              {repeat === 'one' && (
                <span style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: '0.55rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
              )}
            </div>
          </div>

          {/* Volume + like + library */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => setVolume(volume > 0 ? 0 : 0.7)} className="btn-icon" style={{ flexShrink: 0 }}>
              {volume === 0 ? <VolumeX size={18}/> : <Volume2 size={18}/>}
            </button>
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(parseFloat(e.target.value))} style={{ flex: 1 }} />
            <button onClick={() => toggleLike(currentSong.id)} className="btn-icon" style={{ flexShrink: 0, color: liked ? '#f43f5e' : undefined }}>
              <Heart size={18} fill={liked ? '#f43f5e' : 'none'}/>
            </button>
            <button onClick={() => navigate('/library')} className="btn-icon" style={{ flexShrink: 0 }}>
              <ListMusic size={18}/>
            </button>
          </div>
        </div>
      </div>

      {/* ── Recommendations — full width below the grid ── */}
      <RecommendationsPanel
        tracks={recTracks}
        status={recStatus}
        onPlay={handlePlayRecommendation}
        currentSongTitle={currentSong.title}
      />
    </div>
  );
}
