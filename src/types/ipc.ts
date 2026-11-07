/**
 * WDS Connect - IPC Type Definitions & Invocation Helpers
 * Exact mapping of Rust models in `src-tauri/src/models.rs`.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ---------------------------------------------------------------------------
// 9-State Connection Lifecycle Model
// ---------------------------------------------------------------------------

export type ConnectionStatus =
  | { status: 'Disconnected' }
  | {
      status: 'Connecting';
      details: {
        host: string;
        port: number;
      };
    }
  | {
      status: 'HostKeyVerificationPending';
      details: {
        host: string;
        port: number;
        key_type: string;
        fingerprint_sha256: string;
        is_changed: boolean;
      };
    }
  | {
      status: 'Authenticating';
      details: {
        method: string;
      };
    }
  | {
      status: 'AuthChallengePending';
      details: {
        user: string;
        host: string;
        reason?: string;
      };
    }
  | {
      status: 'VerifyingIdentity';
      details: {
        command: string;
      };
    }
  | {
      status: 'Connected';
      details: {
        remote_host: string;
        remote_user: string;
        remote_identity: string;
        connected_at: number;
        latency_ms?: number;
      };
    }
  | { status: 'Disconnecting' }
  | {
      status: 'Error';
      details: {
        code: string;
        message: string;
        timestamp: number;
      };
    };

// ---------------------------------------------------------------------------
// Configuration & System Data Models
// ---------------------------------------------------------------------------

export interface AppConfig {
  remote_host: string;
  remote_port: number;
  remote_user: string;
  private_key_path: string;
  heartbeat_interval_secs: number;
  connection_timeout_secs: number;
  identity_check_command: string;
  save_password_to_keyring: boolean;
}

export interface LocalSystemInfo {
  hostname: string;
  username: string;
  os_name: string;
  local_ip?: string;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'ssh';

export interface SanitizedLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface HeartbeatTick {
  latency_ms: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Type-Safe IPC API Wrapper
// ---------------------------------------------------------------------------

export const ipc = {
  // Command Invocations (Frontend -> Backend)
  connect: (): Promise<void> => invoke<void>('connect'),
  disconnect: (): Promise<void> => invoke<void>('disconnect'),
  confirmHostKey: (approved: boolean, remember: boolean): Promise<void> =>
    invoke<void>('confirm_host_key', { approved, remember }),
  submitPassword: (password: string, remember: boolean): Promise<void> =>
    invoke<void>('submit_password', { password, remember }),
  cancelAuth: (): Promise<void> => invoke<void>('cancel_auth'),
  getConfig: (): Promise<AppConfig> => invoke<AppConfig>('get_config'),
  saveConfig: (config: AppConfig): Promise<void> => invoke<void>('save_config', { config }),
  getSystemInfo: (): Promise<LocalSystemInfo> => invoke<LocalSystemInfo>('get_system_info'),
  getDiagnostics: (): Promise<SanitizedLogEntry[]> => invoke<SanitizedLogEntry[]>('get_diagnostics'),
  clearCredentials: (): Promise<void> => invoke<void>('clear_credentials'),

  // Event Subscriptions (Backend -> Frontend)
  onConnectionStatusChange: (callback: (status: ConnectionStatus) => void): Promise<UnlistenFn> =>
    listen<ConnectionStatus>('connection-status-changed', (event) => callback(event.payload)),

  onLogEntry: (callback: (entry: SanitizedLogEntry) => void): Promise<UnlistenFn> =>
    listen<SanitizedLogEntry>('log-entry', (event) => callback(event.payload)),

  onHeartbeatTick: (callback: (tick: HeartbeatTick) => void): Promise<UnlistenFn> =>
    listen<HeartbeatTick>('heartbeat-tick', (event) => callback(event.payload)),
};
