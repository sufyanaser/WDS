import { useState, useEffect, useCallback } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  body?: string;
  date?: string;
}

export function useAutoUpdater() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [activeUpdate, setActiveUpdate] = useState<Update | null>(null);
  const [isReadyToRestart, setIsReadyToRestart] = useState(false);

  const checkForUpdates = useCallback(async (manual = false) => {
    try {
      setIsChecking(true);
      setError(null);
      const update = await check();
      if (update) {
        setActiveUpdate(update);
        setUpdateInfo({
          available: true,
          currentVersion: update.currentVersion,
          latestVersion: update.version,
          body: update.body,
          date: update.date,
        });
      } else {
        if (manual) {
          setUpdateInfo({
            available: false,
            currentVersion: '1.0.0',
            latestVersion: '1.0.0',
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Suppress network errors on initial auto-check so we don't annoy the user if offline
      if (manual) {
        setError(`فشل التحقق من التحديثات: ${msg}`);
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Check once on launch without blocking
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdates(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  const downloadAndInstall = useCallback(async () => {
    if (!activeUpdate) return;
    try {
      setIsDownloading(true);
      setError(null);
      let downloaded = 0;
      let contentLength = 0;

      await activeUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            setDownloadProgress(100);
            break;
        }
      });

      setIsReadyToRestart(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`فشل تثبيت التحديث: ${msg}`);
    } finally {
      setIsDownloading(false);
    }
  }, [activeUpdate]);

  const dismissUpdate = useCallback(() => {
    setUpdateInfo(null);
  }, []);

  return {
    updateInfo,
    isChecking,
    isDownloading,
    downloadProgress,
    isReadyToRestart,
    error,
    checkForUpdates,
    downloadAndInstall,
    dismissUpdate,
  };
}
