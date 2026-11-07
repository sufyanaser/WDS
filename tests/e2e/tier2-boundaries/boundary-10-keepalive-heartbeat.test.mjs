import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { evaluateHeartbeatHealth } from '../harness/oracle.mjs';

describe('Tier 2: Feature 10 - Keepalive Heartbeat Boundaries', () => {
  it('T2.10.1: 1 missed heartbeat sets status to warning without dropping connection', () => {
    const health = evaluateHeartbeatHealth(1);
    assert.strictEqual(health.status, 'warning');
    assert.strictEqual(health.shouldDrop, false);
  });

  it('T2.10.2: 2 consecutive missed heartbeats set status to degraded without dropping connection', () => {
    const health = evaluateHeartbeatHealth(2);
    assert.strictEqual(health.status, 'degraded');
    assert.strictEqual(health.shouldDrop, false);
  });

  it('T2.10.3: 3 consecutive missed heartbeats trigger automatic connection drop and transition to Error', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected');

    // Simulate 3 consecutive misses
    backend.tickHeartbeat(true); // miss 1
    assert.strictEqual(backend.status.status, 'Connected');
    backend.tickHeartbeat(true); // miss 2
    assert.strictEqual(backend.status.status, 'Connected');
    backend.tickHeartbeat(true); // miss 3 (threshold reached!)

    assert.strictEqual(backend.status.status, 'Error');
    assert.strictEqual(backend.status.details.code, 'ECONNRESET');
    assert.match(backend.status.details.message, /Heartbeat missed 3 consecutive ticks/);
  });

  it('T2.10.4: Successful heartbeat tick resets consecutive miss count to 0', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    backend.tickHeartbeat(true); // miss 1
    backend.tickHeartbeat(true); // miss 2
    assert.strictEqual(backend.consecutiveHeartbeatMisses, 2);

    backend.tickHeartbeat(false, 3); // success!
    assert.strictEqual(backend.consecutiveHeartbeatMisses, 0, 'Consecutive misses must reset to 0 upon healthy tick');
    assert.strictEqual(backend.status.status, 'Connected');
  });

  it('T2.10.5: High latency response under 5s timeout is accepted as healthy', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();

    const ticks = [];
    backend.on('heartbeat-tick', (t) => ticks.push(t));

    backend.tickHeartbeat(false, 4800); // 4800ms < 5000ms timeout
    assert.strictEqual(ticks[0].status, 'healthy');
    assert.strictEqual(ticks[0].latencyMs, 4800);
    assert.strictEqual(backend.status.status, 'Connected');
  });
});
