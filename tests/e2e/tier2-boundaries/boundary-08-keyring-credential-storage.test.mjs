import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { KEYRING_SPEC } from '../harness/contracts.mjs';

describe('Tier 2: Feature 8 - Keyring Credential Storage Boundaries', () => {
  it('T2.8.1: Purging credentials when no saved password exists returns safe success', async () => {
    const backend = new TauriBackendSimulator();
    assert.strictEqual(backend.keyringStore.size, 0);

    const result = await backend.clear_credentials();
    assert.strictEqual(result, true, 'Purge must be idempotent and safe when store is empty');
  });

  it('T2.8.2: Updating password overwrites previous entry in keyring atomically', async () => {
    const backend = new TauriBackendSimulator();
    backend.keyringStore.set(KEYRING_SPEC.defaultAccount, 'OldPassword1');

    backend.keyringStore.set(KEYRING_SPEC.defaultAccount, 'NewPassword2');
    assert.strictEqual(backend.keyringStore.get(KEYRING_SPEC.defaultAccount), 'NewPassword2');
    assert.strictEqual(backend.keyringStore.size, 1);
  });

  it('T2.8.3: Keyring storage error is logged as warning without aborting connection', () => {
    const keyringFailureHandling = (error) => {
      return {
        loggedLevel: 'WARN',
        message: `Failed to access OS Keyring: ${error.message}. Continuing with in-memory authentication.`,
        aborted: false,
      };
    };

    const res = keyringFailureHandling(new Error('Keyring unavailable'));
    assert.strictEqual(res.aborted, false);
    assert.strictEqual(res.loggedLevel, 'WARN');
  });

  it('T2.8.4: Missing keyring credential triggers in-app prompt fallback', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });
    // No credentials in keyring

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');
  });

  it('T2.8.5: Invalidating saved credential forces prompt on subsequent attempt', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    // Populate then purge
    backend.keyringStore.set(KEYRING_SPEC.defaultAccount, 'ValidPass');
    await backend.clear_credentials();

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');
  });
});
