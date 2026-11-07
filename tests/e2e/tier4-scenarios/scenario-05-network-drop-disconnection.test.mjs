import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 4: Scenario 5 - Network Drop Simulation & Graceful Disconnection', () => {
  it('Detects network outage via 3 consecutive missed keepalives and triggers graceful failure', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected');

    const tickStatuses = [];
    backend.on('heartbeat-tick', (tick) => tickStatuses.push(tick.status));

    // Sudden network loss occurs:
    // Miss 1: warning
    backend.tickHeartbeat(true);
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.consecutiveHeartbeatMisses, 1);

    // Miss 2: degraded
    backend.tickHeartbeat(true);
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.consecutiveHeartbeatMisses, 2);

    // Miss 3: drop threshold reached!
    backend.tickHeartbeat(true);

    assert.strictEqual(backend.status.status, 'Error');
    assert.strictEqual(backend.status.details.code, 'ECONNRESET');
    assert.match(backend.status.details.message, /Heartbeat missed 3 consecutive ticks/);

    assert.deepStrictEqual(tickStatuses, ['warning', 'degraded', 'dropped']);

    // User can reset to Disconnected cleanly
    await backend.disconnect();
    assert.strictEqual(backend.status.status, 'Disconnected');
  });
});
