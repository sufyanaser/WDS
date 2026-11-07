import React, { useState, useRef, useEffect } from 'react';
import {
  Smartphone,
  RotateCw,
  Maximize2,
  Minimize2,
  RotateCcw,
  Play,
  Download,
  AppWindow,
  Home,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { OfflineOverlay } from './OfflineOverlay';
import { AndroidStatus, AndroidInputPayload } from '../../hooks/useSimulator';

interface AndroidPreviewProps {
  isViteOnline: boolean;
  onRefreshHealth: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  reloadTrigger: number;
  androidStatus: AndroidStatus;
  androidFrame: string | null;
  onCaptureFrame: () => void;
  onSendInput: (payload: AndroidInputPayload) => void;
  onLaunchEmulator: () => void;
  onInstallAndLaunch: () => void;
  onLaunchScrcpy: () => void;
}

export const AndroidPreview: React.FC<AndroidPreviewProps> = ({
  isViteOnline,
  onRefreshHealth,
  isMaximized,
  onToggleMaximize,
  reloadTrigger,
  androidStatus,
  androidFrame,
  onCaptureFrame,
  onSendInput,
  onLaunchEmulator,
  onInstallAndLaunch,
  onLaunchScrcpy,
}) => {
  const [viewMode, setViewMode] = useState<'web' | 'native'>('native');
  const [isLandscape, setIsLandscape] = useState(false);
  const [localReloadKey, setLocalReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const previewUrl = 'http://127.0.0.1:5174/';

  // Auto-refresh screencap frames while in native view mode
  useEffect(() => {
    if (viewMode !== 'native' || !androidStatus.is_running) return;

    onCaptureFrame();
    const timer = setInterval(() => {
      onCaptureFrame();
    }, 350);

    return () => clearInterval(timer);
  }, [viewMode, androidStatus.is_running, onCaptureFrame]);

  const handleReload = () => {
    if (viewMode === 'web') {
      setLocalReloadKey((prev) => prev + 1);
    } else {
      onSendInput({ action: 'relaunch' });
    }
  };

  // Convert click/drag coordinates considering letterboxing and aspect ratio
  const getCanvasCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || !androidStatus.is_running) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const screenW = androidStatus.screen_width || 1080;
    const screenH = androidStatus.screen_height || 2400;

    const containerAspect = rect.width / rect.height;
    const imageAspect = screenW / screenH;
    let renderW = rect.width;
    let renderH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (containerAspect > imageAspect) {
      renderW = rect.height * imageAspect;
      offsetX = (rect.width - renderW) / 2;
    } else {
      renderH = rect.width / imageAspect;
      offsetY = (rect.height - renderH) / 2;
    }

    const clickX = e.clientX - rect.left - offsetX;
    const clickY = e.clientY - rect.top - offsetY;

    if (clickX < 0 || clickX > renderW || clickY < 0 || clickY > renderH) {
      return null;
    }

    const actualX = Math.round((clickX / renderW) * screenW);
    const actualY = Math.round((clickY / renderH) * screenH);

    return { x: actualX, y: actualY };
  };

  const handleScreenMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;
    dragStartRef.current = { x: coords.x, y: coords.y, time: Date.now() };
  };

  const handleScreenMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const coords = getCanvasCoords(e);
    const finalX = coords ? coords.x : dragStartRef.current.x;
    const finalY = coords ? coords.y : dragStartRef.current.y;

    const dx = Math.abs(finalX - dragStartRef.current.x);
    const dy = Math.abs(finalY - dragStartRef.current.y);
    const dt = Date.now() - dragStartRef.current.time;

    if (dx < 20 && dy < 20) {
      onSendInput({ action: 'tap', x: dragStartRef.current.x, y: dragStartRef.current.y });
    } else {
      onSendInput({
        action: 'swipe',
        x: dragStartRef.current.x,
        y: dragStartRef.current.y,
        x2: finalX,
        y2: finalY,
        duration_ms: Math.max(100, Math.min(600, dt)),
      });
    }

    dragStartRef.current = null;
  };

  return (
    <section
      aria-label="Android Mobile Preview"
      className={`flex flex-col bg-[#11141b] rounded-lg border border-[#262c36] shadow-md overflow-hidden transition-all duration-200 ${
        isMaximized ? 'fixed inset-3 z-40 bg-[#0e1117]' : 'h-full flex-1 min-w-[200px]'
      }`}
    >
      {/* Compact Frame Header (32px / h-8) */}
      <div className="h-8 bg-[#171b23] border-b border-[#262c36] px-2.5 flex items-center justify-between select-none shrink-0">
        {/* Left / Title & Port Indicator */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-4 h-4 rounded bg-emerald-950 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
            <Smartphone className="w-3 h-3" />
          </div>
          <span className="text-[11px] font-semibold text-slate-200 truncate">Android</span>
          {viewMode === 'native' ? (
            <span
              className={`text-[9px] font-mono px-1 py-0.2 rounded border flex items-center gap-1 shrink-0 ${
                androidStatus.is_running
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                  : 'bg-amber-950/80 text-amber-300 border-amber-800/60'
              }`}
            >
              {androidStatus.is_running ? 'AVD Online' : 'AVD Offline'}
            </span>
          ) : (
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 shrink-0">
              5174
            </span>
          )}
        </div>

        {/* Center / Mode Switcher */}
        <div className="flex items-center bg-[#0d1017] p-0.5 rounded border border-[#262c36] text-[10px]">
          <button
            type="button"
            onClick={() => setViewMode('native')}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              viewMode === 'native'
                ? 'bg-emerald-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Native
          </button>
          <button
            type="button"
            onClick={() => setViewMode('web')}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              viewMode === 'web'
                ? 'bg-emerald-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Web
          </button>
        </div>

        {/* Right / Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {viewMode === 'native' && (
            <>
              <button
                type="button"
                onClick={onLaunchScrcpy}
                title="فتح نافذة Scrcpy 60fps عالية الأداء"
                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-emerald-300 hover:bg-[#202531] transition-colors"
              >
                <AppWindow className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={onInstallAndLaunch}
                title="تثبيت وتشغيل APK على المحاكي"
                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-emerald-300 hover:bg-[#202531] transition-colors"
              >
                <Download className="w-3 h-3" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsLandscape(!isLandscape)}
            title={isLandscape ? 'تدوير للوضع الرأسي' : 'تدوير للوضع الأفقي'}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-emerald-300 hover:bg-[#202531] transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={handleReload}
            title={viewMode === 'native' ? 'إعادة تشغيل التطبيق في المحاكي' : 'إعادة تحميل المعاينة'}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-emerald-300 hover:bg-[#202531] transition-colors"
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
        {viewMode === 'web' && !isViteOnline && <OfflineOverlay port={5174} onRetry={onRefreshHealth} />}

        {/* Scalable Chassis without Fixed Scroll Overflows */}
        <div
          style={{
            aspectRatio: isLandscape ? '2400 / 1080' : '1080 / 2400',
            maxHeight: '100%',
            maxWidth: '100%',
          }}
          className="relative bg-[#1c2029] rounded-[24px] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.8)] border-2 border-[#2e3646] flex flex-col shrink-0 overflow-hidden"
        >
          {/* Top Hardware Bezel with Camera Punch Hole */}
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-black ring-1 ring-[#3a4457] z-20 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-[#0a1826]" />
          </div>

          {/* Screen Display Area */}
          <div className="relative w-full h-full bg-[#0b0d11] rounded-[18px] overflow-hidden flex flex-col">
            {viewMode === 'web' ? (
              <iframe
                ref={iframeRef}
                key={`android-web-${reloadTrigger}-${localReloadKey}`}
                src={previewUrl}
                title="Wajibati Android Web Preview"
                className="w-full h-full border-none bg-slate-900 cursor-pointer"
                allow="clipboard-read; clipboard-write; camera; microphone; geolocation"
              />
            ) : (
              <div
                ref={canvasRef}
                onMouseDown={handleScreenMouseDown}
                onMouseUp={handleScreenMouseUp}
                className="relative w-full h-full bg-black flex items-center justify-center cursor-pointer select-none overflow-hidden"
              >
                {androidStatus.is_running ? (
                  androidFrame ? (
                    <img
                      src={androidFrame}
                      alt="Android Emulator Live Screen"
                      className="w-full h-full object-contain pointer-events-none select-none"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-400 mb-2" />
                      <span className="text-[11px] font-mono">جارٍ استقبال بث شاشة المحاكي...</span>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <Smartphone className="w-8 h-8 text-slate-600 mb-2" />
                    <h4 className="text-xs font-bold text-slate-200 mb-0.5">محاكي Android متوقف</h4>
                    <p className="text-[10px] text-slate-500 mb-3 max-w-[180px]">
                      جهاز <span className="font-mono text-emerald-400">Medium_Phone</span> متاح للتشغيل.
                    </p>
                    <button
                      type="button"
                      onClick={onLaunchEmulator}
                      className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-medium transition-colors shadow-xs"
                    >
                      <Play className="w-3 h-3" />
                      <span>بدء تشغيل المحاكي</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Android Bottom Navigation Bar */}
            <div className="h-5 w-full bg-[#0e1117] flex items-center justify-between px-4 z-10 shrink-0 border-t border-[#1a1f29]">
              <button
                type="button"
                onClick={() => onSendInput({ action: 'back' })}
                title="رجوع (Back)"
                className="text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={() => onSendInput({ action: 'home' })}
                title="الشاشة الرئيسية (Home)"
                className="w-16 h-1 bg-white/40 hover:bg-white/80 rounded-full transition-colors"
              />

              <button
                type="button"
                onClick={() => onSendInput({ action: 'relaunch' })}
                title="إعادة فتح تطبيق واجباتي"
                className="text-slate-400 hover:text-emerald-400 transition-colors"
              >
                <Home className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info Strip (20px / h-5) */}
      <div className="h-5 bg-[#0f1218] border-t border-[#202632] px-2.5 flex items-center justify-between text-[9px] text-slate-500 font-mono select-none shrink-0">
        <span className="flex items-center gap-1 text-emerald-400 truncate">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          {viewMode === 'native'
            ? `AVD: ${androidStatus.device_id || 'Offline'} (${androidStatus.app_running ? 'iq.wajibati.app' : 'Standby'})`
            : 'Session: Android Partition (5174)'}
        </span>
        <span className="shrink-0">
          {androidStatus.screen_width || 1080}×{androidStatus.screen_height || 2400}
        </span>
      </div>
    </section>
  );
};
