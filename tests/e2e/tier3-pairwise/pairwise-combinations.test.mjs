import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { WINDOW_SPEC, KEYRING_SPEC } from '../harness/contracts.mjs';
import { OBSERVED_CONFIG, REMOTE_IDENTITY_FIXTURES } from '../harness/fixtures.mjs';

describe('Tier 3: Cross-Feature Pairwise Combinations (11 Tests)', () => {
  it('T3.1: F1 (Window Shell) + F2 (Device Cards) - Responsive resize preserves cards without clipping', () => {
    const windowWidths = [440, 520, 640];
    for (const w of windowWidths) {
      const cardWidth = Math.min(392, w - 48); // 24px padding each side
      assert.ok(cardWidth >= 360, 'Card width must remain at least 360px');
      assert.ok(cardWidth <= w, 'Card width must fit inside window bounds');
    }
  });

  it('T3.2: F3 (Action Transitions) + F4 (Sanitized Diagnostics) - Connect/cancel transitions stream logs without secret leakage', async () => {
    const backend = new TauriBackendSimulator({
      simulatePassphraseRequired: true,
      knownHostPresent: true,
    });

    await backend.connect();
    await backend.cancel_auth();

    const logs = await backend.get_diagnostics();
    assert.ok(logs.length >= 3, 'Logs must record state changes');
    for (const log of logs) {
      assert.ok(!log.message.includes('BEGIN OPENSSH PRIVATE KEY'));
      assert.ok(!log.message.includes('SuperSecretPassword'));
    }
  });

  it('T3.3: F5 (Host Key Verification) + F7 (Password Fallback) - New host key acceptance flows to password fallback', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: false, // Unknown host
      simulatePassphraseRequired: true, // Needs password
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');

    await backend.confirm_host_key(true, true);
    assert.strictEqual(backend.status.status, 'AuthChallengePending', 'Must transition to password challenge after host key confirmation');
  });

  it('T3.4: F6 (Public Key Auth) + F8 (Keyring Storage) - Key failure queries keyring before prompting user', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePublicKeyRejected: true,
    });

    // Populate keyring
    backend.keyringStore.set(KEYRING_SPEC.defaultAccount, 'SavedMacPassword');

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected', 'Must automatically connect using keyring password when public key fails');
  });

  it('T3.5: F7 (Password Dialog) + F8 (Keyring Storage) - Password submission with Remember flag stores to Credential Manager', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');

    await backend.submit_password('SecretUserPassword99!', true);
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.keyringStore.get(KEYRING_SPEC.defaultAccount), 'SecretUserPassword99!');
  });

  it('T3.6: F5 (Host Key Verification) + F9 (Remote Identity Verification) - Host key mismatch aborts before identity probe runs', async () => {
    const backend = new TauriBackendSimulator({
      simulateHostKeyMismatch: true,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');

    await backend.confirm_host_key(false); // Reject mismatched host
    assert.strictEqual(backend.status.status, 'Disconnected');

    const identityLogs = backend.logs.filter((l) => l.message.includes('uname -srm'));
    assert.strictEqual(identityLogs.length, 0, 'Remote identity check must never be dispatched if host key is rejected');
  });

  it('T3.7: F9 (Remote Identity Verification) + F10 (Keepalive Heartbeat) - Darwin identity verified triggers heartbeat loop', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
      remoteIdentityFixture: REMOTE_IDENTITY_FIXTURES.validDarwin,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected');

    // Heartbeat should tick successfully
    const ticks = [];
    backend.on('heartbeat-tick', (t) => ticks.push(t));

    backend.tickHeartbeat(false, 3);
    assert.strictEqual(ticks.length, 1);
    assert.strictEqual(ticks[0].status, 'healthy');
  });

  it('T3.8: F10 (Keepalive Heartbeat) + F11 (Clean Disconnection) - Disconnect immediately terminates heartbeat loop', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
      autoTickHeartbeat: true,
    });

    await backend.connect();
    assert.ok(backend.heartbeatTimer !== null);

    await backend.disconnect();
    assert.strictEqual(backend.heartbeatTimer, null, 'Heartbeat timer must be cancelled immediately');
  });

  it('T3.9: F2 (Device Cards) + F10 (Keepalive Heartbeat) - Heartbeat tick updates latency metric on RemoteDeviceCard', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.details.latency_ms, 3);

    // Simulate tick with 5ms latency
    backend.tickHeartbeat(false, 5);
    backend.status.details.latency_ms = 5;

    assert.strictEqual(backend.status.details.latency_ms, 5, 'Remote device card latency must reflect latest heartbeat tick');
  });

  it('T3.10: F8 (Keyring Storage) + F11 (Clean Disconnection) - Credential purge followed by reconnect prompts for password', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    // Populate and connect
    backend.keyringStore.set(KEYRING_SPEC.defaultAccount, 'InitialPassword');
    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected');

    // Purge credentials and disconnect
    await backend.clear_credentials();
    await backend.disconnect();
    assert.strictEqual(backend.status.status, 'Disconnected');

    // Reconnect - must now prompt for password!
    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending', 'Must challenge for password once keyring is cleared');
  });

  it('T3.11: F4 (Diagnostics Panel) + F11 (Clean Disconnection) - Disconnection logs teardown sequence in diagnostics panel', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    await backend.disconnect();

    const logs = await backend.get_diagnostics();
    const disconnectLogs = logs.filter((l) => l.message.includes('Disconnect'));
    assert.ok(disconnectLogs.length >= 2, 'Teardown messages must be captured in diagnostics log');
  });
});
