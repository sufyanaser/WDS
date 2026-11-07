import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { KEYRING_SPEC } from '../harness/contracts.mjs';

describe('Tier 1: Feature 8 - OS Credential Storage (Keyring persistence)', () => {
  it('T1.8.1: Keyring service identifier is strictly com.wds.connect', () => {
    assert.strictEqual(KEYRING_SPEC.service, 'com.wds.connect', 'Keyring service identifier must be com.wds.connect');
  });

  it('T1.8.2: Saved password persists under account key ali@192.168.68.103', async () => {
    const backend = new TauriBackendSimulator();
    backend.keyringStore.set(KEYRING_SPEC.defaultAccount, 'SavedSecretPassword');

    assert.ok(backend.keyringStore.has('ali@192.168.68.103'));
    assert.strictEqual(backend.keyringStore.get('ali@192.168.68.103'), 'SavedSecretPassword');
  });

  it('T1.8.3: Subsequent connection queries keyring and automatically authenticates without prompt', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    // Pre-populate credential in keyring
    backend.keyringStore.set(KEYRING_SPEC.defaultAccount, 'SavedSecretPassword');

    await backend.connect();

    // Should automatically connect without staying in AuthChallengePending
    assert.strictEqual(backend.status.status, 'Connected');
  });

  it('T1.8.4: Settings drawer provides explicit action to purge stored credentials', async () => {
    const backend = new TauriBackendSimulator();
    backend.keyringStore.set(KEYRING_SPEC.defaultAccount, 'SavedSecretPassword');

    const result = await backend.clear_credentials();
    assert.strictEqual(result, true, 'clear_credentials IPC command must succeed');
  });

  it('T1.8.5: Purging credentials removes entry from OS Credential Manager', async () => {
    const backend = new TauriBackendSimulator();
    backend.keyringStore.set(KEYRING_SPEC.defaultAccount, 'SavedSecretPassword');

    await backend.clear_credentials();
    assert.strictEqual(backend.keyringStore.has(KEYRING_SPEC.defaultAccount), false, 'Credential must be removed from store');
  });
});
