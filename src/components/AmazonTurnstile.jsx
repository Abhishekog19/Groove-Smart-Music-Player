/**
 * AmazonTurnstile.jsx — Cloudflare Turnstile Widget for Amazon Music Auth
 *
 * This component runs a Cloudflare Turnstile challenge in the browser.
 * It uses Monochrome's site key (0x4AAAAAADgxqF6QVMm0GLHH) which is what
 * amz.geeked.wtf expects when validating Turnstile responses.
 *
 * Flow:
 *   1. Component mounts (invisible, renders in corner)
 *   2. Turnstile widget executes automatically
 *   3. On success → POSTs token to /api/amazon/exchange-turnstile
 *   4. Backend exchanges token → caches JWT → Amazon Music is ready
 *   5. onReady() callback fires → parent knows Amazon is available
 *
 * Used in App.jsx, runs silently in the background.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ── Site Key Selection ────────────────────────────────────────────────────────
// Cloudflare Turnstile site keys are domain-bound.
// In development (localhost), we use Cloudflare's official test key which:
//   - Always passes without user interaction
//   - Works on any domain (including localhost)
//   - BUT generates a test token that amz.geeked.wtf rejects (expected in dev)
//   - Amazon Music falls back to Qobuz silently in that case — this is fine
//
// In production (deployed domain):
//   - Use Monochrome's Amazon key: 0x4AAAAAADgxqF6QVMm0GLHH
//   - This is what amz.geeked.wtf validates against
//   - Add your deployed domain to the Cloudflare Turnstile site settings
//
const IS_DEV = import.meta.env.DEV;

const AMAZON_TURNSTILE_SITE_KEY = IS_DEV
  ? '1x00000000000000000000AA'  // Cloudflare always-pass test key (localhost safe)
  : (import.meta.env.VITE_AMAZON_TURNSTILE_SITE_KEY || '0x4AAAAAADgxqF6QVMm0GLHH');

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const EXCHANGE_ENDPOINT    = '/api/amazon/exchange-turnstile';

// How long after success to re-trigger (JWT TTL minus buffer)
const REFRESH_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

export default function AmazonTurnstile({ onReady, onError }) {
  const containerRef  = useRef(null);
  const widgetIdRef   = useRef(null);
  const refreshTimerRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | loading | active | done | error

  // ── Load Turnstile script ────────────────────────────────────────────────
  const loadScript = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (window.turnstile) { resolve(window.turnstile); return; }

      const existing = document.getElementById('cf-turnstile-script');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.turnstile), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id    = 'cf-turnstile-script';
      script.src   = `${TURNSTILE_SCRIPT_URL}?render=explicit`;
      script.async = true;
      script.defer = true;
      script.onload  = () => resolve(window.turnstile);
      script.onerror = () => reject(new Error('Failed to load Turnstile script'));
      document.head.appendChild(script);
    });
  }, []);

  // ── Exchange token with backend ──────────────────────────────────────────
  const exchangeToken = useCallback(async (token) => {
    try {
      const res = await fetch(EXCHANGE_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      });

      const data = await res.json();

      // Dev-mode token rejection: test tokens don't work with production Amazon proxy.
      // This is expected in local dev — Qobuz/Deezer will handle audio instead.
      if (data?.isDev) {
        console.info('[Turnstile] ℹ️ Dev mode: test token not accepted by Amazon proxy (expected). Qobuz/Deezer will be used.');
        setStatus('error');
        // Do NOT fire onError — this is not a real error, just a dev limitation
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Exchange failed HTTP ${res.status}`);
      }

      console.log(`[Turnstile] ✅ Amazon JWT ready (expires in ${data.expiresIn}s)`);
      setStatus('done');
      onReady?.();

      // Schedule a refresh before JWT expires
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        console.log('[Turnstile] JWT expiring soon — re-running challenge');
        setStatus('idle');
        renderWidget();
      }, REFRESH_INTERVAL_MS);

    } catch (err) {
      console.warn('[Turnstile] Exchange failed:', err.message);
      setStatus('error');
      onError?.(err.message);
    }
  }, [onReady, onError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render Turnstile widget ──────────────────────────────────────────────
  const renderWidget = useCallback(async () => {
    if (!containerRef.current) return;
    setStatus('loading');

    try {
      const turnstile = await loadScript();

      // Remove previous widget if exists
      if (widgetIdRef.current && turnstile.remove) {
        try { turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
      }

      widgetIdRef.current = turnstile.render(containerRef.current, {
        sitekey:    AMAZON_TURNSTILE_SITE_KEY,
        size:       'invisible',
        execution:  'execute',   // auto-execute (no user interaction needed in most cases)
        appearance: 'interaction-only',  // only shows UI if user interaction is required
        theme:      'dark',

        callback: (token) => {
          console.log('[Turnstile] ✅ Challenge passed');
          setStatus('active');
          exchangeToken(token);
        },

        'error-callback': (code) => {
          console.warn(`[Turnstile] Error: ${code}`);
          setStatus('error');
          onError?.(`Turnstile error: ${code}`);
        },

        'expired-callback': () => {
          console.warn('[Turnstile] Token expired — re-running');
          setStatus('idle');
          // Small delay before re-render to avoid tight loop
          setTimeout(renderWidget, 2000);
        },

        'unsupported-callback': () => {
          console.warn('[Turnstile] Browser unsupported');
          setStatus('error');
          onError?.('Browser does not support Cloudflare Turnstile');
        },
      });

      // Execute the challenge immediately
      if (turnstile.execute && widgetIdRef.current) {
        turnstile.execute(widgetIdRef.current);
      }

    } catch (err) {
      console.warn('[Turnstile] Failed to render widget:', err.message);
      setStatus('error');
      onError?.(err.message);
    }
  }, [loadScript, exchangeToken, onError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mount: check backend status, run if needed ───────────────────────────
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Check if backend already has a valid JWT (e.g. from another tab's challenge)
        const res  = await fetch('/api/amazon/status');
        const data = await res.json();

        if (!mounted) return;

        if (data.hasJwt && !data.isRateLimited && data.jwtExpiresIn > 30) {
          console.log(`[Turnstile] Backend already has JWT (${data.jwtExpiresIn}s remaining)`);
          setStatus('done');
          onReady?.();

          // Schedule refresh
          const refreshIn = Math.max((data.jwtExpiresIn - 30) * 1000, 10_000);
          refreshTimerRef.current = setTimeout(() => renderWidget(), refreshIn);
          return;
        }

        // Need to run the challenge
        if (!data.isRateLimited) {
          renderWidget();
        } else {
          console.warn('[Turnstile] Amazon rate limited — skipping challenge');
          setStatus('error');
        }
      } catch {
        // Backend unreachable? Try the challenge anyway
        if (mounted) renderWidget();
      }
    };

    init();

    return () => {
      mounted = false;
      clearTimeout(refreshTimerRef.current);
      // Clean up widget
      if (window.turnstile && widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────
  // The widget container must be in the DOM — Cloudflare mounts its iframe here.
  // Positioned off-screen so it doesn't affect layout, but visible if needed.
  return (
    <div
      style={{
        position:   'fixed',
        bottom:     '80px',
        right:      '16px',
        zIndex:     9999,
        // Only show during interaction-required state
        visibility: status === 'loading' ? 'visible' : 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div ref={containerRef} id="amazon-turnstile-container" />
    </div>
  );
}
