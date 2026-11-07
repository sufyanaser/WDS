import React, { useState, useCallback, useRef } from 'react';
import { StudioHeader, ViewportMode } from './components/studio/StudioHeader';
import { DesktopPreview } from './components/studio/DesktopPreview';
import { AndroidPreview } from './components/studio/AndroidPreview';
import { IphonePreview } from './components/studio/IphonePreview';
import { SplitDivider } from './components/studio/SplitDivider';
import { WdsConnectDrawer } from './components/studio/WdsConnectDrawer';
import { HostKeyDialog } from './components/HostKeyDialog';
import { PasswordDialog } from './components/PasswordDialog';
import { SettingsModal } from './components/SettingsModal';
import { useConnection } from './hooks/useConnection';
import { useDiagnostics } from './hooks/useDiagnostics';
import { useDevServerHealth } from './hooks/useDevServerHealth';
import { useSimulator } from './hooks/useSimulator';
import { useAutoUpdater } from './hooks/useAutoUpdater';
import { UpdateNotification } from './components/studio/UpdateNotification';

export const App: React.FC = () => {
  // Mac Bridge & Diagnostics State
  const {
    status,
    config,
    systemInfo,
    latencyMs,
    isSettingsOpen,
    setIsSettingsOpen,
    connect,
    disconnect,
    confirmHostKey,
    submitPassword,
    cancelAuth,
    saveConfig,
    clearCredentials,
  } = useConnection();

  const { logs, copyLogs, clearLogs, isCopied } = useDiagnostics();

  // Vite Dev Server Health (Port 5173)
  const devServerHealth = useDevServerHealth('http://127.0.0.1:5173', 4000);

  // Native Simulators Engine
  const {
    androidStatus,
    iosStatus,
    androidFrame,
    iosFrame,
    captureAndroidFrame,
    captureIosFrame,
    sendAndroidInput,
    sendIosInput,
    launchAndroidEmulator,
    installAndLaunchAndroid,
    launchScrcpy,
    bootIosSimulator,
    launchIosApp,
  } = useSimulator();

  // Tauri Auto-Updater
  const {
    updateInfo,
    isDownloading,
    downloadProgress,
    isReadyToRestart,
    error: updateError,
    downloadAndInstall,
    dismissUpdate,
  } = useAutoUpdater();

  // Studio State
  const [viewportMode, setViewportMode] = useState<ViewportMode>('all');
  const [isConnectDrawerOpen, setIsConnectDrawerOpen] = useState(false);
  const [maximizedViewport, setMaximizedViewport] = useState<'desktop' | 'android' | 'iphone' | null>(null);
  const [globalReloadTrigger, setGlobalReloadTrigger] = useState(0);

  // 3-way workspace split state: [Desktop %, Android %, iPhone %]
  const containerRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState<[number, number, number]>(() => {
    try {
      const saved = localStorage.getItem('wds_workspace_split');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.length === 3 &&
          parsed[0] >= 30 &&
          parsed[1] >= 15 &&
          parsed[2] >= 15
        ) {
          return [parsed[0], parsed[1], parsed[2]];
        }
      }
    } catch {
      // fallback
    }
    return [60, 20, 20];
  });

  const handleDragDivider1 = useCallback((deltaPixels: number) => {
    if (!containerRef.current) return;
    const totalW = containerRef.current.clientWidth;
    if (totalW <= 0) return;
    const deltaPct = (deltaPixels / totalW) * 100;

    setSplit((prev) => {
      let d = prev[0] + deltaPct;
      let a = prev[1] - deltaPct;
      const i = prev[2];

      if (d < 35) {
        const diff = 35 - d;
        d = 35;
        a -= diff;
      } else if (a < 15) {
        const diff = 15 - a;
        a = 15;
        d -= diff;
      }

      const next: [number, number, number] = [
        Math.round(d * 10) / 10,
        Math.round(a * 10) / 10,
        i,
      ];
      localStorage.setItem('wds_workspace_split', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleDragDivider2 = useCallback((deltaPixels: number) => {
    if (!containerRef.current) return;
    const totalW = containerRef.current.clientWidth;
    if (totalW <= 0) return;
    const deltaPct = (deltaPixels / totalW) * 100;

    setSplit((prev) => {
      const d = prev[0];
      let a = prev[1] + deltaPct;
      let i = prev[2] - deltaPct;

      if (a < 15) {
        const diff = 15 - a;
        a = 15;
        i -= diff;
      } else if (i < 15) {
        const diff = 15 - i;
        i = 15;
        a -= diff;
      }

      const next: [number, number, number] = [
        d,
        Math.round(a * 10) / 10,
        Math.round(i * 10) / 10,
      ];
      localStorage.setItem('wds_workspace_split', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleResetSplit = useCallback(() => {
    const defaultSplit: [number, number, number] = [60, 20, 20];
    setSplit(defaultSplit);
    localStorage.setItem('wds_workspace_split', JSON.stringify(defaultSplit));
  }, []);

  const handleReloadAll = useCallback(() => {
    setGlobalReloadTrigger((prev) => prev + 1);
    devServerHealth.checkNow();
    if (androidStatus.is_running) {
      sendAndroidInput({ action: 'relaunch' });
    }
    if (iosStatus.is_connected) {
      sendIosInput({ action: 'relaunch' });
    }
  }, [devServerHealth, androidStatus.is_running, iosStatus.is_connected, sendAndroidInput, sendIosInput]);

  const toggleMaximize = (target: 'desktop' | 'android' | 'iphone') => {
    setMaximizedViewport((prev) => (prev === target ? null : target));
  };

  const hostKeyDetails =
    status.status === 'HostKeyVerificationPending' ? status.details : null;

  const authChallengeDetails =
    status.status === 'AuthChallengePending' ? status.details : null;

  const isAllMode = viewportMode === 'all' && maximizedViewport === null;

  return (
    <div className="w-full h-screen bg-[#090b0f] text-slate-100 flex flex-col overflow-hidden select-none font-sans">
      {/* Unified Top Application Bar (Compact 40px) */}
      <StudioHeader
        viewportMode={viewportMode}
        onSelectViewportMode={(mode) => {
          setMaximizedViewport(null);
          setViewportMode(mode);
        }}
        isViteOnline={devServerHealth.isOnline}
        viteLatencyMs={devServerHealth.latencyMs}
        onRefreshHealth={devServerHealth.checkNow}
        onReloadAll={handleReloadAll}
        macStatus={status}
        isConnectDrawerOpen={isConnectDrawerOpen}
        onToggleConnectDrawer={() => setIsConnectDrawerOpen(!isConnectDrawerOpen)}
        onResetSplit={handleResetSplit}
      />

      {/* Main Studio Viewport Workspace - Desktop-First Flat Layout */}
      <main className="relative flex-1 p-2 overflow-hidden flex flex-col bg-[#0b0e14]">
        {isAllMode ? (
          /* Triple-Platform Flat Layout with Draggable Dividers (Default: 60:20:20) */
          <div
            ref={containerRef}
            className="flex-1 flex flex-row overflow-hidden w-full h-full items-stretch"
          >
            {/* 1. Desktop Preview (Windows) - 60% */}
            <div style={{ width: `${split[0]}%` }} className="h-full min-w-0 pr-0.5 flex flex-col">
              <DesktopPreview
                isViteOnline={devServerHealth.isOnline}
                onRefreshHealth={devServerHealth.checkNow}
                isMaximized={false}
                onToggleMaximize={() => toggleMaximize('desktop')}
                reloadTrigger={globalReloadTrigger}
              />
            </div>

            {/* Split Divider 1 */}
            <SplitDivider
              onDrag={handleDragDivider1}
              onDoubleClick={handleResetSplit}
            />

            {/* 2. Android Preview (Native AVD / Isolated 5174) - 20% */}
            <div style={{ width: `${split[1]}%` }} className="h-full min-w-0 px-0.5 flex flex-col">
              <AndroidPreview
                isViteOnline={devServerHealth.isOnline}
                onRefreshHealth={devServerHealth.checkNow}
                isMaximized={false}
                onToggleMaximize={() => toggleMaximize('android')}
                reloadTrigger={globalReloadTrigger}
                androidStatus={androidStatus}
                androidFrame={androidFrame}
                onCaptureFrame={captureAndroidFrame}
                onSendInput={sendAndroidInput}
                onLaunchEmulator={launchAndroidEmulator}
                onInstallAndLaunch={installAndLaunchAndroid}
                onLaunchScrcpy={launchScrcpy}
              />
            </div>

            {/* Split Divider 2 */}
            <SplitDivider
              onDrag={handleDragDivider2}
              onDoubleClick={handleResetSplit}
            />

            {/* 3. iPhone Preview (Mac Simulator / Isolated 5175) - 20% */}
            <div style={{ width: `${split[2]}%` }} className="h-full min-w-0 pl-0.5 flex flex-col">
              <IphonePreview
                isViteOnline={devServerHealth.isOnline}
                onRefreshHealth={devServerHealth.checkNow}
                isMaximized={false}
                onToggleMaximize={() => toggleMaximize('iphone')}
                reloadTrigger={globalReloadTrigger}
                iosStatus={iosStatus}
                iosFrame={iosFrame}
                onCaptureFrame={captureIosFrame}
                onSendInput={sendIosInput}
                onBootSimulator={bootIosSimulator}
                onLaunchApp={launchIosApp}
                onOpenConnectDrawer={() => setIsConnectDrawerOpen(true)}
              />
            </div>
          </div>
        ) : (
          /* Focused / Single / Maximized Viewport */
          <div className="flex-1 flex flex-row overflow-hidden w-full h-full">
            {(maximizedViewport === 'desktop' || viewportMode === 'desktop') && (
              <DesktopPreview
                isViteOnline={devServerHealth.isOnline}
                onRefreshHealth={devServerHealth.checkNow}
                isMaximized={maximizedViewport === 'desktop'}
                onToggleMaximize={() => toggleMaximize('desktop')}
                reloadTrigger={globalReloadTrigger}
              />
            )}

            {(maximizedViewport === 'android' || viewportMode === 'android') && (
              <AndroidPreview
                isViteOnline={devServerHealth.isOnline}
                onRefreshHealth={devServerHealth.checkNow}
                isMaximized={maximizedViewport === 'android'}
                onToggleMaximize={() => toggleMaximize('android')}
                reloadTrigger={globalReloadTrigger}
                androidStatus={androidStatus}
                androidFrame={androidFrame}
                onCaptureFrame={captureAndroidFrame}
                onSendInput={sendAndroidInput}
                onLaunchEmulator={launchAndroidEmulator}
                onInstallAndLaunch={installAndLaunchAndroid}
                onLaunchScrcpy={launchScrcpy}
              />
            )}

            {(maximizedViewport === 'iphone' || viewportMode === 'iphone') && (
              <IphonePreview
                isViteOnline={devServerHealth.isOnline}
                onRefreshHealth={devServerHealth.checkNow}
                isMaximized={maximizedViewport === 'iphone'}
                onToggleMaximize={() => toggleMaximize('iphone')}
                reloadTrigger={globalReloadTrigger}
                iosStatus={iosStatus}
                iosFrame={iosFrame}
                onCaptureFrame={captureIosFrame}
                onSendInput={sendIosInput}
                onBootSimulator={bootIosSimulator}
                onLaunchApp={launchIosApp}
                onOpenConnectDrawer={() => setIsConnectDrawerOpen(true)}
              />
            )}
          </div>
        )}
      </main>

      {/* WDS Connect Drawer (Mac Bridge, SSH, Diagnostics) */}
      <WdsConnectDrawer
        isOpen={isConnectDrawerOpen}
        onClose={() => setIsConnectDrawerOpen(false)}
        status={status}
        config={config}
        systemInfo={systemInfo}
        latencyMs={latencyMs}
        logs={logs}
        isCopied={isCopied}
        onConnect={connect}
        onDisconnect={disconnect}
        onCancelAuth={cancelAuth}
        onCopyLogs={copyLogs}
        onClearLogs={clearLogs}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Interactive Modal Dialogs for SSH Authentication */}
      <HostKeyDialog
        isOpen={status.status === 'HostKeyVerificationPending'}
        details={hostKeyDetails}
        onConfirm={confirmHostKey}
        onCancel={cancelAuth}
      />

      <PasswordDialog
        isOpen={status.status === 'AuthChallengePending'}
        details={authChallengeDetails}
        onSubmit={submitPassword}
        onCancel={cancelAuth}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        config={config}
        onSave={saveConfig}
        onClearCredentials={clearCredentials}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Tauri Auto-Updater Toast / Modal */}
      <UpdateNotification
        updateInfo={updateInfo}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        isReadyToRestart={isReadyToRestart}
        error={updateError}
        onDownload={downloadAndInstall}
        onDismiss={dismissUpdate}
      />
    </div>
  );
};

export default App;
