import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 2: Feature 7 - Password Fallback Dialog Boundaries', () => {
  it('T2.7.1: Empty password submission is rejected with client-side validation error', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');

    await assert.rejects(async () => {
      await backend.submit_password('   ');
    }, /Password cannot be empty/);
  });

  it('T2.7.2: Extremely long password (1024 characters) is handled safely without buffer overflow', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    await backend.connect();
    const longPassword = 'a'.repeat(1024);

    await backend.submit_password(longPassword, false);
    assert.strictEqual(backend.status.status, 'Connected');
  });

  it('T2.7.3: Passwords with UTF-8 unicode, special characters, and quotes transmit intact', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    await backend.connect();
    const complexPass = 'P@$$w0rd!#%^&*()_+~"\'\\/☕🔑🔐';

    await backend.submit_password(complexPass, true);
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.keyringStore.get('ali@192.168.68.103'), complexPass);
  });

  it('T2.7.4: Password memory buffer is zeroized after transmission', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    await backend.connect();
    await backend.submit_password('SensitivePassword123', false);

    assert.strictEqual(backend.isZeroized, true, 'Backend memory buffer must trigger zeroization via zeroize crate');
  });

  it('T2.7.5: Cancelling password dialog aborts auth and returns to Disconnected state', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');

    await backend.cancel_auth();
    assert.strictEqual(backend.status.status, 'Disconnected');
  });
});
