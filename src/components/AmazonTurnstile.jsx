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
// Dev (localhost):
//   → Cloudflare test key — always passes, works on any domain, no errors
//
// Production (groove-smart-music-player.vercel.app or any real domain):
//   → Your OWN Cloudflare Turnstile site key (VITE_CF_TURNSTILE_SITE_KEY)
//   → The widget runs cleanly on your registered domain
//   → Token sent to amz.geeked.wtf which validates it against ITS secret
//     (fails gracefully if keys don't match — Qobuz takes over as fallback)
//
// To make Amazon Music fully work in production, you need to self-host
// an Amazon Music proxy configured with YOUR Turnstile keys (Phase 3).
//
const IS_DEV = import.meta.env.DEV;

// Monochrome's registered Turnstile site key — this is what amz.geeked.wtf validates tokens against.
// Using the test key (1x00000000000000000000AA) generates tokens that amz.geeked.wtf REJECTS (403).
// This key is PUBLIC (safe to use in frontend — Cloudflare site keys are not secret).
// Source: Monochrome frontend source code (0x4AAAAAADgxqF6QVMm0GLHH)
const AMAZON_TURNSTILE_SITE_KEY = '0x4AAAAAADgxqF6QVMm0GLHH';

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
// Direct browser → amz.geeked.wtf (matches Monochrome exactly)
// The JWT exchange MUST happen from the browser — amz.geeked.wtf ties JWTs to the
// requesting IP. Server-side exchange → browser track request = 401 (IP mismatch).
const AMZ_API_BASE      = 'https://amz.geeked.wtf';
const EXCHANGE_ENDPOINT = `${AMZ_API_BASE}/api/auth/turnstile`;

// How long after success to re-trigger (JWT TTL minus buffer)
const REFRESH_INTERVAL_MS = 55 * 60 * 1000; // 55 minutes (JWT lasts ~1hr)

// ── Browser-side JWT cache (sessionStorage) ───────────────────────────────────
// Stored in sessionStorage so it survives hot-reloads but not browser restarts.
const JWT_STORAGE_KEY = 'amz_turnstile_jwt';
const JWT_EXPIRY_KEY  = 'amz_turnstile_expiry';

export function getStoredJwt() {
  try {
    const jwt    = sessionStorage.getItem(JWT_STORAGE_KEY);
    const expiry = Number(sessionStorage.getItem(JWT_EXPIRY_KEY) || 0);
    if (jwt && Date.now() < expiry) return jwt;
  } catch { /* sessionStorage unavailable */ }
  return null;
}

function storeJwt(jwt, expiresIn = 3600) {
  try {
    sessionStorage.setItem(JWT_STORAGE_KEY, jwt);
    sessionStorage.setItem(JWT_EXPIRY_KEY, String(Date.now() + (expiresIn - 60) * 1000));
  } catch { /* ignore */ }
}

function clearStoredJwt() {
  try {
    sessionStorage.removeItem(JWT_STORAGE_KEY);
    sessionStorage.removeItem(JWT_EXPIRY_KEY);
  } catch { /* ignore */ }
}

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
      // NOTE: do NOT use defer — it causes "preloaded but not used" browser warning
      // because Cloudflare's script adds a preload hint that fires before defer resolves
      script.onload  = () => resolve(window.turnstile);
      script.onerror = () => reject(new Error('Failed to load Turnstile script'));
      document.head.appendChild(script);
    });
  }, []);

  // ── Exchange token with backend ──────────────────────────────────────────
  const exchangeToken = useCallback(async (token) => {
    try {
      // ── Call amz.geeked.wtf DIRECTLY from the browser (Monochrome pattern) ──
      // JWT is IP-bound to the requester. Browser must exchange AND use the JWT
      // from the same IP — server-side exchange causes 401 on track requests.
      const res = await fetch(EXCHANGE_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cf_turnstile_response: token }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Exchange failed HTTP ${res.status}: ${text.substring(0, 80)}`);
      }

      const data = await res.json();
      if (!data?.access_token) throw new Error('No access_token in response');

      const expiresIn = data.expires_in || 3600;
      storeJwt(data.access_token, expiresIn);

      // Also tell our backend the JWT is ready (for /api/amazon/status checks)
      fetch('/api/amazon/notify-jwt', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ expiresIn }),
      }).catch(() => {});

      console.log(`[Turnstile] ✅ Amazon JWT ready (expires in ${expiresIn}s)`);
      setStatus('done');
      onReady?.();

      // Schedule a refresh before JWT expires
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        console.log('[Turnstile] JWT expiring soon — re-running challenge');
        clearStoredJwt();
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
        // Check if we already have a valid JWT in sessionStorage (survives hot-reload)
        const existingJwt = getStoredJwt();
        if (existingJwt) {
          console.log('[Turnstile] Found existing JWT in sessionStorage');
          setStatus('done');
          onReady?.();

          // Schedule refresh based on remaining TTL
          const expiry = Number(sessionStorage.getItem(JWT_EXPIRY_KEY) || 0);
          const remaining = Math.max(expiry - Date.now(), 10_000);
          refreshTimerRef.current = setTimeout(() => {
            clearStoredJwt();
            renderWidget();
          }, remaining);
          return;
        }

        // No stored JWT — run the Turnstile challenge
        renderWidget();
      } catch {
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
