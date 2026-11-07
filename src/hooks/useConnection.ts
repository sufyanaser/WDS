import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ConnectionStatus, AppConfig, LocalSystemInfo, HeartbeatTick } from '../types/ipc';

const DEFAULT_CONFIG: AppConfig = {
  remote_host: '192.168.68.100',
  remote_port: 22,
  remote_user: 'ali',
  private_key_path: 'C:\\Users\\sufya\\.ssh\\wds_mac_ed25519',
  heartbeat_interval_secs: 15,
  connection_timeout_secs: 10,
  identity_check_command: 'uname -srm; sw_vers -productVersion 2>/dev/null || true',
  save_password_to_keyring: false,
};

const DEFAULT_SYSTEM_INFO: LocalSystemInfo = {
  hostname: 'SUFYAN',
  username: 'sufya',
  os_name: 'Windows 11',
  local_ip: '192.168.68.104',
};

export function useConnection() {
  const [status, setStatus] = useState<ConnectionStatus>({ status: 'Disconnected' });
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [systemInfo, setSystemInfo] = useState<LocalSystemInfo>(DEFAULT_SYSTEM_INFO);
  const [latencyMs, setLatencyMs] = useState<number | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initialize initial config and system information from backend
  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const fetchedConfig = await invoke<AppConfig>('get_config');
        if (isMounted && fetchedConfig) setConfig(fetchedConfig);
      } catch (err) {
        console.warn('Backend get_config unavailable, using default config:', err);
      }

      try {
        const fetchedInfo = await invoke<LocalSystemInfo>('get_system_info');
        if (isMounted && fetchedInfo) setSystemInfo(fetchedInfo);
      } catch (err) {
        console.warn('Backend get_system_info unavailable, using default info:', err);
      }
    }

    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Listen to Tauri events: connection-status-changed & heartbeat-tick
  useEffect(() => {
    let unlistenStatus: UnlistenFn | undefined;
    let unlistenHeartbeat: UnlistenFn | undefined;

    async function setupListeners() {
      try {
        unlistenStatus = await listen<ConnectionStatus>('connection-status-changed', (event) => {
          setStatus(event.payload);
          if (event.payload.status === 'Connected' && event.payload.details.latency_ms !== undefined) {
            setLatencyMs(event.payload.details.latency_ms);
          } else if (event.payload.status === 'Disconnected') {
            setLatencyMs(undefined);
          }
        });

        unlistenHeartbeat = await listen<HeartbeatTick>('heartbeat-tick', (event) => {
          setLatencyMs(event.payload.latency_ms);
        });
      } catch (err) {
        console.warn('Tauri event listeners could not be attached:', err);
      }
    }

    setupListeners();

    return () => {
      if (unlistenStatus) unlistenStatus();
      if (unlistenHeartbeat) unlistenHeartbeat();
    };
  }, []);

  const connect = useCallback(async () => {
    try {
      setStatus({ status: 'Connecting', details: { host: config.remote_host, port: config.remote_port } });
      await invoke('connect');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ status: 'Error', details: { code: 'CONNECT_FAILED', message, timestamp: Date.now() } });
    }
  }, [config.remote_host, config.remote_port]);

  const disconnect = useCallback(async () => {
    try {
      setStatus({ status: 'Disconnecting' });
      await invoke('disconnect');
      setStatus({ status: 'Disconnected' });
      setLatencyMs(undefined);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ status: 'Error', details: { code: 'DISCONNECT_FAILED', message, timestamp: Date.now() } });
    }
  }, []);

  const confirmHostKey = useCallback(async (approved: boolean, remember: boolean) => {
    try {
      await invoke('confirm_host_key', { approved, remember });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ status: 'Error', details: { code: 'HOST_KEY_REJECTED', message, timestamp: Date.now() } });
    }
  }, []);

  const submitPassword = useCallback(async (password: string, remember: boolean) => {
    try {
      await invoke('submit_password', { password, remember });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ status: 'Error', details: { code: 'AUTH_FAILED', message, timestamp: Date.now() } });
    }
  }, []);

  const cancelAuth = useCallback(async () => {
    try {
      await invoke('cancel_auth');
      setStatus({ status: 'Disconnected' });
    } catch (err) {
      console.error('Cancel auth failed:', err);
      setStatus({ status: 'Disconnected' });
    }
  }, []);

  const saveConfig = useCallback(async (newConfig: AppConfig) => {
    try {
      await invoke('save_config', { config: newConfig });
      setConfig(newConfig);
    } catch (err) {
      console.error('Failed to save config:', err);
      throw err;
    }
  }, []);

  const clearCredentials = useCallback(async () => {
    try {
      await invoke('clear_credentials');
    } catch (err) {
      console.error('Failed to clear credentials:', err);
      throw err;
    }
  }, []);

  return {
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
  };
}
