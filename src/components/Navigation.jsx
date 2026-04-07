import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Library, Music2, ListMusic, Download, Search, Disc3, X, Menu } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/',         label: 'Home',      icon: Home,     exact: true },
  { path: '/library',  label: 'Library',   icon: Library   },
  { path: '/player',   label: 'Player',    icon: Disc3     },
  { path: '/playlists',label: 'Playlists', icon: ListMusic },
  { path: '/import',   label: 'Import',    icon: Download  },
  { path: '/search',   label: 'Search',    icon: Search    },
];

export default function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {/* ── Mobile header bar ── */}
      <div className="mobile-header">
        <button
          onClick={() => setMobileOpen(true)}
          className="btn-icon"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <Music2 size={20} style={{ color: 'var(--accent-light)' }} />
          <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>Smusic</span>
        </div>
        <div style={{ width: 38 }} /> {/* spacer */}
      </div>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="mobile-overlay animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`app-sidebar ${mobileOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-icon">
            <Music2 size={22} style={{ color: 'var(--accent-light)' }} />
          </div>
          <span className="logo-text">Smusic</span>
          {/* Mobile close */}
          <button
            className="btn-icon mobile-close"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="sidebar-nav">
          <p className="section-title" style={{ padding: '0 1rem', marginBottom: '0.5rem' }}>Navigation</p>
          {NAV_ITEMS.map(({ path, label, icon: Icon, exact }) => (
            <NavLink
              key={path}
              to={path}
              end={exact}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <p style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>Smusic v2.0 · TIDAL Powered</p>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="mobile-tab-bar">
        {NAV_ITEMS.map(({ path, label, icon: Icon, exact }) => (
          <NavLink
            key={path}
            to={path}
            end={exact}
            className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <style>{`
        /* Mobile header */
        .mobile-header {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 56px;
          background: rgba(7,8,15,0.95);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          z-index: 50;
        }

        /* Sidebar logo */
        .sidebar-logo {
          padding: 1.25rem 1rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          border-bottom: 1px solid var(--border);
          margin-bottom: 1rem;
        }
        .logo-icon {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-dim);
          border-radius: var(--r-md);
          border: 1px solid var(--border-accent);
          flex-shrink: 0;
        }
        .logo-text {
          font-size: 1.15rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          flex: 1;
        }
        .mobile-close { display: none; }

        /* Sidebar nav */
        .sidebar-nav {
          flex: 1;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow-y: auto;
        }
        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 0.75rem;
          border-radius: var(--r-md);
          color: var(--text-muted);
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 500;
          transition: all 0.15s;
        }
        .sidebar-link:hover {
          background: rgba(255,255,255,0.05);
          color: var(--text-primary);
        }
        .sidebar-link.active {
          background: var(--accent-dim);
          color: var(--accent-light);
          border: 1px solid var(--border-accent);
        }

        /* Sidebar footer */
        .sidebar-footer {
          padding: 1rem;
          border-top: 1px solid var(--border);
        }

        /* Mobile overlay */
        .mobile-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 39;
          backdrop-filter: blur(4px);
        }

        /* Mobile bottom tab bar */
        .mobile-tab-bar {
          display: none;
          position: fixed;
          bottom: 80px; /* above playerbar */
          left: 0;
          right: 0;
          background: rgba(7,8,15,0.97);
          backdrop-filter: blur(16px);
          border-top: 1px solid var(--border);
          z-index: 38;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .mobile-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 0.65rem 0.25rem;
          color: var(--text-subtle);
          text-decoration: none;
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          transition: color 0.15s;
        }
        .mobile-tab.active { color: var(--accent-light); }
        .mobile-tab:hover  { color: var(--text-secondary); }

        @media (max-width: 768px) {
          .mobile-header   { display: flex; }
          .mobile-tab-bar  { display: flex; }
          .mobile-close    { display: flex; margin-left: auto; }
          .app-main-inner  { padding-top: calc(56px + 1rem); }
        }
      `}</style>
    </>
  );
}