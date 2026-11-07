import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 1: Feature 11 - Clean Disconnection & Reset', () => {
  it('T1.11.1: Clicking Disconnect invokes disconnect IPC command', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected');

    await backend.disconnect();
    assert.strictEqual(backend.status.status, 'Disconnected');
  });

  it('T1.11.2: Disconnect sends SSH disconnect packet to remote host', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    await backend.disconnect();

    const disconnectLog = backend.logs.find((l) => l.message.includes('Sending SSH disconnect packet'));
    assert.ok(disconnectLog, 'Teardown must log sending disconnect packet');
  });

  it('T1.11.3: Active background heartbeat task is cancelled immediately', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
      autoTickHeartbeat: true,
    });

    await backend.connect();
    assert.ok(backend.heartbeatTimer !== null, 'Heartbeat timer must be active while connected');

    await backend.disconnect();
    assert.strictEqual(backend.heartbeatTimer, null, 'Heartbeat timer must be null after disconnect');
  });

  it('T1.11.4: TCP socket and transport channels are closed', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    await backend.disconnect();

    const cleanLog = backend.logs.find((l) => l.message.includes('Disconnected cleanly'));
    assert.ok(cleanLog, 'Socket closure must be logged upon clean disconnect');
  });

  it('T1.11.5: UI state resets cleanly to Disconnected with Connect button restored', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    await backend.disconnect();

    assert.strictEqual(backend.status.status, 'Disconnected');
  });
});
