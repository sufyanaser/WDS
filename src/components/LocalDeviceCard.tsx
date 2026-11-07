import React from 'react';
import { Monitor, User, Globe } from 'lucide-react';
import { LocalSystemInfo } from '../types/ipc';

interface LocalDeviceCardProps {
  systemInfo: LocalSystemInfo;
}

export const LocalDeviceCard: React.FC<LocalDeviceCardProps> = ({ systemInfo }) => {
  return (
    <section
      aria-label="Local workstation device card"
      className="bg-[#161920] border border-[#262c36] rounded-xl p-3 shadow-sm hover:border-[#333b49] transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Workstation Icon Box */}
          <div className="w-9 h-9 rounded-lg bg-[#1e222b] border border-[#262c36] flex items-center justify-center text-sky-400 shrink-0">
            <Monitor className="w-5 h-5" />
          </div>

          {/* Host & User Identity */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-100 tracking-tight">
                {systemInfo.hostname || 'SUFYAN'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3 text-slate-500" />
                {systemInfo.username || 'sufya'}
              </span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3 text-slate-500" />
                {systemInfo.local_ip || '192.168.68.104'}
              </span>
            </div>
          </div>
        </div>

        {/* Local & OS Badges */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Local
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/60">
            {systemInfo.os_name || 'Windows 11'}
          </span>
        </div>
      </div>
    </section>
  );
};
