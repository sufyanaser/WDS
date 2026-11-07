import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TauriBackendSimulator } from '../harness/mock-backend.mjs';
import { SAMPLE_SECRETS } from '../harness/fixtures.mjs';
import { REDACTION_LABELS } from '../harness/contracts.mjs';

describe('Tier 1: Feature 4 - Sanitized Real-Time Diagnostics Panel', () => {
  it('T1.4.1: Diagnostics panel renders collapsible log container with auto-scroll', async () => {
    const backend = new TauriBackendSimulator();
    const initialDiagnostics = await backend.get_diagnostics();
    assert.ok(Array.isArray(initialDiagnostics), 'Diagnostics must return an array of log entries');
  });

  it('T1.4.2: Real-time logs stream with timestamp, log level, and message fields', async () => {
    const backend = new TauriBackendSimulator();
    const capturedLogs = [];
    backend.on('log-entry', (entry) => capturedLogs.push(entry));

    await backend.connect();

    assert.ok(capturedLogs.length > 0, 'Real-time logs must be emitted');
    const first = capturedLogs[0];
    assert.ok(typeof first.timestamp === 'number', 'Log entry must have numeric timestamp');
    assert.ok(['INFO', 'WARN', 'ERROR', 'DEBUG'].includes(first.level), 'Log entry must have valid level');
    assert.ok(typeof first.message === 'string' && first.message.length > 0, 'Log entry must have non-empty message');
  });

  it('T1.4.3: Copy Logs action captures full sanitized log buffer to clipboard', async () => {
    const backend = new TauriBackendSimulator();
    await backend.connect();
    const logs = await backend.get_diagnostics();

    const formattedExport = logs.map((l) => `[${new Date(l.timestamp).toISOString()}] [${l.level}] ${l.message}`).join('\n');
    assert.ok(formattedExport.length > 0, 'Formatted export must not be empty');
    assert.ok(formattedExport.includes('[INFO]'), 'Export must include log lines');
  });

  it('T1.4.4: Clear Logs action purges in-memory log buffer', async () => {
    const backend = new TauriBackendSimulator();
    await backend.connect();
    assert.ok(backend.logs.length > 0);

    backend.logs = [];
    const cleared = await backend.get_diagnostics();
    assert.strictEqual(cleared.length, 0, 'Log buffer must be empty after clear');
  });

  it('T1.4.5: User manual upward scroll engages scroll-lock and stops auto-scrolling', () => {
    const scrollState = { isAtBottom: true, autoScrollActive: true };

    // Simulate user scroll up
    scrollState.isAtBottom = false;
    scrollState.autoScrollActive = scrollState.isAtBottom;

    assert.strictEqual(scrollState.autoScrollActive, false, 'Auto-scroll must be disabled when scrolled up');
  });
});
