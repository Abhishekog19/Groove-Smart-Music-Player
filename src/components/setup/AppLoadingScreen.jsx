export default function AppLoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base, #07080f)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '1.5rem', fontFamily: 'var(--font, Inter, sans-serif)',
    }}>
      <style>{`
        @keyframes spin-ring { to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%,100%{opacity:0.4;transform:scale(0.9)} 50%{opacity:1;transform:scale(1)} }
        @keyframes loading-fade { 0%,100%{opacity:0.4} 50%{opacity:1} }
      `}</style>

      {/* Spinner */}
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.06)',
          borderTopColor: 'var(--accent, #7c3aed)',
          animation: 'spin-ring 1s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: '18px',
          borderRadius: '50%', background: 'var(--accent-dim, rgba(124,58,237,0.18))',
          animation: 'pulse-dot 1.5s ease-in-out infinite',
        }} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #f8fafc)', marginBottom: 4 }}>
          Smusic
        </p>
        <p style={{
          fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)',
          animation: 'loading-fade 1.5s ease-in-out infinite',
        }}>
          Loading your collection…
        </p>
      </div>
    </div>
  );
}
