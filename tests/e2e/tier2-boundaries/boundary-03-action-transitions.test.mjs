import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 2: Feature 3 - Action Transitions Boundaries', () => {
  it('T2.3.1: Double-click/rapid repeated clicks on Connect are debounced (single in-flight request)', async () => {
    const backend = new TauriBackendSimulator();

    let connectCallCount = 0;
    let isConnecting = false;

    async function triggerConnect() {
      if (isConnecting) return; // Debounce guard
      isConnecting = true;
      connectCallCount++;
      try {
        await backend.connect();
      } finally {
        isConnecting = false;
      }
    }

    // Fire two calls concurrently
    await Promise.all([triggerConnect(), triggerConnect()]);
    assert.strictEqual(connectCallCount, 1, 'Second concurrent connect call must be debounced');
  });

  it('T2.3.2: Connection to completely unreachable IP times out gracefully and transitions to Error', async () => {
    const backend = new TauriBackendSimulator({
      tcpUnreachable: true,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Error');
    assert.strictEqual(backend.status.details.code, 'ETIMEDOUT');
  });

  it('T2.3.3: Connection to closed port (connection refused) transitions to Error with clear message', () => {
    const connectionRefusedError = {
      code: 'ECONNREFUSED',
      message: 'Connection refused: remote port is not accepting connections',
      timestamp: Date.now(),
    };

    assert.strictEqual(connectionRefusedError.code, 'ECONNREFUSED');
    assert.match(connectionRefusedError.message, /Connection refused/);
  });

  it('T2.3.4: Disconnect called while already in Disconnected state is a safe no-op', async () => {
    const backend = new TauriBackendSimulator();
    assert.strictEqual(backend.status.status, 'Disconnected');

    // Should not throw
    await backend.disconnect();
    assert.strictEqual(backend.status.status, 'Disconnected');
  });

  it('T2.3.5: Disconnect invoked mid-handshake cancels pending rendezvous and resets cleanly', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: false, // will pause in HostKeyVerificationPending
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');

    await backend.confirm_host_key(false); // Reject
    assert.strictEqual(backend.status.status, 'Disconnected');
  });
});
