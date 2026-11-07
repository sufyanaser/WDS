import React from 'react';
import { Play, LogOut, RefreshCw, XCircle } from 'lucide-react';
import { ConnectionStatus } from '../types/ipc';

interface PrimaryActionProps {
  status: ConnectionStatus;
  onConnect: () => void;
  onDisconnect: () => void;
  onCancel: () => void;
}

export const PrimaryAction: React.FC<PrimaryActionProps> = ({
  status,
  onConnect,
  onDisconnect,
  onCancel,
}) => {
  const isPending =
    status.status === 'Connecting' ||
    status.status === 'Authenticating' ||
    status.status === 'VerifyingIdentity';

  const isActionRequired =
    status.status === 'HostKeyVerificationPending' ||
    status.status === 'AuthChallengePending';

  const isConnected = status.status === 'Connected';
  const isDisconnecting = status.status === 'Disconnecting';

  const getSubtitle = () => {
    switch (status.status) {
      case 'Connected':
        return 'Secure SSH transport active. Keepalive heartbeat monitoring.';
      case 'Connecting':
        return 'Initiating TCP handshake and negotiating SSH algorithms...';
      case 'Authenticating':
        return 'Authenticating via Ed25519 private key...';
      case 'VerifyingIdentity':
        return 'Running remote identity verification (uname, sw_vers)...';
      case 'HostKeyVerificationPending':
        return 'Unknown SSH host key detected. Review fingerprint to continue.';
      case 'AuthChallengePending':
        return 'Public key auth failed. Fallback password required.';
      case 'Disconnecting':
        return 'Closing SSH channels and terminating session safely...';
      case 'Error':
        return `Connection error: ${status.details.message}`;
      case 'Disconnected':
      default:
        return 'Idle. Click to establish secure session to MacBook.';
    }
  };

  return (
    <div className="w-full flex flex-col gap-1.5 select-none">
      {/* Action Controls */}
      {isConnected ? (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={isDisconnecting}
          className="w-full h-11 min-h-[44px] rounded-lg bg-slate-900 hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 border border-slate-700 hover:border-rose-800/80 font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          {isDisconnecting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
              <span>Disconnecting...</span>
            </>
          ) : (
            <>
              <LogOut className="w-4 h-4 text-rose-400" />
              <span>Disconnect from MacBook</span>
            </>
          )}
        </button>
      ) : isPending ? (
        <div className="flex items-center gap-2 w-full">
          <button
            type="button"
            disabled
            className="flex-1 h-11 min-h-[44px] rounded-lg bg-sky-950/70 border border-sky-800/80 text-sky-200 font-medium text-sm flex items-center justify-center gap-2 cursor-wait"
          >
            <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
            <span>
              {status.status === 'VerifyingIdentity'
                ? 'Verifying Identity...'
                : status.status === 'Authenticating'
                ? 'Authenticating...'
                : 'Connecting...'}
            </span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel connection attempt"
            className="h-11 min-h-[44px] px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <XCircle className="w-4 h-4 text-slate-400" />
            <span>Cancel</span>
          </button>
        </div>
      ) : isActionRequired ? (
        <div className="flex items-center gap-2 w-full">
          <button
            type="button"
            disabled
            className="flex-1 h-11 min-h-[44px] rounded-lg bg-amber-950/70 border border-amber-800/80 text-amber-200 font-medium text-sm flex items-center justify-center gap-2"
          >
            <span>Action Required in Dialog</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Abort connection attempt"
            className="h-11 min-h-[44px] px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <XCircle className="w-4 h-4 text-slate-400" />
            <span>Abort</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          className="w-full h-11 min-h-[44px] rounded-lg bg-sky-400 hover:bg-sky-300 active:bg-sky-500 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-sky-950/40 border border-sky-300/40 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <Play className="w-4 h-4 fill-slate-950 text-slate-950" />
          <span>{status.status === 'Error' ? 'Retry Connection' : 'Connect to MacBook'}</span>
        </button>
      )}

      {/* Live Descriptive Subtitle */}
      <div
        role="status"
        aria-live="polite"
        className="text-[11px] text-slate-400 text-center truncate px-1"
      >
        {getSubtitle()}
      </div>
    </div>
  );
};
