import React, { useEffect, useRef } from 'react';
import { Mic2, MicOff, Loader2, AlertCircle } from 'lucide-react';

/* ─── Helper ──────────────────────────────────────────────────────────────── */

function LyricsLine({ text, isActive, isPast, isRTL, onClick }) {
  const ref = useRef(null);

  // Smooth-scroll the active line to the vertical centre of the panel
  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive]);

  return (
    <button
      ref={ref}
      onClick={onClick}
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        display:    'block',
        width:      '100%',
        textAlign:  isRTL ? 'right' : 'center',
        background: 'none',
        border:     'none',
        padding:    '0.35rem 1.25rem',
        cursor:     onClick ? 'pointer' : 'default',
        // Gradient: active → bright white, past → muted, future → dim
        color: isActive
          ? '#ffffff'
          : isPast
            ? 'rgba(255,255,255,0.38)'
            : 'rgba(255,255,255,0.22)',
        fontSize:       isActive ? '1.25rem' : '1.05rem',
        fontWeight:     isActive ? 800 : 500,
        lineHeight:     1.45,
        letterSpacing:  isActive ? '-0.02em' : '-0.01em',
        transition:     'color 0.35s ease, font-size 0.25s ease, font-weight 0.25s ease, transform 0.25s ease, text-shadow 0.35s ease',
        transform:      isActive ? 'scale(1.04)' : 'scale(1)',
        textShadow:     isActive ? '0 0 32px rgba(167,139,250,0.6)' : 'none',
        willChange:     'color, font-size, transform',
      }}
    >
      {text}
    </button>
  );
}

/* ─── Loading / Empty states ──────────────────────────────────────────────── */

function StatusView({ status, songTitle }) {
  const shared = {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: '0.75rem', height: '100%', color: 'var(--text-muted)',
    padding: '2rem',
  };

  if (status === 'loading') return (
    <div style={shared}>
      <Loader2 size={28} style={{ animation: 'spin 1.2s linear infinite', color: 'var(--accent-light)' }} />
      <span style={{ fontSize: '0.875rem', color: 'var(--text-subtle)' }}>Fetching lyrics…</span>
    </div>
  );

  if (status === 'unavailable') return (
    <div style={shared}>
      <MicOff size={32} style={{ opacity: 0.35 }} />
      <p style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        No lyrics available
      </p>
      <p style={{ fontSize: '0.8rem', textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>
        {songTitle
          ? `Couldn't find lyrics for "${songTitle}"`
          : 'Play a song to see lyrics'}
      </p>
    </div>
  );

  if (status === 'error') return (
    <div style={shared}>
      <AlertCircle size={28} style={{ color: 'var(--danger)', opacity: 0.7 }} />
      <p style={{ fontSize: '0.875rem', textAlign: 'center' }}>Couldn't load lyrics</p>
    </div>
  );

  return null;
}

/* ─── Main component ──────────────────────────────────────────────────────── */

/**
 * LyricsPanel
 *
 * Displays karaoke-style synchronized lyrics inside the Player page.
 * Each line is individually animated and the active line auto-scrolls
 * to the vertical centre of the panel.
 *
 * Clicking a lyric line seeks playback to that line's timestamp.
 *
 * Props:
 *   lines         {time, text}[]   - parsed lyric lines from useLyrics
 *   activeIndex   number           - index of currently active line
 *   status        string           - 'idle'|'loading'|'ready'|'unavailable'
 *   isRightToLeft boolean          - RTL direction flag
 *   isSynced      boolean          - true = real LRC timestamps, false = estimated
 *   songTitle     string           - shown in the "no lyrics" state
 *   onSeek        (time) => void   - called when user clicks a lyric line
 */
export function LyricsPanel({ lines, activeIndex, status, isRightToLeft, isSynced, songTitle, onSeek }) {
  const containerRef = useRef(null);

  return (
    <div
      style={{
        position:       'relative',
        width:          '100%',
        // Glassmorphism panel
        background:     'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(15,17,23,0.92) 60%)',
        border:         '1px solid rgba(124,58,237,0.18)',
        borderRadius:   20,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        overflow:       'hidden',
        boxShadow:      '0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >

      {/* ── Header bar ── */}
      <div style={{
        display:       'flex',
        alignItems:    'center',
        gap:           '0.5rem',
        padding:       '0.85rem 1.25rem 0.7rem',
        borderBottom:  '1px solid rgba(255,255,255,0.06)',
        background:    'rgba(0,0,0,0.15)',
      }}>
        <Mic2 size={14} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>
          Lyrics
        </span>
        {status === 'ready' && (
          <span style={{
            marginLeft:    'auto',
            display:       'inline-flex',
            alignItems:    'center',
            gap:           '0.3rem',
            fontSize:      '0.65rem',
            fontWeight:    600,
            letterSpacing: '0.06em',
            color:         isSynced ? 'var(--accent-light)' : 'var(--text-subtle)',
            background:    isSynced ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.05)',
            border:        isSynced ? '1px solid rgba(167,139,250,0.3)' : '1px solid rgba(255,255,255,0.08)',
            borderRadius:  99,
            padding:       '0.15rem 0.5rem',
          }}>
            {isSynced ? '● Synced' : '○ Estimated'}
          </span>
        )}
      </div>

      {/* ── Fade masks (top + bottom) ── */}
      {status === 'ready' && (
        <>
          <div style={{
            position: 'absolute', top: 44, left: 0, right: 0, height: 48, zIndex: 2, pointerEvents: 'none',
            background: 'linear-gradient(to bottom, rgba(15,17,23,0.85), transparent)',
          }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 56, zIndex: 2, pointerEvents: 'none',
            background: 'linear-gradient(to top, rgba(15,17,23,0.9), transparent)',
          }} />
        </>
      )}

      {/* ── Lyrics scroll area ── */}
      <div
        ref={containerRef}
        style={{
          height:     340,
          overflowY:  'auto',
          overflowX:  'hidden',
          padding:    '2rem 0',
          scrollbarWidth: 'none',   // Firefox
          msOverflowStyle: 'none',  // IE
        }}
      >
        <style>{`
          /* Hide webkit scrollbar inside this panel */
          .lyrics-scroll::-webkit-scrollbar { display: none; }
        `}</style>

        {(status === 'loading' || status === 'unavailable' || status === 'error' || status === 'idle') ? (
          <StatusView status={status} songTitle={songTitle} />
        ) : (
          <>
            {/* Top spacer so first line can scroll to centre */}
            <div style={{ height: 60 }} />

            {lines.map((line, idx) => (
              <LyricsLine
                key={idx}
                text={line.text}
                isActive={idx === activeIndex}
                isPast={idx < activeIndex}
                isRTL={isRightToLeft}
                onClick={onSeek ? () => onSeek(line.time) : undefined}
              />
            ))}

            {/* Bottom spacer so last line can scroll to centre */}
            <div style={{ height: 60 }} />
          </>
        )}
      </div>
    </div>
  );
}

export default LyricsPanel;
