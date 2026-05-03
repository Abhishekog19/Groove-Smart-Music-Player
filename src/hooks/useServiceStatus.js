/**
 * useServiceStatus — fast check that the backend is reachable.
 * Hits /api/health (instant, no TIDAL mirror dependency).
 * Only shows "down" if the backend itself is unreachable.
 */

import { useState, useEffect, useCallback } from 'react';

const PROBE_URL = '/api/health';
const TIMEOUT_MS = 5000;

async function probe() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(PROBE_URL, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export function useServiceStatus() {
  const [status, setStatus] = useState('checking');
  const [checkedAt, setCheckedAt] = useState(null);

  const check = useCallback(async (silent = false) => {
    if (!silent) setStatus('checking');
    const ok = await probe();
    setStatus(ok ? 'ok' : 'down');
    setCheckedAt(new Date());
  }, []);

  const retry = useCallback(() => check(false), [check]);

  useEffect(() => {
    check(false);
    const interval = setInterval(() => check(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [check]);

  return { status, checkedAt, retry };
}
