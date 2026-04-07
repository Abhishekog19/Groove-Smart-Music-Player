import { useNavigate } from 'react-router-dom';
import { Music2, Download, Search, Library, Zap, Waves, Globe, ChevronRight, Play } from 'lucide-react';

const FEATURES = [
  {
    icon: Globe,
    title: 'TIDAL Streaming',
    desc: 'Stream lossless & hi-res audio from TIDAL directly in your browser. No app needed.',
    color: '#7c3aed',
  },
  {
    icon: Download,
    title: 'Batch Downloads',
    desc: 'Download entire albums and playlists as ZIP files. FLAC, AAC — your choice.',
    color: '#0ea5e9',
  },
  {
    icon: Search,
    title: 'Spotify Import',
    desc: 'Paste a Spotify playlist URL and convert it to TIDAL tracks instantly.',
    color: '#22c55e',
  },
  {
    icon: Library,
    title: 'Local Library',
    desc: 'Scan your music folder or upload files. Everything in one place.',
    color: '#f59e0b',
  },
  {
    icon: Waves,
    title: 'Lossless Quality',
    desc: 'CD-quality FLAC and Hi-Res 24-bit audio. Hear music the way it was recorded.',
    color: '#ec4899',
  },
  {
    icon: Zap,
    title: 'Instant Playback',
    desc: 'Fast, reliable streaming with multi-target routing and automatic fallback.',
    color: '#a78bfa',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font)', overflow: 'hidden' }}>

      {/* ── Animated background blobs ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,165,233,0.1) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', top: '40%', left: '50%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.07) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Top nav ── */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10, background: 'rgba(7,8,15,0.8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Music2 size={18} style={{ color: 'var(--accent-light)' }} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em' }}>Smusic</span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn-ghost" style={{ padding: '0.45rem 1rem', fontSize: '0.82rem' }} onClick={() => navigate('/library')}>Open App</button>
            <button className="btn-accent" style={{ padding: '0.45rem 1rem', fontSize: '0.82rem' }} onClick={() => navigate('/search')}>
              <Search size={14} /> Search Music
            </button>
          </nav>
        </header>

        {/* ── Hero ── */}
        <section style={{ maxWidth: 900, margin: '0 auto', padding: '5rem 2rem 4rem', textAlign: 'center' }}>
          <div className="animate-fade-up" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', borderRadius: 99, padding: '0.3rem 1rem', marginBottom: '2rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-light)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <Zap size={12} /> Now with TIDAL Hi-Res Streaming
          </div>

          <h1 className="animate-fade-up delay-1" style={{ fontSize: 'clamp(2.5rem, 8vw, 5.5rem)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: '1.5rem' }}>
            Your Music,{' '}
            <span style={{ background: 'linear-gradient(135deg, var(--accent-light), #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Uncompromised
            </span>
          </h1>

          <p className="animate-fade-up delay-2" style={{ fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', color: 'var(--text-muted)', maxWidth: 600, margin: '0 auto 2.5rem', lineHeight: 1.7 }}>
            Stream lossless audio, import Spotify playlists, download entire albums — all from one beautifully designed music player.
          </p>

          <div className="animate-fade-up delay-3" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn-accent"
              style={{ padding: '0.85rem 2rem', fontSize: '1rem', borderRadius: 12 }}
              onClick={() => navigate('/library')}
            >
              <Play size={18} fill="currentColor" /> Open Library
            </button>
            <button
              className="btn-ghost"
              style={{ padding: '0.85rem 2rem', fontSize: '1rem', borderRadius: 12 }}
              onClick={() => navigate('/search')}
            >
              <Search size={18} /> Search TIDAL
            </button>
          </div>

          {/* ── Player preview card ── */}
          <div className="animate-fade-up delay-4" style={{ marginTop: '4rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.5rem', maxWidth: 480, margin: '4rem auto 0', boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(124,58,237,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 64, height: 64, borderRadius: 12, background: 'linear-gradient(135deg, var(--accent), #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', flexShrink: 0 }}>🎵</div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 2 }}>Lose Yourself</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Eminem · 8 Mile Soundtrack</div>
                <div style={{ marginTop: 8, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '42%', background: 'linear-gradient(90deg, var(--accent), var(--accent-light))' }} />
                </div>
              </div>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Play size={15} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              {['LOSSLESS', 'FLAC', '24-bit'].map(tag => (
                <span key={tag} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', padding: '0.2rem 0.6rem', borderRadius: 99, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--accent-light)' }}>{tag}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features grid ── */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '4rem 2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p className="section-title" style={{ marginBottom: '0.75rem' }}>Features</p>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>Everything you need. Nothing you don't.</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {FEATURES.map(({ icon: Icon, title, desc, color }, i) => (
              <div
                key={title}
                className="animate-fade-up"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', animationDelay: `${i * 0.07}s`, transition: 'border-color 0.2s, transform 0.2s', cursor: 'default' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = color + '55'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 10, background: color + '22', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <Icon size={20} style={{ color }} />
                </div>
                <h3 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.4rem' }}>{title}</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA banner ── */}
        <section style={{ maxWidth: 1100, margin: '0 auto 6rem', padding: '0 2rem' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(236,72,153,0.15))', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 20, padding: '3rem 2rem', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, marginBottom: '0.75rem' }}>Ready to listen?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.95rem' }}>Import your library or start searching TIDAL right now.</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn-accent" style={{ padding: '0.75rem 1.75rem' }} onClick={() => navigate('/search')}>
                <Search size={16} /> Search Music <ChevronRight size={16} />
              </button>
              <button className="btn-ghost" style={{ padding: '0.75rem 1.75rem' }} onClick={() => navigate('/import')}>
                <Download size={16} /> Import Playlist
              </button>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ borderTop: '1px solid var(--border)', padding: '1.5rem 2rem', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '0.75rem' }}>
          Smusic · Built on TIDAL · Open in any modern browser
        </footer>
      </div>
    </div>
  );
}
