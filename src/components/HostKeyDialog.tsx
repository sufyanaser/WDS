import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, Copy, Check, Lock } from 'lucide-react';

interface HostKeyDetails {
  host: string;
  port: number;
  key_type: string;
  fingerprint_sha256: string;
  is_changed: boolean;
}

interface HostKeyDialogProps {
  isOpen: boolean;
  details: HostKeyDetails | null;
  onConfirm: (approved: boolean, remember: boolean) => void;
  onCancel: () => void;
}

export const HostKeyDialog: React.FC<HostKeyDialogProps> = ({
  isOpen,
  details,
  onConfirm,
  onCancel,
}) => {
  const [remember, setRemember] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const trustButtonRef = useRef<HTMLButtonElement>(null);

  // Trap focus and handle Escape
  useEffect(() => {
    if (!isOpen) return;

    trustButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || !details) return null;

  const copyFingerprint = async () => {
    try {
      await navigator.clipboard.writeText(details.fingerprint_sha256);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy fingerprint:', err);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hostkey-title"
      aria-describedby="hostkey-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none"
    >
      <div className="w-full max-w-sm bg-[#1e222b] border border-amber-500/40 rounded-xl p-4 shadow-2xl space-y-3.5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-300 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 id="hostkey-title" className="text-sm font-bold text-slate-100">
              {details.is_changed ? 'HOST KEY HAS CHANGED' : 'Unknown SSH Host Key'}
            </h2>
            <p id="hostkey-desc" className="text-xs text-slate-400 mt-0.5">
              {details.is_changed
                ? 'Warning: The host key for this server differs from the cached key. This could indicate a Man-in-the-Middle attack or server reinstallation.'
                : `The authenticity of host ${details.host}:${details.port} cannot be established automatically.`}
            </p>
          </div>
        </div>

        {/* Monospace Fingerprint Card */}
        <div className="bg-[#12141a] border border-[#262c36] rounded-lg p-3 space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>
              Algorithm: <strong className="text-slate-200">{details.key_type}</strong>
            </span>
            <span>
              Target: <strong className="text-slate-200">{details.host}:{details.port}</strong>
            </span>
          </div>

          <div className="p-2 rounded bg-[#0b0d11] border border-[#262c36] flex items-center justify-between gap-2">
            <span className="text-sky-300 font-mono text-[11px] break-all">
              {details.fingerprint_sha256}
            </span>
            <button
              type="button"
              onClick={copyFingerprint}
              aria-label="Copy SHA256 fingerprint"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 shrink-0"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Remember in known_hosts Checkbox */}
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-4 h-4 rounded bg-[#12141a] border-[#262c36] text-sky-500 focus:ring-sky-400 focus:ring-offset-[#1e222b]"
          />
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-slate-400" />
            Save host key to ~/.ssh/known_hosts
          </span>
        </label>

        {/* Action Buttons (44px min height) */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            ref={trustButtonRef}
            type="button"
            onClick={() => onConfirm(true, remember)}
            className="w-full h-11 min-h-[44px] rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-sm flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Trust and Connect
          </button>
          <button
            type="button"
            onClick={() => onConfirm(false, false)}
            className="w-full h-10 rounded-lg bg-transparent hover:bg-rose-950/40 text-rose-300 border border-rose-800/60 font-medium text-xs flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            Reject and Abort
          </button>
        </div>
      </div>
    </div>
  );
};
