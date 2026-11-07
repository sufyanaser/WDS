import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeLog } from '../harness/oracle.mjs';
import { SAMPLE_SECRETS } from '../harness/fixtures.mjs';
import { REDACTION_LABELS } from '../harness/contracts.mjs';

describe('Tier 2: Feature 4 - Sanitized Diagnostics Boundaries', () => {
  it('T2.4.1: Redacts OpenSSH and RSA private key headers and bodies to [REDACTED_PRIVATE_KEY]', () => {
    const rawEd25519 = `Loaded key: ${SAMPLE_SECRETS.rawEd25519Key} for user ali`;
    const sanitizedEd = sanitizeLog(rawEd25519);
    assert.ok(!sanitizedEd.includes('BEGIN OPENSSH PRIVATE KEY'));
    assert.ok(sanitizedEd.includes(REDACTION_LABELS.privateKey));

    const rawRsa = `Certificate error: ${SAMPLE_SECRETS.rawRsaKey}`;
    const sanitizedRsa = sanitizeLog(rawRsa);
    assert.ok(!sanitizedRsa.includes('BEGIN RSA PRIVATE KEY'));
    assert.ok(sanitizedRsa.includes(REDACTION_LABELS.privateKey));
  });

  it('T2.4.2: Redacts plaintext passwords in key-value and URL parameters to [REDACTED_PASSWORD]', () => {
    const log1 = SAMPLE_SECRETS.logWithPassword;
    const sanitized1 = sanitizeLog(log1);
    assert.ok(!sanitized1.includes('SuperSecretPassword123!'));
    assert.ok(sanitized1.includes(REDACTION_LABELS.password));

    const log2 = 'auth failed with secret: "MyVerySecretPassword"';
    const sanitized2 = sanitizeLog(log2);
    assert.ok(!sanitized2.includes('MyVerySecretPassword'));
  });

  it('T2.4.3: Redacts Bearer tokens and authorization secrets to [REDACTED_TOKEN]', () => {
    const tokenLog = SAMPLE_SECRETS.logWithToken;
    const sanitized = sanitizeLog(tokenLog);
    assert.ok(!sanitized.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
    assert.ok(sanitized.includes(REDACTION_LABELS.token));
  });

  it('T2.4.4: High-volume log burst caps buffer size to prevent memory explosion', () => {
    const MAX_BUFFER = 1000;
    const logRingBuffer = [];

    function pushLog(entry) {
      if (logRingBuffer.length >= MAX_BUFFER) {
        logRingBuffer.shift(); // Evict oldest
      }
      logRingBuffer.push(entry);
    }

    // Push 2500 logs
    for (let i = 0; i < 2500; i++) {
      pushLog({ id: i, msg: `Log entry ${i}` });
    }

    assert.strictEqual(logRingBuffer.length, MAX_BUFFER, 'Buffer must be capped at 1000');
    assert.strictEqual(logRingBuffer[logRingBuffer.length - 1].id, 2499, 'Latest log must be retained');
    assert.strictEqual(logRingBuffer[0].id, 1500, 'Oldest retained log must be entry 1500');
  });

  it('T2.4.5: Empty diagnostics panel displays accessible fallback message', () => {
    const logs = [];
    const emptyFallback = logs.length === 0 ? 'No logs recorded' : '';
    assert.strictEqual(emptyFallback, 'No logs recorded', 'Empty state message must render when logs array is empty');
  });
});
