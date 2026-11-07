import React from 'react';
import { Download, RefreshCw, X, ArrowUpCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { UpdateInfo } from '../../hooks/useAutoUpdater';

interface UpdateNotificationProps {
  updateInfo: UpdateInfo | null;
  isDownloading: boolean;
  downloadProgress: number;
  isReadyToRestart: boolean;
  error: string | null;
  onDownload: () => void;
  onDismiss: () => void;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  updateInfo,
  isDownloading,
  downloadProgress,
  isReadyToRestart,
  error,
  onDownload,
  onDismiss,
}) => {
  if (!updateInfo?.available && !error && !isReadyToRestart) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm bg-[#131722] border border-[#2b3547] rounded-xl p-3 shadow-2xl text-slate-200 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-100">
          <ArrowUpCircle className="w-4 h-4 text-sky-400" />
          <span>تحديث جديد متوفر لـ WDS</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {updateInfo?.available && (
        <div className="mb-2 text-[11px] text-slate-400 space-y-1">
          <p>
            الإصدار الحالي: <span className="font-mono text-slate-300">v{updateInfo.currentVersion}</span> ←
            الإصدار الجديد: <span className="font-mono text-emerald-400 font-bold">v{updateInfo.latestVersion}</span>
          </p>
          {updateInfo.body && (
            <p className="line-clamp-2 bg-[#0b0e14] p-1.5 rounded border border-[#1d2433] text-[10px] text-slate-300">
              {updateInfo.body}
            </p>
          )}
        </div>
      )}

      {isDownloading && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>جارٍ تنزيل التحديث والتحقق من التوقيع...</span>
            <span className="font-mono">{downloadProgress}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#0b0e14] rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}

      {isReadyToRestart && (
        <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] mb-2 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>تم تثبيت التحديث بنجاح! يُرجى إعادة تشغيل WDS لتطبيقه.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-rose-400 text-[10px] mb-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#1e2535]">
        <button
          type="button"
          onClick={onDismiss}
          className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          تخطي الآن
        </button>

        {!isReadyToRestart && !isDownloading && updateInfo?.available && (
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1 px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-[11px] font-medium transition-colors shadow-xs"
          >
            <Download className="w-3 h-3" />
            <span>تنزيل وتثبيت</span>
          </button>
        )}

        {isDownloading && (
          <button
            type="button"
            disabled
            className="flex items-center gap-1 px-3 py-1 bg-sky-800/60 text-slate-300 rounded-md text-[11px] font-medium cursor-not-allowed"
          >
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>جارٍ التثبيت...</span>
          </button>
        )}
      </div>
    </div>
  );
};
