import React from 'react';
import { Play, Sparkles, Loader2, Radio } from 'lucide-react';

/* ─── Single track card ───────────────────────────────────────────────────── */

function TrackCard({ track, onPlay, index }) {
  const [hovered, setHovered] = React.useState(false);

  const cover = track.cover?.startsWith?.('http') ? (
    <img
      src={track.cover}
      alt={track.title}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  ) : (
    <span style={{ fontSize: '1.25rem' }}>{track.cover || '🎵'}</span>
  );

  return (
    <button
      onClick={() => onPlay(track)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:         'flex',
        alignItems:      'center',
        gap:             '0.75rem',
        width:           '100%',
        background:      hovered ? 'rgba(124,58,237,0.1)' : 'rgba(255,255,255,0.03)',
        border:          `1px solid ${hovered ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius:    10,
        padding:         '0.6rem 0.75rem',
        cursor:          'pointer',
        transition:      'all 0.18s ease',
        textAlign:       'left',
        transform:       hovered ? 'translateX(3px)' : 'translateX(0)',
        animationDelay:  `${index * 0.04}s`,
        animation:       'fadeUp 0.4s ease-out both',
      }}
    >
      {/* Cover */}
      <div style={{
        width:          40,
        height:         40,
        borderRadius:   8,
        flexShrink:     0,
        background:     'var(--bg-elevated)',
        overflow:       'hidden',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        position:       'relative',
        boxShadow:      hovered ? '0 4px 12px rgba(0,0,0,0.4)' : 'none',
        transition:     'box-shadow 0.18s',
      }}>
        {cover}
        {/* Play overlay on hover */}
        {hovered && (
          <div style={{
            position:       'absolute', inset: 0,
            background:     'rgba(0,0,0,0.55)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            borderRadius:   8,
          }}>
            <Play size={14} fill="#fff" style={{ color: '#fff', marginLeft: 2 }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:     '0.82rem',
          fontWeight:   600,
          color:        hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
          whiteSpace:   'nowrap',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          transition:   'color 0.15s',
        }}>
          {track.title}
        </div>
        <div style={{
          fontSize:     '0.72rem',
          color:        'var(--text-subtle)',
          whiteSpace:   'nowrap',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          marginTop:    2,
        }}>
          {track.artist}
        </div>
      </div>

      {/* Duration */}
      {track.duration && (
        <div style={{
          fontSize:    '0.7rem',
          color:       'var(--text-subtle)',
          flexShrink:  0,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {track.duration}
        </div>
      )}
    </button>
  );
}

/* ─── Skeleton loader ─────────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.6rem 0.75rem',
      border: '1px solid rgba(255,255,255,0.04)',
      borderRadius: 10,
    }}>
      <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="skeleton" style={{ height: 11, width: '65%', borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 9,  width: '42%', borderRadius: 4 }} />
      </div>
      <div className="skeleton" style={{ height: 9, width: 30, borderRadius: 4, flexShrink: 0 }} />
    </div>
  );
}

/* ─── Main panel ──────────────────────────────────────────────────────────── */

/**
 * RecommendationsPanel
 *
 * "You May Also Like" section that appears below the player controls.
 * Shows similar track cards. Clicking a track immediately plays it.
 *
 * Props:
 *   tracks    object[]  — normalized song objects from useRecommendations
 *   status    string    — 'idle' | 'loading' | 'ready' | 'unavailable'
 *   onPlay    (song)=>void  — called when user clicks a track
 *   currentSongTitle  string  — label for the section header
 */
export function RecommendationsPanel({ tracks, status, onPlay, currentSongTitle }) {
  if (status === 'idle' || status === 'unavailable') return null;

  return (
    <div
      style={{
        marginTop:      '0.5rem',
        display:        'flex',
        flexDirection:  'column',
        gap:            '0.75rem',
        animation:      'fadeUp 0.45s ease-out both',
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{
          width:          28,
          height:         28,
          borderRadius:   8,
          background:     'var(--accent-dim)',
          border:         '1px solid var(--border-accent)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
        }}>
          {status === 'loading'
            ? <Loader2 size={13} style={{ color: 'var(--accent-light)', animation: 'spin 1.2s linear infinite' }} />
            : <Sparkles size={13} style={{ color: 'var(--accent-light)' }} />
          }
        </div>
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            You May Also Like
          </div>
          {currentSongTitle && status !== 'loading' && (
            <div style={{ fontSize: '0.67rem', color: 'var(--text-subtle)', marginTop: 1 }}>
              Similar to <span style={{ color: 'var(--text-muted)' }}>{currentSongTitle}</span>
            </div>
          )}
        </div>

        {status === 'ready' && (
          <div style={{
            marginLeft:  'auto',
            fontSize:    '0.65rem',
            fontWeight:  600,
            color:       'var(--text-subtle)',
            background:  'rgba(255,255,255,0.05)',
            border:      '1px solid rgba(255,255,255,0.08)',
            borderRadius: 99,
            padding:     '0.15rem 0.5rem',
            display:     'flex',
            alignItems:  'center',
            gap:         '0.25rem',
          }}>
            <Radio size={10} />
            {tracks.length} tracks
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: 'var(--border)', borderRadius: 1 }} />

      {/* ── Track list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {status === 'loading'
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : tracks.map((track, i) => (
              <TrackCard
                key={track.id || `rec-${i}`}
                track={track}
                onPlay={onPlay}
                index={i}
              />
            ))
        }
      </div>
    </div>
  );
}

export default RecommendationsPanel;
