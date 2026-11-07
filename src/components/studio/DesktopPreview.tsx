import React, { useState, useRef } from 'react';
import {
  RotateCw,
  ExternalLink,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  AppWindow,
  Sliders,
} from 'lucide-react';
import { OfflineOverlay } from './OfflineOverlay';

interface DesktopPreviewProps {
  isViteOnline: boolean;
  onRefreshHealth: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  reloadTrigger: number;
}

interface ResolutionPreset {
  label: string;
  width: number | '100%';
  height: number | '100%';
}

const DESKTOP_PRESETS: ResolutionPreset[] = [
  { label: 'تلقائي / Fluid', width: '100%', height: '100%' },
  { label: '1440 × 900 (Laptop)', width: 1440, height: 900 },
  { label: '1280 × 800 (Compact)', width: 1280, height: 800 },
  { label: '1920 × 1080 (FHD)', width: 1920, height: 1080 },
];

export const DesktopPreview: React.FC<DesktopPreviewProps> = ({
  isViteOnline,
  onRefreshHealth,
  isMaximized,
  onToggleMaximize,
  reloadTrigger,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<ResolutionPreset>(DESKTOP_PRESETS[0]);
  const [localReloadKey, setLocalReloadKey] = useState(0);
  const [isCopied, setIsCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewUrl = 'http://127.0.0.1:5173/';

  const handleReload = () => {
    setLocalReloadKey((prev) => prev + 1);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(previewUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1200);
    } catch {
      // fallback
    }
  };

  const handleOpenExternal = () => {
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <section
      aria-label="Desktop Preview"
      className={`flex flex-col bg-[#0b0e14] rounded-lg border border-[#202632] shadow-sm overflow-hidden transition-all duration-200 h-full w-full ${
        isMaximized ? 'fixed inset-2 z-40 bg-[#0e1117] shadow-2xl' : ''
      }`}
    >
      {/* Compact Desktop Sub-Header (32px) */}
      <div className="h-8 bg-[#131720] border-b border-[#202632] px-2.5 flex items-center justify-between select-none shrink-0">
        {/* Left / Title */}
        <div className="flex items-center gap-1.5">
          <AppWindow className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-xs font-semibold text-slate-200">Desktop (Windows)</span>
          <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
            5173
          </span>
        </div>

        {/* Center / Compact URL Bar */}
        <div className="hidden md:flex items-center bg-[#0a0d13] border border-[#232936] rounded px-2 py-0.5 text-[11px] font-mono text-slate-400 gap-1.5">
          <span className="text-slate-300">{previewUrl}</span>
          <button
            type="button"
            onClick={handleCopyUrl}
            title="نسخ الرابط"
            className="text-slate-400 hover:text-white transition-colors"
          >
            {isCopied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
          </button>
          <button
            type="button"
            onClick={handleOpenExternal}
            title="فتح في المتصفح الخارجي"
            className="text-slate-400 hover:text-sky-300 transition-colors"
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* Right / Presets & Actions */}
        <div className="flex items-center gap-1">
          {/* Preset Selector */}
          <div className="flex items-center gap-1 bg-[#0f131a] px-1.5 py-0.5 rounded border border-[#202632] text-[10px]">
            <Sliders className="w-2.5 h-2.5 text-slate-400" />
            <select
              value={selectedPreset.label}
              onChange={(e) => {
                const found = DESKTOP_PRESETS.find((p) => p.label === e.target.value);
                if (found) setSelectedPreset(found);
              }}
              className="bg-transparent text-slate-300 outline-none cursor-pointer text-[10px]"
            >
              {DESKTOP_PRESETS.map((p) => (
                <option key={p.label} value={p.label} className="bg-[#131720] text-slate-200">
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reload Button */}
          <button
            type="button"
            onClick={handleReload}
            title="إعادة تحميل سطح المكتب"
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-sky-300 hover:bg-[#1a202c] transition-colors"
          >
            <RotateCw className="w-3 h-3" />
          </button>

          {/* Maximize / Restore Button */}
          <button
            type="button"
            onClick={onToggleMaximize}
            title={isMaximized ? 'استعادة الحجم' : 'تكبير ملء الشاشة'}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-[#1a202c] transition-colors"
          >
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Main Preview Container - Uses Full Space with Zero Container Scrollbar */}
      <div className="relative flex-1 bg-[#07090d] overflow-hidden flex items-center justify-center p-1">
        {!isViteOnline && <OfflineOverlay port={5173} onRetry={onRefreshHealth} />}

        <div
          style={{
            width: typeof selectedPreset.width === 'number' ? `${selectedPreset.width}px` : selectedPreset.width,
            height: typeof selectedPreset.height === 'number' ? `${selectedPreset.height}px` : selectedPreset.height,
            maxWidth: '100%',
            maxHeight: '100%',
          }}
          className="relative w-full h-full bg-white rounded overflow-hidden border border-[#1b202a] flex flex-col"
        >
          <iframe
            ref={iframeRef}
            key={`desktop-${reloadTrigger}-${localReloadKey}`}
            src={previewUrl}
            title="Wajibati Desktop Viewport"
            className="w-full h-full border-none bg-slate-900"
            allow="clipboard-read; clipboard-write; camera; microphone; geolocation"
          />
        </div>
      </div>
    </section>
  );
};
