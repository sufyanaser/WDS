import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { SanitizedLogEntry } from '../types/ipc';

const MAX_LOGS = 500;

export function useDiagnostics() {
  const [logs, setLogs] = useState<SanitizedLogEntry[]>([]);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadDiagnostics() {
      try {
        const initialLogs = await invoke<SanitizedLogEntry[]>('get_diagnostics');
        if (isMounted && initialLogs) {
          setLogs(initialLogs.slice(-MAX_LOGS));
        }
      } catch (err) {
        console.warn('Initial diagnostics load skipped:', err);
      }
    }

    loadDiagnostics();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    async function setupLogListener() {
      try {
        unlisten = await listen<SanitizedLogEntry>('log-entry', (event) => {
          setLogs((prev) => {
            const next = [...prev, event.payload];
            return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
          });
        });
      } catch (err) {
        console.warn('Diagnostics event listener unavailable:', err);
      }
    }

    setupLogListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const copyLogs = useCallback(async () => {
    if (logs.length === 0) return;
    const text = logs
      .map((entry) => `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs to clipboard:', err);
    }
  }, [logs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    copyLogs,
    clearLogs,
    isCopied,
  };
}
