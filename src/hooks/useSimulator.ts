import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface AndroidStatus {
  is_running: boolean;
  device_id: string;
  app_installed: boolean;
  app_running: boolean;
  screen_width: number;
  screen_height: number;
}

export interface AndroidInputPayload {
  action: 'tap' | 'swipe' | 'text' | 'key' | 'relaunch' | 'back' | 'home';
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  duration_ms?: number;
  text?: string;
  keycode?: number;
}

export interface IosStatus {
  is_connected: boolean;
  host: string;
  device_name: string;
  state: string; // "Disconnected" | "Shutdown" | "Booting" | "Booted" | "Error"
  app_installed: boolean;
  app_running: boolean;
  error_message?: string;
}

export interface IosInputPayload {
  action: 'home' | 'relaunch' | 'open_url' | 'key';
  text?: string;
  url?: string;
}

export function useSimulator() {
  const [androidStatus, setAndroidStatus] = useState<AndroidStatus>({
    is_running: false,
    device_id: '',
    app_installed: false,
    app_running: false,
    screen_width: 1080,
    screen_height: 2400,
  });

  const [iosStatus, setIosStatus] = useState<IosStatus>({
    is_connected: false,
    host: '192.168.68.100',
    device_name: 'Wajibati iPhone 17 Pro',
    state: 'Disconnected',
    app_installed: false,
    app_running: false,
  });

  const [isBootingIos, setIsBootingIos] = useState(false);
  const [androidFrame, setAndroidFrame] = useState<string | null>(null);
  const [iosFrame, setIosFrame] = useState<string | null>(null);
  const [isCapturingAndroid, setIsCapturingAndroid] = useState(false);
  const [isCapturingIos, setIsCapturingIos] = useState(false);
  const mountedRef = useRef(true);

  // Poll Android Status
  const refreshAndroidStatus = useCallback(async () => {
    try {
      const res = await invoke<AndroidStatus>('android_get_status');
      if (mountedRef.current) {
        setAndroidStatus(res);
      }
    } catch {
      // ignore
    }
  }, []);

  // Poll iOS Status
  const refreshIosStatus = useCallback(async () => {
    try {
      const res = await invoke<IosStatus>('ios_get_status');
      if (mountedRef.current) {
        if (isBootingIos && res.state !== 'Booted') {
          setIosStatus({ ...res, state: 'Booting' });
        } else {
          setIosStatus(res);
        }
        if (res.state === 'Booted') {
          setIsBootingIos(false);
        }
      }
    } catch {
      // ignore
    }
  }, [isBootingIos]);

  // Capture Android Frame
  const captureAndroidFrame = useCallback(async () => {
    if (!androidStatus.is_running || isCapturingAndroid) return;
    setIsCapturingAndroid(true);
    try {
      const dataUrl = await invoke<string>('android_screencap');
      if (mountedRef.current && dataUrl) {
        setAndroidFrame(dataUrl);
      }
    } catch {
      // ignore
    } finally {
      if (mountedRef.current) {
        setIsCapturingAndroid(false);
      }
    }
  }, [androidStatus.is_running, isCapturingAndroid]);

  // Capture iOS Frame
  const captureIosFrame = useCallback(async () => {
    if (!iosStatus.is_connected || iosStatus.state !== 'Booted' || isCapturingIos) return;
    setIsCapturingIos(true);
    try {
      const dataUrl = await invoke<string>('ios_screencap');
      if (mountedRef.current && dataUrl) {
        setIosFrame(dataUrl);
      }
    } catch {
      // ignore
    } finally {
      if (mountedRef.current) {
        setIsCapturingIos(false);
      }
    }
  }, [iosStatus.is_connected, iosStatus.state, isCapturingIos]);

  // Send input to Android
  const sendAndroidInput = useCallback(
    async (payload: AndroidInputPayload) => {
      try {
        await invoke<string>('android_send_input', { payload });
        setTimeout(() => {
          captureAndroidFrame();
        }, 120);
      } catch (err) {
        console.warn('Android send input error:', err);
      }
    },
    [captureAndroidFrame]
  );

  // Send input to iOS
  const sendIosInput = useCallback(
    async (payload: IosInputPayload) => {
      try {
        await invoke<string>('ios_send_input', { payload });
        setTimeout(() => {
          captureIosFrame();
        }, 200);
      } catch (err) {
        console.warn('iOS send input error:', err);
      }
    },
    [captureIosFrame]
  );

  const launchAndroidEmulator = useCallback(async () => {
    try {
      await invoke<string>('android_launch_emulator');
      setTimeout(refreshAndroidStatus, 3000);
    } catch (err) {
      console.error(err);
    }
  }, [refreshAndroidStatus]);

  const installAndLaunchAndroid = useCallback(async () => {
    try {
      await invoke<string>('android_install_and_launch');
      setTimeout(() => {
        refreshAndroidStatus();
        captureAndroidFrame();
      }, 2000);
    } catch (err) {
      console.error(err);
    }
  }, [refreshAndroidStatus, captureAndroidFrame]);

  const launchScrcpy = useCallback(async () => {
    try {
      await invoke<string>('android_launch_scrcpy');
    } catch (err) {
      console.error(err);
    }
  }, []);

  const bootIosSimulator = useCallback(async () => {
    setIsBootingIos(true);
    try {
      await invoke<string>('ios_boot_simulator');
      setTimeout(async () => {
        await refreshIosStatus();
        captureIosFrame();
      }, 3000);
    } catch (err) {
      console.error(err);
      setIsBootingIos(false);
    }
  }, [refreshIosStatus, captureIosFrame]);

  const launchIosApp = useCallback(async () => {
    try {
      await invoke<string>('ios_launch_app');
      setTimeout(() => {
        refreshIosStatus();
        captureIosFrame();
      }, 2000);
    } catch (err) {
      console.error(err);
    }
  }, [refreshIosStatus, captureIosFrame]);

  useEffect(() => {
    mountedRef.current = true;
    refreshAndroidStatus();
    refreshIosStatus();

    const statusTimer = setInterval(() => {
      refreshAndroidStatus();
      refreshIosStatus();
    }, 4000);

    return () => {
      mountedRef.current = false;
      clearInterval(statusTimer);
    };
  }, [refreshAndroidStatus, refreshIosStatus]);

  return {
    androidStatus,
    iosStatus,
    isBootingIos,
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
    refreshAndroidStatus,
    refreshIosStatus,
  };
}
