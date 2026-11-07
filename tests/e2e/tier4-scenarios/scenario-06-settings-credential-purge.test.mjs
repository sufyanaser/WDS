import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { KEYRING_SPEC } from '../harness/contracts.mjs';

describe('Tier 4: Scenario 6 - Settings Modification, Credential Purge & Reconnect', () => {
  it('Executes settings drawer configuration, credential purge from Credential Manager, and prompt on reconnect', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    // Step 1: User saves password during previous session
    backend.keyringStore.set(KEYRING_SPEC.defaultAccount, 'MyOldSavedPass123!');
    assert.strictEqual(backend.keyringStore.size, 1);

    // Step 2: User opens Settings modal and inspects config
    const currentConfig = await backend.get_config();
    assert.strictEqual(currentConfig.remoteUser, 'ali');
    assert.strictEqual(currentConfig.remoteHost, '192.168.68.103');

    // Step 3: User changes heartbeat interval in settings
    await backend.save_config({ heartbeatIntervalSec: 15 });
    const updatedConfig = await backend.get_config();
    assert.strictEqual(updatedConfig.heartbeatIntervalSec, 15);

    // Step 4: User clicks "Purge Saved Credentials" in settings
    await backend.clear_credentials();
    assert.strictEqual(backend.keyringStore.has(KEYRING_SPEC.defaultAccount), false);

    // Step 5: User clicks Connect. Because keyring was purged, system must prompt for password
    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');

    // Step 6: User enters new credentials and connects successfully
    await backend.submit_password('NewlyUpdatedPassword!', true);
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.keyringStore.get(KEYRING_SPEC.defaultAccount), 'NewlyUpdatedPassword!');
  });
});
