import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { REMOTE_IDENTITY_FIXTURES } from '../harness/fixtures.mjs';
import { verifyRemoteIdentity } from '../harness/oracle.mjs';

describe('Tier 2: Feature 9 - Remote Identity Verification Boundaries', () => {
  it('T2.9.1: Exit code 1 from remote identity command prevents Connected state and transitions to Error', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
      remoteIdentityFixture: REMOTE_IDENTITY_FIXTURES.commandFailure,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Error');
    assert.strictEqual(backend.status.details.code, 'EIDENTITY');
  });

  it('T2.9.2: Remote identity OS string returning Linux instead of Darwin is rejected', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
      remoteIdentityFixture: REMOTE_IDENTITY_FIXTURES.invalidLinux,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Error');
    assert.match(backend.status.details.message, /expected 'Darwin'/);
  });

  it('T2.9.3: Remote identity command timeout transitions to Error', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
      remoteIdentityFixture: REMOTE_IDENTITY_FIXTURES.timeoutFailure,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Error');
    assert.match(backend.status.details.message, /timed out/);
  });

  it('T2.9.4: Command output with injection payloads is sanitized and validated strictly', () => {
    const maliciousOutput = {
      exitCode: 0,
      stdout: 'Darwin 24.1.0; rm -rf /\nali; cat /etc/shadow\n',
      stderr: '',
    };

    const res = verifyRemoteIdentity(maliciousOutput, 'ali');
    assert.strictEqual(res.verified, false, 'Injection in username must be rejected');
  });

  it('T2.9.5: Truncated or empty remote command stdout is rejected safely', () => {
    const emptyResult = { exitCode: 0, stdout: '', stderr: '' };
    const res = verifyRemoteIdentity(emptyResult, 'ali');
    assert.strictEqual(res.verified, false);
    assert.match(res.reason, /Unexpected output format/);
  });
});
