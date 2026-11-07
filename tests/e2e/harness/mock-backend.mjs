/**
 * Opaque-Box Tauri Backend Simulator & IPC Contract Test Double
 * Implements the full IPC surface and 9-state connection lifecycle as specified in PROJECT.md.
 */

import { EventEmitter } from 'node:events';
import { KEYRING_SPEC, HEARTBEAT_SPEC } from './contracts.mjs';
import { sanitizeLog, verifyRemoteIdentity, isValidTransition, evaluateHeartbeatHealth } from './oracle.mjs';
import { OBSERVED_CONFIG, REMOTE_IDENTITY_FIXTURES } from './fixtures.mjs';

export class TauriBackendSimulator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      simulatePassphraseRequired: true,
      knownHostPresent: true,
      remoteIdentityFixture: REMOTE_IDENTITY_FIXTURES.validDarwin,
      autoTickHeartbeat: false,
      ...options,
    };

    this.status = { status: 'Disconnected' };
    this.logs = [];
    this.keyringStore = new Map(); // Stores credentials for service: 'com.wds.connect'
    this.knownHosts = new Set();
    this.heartbeatTimer = null;
    this.consecutiveHeartbeatMisses = 0;
    this.isZeroized = false;

    // Initialize with observed known_hosts if configured
    if (this.options.knownHostPresent) {
      this.knownHosts.add(OBSERVED_CONFIG.ssh.fingerprintSha256);
    }

    this.config = {
      localHost: OBSERVED_CONFIG.local.hostname,
      remoteHost: OBSERVED_CONFIG.remote.host,
      remotePort: OBSERVED_CONFIG.remote.port,
      remoteUser: OBSERVED_CONFIG.remote.username,
      privateKeyPath: OBSERVED_CONFIG.ssh.privateKeyPath,
      heartbeatIntervalSec: 10,
    };
  }

  // --- Internal State Management ---

  _transitionTo(newStatus) {
    const fromState = typeof this.status === 'string' ? this.status : this.status.status;
    const toState = typeof newStatus === 'string' ? newStatus : newStatus.status;

    if (fromState !== toState && !isValidTransition(fromState, toState)) {
      throw new Error(`Illegal state transition attempted from '${fromState}' to '${toState}'`);
    }

    this.status = typeof newStatus === 'string' ? { status: newStatus } : newStatus;
    this.emit('connection-status-changed', this.status);
    this._log('INFO', `State transition: ${fromState} -> ${toState}`);
  }

  _log(level, message) {
    const sanitizedMessage = sanitizeLog(message);
    const entry = {
      timestamp: Date.now(),
      level,
      message: sanitizedMessage,
    };
    this.logs.push(entry);
    this.emit('log-entry', entry);
  }

  // --- Tauri IPC Commands ---

  async connect() {
    if (this.status.status !== 'Disconnected' && this.status.status !== 'Error') {
      throw new Error(`Cannot connect while in state: ${this.status.status}`);
    }

    this._transitionTo({
      status: 'Connecting',
      details: { host: this.config.remoteHost, port: this.config.remotePort },
    });
    this._log('INFO', `Initiating TCP connection to ${this.config.remoteHost}:${this.config.remotePort}`);

    // Simulate TCP handshake
    if (this.options.tcpUnreachable) {
      this._transitionTo({
        status: 'Error',
        details: { code: 'ETIMEDOUT', message: 'Connection timed out', timestamp: Date.now() },
      });
      return;
    }

    // Step 1: Host Key Verification
    const presentedSha256 = this.options.presentedHostKeySha256 || OBSERVED_CONFIG.ssh.fingerprintSha256;
    const isRecorded = this.knownHosts.has(presentedSha256);

    if (this.options.simulateHostKeyMismatch) {
      this._transitionTo({
        status: 'HostKeyVerificationPending',
        details: {
          host: this.config.remoteHost,
          port: this.config.remotePort,
          key_type: 'ssh-ed25519',
          fingerprint_sha256: presentedSha256,
          is_changed: true,
        },
      });
      return;
    }

    if (!isRecorded) {
      this._transitionTo({
        status: 'HostKeyVerificationPending',
        details: {
          host: this.config.remoteHost,
          port: this.config.remotePort,
          key_type: 'ssh-ed25519',
          fingerprint_sha256: presentedSha256,
          is_changed: false,
        },
      });
      return;
    }

    // Host key already verified, proceed to auth
    await this._proceedToAuth();
  }

  async confirm_host_key(approved, remember = false) {
    if (this.status.status !== 'HostKeyVerificationPending') {
      throw new Error(`confirm_host_key called while not in HostKeyVerificationPending (current: ${this.status.status})`);
    }

    if (!approved) {
      this._log('WARN', 'Host key rejected by user. Aborting connection.');
      this._transitionTo('Disconnected');
      return;
    }

    if (remember) {
      const presented = this.status.details?.fingerprint_sha256 || OBSERVED_CONFIG.ssh.fingerprintSha256;
      this.knownHosts.add(presented);
      this._log('INFO', `Added host key fingerprint ${presented} to known_hosts`);
    }

    await this._proceedToAuth();
  }

  async _proceedToAuth() {
    this._transitionTo({
      status: 'Authenticating',
      details: { method: 'publickey' },
    });
    this._log('INFO', `Attempting public-key authentication via ${this.config.privateKeyPath}`);

    // If key auth is configured to fail (e.g. passphrase encrypted or rejected)
    if (this.options.simulatePassphraseRequired || this.options.simulatePublicKeyRejected) {
      // Check OS Keyring first
      const savedPassword = this.keyringStore.get(KEYRING_SPEC.defaultAccount);
      if (savedPassword) {
        this._log('INFO', 'Found saved credentials in OS Keyring. Attempting password authentication.');
        await this._authenticateWithPassword(savedPassword);
        return;
      }

      this._transitionTo({
        status: 'AuthChallengePending',
        details: {
          user: this.config.remoteUser,
          host: this.config.remoteHost,
          reason: 'Public key denied or passphrase required. Password fallback requested.',
        },
      });
      return;
    }

    // Public key succeeded directly
    await this._proceedToRemoteIdentityCheck();
  }

  async submit_password(password, remember = false) {
    if (this.status.status !== 'AuthChallengePending') {
      throw new Error(`submit_password called while not in AuthChallengePending (current: ${this.status.status})`);
    }

    if (!password || password.trim().length === 0) {
      throw new Error('Password cannot be empty');
    }

    if (remember) {
      this.keyringStore.set(KEYRING_SPEC.defaultAccount, password);
      this._log('INFO', `Password saved securely to OS Keyring under ${KEYRING_SPEC.defaultAccount}`);
    }

    // Zeroize memory buffer simulation
    this.isZeroized = true;

    await this._authenticateWithPassword(password);
  }

  async cancel_auth() {
    if (this.status.status !== 'AuthChallengePending' && this.status.status !== 'HostKeyVerificationPending') {
      throw new Error(`cancel_auth called while not in pending auth state (current: ${this.status.status})`);
    }

    this._log('INFO', 'Authentication cancelled by user.');
    this._transitionTo('Disconnected');
  }

  async _authenticateWithPassword(password) {
    this._transitionTo({
      status: 'Authenticating',
      details: { method: 'password' },
    });

    if (this.options.simulateInvalidPassword) {
      this._log('ERROR', 'Password authentication failed: Permission denied');
      this._transitionTo({
        status: 'Error',
        details: { code: 'EAUTH', message: 'Authentication failed: Invalid password', timestamp: Date.now() },
      });
      return;
    }

    await this._proceedToRemoteIdentityCheck();
  }

  async _proceedToRemoteIdentityCheck() {
    this._transitionTo({
      status: 'VerifyingIdentity',
      details: { command: 'uname -srm; id -un; sw_vers' },
    });
    this._log('INFO', 'Executing harmless remote identity verification: uname -srm; id -un; sw_vers');

    const fixture = this.options.remoteIdentityFixture || REMOTE_IDENTITY_FIXTURES.validDarwin;
    const verification = verifyRemoteIdentity(fixture, this.config.remoteUser);

    if (!verification.verified) {
      this._log('ERROR', `Remote identity verification failed: ${verification.reason}`);
      this._transitionTo({
        status: 'Error',
        details: {
          code: 'EIDENTITY',
          message: verification.reason,
          timestamp: Date.now(),
        },
      });
      return;
    }

    // Succeeded! Transition to Connected
    this._transitionTo({
      status: 'Connected',
      details: {
        remote_host: this.config.remoteHost,
        remote_user: this.config.remoteUser,
        remote_identity: verification.details?.os || 'Darwin',
        connected_at: Date.now(),
        latency_ms: 3,
      },
    });
    this._log('INFO', `Successfully connected to ${this.config.remoteUser}@${this.config.remoteHost}`);

    // Start keepalive heartbeat
    this._startHeartbeat();
  }

  _startHeartbeat() {
    this.consecutiveHeartbeatMisses = 0;
    if (this.options.autoTickHeartbeat) {
      this.heartbeatTimer = setInterval(() => {
        this.tickHeartbeat();
      }, 50); // fast simulation
    }
  }

  tickHeartbeat(isMissed = false, latencyMs = 3) {
    if (this.status.status !== 'Connected') return;

    if (isMissed) {
      this.consecutiveHeartbeatMisses++;
    } else {
      this.consecutiveHeartbeatMisses = 0;
    }

    const health = evaluateHeartbeatHealth(this.consecutiveHeartbeatMisses);

    const tickPayload = {
      timestamp: Date.now(),
      latencyMs: isMissed ? null : latencyMs,
      consecutiveMisses: this.consecutiveHeartbeatMisses,
      status: health.status,
    };

    this.emit('heartbeat-tick', tickPayload);

    if (health.shouldDrop) {
      this._log('ERROR', `Connection dropped: ${health.reason}`);
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this._transitionTo({
        status: 'Error',
        details: {
          code: 'ECONNRESET',
          message: health.reason,
          timestamp: Date.now(),
        },
      });
    }
  }

  async disconnect() {
    if (this.status.status === 'Disconnected') {
      return; // Safe no-op
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.status.status === 'Error') {
      this._transitionTo('Disconnected');
      this._log('INFO', 'Reset from Error to Disconnected.');
      return;
    }

    this._transitionTo('Disconnecting');
    this._log('INFO', 'Sending SSH disconnect packet and closing transport.');

    // Teardown
    this._transitionTo('Disconnected');
    this._log('INFO', 'Disconnected cleanly.');
  }

  async clear_credentials() {
    this.keyringStore.delete(KEYRING_SPEC.defaultAccount);
    this._log('INFO', `Purged stored credentials for ${KEYRING_SPEC.defaultAccount} from OS Keyring`);
    return true;
  }

  async get_config() {
    return { ...this.config };
  }

  async save_config(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this._log('INFO', 'Configuration updated.');
    return true;
  }

  async get_system_info() {
    return {
      localHost: OBSERVED_CONFIG.local.hostname,
      localUser: OBSERVED_CONFIG.local.username,
      localPlatform: OBSERVED_CONFIG.local.platform,
      localIp: OBSERVED_CONFIG.local.ip,
    };
  }

  async get_diagnostics() {
    return [...this.logs];
  }
}
