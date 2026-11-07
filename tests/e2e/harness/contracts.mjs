/**
 * Contracts & Specification Constants
 * Derived strictly from ORIGINAL_REQUEST.md and PROJECT.md
 */

export const WINDOW_SPEC = Object.freeze({
  defaultWidth: 440,
  defaultHeight: 580,
  minWidth: 440,
  minHeight: 560,
  maxWidth: 640,
  maxHeight: 860,
  resizable: true,
  theme: 'Dark',
  decorations: true,
  subsystemDeclaration: '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]',
  title: 'WDS Connect',
  identifier: 'com.wds.connect',
});

export const CONNECTION_STATES = Object.freeze([
  'Disconnected',
  'Connecting',
  'HostKeyVerificationPending',
  'Authenticating',
  'AuthChallengePending',
  'VerifyingIdentity',
  'Connected',
  'Disconnecting',
  'Error',
]);

export const VALID_TRANSITIONS = Object.freeze({
  Disconnected: ['Connecting'],
  Connecting: ['HostKeyVerificationPending', 'Authenticating', 'Error', 'Disconnected'],
  HostKeyVerificationPending: ['Authenticating', 'Disconnected', 'Error'],
  Authenticating: ['AuthChallengePending', 'VerifyingIdentity', 'Error', 'Disconnected'],
  AuthChallengePending: ['Authenticating', 'Disconnected', 'Error'],
  VerifyingIdentity: ['Connected', 'Error', 'Disconnected'],
  Connected: ['Disconnecting', 'Error'],
  Disconnecting: ['Disconnected', 'Error'],
  Error: ['Disconnected', 'Connecting'],
});

export const IPC_COMMANDS = Object.freeze([
  'connect',
  'disconnect',
  'confirm_host_key',
  'submit_password',
  'cancel_auth',
  'get_config',
  'save_config',
  'get_system_info',
  'get_diagnostics',
  'clear_credentials',
]);

export const IPC_EVENTS = Object.freeze([
  'connection-status-changed',
  'log-entry',
  'heartbeat-tick',
]);

export const KEYRING_SPEC = Object.freeze({
  service: 'com.wds.connect',
  defaultAccount: 'ali@192.168.68.103',
});

export const HEARTBEAT_SPEC = Object.freeze({
  intervalMs: 10_000,
  timeoutMs: 5_000,
  missedThresholdBeforeDrop: 3,
});

export const REDACTION_LABELS = Object.freeze({
  privateKey: '[REDACTED_PRIVATE_KEY]',
  password: '[REDACTED_PASSWORD]',
  token: '[REDACTED_TOKEN]',
});
