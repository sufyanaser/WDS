import React from 'react';
import { Laptop, ShieldCheck, Activity, Terminal } from 'lucide-react';
import { AppConfig, ConnectionStatus } from '../types/ipc';

interface RemoteDeviceCardProps {
  config: AppConfig;
  status: ConnectionStatus;
  latencyMs?: number;
}

export const RemoteDeviceCard: React.FC<RemoteDeviceCardProps> = ({ config, status, latencyMs }) => {
  const isConnected = status.status === 'Connected';
  const remoteIdentity = isConnected ? status.details.remote_identity : null;

  return (
    <section
      aria-label="Remote MacBook device card"
      className="bg-[#161920] border border-[#262c36] rounded-xl p-3 shadow-sm hover:border-[#333b49] transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Laptop Icon Box */}
          <div
            className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
              isConnected
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-400'
                : 'bg-[#1e222b] border-[#262c36] text-slate-400'
            }`}
          >
            <Laptop className="w-5 h-5" />
          </div>

          {/* Hostname & Target Endpoint */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-100 tracking-tight">
                {config.remote_host || 'Alis-MacBook-Pro-2.local'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
              <span className="flex items-center gap-1">
                <Terminal className="w-3 h-3 text-slate-500" />
                {config.remote_user}@{config.remote_host}:{config.remote_port}
              </span>
            </div>
          </div>
        </div>

        {/* Badges & Latency */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Remote
          </span>
          {isConnected ? (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/80 flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
              Verified Mac
            </span>
          ) : (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700">
              macOS
            </span>
          )}
        </div>
      </div>

      {/* Verified OS / Kernel Metadata Subtitle */}
      {isConnected && remoteIdentity && (
        <div className="mt-2.5 pt-2 border-t border-[#262c36]/70 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="truncate max-w-[260px]">{remoteIdentity}</span>
          </div>
          {latencyMs !== undefined && (
            <div className="flex items-center gap-1 text-slate-400">
              <Activity className="w-3 h-3 text-sky-400" />
              <span>{latencyMs.toFixed(1)} ms</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
