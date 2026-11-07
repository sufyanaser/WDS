import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { OBSERVED_CONFIG } from '../harness/fixtures.mjs';
import { calculateFingerprints } from '../harness/oracle.mjs';

describe('Tier 1: Feature 6 - Public Key Authentication (wds_mac_ed25519)', () => {
  it('T1.6.1: Connection attempts public-key auth first using configured Ed25519 key', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    const authMethods = [];
    backend.on('connection-status-changed', (st) => {
      if (st.status === 'Authenticating') authMethods.push(st.details?.method);
    });

    await backend.connect();
    assert.strictEqual(authMethods[0], 'publickey', 'Primary auth method must be publickey');
  });

  it('T1.6.2: Key algorithm correctly identifies as ssh-ed25519', () => {
    const pubKey = OBSERVED_CONFIG.ssh.publicKey;
    assert.ok(pubKey.startsWith('ssh-ed25519'), 'Configured key must be Ed25519 algorithm');
  });

  it('T1.6.3: Public key fingerprint matches known authority (SHA256:K6YAdHZa5i90FIKTJiClWYbLpMNFwmWsPx0wcEPn8UE)', () => {
    const rawBase64 = OBSERVED_CONFIG.ssh.publicKey.split(' ')[1];
    const fps = calculateFingerprints(rawBase64);
    assert.strictEqual(fps.sha256, 'K6YAdHZa5i90FIKTJiClWYbLpMNFwmWsPx0wcEPn8UE', 'Calculated SHA256 must match authoritative ssh-keygen output');
  });

  it('T1.6.4: Successful public-key signature transitions state to VerifyingIdentity', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: true,
      simulatePassphraseRequired: false,
    });

    const states = [];
    backend.on('connection-status-changed', (st) => states.push(st.status));

    await backend.connect();
    assert.ok(states.includes('VerifyingIdentity'), 'Successful auth must transition to VerifyingIdentity');
  });

  it('T1.6.5: SSH authentication operates entirely in backend without spawning terminal window', () => {
    const backend = new TauriBackendSimulator();
    assert.strictEqual(backend.options.spawnTerminalWindow, undefined, 'No terminal process spawn flag allowed');
  });
});
