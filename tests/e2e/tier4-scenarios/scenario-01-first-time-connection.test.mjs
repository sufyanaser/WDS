import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { OBSERVED_CONFIG, REMOTE_IDENTITY_FIXTURES } from '../harness/fixtures.mjs';

describe('Tier 4: Scenario 1 - First-Time Connection with Unknown Host Key & Public Key Auth', () => {
  it('Executes realistic first-time setup workflow', async () => {
    // Host key not yet in known_hosts
    const backend = new TauriBackendSimulator({
      knownHostPresent: false,
      simulatePassphraseRequired: false,
      remoteIdentityFixture: REMOTE_IDENTITY_FIXTURES.validDarwin,
    });

    const lifecycleAudit = [];
    backend.on('connection-status-changed', (st) => lifecycleAudit.push(st.status));

    // Step 1: User launches application and clicks Connect
    assert.strictEqual(backend.status.status, 'Disconnected');
    await backend.connect();

    // Step 2: Verification modal appears with host key challenge
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');
    assert.strictEqual(backend.status.details.fingerprint_sha256, OBSERVED_CONFIG.ssh.fingerprintSha256);
    assert.strictEqual(backend.status.details.is_changed, false);

    // Step 3: User verifies fingerprint and accepts with Remember enabled
    await backend.confirm_host_key(true, true);

    // Step 4: System performs public-key auth, remote identity verification, and enters Connected state
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.status.details.remote_user, 'ali');
    assert.match(backend.status.details.remote_identity, /Darwin/);

    // Step 5: Check that known_hosts recorded the key for future zero-prompt connections
    assert.ok(backend.knownHosts.has(OBSERVED_CONFIG.ssh.fingerprintSha256));

    // Step 6: Verify full lifecycle path passed through expected states
    assert.deepStrictEqual(lifecycleAudit, [
      'Connecting',
      'HostKeyVerificationPending',
      'Authenticating',
      'VerifyingIdentity',
      'Connected',
    ]);
  });
});
