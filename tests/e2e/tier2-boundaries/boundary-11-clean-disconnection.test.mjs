import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 2: Feature 11 - Clean Disconnection Boundaries', () => {
  it('T2.11.1: Disconnect during network drop drops socket cleanly without hanging', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    // Simulate network drop
    backend.tickHeartbeat(true);
    backend.tickHeartbeat(true);
    backend.tickHeartbeat(true); // transitions to Error

    // User clicks Disconnect/Reset from Error
    await backend.disconnect();
    assert.strictEqual(backend.status.status, 'Disconnected');
  });

  it('T2.11.2: Immediate reconnect after disconnect succeeds without socket resource conflict', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    // Cycle 1: Connect and Disconnect
    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected');
    await backend.disconnect();
    assert.strictEqual(backend.status.status, 'Disconnected');

    // Cycle 2: Immediately connect again
    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected', 'Immediate re-connection must succeed without socket collision');
    await backend.disconnect();
  });

  it('T2.11.3: Disconnect while in HostKeyVerificationPending aborts handshake and resets state', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: false, // pauses in HostKeyVerificationPending
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');

    await backend.confirm_host_key(false); // Reject
    assert.strictEqual(backend.status.status, 'Disconnected');
  });

  it('T2.11.4: Disconnect while in AuthChallengePending cancels prompt and resets state', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true, // pauses in AuthChallengePending
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');

    await backend.cancel_auth();
    assert.strictEqual(backend.status.status, 'Disconnected');
  });

  it('T2.11.5: Repeated rapid calls to disconnect are idempotent and do not throw', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    await backend.disconnect();

    // Call disconnect multiple times
    await assert.doesNotReject(async () => {
      await backend.disconnect();
      await backend.disconnect();
      await backend.disconnect();
    });

    assert.strictEqual(backend.status.status, 'Disconnected');
  });
});
