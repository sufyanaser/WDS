import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 4: Scenario 3 - Host Key Mismatch (MITM) Detection & User Rejection', () => {
  it('Detects altered host key, presents critical security warning, and cleanly rejects connection', async () => {
    const backend = new TauriBackendSimulator({
      simulateHostKeyMismatch: true,
      presentedHostKeySha256: 'AttackerForgedKeyFingerprintFakeBase64Hash1=',
    });

    // Step 1: User attempts to connect
    await backend.connect();

    // Step 2: System catches mismatch between known_hosts and incoming key
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');
    assert.strictEqual(backend.status.details.is_changed, true, 'Must flag that host key has changed from recorded known_hosts key');
    assert.strictEqual(backend.status.details.fingerprint_sha256, 'AttackerForgedKeyFingerprintFakeBase64Hash1=');

    // Step 3: Security-conscious user rejects the suspicious host key
    await backend.confirm_host_key(false);

    // Step 4: Connection is cleanly aborted without ever sending credentials or running remote check
    assert.strictEqual(backend.status.status, 'Disconnected');

    // Verify no credentials or identity checks were run
    const remoteCommands = backend.logs.filter((l) => l.message.includes('uname'));
    assert.strictEqual(remoteCommands.length, 0);

    const warnLog = backend.logs.find((l) => l.message.includes('Host key rejected'));
    assert.ok(warnLog, 'Must log warning regarding host key rejection');
  });
});
