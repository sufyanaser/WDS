import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { REMOTE_IDENTITY_FIXTURES } from '../harness/fixtures.mjs';
import { verifyRemoteIdentity } from '../harness/oracle.mjs';

describe('Tier 1: Feature 9 - Remote Identity Verification (Exit code 0 & Darwin)', () => {
  it('T1.9.1: Executes harmless identity command "uname -srm; id -un; sw_vers" after auth', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    const verificationCommands = [];
    backend.on('connection-status-changed', (st) => {
      if (st.status === 'VerifyingIdentity') verificationCommands.push(st.details?.command);
    });

    await backend.connect();
    assert.strictEqual(verificationCommands[0], 'uname -srm; id -un; sw_vers');
  });

  it('T1.9.2: Requires exit code 0 for identity verification', () => {
    const valid = verifyRemoteIdentity(REMOTE_IDENTITY_FIXTURES.validDarwin, 'ali');
    assert.strictEqual(valid.verified, true);

    const invalidCode = verifyRemoteIdentity(REMOTE_IDENTITY_FIXTURES.commandFailure, 'ali');
    assert.strictEqual(invalidCode.verified, false);
    assert.match(invalidCode.reason, /non-zero exit code/);
  });

  it('T1.9.3: Confirms remote operating system contains Darwin', () => {
    const valid = verifyRemoteIdentity(REMOTE_IDENTITY_FIXTURES.validDarwin, 'ali');
    assert.strictEqual(valid.verified, true);
    assert.match(valid.details.os, /^Darwin/);

    const invalidOs = verifyRemoteIdentity(REMOTE_IDENTITY_FIXTURES.invalidLinux, 'ali');
    assert.strictEqual(invalidOs.verified, false);
    assert.match(invalidOs.reason, /identity mismatch: expected 'Darwin'/);
  });

  it('T1.9.4: Confirms remote username matches configured target (ali)', () => {
    const valid = verifyRemoteIdentity(REMOTE_IDENTITY_FIXTURES.validDarwin, 'ali');
    assert.strictEqual(valid.details.user, 'ali');

    const wrongUser = verifyRemoteIdentity(REMOTE_IDENTITY_FIXTURES.invalidUser, 'ali');
    assert.strictEqual(wrongUser.verified, false);
    assert.match(wrongUser.reason, /user identity mismatch: expected 'ali'/);
  });

  it('T1.9.5: Switches state to Connected ONLY after exit code 0 and Darwin identity checks succeed', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
      remoteIdentityFixture: REMOTE_IDENTITY_FIXTURES.validDarwin,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.status.details.remote_user, 'ali');
    assert.match(backend.status.details.remote_identity, /Darwin/);
  });
});
