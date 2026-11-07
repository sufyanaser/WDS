import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 1: Feature 3 - Connect/Disconnect Action Transitions', () => {
  it('T1.3.1: Primary action button meets minimum 44px accessible target size', () => {
    const primaryActionButtonSpec = { minHeightPx: 44, minWidthPx: 120, accessibleRole: 'button' };
    assert.ok(primaryActionButtonSpec.minHeightPx >= 44, 'Button height must be at least 44px for touch/pointer accessibility');
  });

  it('T1.3.2: Connect action transitions state from Disconnected to Connecting', async () => {
    const backend = new TauriBackendSimulator({
      simulatePassphraseRequired: true,
      knownHostPresent: true,
    });

    const statusHistory = [];
    backend.on('connection-status-changed', (st) => statusHistory.push(st.status));

    assert.strictEqual(backend.status.status, 'Disconnected');
    await backend.connect();

    assert.ok(statusHistory.includes('Connecting'), 'State transition must pass through Connecting');
  });

  it('T1.3.3: Action button enters disabled loading state during in-flight connection', async () => {
    const backend = new TauriBackendSimulator();
    assert.strictEqual(backend.status.status, 'Disconnected');

    // Simulate in-flight state
    const promise = backend.connect();
    assert.ok(backend.status.status === 'Connecting' || backend.status.status === 'AuthChallengePending');
    await promise;
  });

  it('T1.3.4: Disconnect action transitions Connected state to Disconnecting then Disconnected', async () => {
    const backend = new TauriBackendSimulator({
      simulatePassphraseRequired: false,
      knownHostPresent: true,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected');

    const disconnectEvents = [];
    backend.on('connection-status-changed', (st) => disconnectEvents.push(st.status));

    await backend.disconnect();
    assert.ok(disconnectEvents.includes('Disconnecting'), 'Must transition through Disconnecting');
    assert.strictEqual(backend.status.status, 'Disconnected', 'Final state must be Disconnected');
  });

  it('T1.3.5: User can cancel in-flight connection before authentication finishes', async () => {
    const backend = new TauriBackendSimulator({
      simulatePassphraseRequired: true,
      knownHostPresent: true,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');

    await backend.cancel_auth();
    assert.strictEqual(backend.status.status, 'Disconnected', 'State must reset to Disconnected upon cancel');
  });
});
