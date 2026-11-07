import { useState, useEffect, useCallback, useRef } from 'react';

export interface DevServerHealth {
  isOnline: boolean;
  latencyMs: number | null;
  lastChecked: Date | null;
  error: string | null;
  isChecking: boolean;
  checkNow: () => Promise<void>;
}

export function useDevServerHealth(url = 'http://127.0.0.1:5173', intervalMs = 4000): DevServerHealth {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const mountedRef = useRef(true);

  const checkNow = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsChecking(true);
    const start = performance.now();
    try {
      // Use no-cache fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - start);

      if (mountedRef.current) {
        setIsOnline(true);
        setLatencyMs(latency);
        setError(null);
        setLastChecked(new Date());
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setIsOnline(false);
        setLatencyMs(null);
        setError(err?.name === 'AbortError' ? 'Connection timed out' : 'Server offline');
        setLastChecked(new Date());
      }
    } finally {
      if (mountedRef.current) {
        setIsChecking(false);
      }
    }
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    checkNow();

    const timer = setInterval(() => {
      checkNow();
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [checkNow, intervalMs]);

  return {
    isOnline,
    latencyMs,
    lastChecked,
    error,
    isChecking,
    checkNow,
  };
}
