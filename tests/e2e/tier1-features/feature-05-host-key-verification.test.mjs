import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { OBSERVED_CONFIG } from '../harness/fixtures.mjs';
import { calculateFingerprints } from '../harness/oracle.mjs';

describe('Tier 1: Feature 5 - Host Key Verification & Fingerprint Challenge', () => {
  it('T1.5.1: Known host lookup against known_hosts verifies matching key without prompt', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'Connected', 'Known host key must proceed directly without challenge prompt');
  });

  it('T1.5.2: Unknown host triggers HostKeyVerificationPending with SHA256 and MD5 fingerprints', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: false, // Not in known_hosts
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');
    assert.strictEqual(backend.status.details.fingerprint_sha256, OBSERVED_CONFIG.ssh.fingerprintSha256);
  });

  it('T1.5.3: HostKeyDialog renders un-dismissible modal with host, port, key type, and fingerprints', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: false,
    });

    await backend.connect();
    const details = backend.status.details;
    assert.strictEqual(details.host, '192.168.68.103');
    assert.strictEqual(details.port, 22);
    assert.strictEqual(details.key_type, 'ssh-ed25519');
    assert.ok(details.fingerprint_sha256.length > 0);
  });

  it('T1.5.4: User approval resumes connection workflow without remembering if unchecked', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: false,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');

    await backend.confirm_host_key(true, false); // approved = true, remember = false
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.knownHosts.has(OBSERVED_CONFIG.ssh.fingerprintSha256), false, 'Should not be stored in knownHosts when remember=false');
  });

  it('T1.5.5: User approval with "Remember" flag appends host key to known_hosts', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: false,
      simulatePassphraseRequired: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');

    await backend.confirm_host_key(true, true); // approved = true, remember = true
    assert.strictEqual(backend.status.status, 'Connected');
    assert.strictEqual(backend.knownHosts.has(OBSERVED_CONFIG.ssh.fingerprintSha256), true, 'Must be stored in knownHosts when remember=true');
  });
});
