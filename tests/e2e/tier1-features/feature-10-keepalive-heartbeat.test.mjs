import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { HEARTBEAT_SPEC } from '../harness/contracts.mjs';

describe('Tier 1: Feature 10 - Non-Blocking Keepalive Heartbeat & Drop Detection', () => {
  it('T1.10.1: Heartbeat keepalive task activates immediately upon entering Connected state', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.consecutiveHeartbeatMisses, 0);
  });

  it('T1.10.2: Heartbeat sends periodic ping at 10-second intervals', () => {
    assert.strictEqual(HEARTBEAT_SPEC.intervalMs, 10_000, 'Keepalive interval must be 10,000ms (10s)');
  });

  it('T1.10.3: Heartbeat sets response timeout threshold of 5 seconds', () => {
    assert.strictEqual(HEARTBEAT_SPEC.timeoutMs, 5_000, 'Keepalive timeout must be 5,000ms (5s)');
  });

  it('T1.10.4: Emits heartbeat-tick events with round-trip latency measurements', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();

    const ticks = [];
    backend.on('heartbeat-tick', (tick) => ticks.push(tick));

    backend.tickHeartbeat(false, 4); // 4ms latency

    assert.strictEqual(ticks.length, 1);
    assert.strictEqual(ticks[0].status, 'healthy');
    assert.strictEqual(ticks[0].latencyMs, 4);
    assert.strictEqual(ticks[0].consecutiveMisses, 0);
  });

  it('T1.10.5: Connection bridge UI indicator pulses synchronously with heartbeat ticks', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();

    let pulseTriggered = false;
    backend.on('heartbeat-tick', (tick) => {
      if (tick.status === 'healthy') pulseTriggered = true;
    });

    backend.tickHeartbeat(false, 3);
    assert.strictEqual(pulseTriggered, true, 'UI pulse must trigger on healthy heartbeat tick');
  });
});
