import React from 'react';
import { Lock, Key, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { ConnectionStatus } from '../types/ipc';

interface ConnectionBridgeProps {
  status: ConnectionStatus;
  latencyMs?: number;
}

export const ConnectionBridge: React.FC<ConnectionBridgeProps> = ({ status, latencyMs }) => {
  const renderIndicator = () => {
    switch (status.status) {
      case 'Connected':
        return (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-950/80 border border-emerald-500/80 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-950">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            {latencyMs !== undefined && (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/50">
                {latencyMs.toFixed(1)} ms
              </span>
            )}
          </div>
        );
      case 'Connecting':
      case 'Authenticating':
      case 'VerifyingIdentity':
        return (
          <div className="w-6 h-6 rounded-full bg-sky-950/80 border border-sky-400/80 flex items-center justify-center text-sky-400 animate-pulse shadow-sm shadow-sky-950">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          </div>
        );
      case 'HostKeyVerificationPending':
        return (
          <div className="w-6 h-6 rounded-full bg-amber-950/80 border border-amber-400/80 flex items-center justify-center text-amber-300 animate-pulse shadow-sm shadow-amber-950">
            <Lock className="w-3.5 h-3.5" />
          </div>
        );
      case 'AuthChallengePending':
        return (
          <div className="w-6 h-6 rounded-full bg-amber-950/80 border border-amber-400/80 flex items-center justify-center text-amber-300 animate-pulse shadow-sm shadow-amber-950">
            <Key className="w-3.5 h-3.5" />
          </div>
        );
      case 'Error':
        return (
          <div className="w-6 h-6 rounded-full bg-rose-950/80 border border-rose-500/80 flex items-center justify-center text-rose-400 shadow-sm shadow-rose-950">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        );
      case 'Disconnecting':
        return (
          <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-400">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          </div>
        );
      case 'Disconnected':
      default:
        return (
          <div className="w-2.5 h-2.5 rounded-full bg-slate-700 ring-4 ring-[#0b0d11]" />
        );
    }
  };

  const getLineClass = () => {
    switch (status.status) {
      case 'Connected':
        return 'bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]';
      case 'Connecting':
      case 'Authenticating':
      case 'VerifyingIdentity':
        return 'bg-gradient-to-b from-sky-500 to-sky-400 animate-pulse';
      case 'HostKeyVerificationPending':
      case 'AuthChallengePending':
        return 'bg-amber-500/80';
      case 'Error':
        return 'bg-rose-500/80';
      default:
        return 'bg-[#262c36]';
    }
  };

  return (
    <div
      aria-hidden="true"
      className="relative w-full h-6 flex items-center justify-center select-none"
    >
      {/* Background Connector Line */}
      <div className={`absolute top-0 bottom-0 w-0.5 ${getLineClass()} transition-colors duration-300`} />

      {/* Center Node Badge */}
      <div className="relative z-10 bg-[#0b0d11] px-1.5 py-0.5 rounded-full">
        {renderIndicator()}
      </div>
    </div>
  );
};
