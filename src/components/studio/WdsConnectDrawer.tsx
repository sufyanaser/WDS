import React from 'react';
import { X, Radio, Settings } from 'lucide-react';
import { LocalDeviceCard } from '../LocalDeviceCard';
import { ConnectionBridge } from '../ConnectionBridge';
import { RemoteDeviceCard } from '../RemoteDeviceCard';
import { PrimaryAction } from '../PrimaryAction';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { ConnectionStatus, AppConfig, LocalSystemInfo, SanitizedLogEntry } from '../../types/ipc';

interface WdsConnectDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  status: ConnectionStatus;
  config: AppConfig;
  systemInfo: LocalSystemInfo;
  latencyMs: number | undefined;
  logs: SanitizedLogEntry[];
  isCopied: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onCancelAuth: () => void;
  onCopyLogs: () => void;
  onClearLogs: () => void;
  onOpenSettings: () => void;
}

export const WdsConnectDrawer: React.FC<WdsConnectDrawerProps> = ({
  isOpen,
  onClose,
  status,
  config,
  systemInfo,
  latencyMs,
  logs,
  isCopied,
  onConnect,
  onDisconnect,
  onCancelAuth,
  onCopyLogs,
  onClearLogs,
  onOpenSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs select-none">
      {/* Click outside to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Panel */}
      <aside className="w-full max-w-[480px] h-full bg-[#0b0d11] border-l border-[#262c36] shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="h-12 px-4 bg-[#121620] border-b border-[#262c36] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-bold text-slate-100">WDS Connect — جسر الربط مع Mac</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenSettings}
              title="إعدادات الاتصال"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1f242e] transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="إغلاق اللوحة"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1f242e] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 px-4 py-3 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
          {/* Hardware & Bridge Cards */}
          <div className="flex flex-col gap-2">
            <LocalDeviceCard systemInfo={systemInfo} />
            <ConnectionBridge status={status} latencyMs={latencyMs} />
            <RemoteDeviceCard config={config} status={status} latencyMs={latencyMs} />
          </div>

          {/* Primary Action Button */}
          <div className="py-1">
            <PrimaryAction
              status={status}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onCancel={onCancelAuth}
            />
          </div>

          {/* Diagnostics Panel */}
          <div className="mt-auto pt-2">
            <DiagnosticsPanel
              logs={logs}
              onCopy={onCopyLogs}
              onClear={onClearLogs}
              isCopied={isCopied}
            />
          </div>
        </div>

        {/* Footer info */}
        <div className="h-8 px-4 bg-[#0e1117] border-t border-[#202530] flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>Host: {config.remote_host}</span>
          <span>Port: {config.remote_port}</span>
        </div>
      </aside>
    </div>
  );
};
