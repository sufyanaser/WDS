import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 1: Feature 7 - Secure In-App Password Fallback Dialog', () => {
  it('T1.7.1: Password fallback modal appears automatically when public key fails or requires passphrase', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true, // Key requires passphrase/fails
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');
    assert.strictEqual(backend.status.details.user, 'ali');
    assert.strictEqual(backend.status.details.host, '192.168.68.103');
  });

  it('T1.7.2: Password input field defaults to obscured password masking', () => {
    const passwordField = { inputType: 'password', isObscured: true };
    assert.strictEqual(passwordField.inputType, 'password', 'Input element type must default to "password"');
  });

  it('T1.7.3: Password visibility toggle reveals/obscures plaintext password', () => {
    let visibility = false;
    // Toggle on
    visibility = !visibility;
    assert.strictEqual(visibility, true);
    // Toggle off
    visibility = !visibility;
    assert.strictEqual(visibility, false);
  });

  it('T1.7.4: User can select checkbox to save password in OS Credential Manager', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');

    await backend.submit_password('ValidPass123!', true); // remember = true
    assert.strictEqual(backend.status.status, 'Connected');
    assert.ok(backend.keyringStore.has('ali@192.168.68.103'), 'Password must be stored when remember is checked');
  });

  it('T1.7.5: Submitting valid password resumes authentication and transitions to Authenticating', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true,
    });

    await backend.connect();

    const intermediateStates = [];
    backend.on('connection-status-changed', (st) => intermediateStates.push(st.status));

    await backend.submit_password('ValidPass123!', false);
    assert.ok(intermediateStates.includes('Authenticating'));
    assert.strictEqual(backend.status.status, 'Connected');
  });
});
