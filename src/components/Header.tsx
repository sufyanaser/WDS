import React from 'react';
import { Settings, ShieldCheck, ShieldAlert, Key, RefreshCw, AlertCircle, Circle } from 'lucide-react';
import { ConnectionStatus } from '../types/ipc';

interface HeaderProps {
  status: ConnectionStatus;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ status, onOpenSettings }) => {
  const getStatusBadge = () => {
    switch (status.status) {
      case 'Connected':
        return {
          label: 'Connected',
          badgeClass: 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80',
          icon: <ShieldCheck className="w-3 h-3 text-emerald-400" />,
        };
      case 'Connecting':
      case 'Authenticating':
      case 'VerifyingIdentity':
        return {
          label: status.status === 'VerifyingIdentity' ? 'Verifying Mac' : 'Connecting',
          badgeClass: 'bg-sky-950/70 text-sky-300 border-sky-800/80',
          icon: <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />,
        };
      case 'HostKeyVerificationPending':
      case 'AuthChallengePending':
        return {
          label: 'Action Required',
          badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-800/80',
          icon: status.status === 'HostKeyVerificationPending' ? (
            <ShieldAlert className="w-3 h-3 text-amber-400" />
          ) : (
            <Key className="w-3 h-3 text-amber-400" />
          ),
        };
      case 'Error':
        return {
          label: 'Error',
          badgeClass: 'bg-rose-950/70 text-rose-300 border-rose-800/80',
          icon: <AlertCircle className="w-3 h-3 text-rose-400" />,
        };
      case 'Disconnecting':
        return {
          label: 'Disconnecting',
          badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
          icon: <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />,
        };
      case 'Disconnected':
      default:
        return {
          label: 'Disconnected',
          badgeClass: 'bg-slate-900/80 text-slate-400 border-slate-800',
          icon: <Circle className="w-2.5 h-2.5 fill-slate-500 text-slate-500" />,
        };
    }
  };

  const badge = getStatusBadge();

  return (
    <header className="h-12 w-full flex items-center justify-between px-3 bg-[#0b0d11]/90 border-b border-[#262c36] backdrop-blur-md select-none">
      {/* Brand & Version */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shadow-sm shadow-sky-950">
          <div className="w-2 h-2 rounded-full bg-slate-950 ring-2 ring-white/40" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-100 tracking-tight">WDS Connect</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1e222b] text-slate-400 border border-[#262c36]">
            v1.0
          </span>
        </div>
      </div>

      {/* Status Pill & Settings Action */}
      <div className="flex items-center gap-2">
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shadow-inner ${badge.badgeClass}`}
        >
          {badge.icon}
          <span>{badge.label}</span>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open connection settings"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-300 hover:bg-[#1e222b] border border-transparent hover:border-[#262c36] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
