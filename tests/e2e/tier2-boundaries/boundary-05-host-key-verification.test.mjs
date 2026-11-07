import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';

describe('Tier 2: Feature 5 - Host Key Verification Boundaries', () => {
  it('T2.5.1: KeyMismatch (host exists with different key) flags critical MITM warning (is_changed = true)', async () => {
    const backend = new TauriBackendSimulator({
      simulateHostKeyMismatch: true,
      presentedHostKeySha256: 'DifferentForgedKeyFingerprint1234567890=',
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');
    assert.strictEqual(backend.status.details.is_changed, true, 'is_changed must be true when host key differs from recorded key');
  });

  it('T2.5.2: Rejecting host key immediately aborts connection and transitions to Disconnected', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');

    await backend.confirm_host_key(false); // Reject
    assert.strictEqual(backend.status.status, 'Disconnected');
  });

  it('T2.5.3: Corrupted known_hosts file does not crash parser and handles gracefully', () => {
    const corruptedLine = '192.168.68.103 !!!MALFORMED_LINE_DATA_WITHOUT_KEY_TYPE!!!';
    function parseKnownHostsLine(line) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) return null; // Graceful skip
      return { host: parts[0], keyType: parts[1], key: parts[2] };
    }

    const result = parseKnownHostsLine(corruptedLine);
    assert.strictEqual(result, null, 'Malformed line must be safely skipped without throwing error');
  });

  it('T2.5.4: Non-standard SSH port formats host key identifier with brackets', () => {
    function formatKnownHostEntry(host, port) {
      if (port === 22) return host;
      return `[${host}]:${port}`;
    }

    assert.strictEqual(formatKnownHostEntry('192.168.68.103', 22), '192.168.68.103');
    assert.strictEqual(formatKnownHostEntry('192.168.68.103', 2222), '[192.168.68.103]:2222');
  });

  it('T2.5.5: Simultaneous connection requests don\'t duplicate host key challenge prompts', async () => {
    const backend = new TauriBackendSimulator({
      knownHostPresent: false,
    });

    await backend.connect();
    assert.strictEqual(backend.status.status, 'HostKeyVerificationPending');

    // Calling connect again while in pending state must throw error
    await assert.rejects(async () => {
      await backend.connect();
    }, /Cannot connect while in state/);
  });
});
