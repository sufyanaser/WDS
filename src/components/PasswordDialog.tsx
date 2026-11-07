import React, { useState, useEffect, useRef } from 'react';
import { Key, Eye, EyeOff, Shield } from 'lucide-react';

interface AuthChallengeDetails {
  user: string;
  host: string;
  reason?: string;
}

interface PasswordDialogProps {
  isOpen: boolean;
  details: AuthChallengeDetails | null;
  onSubmit: (password: string, remember: boolean) => void;
  onCancel: () => void;
}

export const PasswordDialog: React.FC<PasswordDialogProps> = ({
  isOpen,
  details,
  onSubmit,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPassword('');
    inputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || !details) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    const submittedPassword = password;
    // Immediate memory cleanup
    setPassword('');
    onSubmit(submittedPassword, remember);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none"
    >
      <div className="w-full max-w-sm bg-[#1e222b] border border-sky-500/40 rounded-xl p-4 shadow-2xl space-y-3.5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-950/80 border border-sky-500/50 flex items-center justify-center text-sky-400 shrink-0">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 id="password-dialog-title" className="text-sm font-bold text-slate-100">
              MacBook Authentication
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Public key authentication failed for{' '}
              <strong className="text-slate-200">
                {details.user}@{details.host}
              </strong>
              . Enter account password:
            </p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <label htmlFor="auth-password" className="sr-only">
              Password for {details.user}
            </label>
            <input
              ref={inputRef}
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`Password for ${details.user}`}
              autoComplete="current-password"
              className="w-full h-11 bg-[#12141a] border border-[#262c36] focus:border-sky-400 rounded-lg px-3 pr-10 text-sm text-slate-100 font-mono placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-2.5 p-1 rounded text-slate-500 hover:text-slate-300 focus:outline-none"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Keyring Checkbox */}
          <label className="flex items-start gap-2 cursor-pointer select-none text-xs text-slate-300">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded bg-[#12141a] border-[#262c36] text-sky-500 focus:ring-sky-400 focus:ring-offset-[#1e222b]"
            />
            <div>
              <span className="flex items-center gap-1 font-medium">
                <Shield className="w-3 h-3 text-sky-400" />
                Save password securely in Windows Credential Manager
              </span>
              <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                Optional and user-removable anytime from Settings. Zeroized from app memory after authentication.
              </p>
            </div>
          </label>

          {/* Action Buttons (44px min height) */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              disabled={!password}
              className="w-full h-11 min-h-[44px] rounded-lg bg-sky-400 hover:bg-sky-300 disabled:opacity-40 text-slate-950 font-semibold text-sm flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              Authenticate
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium text-xs flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
