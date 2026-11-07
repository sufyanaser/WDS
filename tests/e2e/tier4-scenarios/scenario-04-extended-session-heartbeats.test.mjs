import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 4: Scenario 4 - Extended Session Surviving Continuous Heartbeats', () => {
  it('Maintains healthy connected state across a series of 10 heartbeat intervals', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected');

    const receivedTicks = [];
    backend.on('heartbeat-tick', (tick) => receivedTicks.push(tick));

    // Simulate 10 successful heartbeat cycles (representing 100 seconds of real-time monitoring)
    const simulatedLatencies = [2, 3, 2, 4, 3, 3, 2, 5, 3, 2];
    for (const latency of simulatedLatencies) {
      backend.tickHeartbeat(false, latency);
    }

    assert.strictEqual(receivedTicks.length, 10);
    assert.strictEqual(receivedTicks.every((t) => t.status === 'healthy'), true);
    assert.strictEqual(backend.status.status, 'Connected', 'Session must remain Connected throughout heartbeat stream');
    assert.strictEqual(backend.consecutiveHeartbeatMisses, 0);

    // Clean disconnect at end of session
    await backend.disconnect();
    assert.strictEqual(backend.status.status, 'Disconnected');
  });
});
