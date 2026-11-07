import React, { useState, useRef, useEffect } from 'react';
import {
  TabletSmartphone,
  RotateCw,
  Maximize2,
  Minimize2,
  RotateCcw,
  Wifi,
  Battery,
  Eye,
  EyeOff,
  Home,
  RefreshCw,
  Radio,
  ExternalLink as LinkIcon,
  Play,
  AlertTriangle,
} from 'lucide-react';
import { OfflineOverlay } from './OfflineOverlay';
import { IosStatus, IosInputPayload } from '../../hooks/useSimulator';

interface IphonePreviewProps {
  isViteOnline: boolean;
  onRefreshHealth: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  reloadTrigger: number;
  iosStatus: IosStatus;
  iosFrame: string | null;
  onCaptureFrame: () => void;
  onSendInput: (payload: IosInputPayload) => void;
  onBootSimulator: () => void;
  onLaunchApp: () => void;
  onOpenConnectDrawer: () => void;
}

export const IphonePreview: React.FC<IphonePreviewProps> = ({
  isViteOnline,
  onRefreshHealth,
  isMaximized,
  onToggleMaximize,
  reloadTrigger,
  iosStatus,
  iosFrame,
  onCaptureFrame,
  onSendInput,
  onBootSimulator,
  onLaunchApp,
  onOpenConnectDrawer,
}) => {
  const [viewMode, setViewMode] = useState<'web' | 'native'>('web');
  const [isLandscape, setIsLandscape] = useState(false);
  const [localReloadKey, setLocalReloadKey] = useState(0);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewUrl = 'http://127.0.0.1:5175/';

  // Auto-refresh screencap frames while in native view mode and simulator is booted
  useEffect(() => {
    if (viewMode !== 'native' || !iosStatus.is_connected || iosStatus.state !== 'Booted') return;

    onCaptureFrame();
    const timer = setInterval(() => {
      onCaptureFrame();
    }, 400);

    return () => clearInterval(timer);
  }, [viewMode, iosStatus.is_connected, iosStatus.state, onCaptureFrame]);

  const handleReload = () => {
    if (viewMode === 'web') {
      setLocalReloadKey((prev) => prev + 1);
    } else {
      onSendInput({ action: 'relaunch' });
    }
  };

  const getStatusBadge = () => {
    if (viewMode === 'web') {
      return (
        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-indigo-950/70 text-indigo-400 border border-indigo-800/50 shrink-0">
          5175
        </span>
      );
    }

    if (!iosStatus.is_connected) {
      return (
        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800 shrink-0">
          Mac Disconnected
        </span>
      );
    }

    switch (iosStatus.state) {
      case 'Booted':
        return (
          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 shrink-0">
            Booted
          </span>
        );
      case 'Booting':
        return (
          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60 animate-pulse shrink-0">
            Booting...
          </span>
        );
      case 'Shutdown':
        return (
          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 shrink-0">
            Shutdown
          </span>
        );
      case 'Error':
      default:
        return (
          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60 shrink-0">
            Error
          </span>
        );
    }
  };

  return (
    <section
      aria-label="iPhone iOS Preview"
      className={`flex flex-col bg-[#11141b] rounded-lg border border-[#262c36] shadow-md overflow-hidden transition-all duration-200 ${
        isMaximized ? 'fixed inset-3 z-40 bg-[#0e1117]' : 'h-full flex-1 min-w-[200px]'
      }`}
    >
      {/* Compact Frame Header (32px / h-8) */}
      <div className="h-8 bg-[#171b23] border-b border-[#262c36] px-2.5 flex items-center justify-between select-none shrink-0">
        {/* Left / Title & Port Indicator */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-4 h-4 rounded bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-400 shrink-0">
            <TabletSmartphone className="w-3 h-3" />
          </div>
          <span className="text-[11px] font-semibold text-slate-200 truncate">iPhone</span>
          {getStatusBadge()}
        </div>

        {/* Center / Mode Switcher */}
        <div className="flex items-center bg-[#0d1017] p-0.5 rounded border border-[#262c36] text-[10px]">
          <button
            type="button"
            onClick={() => setViewMode('web')}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              viewMode === 'web'
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Web
          </button>
          <button
            type="button"
            onClick={() => setViewMode('native')}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              viewMode === 'native'
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mac Sim
          </button>
        </div>

        {/* Right / Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {viewMode === 'web' && (
            <button
              type="button"
              onClick={() => setShowSafeArea(!showSafeArea)}
              title={showSafeArea ? 'إخفاء حدود Safe Area' : 'إظهار حدود Safe Area'}
              className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                showSafeArea
                  ? 'bg-amber-950/70 text-amber-300 border border-amber-800/80'
                  : 'text-slate-400 hover:text-white hover:bg-[#202531]'
              }`}
            >
              {showSafeArea ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsLandscape(!isLandscape)}
            title={isLandscape ? 'تدوير للوضع الرأسي' : 'تدوير للوضع الأفقي'}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-300 hover:bg-[#202531] transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={handleReload}
            title={viewMode === 'native' ? 'إعادة تشغيل التطبيق على Mac Simulator' : 'إعادة تحميل المعاينة'}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-300 hover:bg-[#202531] transition-colors"
          >
            <RotateCw className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={onToggleMaximize}
            title={isMaximized ? 'استعادة الحجم الطبيعي' : 'تكبير ملء الشاشة'}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-[#202531] transition-colors"
          >
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Main Preview Container with Hardware Frame - Clean, No Scrollbars */}
      <div className="relative flex-1 bg-[#090b0f] overflow-hidden flex flex-col items-center justify-center p-2 select-none">
        {viewMode === 'web' && !isViteOnline && <OfflineOverlay port={5175} onRetry={onRefreshHealth} />}

        {/* Scalable Chassis without Fixed Scroll Overflows */}
        <div
          style={{
            aspectRatio: isLandscape ? '19.5 / 9' : '9 / 19.5',
            maxHeight: '100%',
            maxWidth: '100%',
          }}
          className="relative bg-[#1f2228] rounded-[28px] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.85)] border-2 border-[#383d47] flex flex-col shrink-0 overflow-hidden"
        >
          {/* Screen Display Area */}
          <div className="relative w-full h-full bg-[#000000] rounded-[20px] overflow-hidden flex flex-col">
            {viewMode === 'web' ? (
              <>
                {!isLandscape && (
                  <div className="h-7 w-full bg-[#000000] flex items-center justify-between px-4 z-20 shrink-0 pointer-events-none select-none">
                    <span className="text-[11px] font-semibold text-white tracking-tight">9:41</span>
                    <div className="w-20 h-4 bg-black rounded-full ring-1 ring-slate-800/80 flex items-center justify-between px-2">
                      <div className="w-2 h-2 rounded-full bg-[#0d1b2a] ring-1 ring-[#1b263b]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                    </div>
                    <div className="flex items-center gap-1 text-white">
                      <span className="text-[9px] font-bold">5G</span>
                      <Wifi className="w-2.5 h-2.5 text-white" />
                      <Battery className="w-3 h-3 text-white" />
                    </div>
                  </div>
                )}

                {showSafeArea && (
                  <div className="absolute inset-0 pointer-events-none z-30 border-2 border-dashed border-amber-400/40 flex flex-col justify-between">
                    <div className="h-8 bg-amber-500/10 border-b border-amber-400/30 text-[8px] text-amber-300 font-mono flex items-center justify-center">
                      Top Safe Area
                    </div>
                    <div className="h-6 bg-amber-500/10 border-t border-amber-400/30 text-[8px] text-amber-300 font-mono flex items-center justify-center">
                      Bottom Safe Area
                    </div>
                  </div>
                )}

                <iframe
                  ref={iframeRef}
                  key={`iphone-web-${reloadTrigger}-${localReloadKey}`}
                  src={previewUrl}
                  title="Wajibati iPhone Web Preview"
                  className="w-full h-full border-none bg-slate-900 cursor-pointer"
                  allow="clipboard-read; clipboard-write; camera; microphone; geolocation"
                />

                <div className="h-3 w-full bg-black flex items-center justify-center z-20 shrink-0 pointer-events-none">
                  <div className="w-24 h-0.5 bg-white/60 rounded-full" />
                </div>
              </>
            ) : (
              /* Native Mac Simulator Stream Canvas */
              <div className="relative w-full h-full bg-black flex flex-col items-center justify-center select-none overflow-hidden">
                {!iosStatus.is_connected ? (
                  /* State: Disconnected */
                  <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <Radio className="w-8 h-8 text-slate-600 mb-2" />
                    <h4 className="text-xs font-bold text-slate-200 mb-0.5">MacBook غير متصل</h4>
                    <p className="text-[10px] text-slate-500 mb-3 max-w-[190px]">
                      يتطلب تشغيل محاكي iOS الاتصال بـ MacBook على <span className="font-mono text-indigo-400">192.168.68.100</span>.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenConnectDrawer}
                      className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium transition-colors shadow-xs"
                    >
                      <Radio className="w-3 h-3" />
                      <span>فتح لوحة WDS Connect</span>
                    </button>
                  </div>
                ) : iosStatus.state === 'Shutdown' ? (
                  /* State: Shutdown */
                  <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <TabletSmartphone className="w-8 h-8 text-slate-600 mb-2" />
                    <h4 className="text-xs font-bold text-slate-200 mb-0.5">المحاكي متوقف (Shutdown)</h4>
                    <p className="text-[10px] text-slate-500 mb-3 max-w-[190px]">
                      الجهاز <span className="font-mono text-indigo-400">{iosStatus.device_name}</span> جاهز للإقلاع.
                    </p>
                    <button
                      type="button"
                      onClick={onBootSimulator}
                      className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium transition-colors shadow-xs"
                    >
                      <Play className="w-3 h-3" />
                      <span>تشغيل المحاكي</span>
                    </button>
                  </div>
                ) : iosStatus.state === 'Booting' ? (
                  /* State: Booting */
                  <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
                    <h4 className="text-xs font-bold text-slate-200 mb-1">جارٍ إقلاع المحاكي...</h4>
                    <span className="text-[10px] font-mono text-slate-500">
                      تشغيل {iosStatus.device_name} على Mac
                    </span>
                  </div>
                ) : iosStatus.state === 'Booted' ? (
                  /* State: Booted with Frame Stream */
                  <>
                    {iosFrame ? (
                      <img
                        src={iosFrame}
                        alt="Mac iOS Simulator Screen"
                        className="w-full h-full object-contain pointer-events-none select-none"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                        <RefreshCw className="w-5 h-5 animate-spin text-indigo-400 mb-2" />
                        <span className="text-[11px] font-mono">جارٍ استقبال بث إطارات iOS...</span>
                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={onLaunchApp}
                            className="px-2 py-0.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded text-[10px] flex items-center gap-1"
                          >
                            <Play className="w-2.5 h-2.5" />
                            <span>فتح واجباتي</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* iOS Bottom Controls */}
                    <div className="h-5 w-full bg-[#0a0d13] flex items-center justify-between px-4 z-10 shrink-0 border-t border-[#1a1f29]">
                      <button
                        type="button"
                        onClick={() => onSendInput({ action: 'open_url', url: 'http://127.0.0.1:5173' })}
                        title="فتح رابط واجباتي في Safari"
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        <LinkIcon className="w-3 h-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onSendInput({ action: 'home' })}
                        title="الزر الرئيسي (Home)"
                        className="w-16 h-1 bg-white/50 hover:bg-white/90 rounded-full transition-colors"
                      />

                      <button
                        type="button"
                        onClick={onLaunchApp}
                        title="تشغيل / إعادة تشغيل تطبيق واجباتي"
                        className="text-slate-400 hover:text-indigo-400 transition-colors"
                      >
                        <Home className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                ) : (
                  /* State: Error */
                  <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <AlertTriangle className="w-8 h-8 text-rose-500 mb-2" />
                    <h4 className="text-xs font-bold text-slate-200 mb-0.5">خطأ في محاكي iOS</h4>
                    <p className="text-[10px] text-rose-400 mb-3 max-w-[190px] font-mono break-all">
                      {iosStatus.error_message || 'تعذر تشغيل المحاكي'}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={onBootSimulator}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium transition-colors"
                      >
                        إعادة المحاولة
                      </button>
                      <button
                        type="button"
                        onClick={onOpenConnectDrawer}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] transition-colors"
                      >
                        فحص الاتصال
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Info Strip (20px / h-5) */}
      <div className="h-5 bg-[#0f1218] border-t border-[#202632] px-2.5 flex items-center justify-between text-[9px] text-slate-500 font-mono select-none shrink-0">
        <span className="flex items-center gap-1 text-indigo-400 truncate">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
          {viewMode === 'native'
            ? `Mac Sim: ${iosStatus.device_name} (${iosStatus.state})`
            : 'Session: iOS Partition (5175)'}
        </span>
        <span className="shrink-0">
          {iosStatus.state === 'Booted' ? 'Live Stream' : 'Ready'}
        </span>
      </div>
    </section>
  );
};
