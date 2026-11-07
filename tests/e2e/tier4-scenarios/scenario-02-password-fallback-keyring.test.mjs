import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { KEYRING_SPEC } from '../harness/contracts.mjs';

describe('Tier 4: Scenario 2 - Password Fallback & OS Keyring Persistence', () => {
  it('Executes realistic passphrase-denied fallback and keyring caching workflow', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true, // Public key requires passphrase
    });

    const states = [];
    backend.on('connection-status-changed', (st) => states.push(st.status));

    // Session 1: User connects without saved password in keyring
    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');
    assert.strictEqual(backend.status.details.user, 'ali');

    // User enters password and selects "[x] Save password in Windows Credential Manager"
    await backend.submit_password('SuperSecretPass987!', true);
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.keyringStore.get(KEYRING_SPEC.defaultAccount), 'SuperSecretPass987!');

    // User finishes session and disconnects
    await backend.disconnect();
    assert.strictEqual(backend.status.status, 'Disconnected');

    // Session 2: User connects again. This time, public key fails again, but keyring contains saved password!
    await backend.connect();

    // Must automatically connect without prompting the user for password
    assert.strictEqual(backend.status.status, 'Connected');
  });
});
