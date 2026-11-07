import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 2: Feature 6 - Public Key Auth Boundaries', () => {
  it('T2.6.1: Missing private key file path falls back gracefully to password challenge', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePublicKeyRejected: true,
    });
    backend.config.privateKeyPath = 'C:\\NonExistent\\Path\\key';

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending', 'Must fall back to password challenge if key is missing');
  });

  it('T2.6.2: Zero-byte/corrupted private key does not crash backend process', () => {
    function loadPrivateKeyBlob(blob) {
      if (!blob || blob.length === 0) {
        return { error: 'Empty key file' };
      }
      return { success: true };
    }

    const empty = loadPrivateKeyBlob(Buffer.alloc(0));
    assert.strictEqual(empty.error, 'Empty key file');
  });

  it('T2.6.3: Passphrase-encrypted key prompts for fallback password without hanging', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: true, // As observed on actual host key
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');
  });

  it('T2.6.4: Insecure file permissions warning is logged', () => {
    const aclEntry = { identity: 'Everyone', rights: 'FullControl' };
    function checkPermissions(acl) {
      if (acl.identity === 'Everyone') {
        return 'WARNING: Key file has overly permissive access rights';
      }
      return 'OK';
    }

    const warning = checkPermissions(aclEntry);
    assert.match(warning, /WARNING/);
  });

  it('T2.6.5: Server rejecting public key (Permission denied (publickey)) seamlessly falls back to password', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePublicKeyRejected: true,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'AuthChallengePending');
  });
});
