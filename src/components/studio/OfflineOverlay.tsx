import React from 'react';
import { AlertTriangle, RotateCw, Terminal } from 'lucide-react';

interface OfflineOverlayProps {
  port: number;
  onRetry: () => void;
}

export const OfflineOverlay: React.FC<OfflineOverlayProps> = ({ port, onRetry }) => {
  return (
    <div className="absolute inset-0 bg-[#0b0d11]/95 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-800/80 flex items-center justify-center text-rose-400 mb-3 shadow-lg shadow-rose-950/50 animate-bounce">
        <AlertTriangle className="w-6 h-6" />
      </div>

      <h3 className="text-base font-bold text-slate-100 mb-1">خادم التطوير غير متصل</h3>
      <p className="text-xs text-slate-400 max-w-xs mb-4 leading-relaxed">
        تعذر الاتصال بخادم Vite على المنفذ <span className="font-mono text-sky-400">127.0.0.1:{port}</span>. تأكد من تشغيل أمر التطوير في مجلد واجباتي.
      </p>

      <div className="w-full max-w-sm bg-[#161920] border border-[#262c36] rounded-md p-2.5 mb-4 text-left font-mono text-[11px] text-slate-300 flex items-center gap-2">
        <Terminal className="w-4 h-4 text-sky-400 shrink-0" />
        <span className="truncate">cd G:\PROJECTS\WAJIBATI-consolidation-beta-1-unified &amp;&amp; npm run dev</span>
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-all shadow-sm shadow-sky-950"
      >
        <RotateCw className="w-3.5 h-3.5" />
        <span>إعادة المحاولة الآن</span>
      </button>
    </div>
  );
};
