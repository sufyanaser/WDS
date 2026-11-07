import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Copy, Check, Trash2, Terminal } from 'lucide-react';
import { SanitizedLogEntry, LogLevel } from '../types/ipc';

interface DiagnosticsPanelProps {
  logs: SanitizedLogEntry[];
  onCopy: () => void;
  onClear: () => void;
  isCopied: boolean;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  logs,
  onCopy,
  onClear,
  isCopied,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const isAutoScrollLockedRef = useRef(true);

  // Auto-scroll handler with scroll-lock detection
  useEffect(() => {
    if (!isOpen || !viewportRef.current) return;
    const viewport = viewportRef.current;

    if (isAutoScrollLockedRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [logs, isOpen]);

  const handleScroll = () => {
    if (!viewportRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = viewportRef.current;
    // Lock auto-scroll only if user is within 24px of bottom
    isAutoScrollLockedRef.current = scrollHeight - scrollTop - clientHeight < 24;
  };

  const getLevelStyle = (level: LogLevel) => {
    switch (level) {
      case 'info':
        return 'text-sky-400 font-bold';
      case 'warn':
        return 'text-amber-400 font-bold';
      case 'error':
        return 'text-rose-400 font-bold';
      case 'ssh':
        return 'text-purple-400 font-bold';
      case 'debug':
      default:
        return 'text-slate-500 font-normal';
    }
  };

  return (
    <section
      aria-label="Diagnostics log panel"
      className="bg-[#12151c] border border-[#262c36] rounded-xl overflow-hidden shadow-sm flex flex-col"
    >
      {/* Accordion Bar */}
      <div className="h-10 px-3 flex items-center justify-between bg-[#161920] border-b border-[#262c36] select-none">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="diagnostics-viewport"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded p-1"
        >
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-0' : '-rotate-90'
            }`}
          />
          <span className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            Diagnostics Log
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            {logs.length}
          </span>
        </button>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            disabled={logs.length === 0}
            aria-label="Copy sanitized diagnostic logs to clipboard"
            className="px-2 py-1 rounded bg-[#1e222b] hover:bg-slate-700 disabled:opacity-40 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-400" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClear}
            disabled={logs.length === 0}
            aria-label="Clear diagnostic logs"
            className="p-1 rounded bg-[#1e222b] hover:bg-rose-950/60 disabled:opacity-40 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log Output Viewport */}
      {isOpen && (
        <div
          id="diagnostics-viewport"
          ref={viewportRef}
          onScroll={handleScroll}
          tabIndex={0}
          aria-label="Diagnostic log stream"
          className="h-44 max-h-52 overflow-y-auto p-2.5 bg-[#0e1015] font-mono text-[11px] leading-relaxed custom-scrollbar select-text focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
        >
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
              No connection logs recorded yet. Initiate a connection to view diagnostic events.
            </div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className="flex items-start gap-1.5 py-0.5 hover:bg-[#161920]/40 rounded px-1">
                <span className="text-slate-500 select-none shrink-0">[{entry.timestamp}]</span>
                <span className={`${getLevelStyle(entry.level)} select-none shrink-0 uppercase`}>
                  [{entry.level}]
                </span>
                <span className="text-slate-200 break-all">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
};
