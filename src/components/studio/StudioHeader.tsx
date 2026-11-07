import React from 'react';
import {
  Layers,
  Monitor,
  Smartphone,
  TabletSmartphone,
  RotateCw,
  Radio,
  SlidersHorizontal,
  LayoutGrid,
} from 'lucide-react';
import { ConnectionStatus } from '../../types/ipc';

export type ViewportMode = 'all' | 'desktop' | 'android' | 'iphone';

interface StudioHeaderProps {
  viewportMode: ViewportMode;
  onSelectViewportMode: (mode: ViewportMode) => void;
  isViteOnline: boolean;
  viteLatencyMs: number | null;
  onRefreshHealth: () => void;
  onReloadAll: () => void;
  macStatus: ConnectionStatus;
  isConnectDrawerOpen: boolean;
  onToggleConnectDrawer: () => void;
  onResetSplit?: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  viewportMode,
  onSelectViewportMode,
  isViteOnline,
  viteLatencyMs,
  onRefreshHealth,
  onReloadAll,
  macStatus,
  isConnectDrawerOpen,
  onToggleConnectDrawer,
  onResetSplit,
}) => {
  const getMacStatusBadge = () => {
    switch (macStatus.status) {
      case 'Connected':
        return {
          label: 'Mac: متصل',
          dotClass: 'bg-emerald-400',
          badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80',
        };
      case 'Connecting':
      case 'Authenticating':
        return {
          label: 'Mac: جارٍ الاتصال',
          dotClass: 'bg-sky-400 animate-pulse',
          badgeClass: 'bg-sky-950/60 text-sky-300 border-sky-800/80',
        };
      case 'HostKeyVerificationPending':
      case 'AuthChallengePending':
        return {
          label: 'Mac: مطلوب إجراء',
          dotClass: 'bg-amber-400 animate-pulse',
          badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-800/80',
        };
      case 'Error':
        return {
          label: 'Mac: خطأ اتصال',
          dotClass: 'bg-rose-400',
          badgeClass: 'bg-rose-950/60 text-rose-300 border-rose-800/80',
        };
      case 'Disconnected':
      default:
        return {
          label: 'Mac: مفصول',
          dotClass: 'bg-slate-500',
          badgeClass: 'bg-slate-900/80 text-slate-400 border-slate-800',
        };
    }
  };

  const macBadge = getMacStatusBadge();

  return (
    <header className="h-10 w-full flex items-center justify-between px-3 bg-[#0d1017] border-b border-[#202632] select-none z-30 shadow-xs">
      {/* Brand & Mode Switcher */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-sky-500 via-indigo-600 to-sky-700 flex items-center justify-center shadow-xs ring-1 ring-sky-400/30">
            <Layers className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-bold text-slate-100 tracking-tight">WDS Studio</span>
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-[#262c36]" />

        {/* Viewport Mode Switcher */}
        <nav aria-label="Viewport Selector" className="flex items-center bg-[#141720] p-0.5 rounded-md border border-[#262c36]">
          <button
            type="button"
            onClick={() => onSelectViewportMode('all')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              viewportMode === 'all'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#1c212c]'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>كافة المنصات (3)</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectViewportMode('desktop')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              viewportMode === 'desktop'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#1c212c]'
            }`}
          >
            <Monitor className="w-3 h-3" />
            <span>Desktop</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectViewportMode('android')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              viewportMode === 'android'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#1c212c]'
            }`}
          >
            <Smartphone className="w-3 h-3" />
            <span>Android</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectViewportMode('iphone')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              viewportMode === 'iphone'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#1c212c]'
            }`}
          >
            <TabletSmartphone className="w-3 h-3" />
            <span>iPhone</span>
          </button>
        </nav>

        {/* Reset Split Layout Button */}
        {onResetSplit && viewportMode === 'all' && (
          <button
            type="button"
            onClick={onResetSplit}
            title="استعادة التقسيم الافتراضي (60% Desktop / 20% Android / 20% iPhone)"
            className="flex items-center gap-1 px-2 py-0.5 bg-[#141720] hover:bg-[#1e2330] text-slate-400 hover:text-sky-300 text-[11px] rounded-md border border-[#262c36] transition-colors"
          >
            <LayoutGrid className="w-3 h-3" />
            <span>60:20:20</span>
          </button>
        )}
      </div>

      {/* Center / Dev Server Health */}
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono border transition-all ${
            isViteOnline
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/70 shadow-xs'
              : 'bg-rose-950/60 text-rose-300 border-rose-800/80 animate-pulse'
          }`}
          title={isViteOnline ? `Vite running on 127.0.0.1:5173 (${viteLatencyMs ?? 0}ms)` : 'Vite server unreachable on 5173'}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isViteOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span>{isViteOnline ? 'Vite 5173: Online' : 'Vite 5173: Offline'}</span>
          {isViteOnline && viteLatencyMs !== null && (
            <span className="text-[10px] text-emerald-400/70">({viteLatencyMs}ms)</span>
          )}
          <button
            type="button"
            onClick={onRefreshHealth}
            aria-label="Recheck server health"
            className="p-0.5 hover:text-white rounded text-emerald-400/60 transition-colors"
          >
            <RotateCw className="w-2.5 h-2.5 hover:rotate-180 transition-transform duration-300" />
          </button>
        </div>

        {/* Reload All Viewports */}
        <button
          type="button"
          onClick={onReloadAll}
          title="إعادة تحميل المعاينات والمحاكيات متزامناً"
          className="flex items-center gap-1 px-2 py-0.5 bg-[#171c26] hover:bg-[#202735] text-slate-300 hover:text-sky-300 rounded-md text-[11px] border border-[#2a3242] transition-colors"
        >
          <RotateCw className="w-3 h-3 text-sky-400" />
          <span>تحديث الكل</span>
        </button>
      </div>

      {/* Right / Mac Bridge Toggle */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleConnectDrawer}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
            isConnectDrawerOpen
              ? 'bg-sky-950/80 text-sky-200 border-sky-600 shadow-inner'
              : `${macBadge.badgeClass} hover:border-slate-600`
          }`}
          title="فتح لوحة اتصال MacBook WDS Connect"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${macBadge.dotClass}`} />
          <Radio className="w-3 h-3" />
          <span>{macBadge.label}</span>
          <SlidersHorizontal className="w-2.5 h-2.5 text-slate-400" />
        </button>
      </div>
    </header>
  );
};
