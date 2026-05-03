/**
 * ServiceGate
 *
 * Wraps a feature section (Search or Import) that depends on the serverless API.
 * While the health check is running it shows a subtle spinner.
 * If the health check fails it replaces the feature with an informative
 * "under maintenance" banner — no broken UI, no console errors.
 *
 * Props:
 *   featureName  — string shown in the banner, e.g. "Search" or "Import"
 *   icon         — Lucide icon component (optional, defaults to WifiOff)
 *   status       — 'checking' | 'ok' | 'down'  (from useServiceStatus)
 *   checkedAt    — Date | null
 *   retry        — function to re-trigger the health check
 *   children     — content to render when status === 'ok'
 */

import { WifiOff, RefreshCw, Clock, AlertTriangle, Loader2 } from 'lucide-react';

export default function ServiceGate({ featureName, icon: Icon, status, checkedAt, retry, children }) {
  /* ── Loading state ─────────────────────────────────────────────────────── */
  if (status === 'checking') {
    return (
      <div style={styles.centeredBox}>
        <Loader2 size={36} style={{ color: 'var(--accent-light)', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
        <p style={styles.subtitle}>Checking service availability…</p>
      </div>
    );
  }

  /* ── Service is working ─────────────────────────────────────────────────── */
  if (status === 'ok') return children;

  /* ── Service is down ───────────────────────────────────────────────────── */
  const FeatureIcon = Icon || WifiOff;
  const checkedAtStr = checkedAt
    ? checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={styles.centeredBox}>
      {/* Icon cluster */}
      <div style={styles.iconCluster}>
        <div style={styles.iconBg}>
          <FeatureIcon size={28} style={{ color: 'var(--accent-light)', opacity: 0.6 }} />
        </div>
        <div style={styles.warningBadge}>
          <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
        </div>
      </div>

      {/* Title */}
      <h2 style={styles.title}>{featureName} Unavailable</h2>

      {/* Explanation */}
      <p style={styles.body}>
        The <strong>{featureName.toLowerCase()}</strong> service is currently experiencing issues.
        This is usually a temporary connectivity problem with our music data provider.
      </p>

      {/* Detail chips */}
      <div style={styles.chipRow}>
        <span style={{ ...styles.chip, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
          <WifiOff size={11} /> Service unreachable
        </span>
        {checkedAtStr && (
          <span style={{ ...styles.chip, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-subtle)' }}>
            <Clock size={11} /> Checked at {checkedAtStr}
          </span>
        )}
      </div>

      {/* Info box */}
      <div style={styles.infoBox}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          💡 Your local music library, playback, and playlists are <strong>not affected</strong> — they work
          fully offline. Only features that fetch data from external services (TIDAL search, Spotify import)
          require the API to be online.
        </p>
      </div>

      {/* Retry button */}
      <button
        onClick={retry}
        style={styles.retryBtn}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-dim)'; e.currentTarget.style.borderColor = 'var(--accent-light)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; }}
      >
        <RefreshCw size={15} />
        Try again
      </button>
    </div>
  );
}

/* ── Inline styles ─────────────────────────────────────────────────────────── */
const styles = {
  centeredBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    padding: '3rem 1.5rem',
    textAlign: 'center',
    gap: '1rem',
  },
  iconCluster: {
    position: 'relative',
    width: 72,
    height: 72,
    marginBottom: '0.5rem',
  },
  iconBg: {
    width: 72,
    height: 72,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    background: 'rgba(245,158,11,0.15)',
    border: '1px solid rgba(245,158,11,0.35)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 'clamp(1.2rem, 3vw, 1.6rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    margin: 0,
  },
  body: {
    fontSize: '0.9rem',
    color: 'var(--text-muted)',
    maxWidth: 440,
    lineHeight: 1.65,
    margin: 0,
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    justifyContent: 'center',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '0.3rem 0.65rem',
    borderRadius: 100,
    fontSize: '0.72rem',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  infoBox: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '1rem 1.25rem',
    maxWidth: 480,
  },
  subtitle: {
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    margin: 0,
  },
  retryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.6rem 1.25rem',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    color: 'var(--text-secondary)',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
    marginTop: '0.5rem',
  },
};
