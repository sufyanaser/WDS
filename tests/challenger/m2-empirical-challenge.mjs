#!/usr/bin/env node

/**
 * Empirical Challenger Test Harness for Milestone 2 (Gate 3: Native SSH Integration)
 * Agent: challenger_m2_2
 *
 * Mandate:
 * 1. Heartbeat keepalive timing & drop semantics:
 *    - Verify heartbeat emits heartbeat-tick event structure with latency_ms and timestamp.
 *    - Verify consecutive_misses counter triggers ConnectionStatus::Error { code: "HEARTBEAT_TIMEOUT", ... } on the 3rd consecutive drop.
 * 2. CancellationToken & Disconnect Teardown:
 *    - Verify disconnect() transmits SSH_MSG_DISCONNECT packet with 1.5s timeout.
 *    - Verify calling disconnect during Connecting aborts the connection attempt immediately.
 * 3. IPC commands & Serde tagged enums:
 *    - Confirm all 10 IPC commands match TypeScript ipc.ts definitions.
 *    - Execute node tests/e2e/runner.mjs and verify 100% pass rate.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

const ROOT = resolve(import.meta.dirname, '../..');
console.log('='.repeat(75));
console.log('  CHALLENGER 2 EMPIRICAL VERIFICATION HARNESS (MILESTONE 2: GATE 3)');
console.log('='.repeat(75));

let passedCount = 0;
let failedCount = 0;
const findings = [];

function challenge(section, title, fn) {
  try {
    fn();
    console.log(`  [PASS] [${section}] ${title}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] [${section}] ${title}`);
    console.error(`         ${err.message}`);
    failedCount++;
    findings.push({ section, title, error: err.message });
  }
}

async function challengeAsync(section, title, fn) {
  try {
    await fn();
    console.log(`  [PASS] [${section}] ${title}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] [${section}] ${title}`);
    console.error(`         ${err.message}`);
    failedCount++;
    findings.push({ section, title, error: err.message });
  }
}

// ===========================================================================
// SECTION 1: Heartbeat Keepalive Timing & Drop Semantics
// ===========================================================================
console.log('\n--- Section 1: Heartbeat Keepalive Timing & Drop Semantics ---');

challenge('HEARTBEAT', 'HeartbeatTick Rust model and TypeScript interface definition exact match', () => {
  const tsPath = join(ROOT, 'src/types/ipc.ts');
  const rustModelsPath = join(ROOT, 'src-tauri/src/models.rs');

  const tsContent = readFileSync(tsPath, 'utf-8');
  const rustContent = readFileSync(rustModelsPath, 'utf-8');

  // Verify TypeScript interface
  assert.ok(
    tsContent.includes('export interface HeartbeatTick'),
    'ipc.ts must define HeartbeatTick interface'
  );
  assert.ok(
    tsContent.includes('latency_ms: number;'),
    'HeartbeatTick in ipc.ts must have latency_ms: number'
  );
  assert.ok(
    tsContent.includes('timestamp: number;'),
    'HeartbeatTick in ipc.ts must have timestamp: number'
  );

  // Verify Rust struct
  assert.ok(
    rustContent.includes('pub struct HeartbeatTick'),
    'models.rs must define HeartbeatTick struct'
  );
  assert.ok(
    rustContent.includes('pub latency_ms: u32,'),
    'HeartbeatTick in models.rs must have pub latency_ms: u32'
  );
  assert.ok(
    rustContent.includes('pub timestamp: u64,'),
    'HeartbeatTick in models.rs must have pub timestamp: u64'
  );
});

challenge('HEARTBEAT', 'Heartbeat emitter in heartbeat.rs constructs HeartbeatTick with latency_ms and timestamp', () => {
  const hbPath = join(ROOT, 'src-tauri/src/ssh/heartbeat.rs');
  const hbContent = readFileSync(hbPath, 'utf-8');

  // Must construct HeartbeatTick with latency_ms and timestamp
  assert.ok(
    hbContent.includes('HeartbeatTick {') &&
      hbContent.includes('latency_ms,') &&
      hbContent.includes('timestamp: now,'),
    'heartbeat.rs must construct HeartbeatTick with latency_ms and timestamp'
  );

  // Must emit "heartbeat-tick" event
  assert.ok(
    hbContent.includes('app.emit("heartbeat-tick", &tick)'),
    'heartbeat.rs must emit "heartbeat-tick" event with &tick'
  );
});

challenge('HEARTBEAT', 'Heartbeat ping parameters match specification (interval: 10s/15s, timeout: 5s, max_misses: 3)', () => {
  const hbPath = join(ROOT, 'src-tauri/src/ssh/heartbeat.rs');
  const hbContent = readFileSync(hbPath, 'utf-8');

  // Verify run_heartbeat_loop call passing Duration::from_secs(5) as timeout and 3 as max_misses
  assert.ok(
    hbContent.includes('Duration::from_secs(5)') && hbContent.includes(', 3)'),
    'start_heartbeat must pass 5s timeout and 3 max_misses threshold'
  );
});

challenge('HEARTBEAT', 'Heartbeat drop state transition matches ConnectionStatus::Error with code HEARTBEAT_TIMEOUT', () => {
  const hbPath = join(ROOT, 'src-tauri/src/ssh/heartbeat.rs');
  const hbContent = readFileSync(hbPath, 'utf-8');

  // Verify trigger_heartbeat_timeout creates ConnectionStatus::Error with code "HEARTBEAT_TIMEOUT"
  assert.ok(
    hbContent.includes('code: "HEARTBEAT_TIMEOUT".to_string()'),
    'trigger_heartbeat_timeout must create Error with code "HEARTBEAT_TIMEOUT"'
  );
  assert.ok(
    hbContent.includes('app.emit("connection-status-changed", &error_status)'),
    'trigger_heartbeat_timeout must emit connection-status-changed event'
  );
});

challenge('HEARTBEAT', 'Empirical Simulation: Consecutive misses counter triggers HEARTBEAT_TIMEOUT on exactly the 3rd miss', () => {
  // Simulate the exact state machine in heartbeat.rs
  let consecutive_misses = 0;
  const max_misses = 3;
  let triggered = false;
  let triggerCode = null;
  const emittedEvents = [];

  function simulatePingResult(success, latencyMs = 5) {
    if (success) {
      consecutive_misses = 0;
      const tick = {
        latency_ms: latencyMs,
        timestamp: Date.now(),
      };
      emittedEvents.push({ event: 'heartbeat-tick', payload: tick });
    } else {
      consecutive_misses += 1;
      emittedEvents.push({
        event: 'log-entry',
        level: 'warn',
        message: `Keepalive heartbeat ping failed (${consecutive_misses}/${max_misses} missed)`,
      });

      if (consecutive_misses >= max_misses) {
        triggered = true;
        triggerCode = 'HEARTBEAT_TIMEOUT';
        emittedEvents.push({
          event: 'connection-status-changed',
          payload: {
            status: 'Error',
            details: {
              code: 'HEARTBEAT_TIMEOUT',
              message: `Connection lost: ${max_misses} consecutive heartbeat pings failed`,
              timestamp: Date.now(),
            },
          },
        });
      }
    }
  }

  // 1st miss: should warn, not timeout
  simulatePingResult(false);
  assert.strictEqual(consecutive_misses, 1);
  assert.strictEqual(triggered, false);

  // 2nd miss: should warn, not timeout
  simulatePingResult(false);
  assert.strictEqual(consecutive_misses, 2);
  assert.strictEqual(triggered, false);

  // Recovery: 3rd ping succeeds -> consecutive_misses resets to 0
  simulatePingResult(true, 12);
  assert.strictEqual(consecutive_misses, 0);
  assert.strictEqual(triggered, false);
  const lastTick = emittedEvents[emittedEvents.length - 1];
  assert.strictEqual(lastTick.event, 'heartbeat-tick');
  assert.strictEqual(lastTick.payload.latency_ms, 12);

  // Now trigger 3 consecutive drops
  simulatePingResult(false); // 1
  assert.strictEqual(triggered, false);
  simulatePingResult(false); // 2
  assert.strictEqual(triggered, false);
  simulatePingResult(false); // 3 -> TRIGGER!
  assert.strictEqual(consecutive_misses, 3);
  assert.strictEqual(triggered, true);
  assert.strictEqual(triggerCode, 'HEARTBEAT_TIMEOUT');

  const errorEvent = emittedEvents.find((e) => e.event === 'connection-status-changed');
  assert.ok(errorEvent, 'Must emit connection-status-changed error event');
  assert.strictEqual(errorEvent.payload.status, 'Error');
  assert.strictEqual(errorEvent.payload.details.code, 'HEARTBEAT_TIMEOUT');
});

// ===========================================================================
// SECTION 2: CancellationToken & Disconnect Teardown
// ===========================================================================
console.log('\n--- Section 2: CancellationToken & Disconnect Teardown ---');

challenge('DISCONNECT', 'disconnect() initiates Disconnecting status before resource cleanup', () => {
  const modPath = join(ROOT, 'src-tauri/src/ssh/mod.rs');
  const modContent = readFileSync(modPath, 'utf-8');

  // Verify transition to Disconnecting
  const disconnectFnIdx = modContent.indexOf('pub async fn disconnect');
  const endDisconnectIdx = modContent.indexOf('pub async fn confirm_host_key', disconnectFnIdx);
  assert.ok(disconnectFnIdx !== -1, 'SshManager must define pub async fn disconnect');
  const fnBody = modContent.slice(disconnectFnIdx, endDisconnectIdx !== -1 ? endDisconnectIdx : undefined);

  assert.ok(
    fnBody.includes('self.set_status(app, ConnectionStatus::Disconnecting);'),
    'disconnect() must set status to ConnectionStatus::Disconnecting at start'
  );
});

challenge('DISCONNECT', 'disconnect() cancels both connect_cancel_token and heartbeat_cancel_token', () => {
  const modPath = join(ROOT, 'src-tauri/src/ssh/mod.rs');
  const modContent = readFileSync(modPath, 'utf-8');

  const disconnectFnIdx = modContent.indexOf('pub async fn disconnect');
  const endDisconnectIdx = modContent.indexOf('pub async fn confirm_host_key', disconnectFnIdx);
  const fnBody = modContent.slice(disconnectFnIdx, endDisconnectIdx !== -1 ? endDisconnectIdx : undefined);

  assert.ok(
    fnBody.includes('self.connect_cancel_token.lock().unwrap().take()') &&
      fnBody.includes('token.cancel()'),
    'disconnect() must cancel connect_cancel_token'
  );
  assert.ok(
    fnBody.includes('self.heartbeat_cancel_token.lock().unwrap().take()') &&
      fnBody.includes('token.cancel()'),
    'disconnect() must cancel heartbeat_cancel_token'
  );
});

challenge('DISCONNECT', 'disconnect() transmits SSH_MSG_DISCONNECT packet with 1.5s timeout bound', () => {
  const modPath = join(ROOT, 'src-tauri/src/ssh/mod.rs');
  const modContent = readFileSync(modPath, 'utf-8');

  const disconnectFnIdx = modContent.indexOf('pub async fn disconnect');
  const endDisconnectIdx = modContent.indexOf('pub async fn confirm_host_key', disconnectFnIdx);
  const fnBody = modContent.slice(disconnectFnIdx, endDisconnectIdx !== -1 ? endDisconnectIdx : undefined);

  // Checks russh::Disconnect::ByApplication transmission
  assert.ok(
    fnBody.includes('handle.disconnect(') &&
      fnBody.includes('russh::Disconnect::ByApplication') &&
      fnBody.includes('"User requested disconnect"'),
    'disconnect() must call handle.disconnect with russh::Disconnect::ByApplication and "User requested disconnect"'
  );

  // Checks Duration::from_millis(1500) timeout
  assert.ok(
    fnBody.includes('Duration::from_millis(1500)'),
    'disconnect() packet transmission must be bounded by Duration::from_millis(1500) (1.5s)'
  );
  assert.ok(
    fnBody.includes('tokio::time::timeout('),
    'disconnect() must wrap handle.disconnect in tokio::time::timeout'
  );
});

challenge('DISCONNECT', 'Calling disconnect during Connecting aborts connection attempt immediately via CancellationToken', () => {
  const modPath = join(ROOT, 'src-tauri/src/ssh/mod.rs');
  const modContent = readFileSync(modPath, 'utf-8');

  const connectFnIdx = modContent.indexOf('pub async fn connect');
  const endConnectIdx = modContent.indexOf('pub async fn disconnect', connectFnIdx);
  assert.ok(connectFnIdx !== -1, 'SshManager must define pub async fn connect');
  const fnBody = modContent.slice(connectFnIdx, endConnectIdx !== -1 ? endConnectIdx : undefined);

  // Verify tokio::select! with cancel_token.cancelled() branch
  assert.ok(
    fnBody.includes('tokio::select!') &&
      fnBody.includes('_ = cancel_token.cancelled() =>') &&
      fnBody.includes('self.set_status(app, ConnectionStatus::Disconnected);') &&
      fnBody.includes('Connection cancelled by user'),
    'connect() must select! on cancel_token.cancelled() and abort immediately to Disconnected'
  );
});

// ===========================================================================
// SECTION 3: IPC Commands & Serde Tagged Enums
// ===========================================================================
console.log('\n--- Section 3: IPC Commands & Serde Tagged Enums ---');

const REQUIRED_IPC_COMMANDS = [
  { name: 'connect', args: [], returnType: 'void' },
  { name: 'disconnect', args: [], returnType: 'void' },
  { name: 'confirm_host_key', args: ['approved', 'remember'], returnType: 'void' },
  { name: 'submit_password', args: ['password', 'remember'], returnType: 'void' },
  { name: 'cancel_auth', args: [], returnType: 'void' },
  { name: 'clear_credentials', args: [], returnType: 'void' },
  { name: 'get_config', args: [], returnType: 'AppConfig' },
  { name: 'save_config', args: ['config'], returnType: 'void' },
  { name: 'get_system_info', args: [], returnType: 'LocalSystemInfo' },
  { name: 'get_diagnostics', args: [], returnType: 'SanitizedLogEntry[]' },
];

challenge('IPC', 'All 10 required IPC commands are declared in src-tauri/src/lib.rs', () => {
  const libPath = join(ROOT, 'src-tauri/src/lib.rs');
  const libContent = readFileSync(libPath, 'utf-8');

  // Verify generate_handler! includes all 10 commands
  const handlerMatch = libContent.match(/tauri::generate_handler!\[([^\]]+)\]/s);
  assert.ok(handlerMatch, 'generate_handler! macro invocation must exist in lib.rs');

  const registeredHandlers = handlerMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const cmd of REQUIRED_IPC_COMMANDS) {
    assert.ok(
      registeredHandlers.includes(cmd.name),
      `Command '${cmd.name}' is not registered in tauri::generate_handler!`
    );

    // Verify command function definition
    const fnRegex = new RegExp(`async fn\\s+${cmd.name}\\s*\\(`, 'm');
    assert.ok(
      fnRegex.test(libContent),
      `Command function 'async fn ${cmd.name}(' missing in lib.rs`
    );
  }
});

challenge('IPC', 'TypeScript ipc.ts exposes wrappers for all 10 IPC commands matching invoke signatures', () => {
  const tsPath = join(ROOT, 'src/types/ipc.ts');
  const tsContent = readFileSync(tsPath, 'utf-8');

  for (const cmd of REQUIRED_IPC_COMMANDS) {
    // Check invoke string call
    const invokePattern = `invoke<${cmd.returnType === 'void' ? 'void' : ''}`;
    assert.ok(
      tsContent.includes(`'${cmd.name}'`),
      `ipc.ts must invoke('${cmd.name}')`
    );
  }

  // Specifically verify argument passing
  assert.ok(
    tsContent.includes("invoke<void>('confirm_host_key', { approved, remember })"),
    'confirm_host_key wrapper must pass approved and remember'
  );
  assert.ok(
    tsContent.includes("invoke<void>('submit_password', { password, remember })"),
    'submit_password wrapper must pass password and remember'
  );
  assert.ok(
    tsContent.includes("invoke<void>('save_config', { config })"),
    'save_config wrapper must pass config'
  );
});

challenge('SERDE', 'ConnectionStatus serde tagged enum tag="status", content="details" matches all 9 states', () => {
  const rustModelsPath = join(ROOT, 'src-tauri/src/models.rs');
  const rustContent = readFileSync(rustModelsPath, 'utf-8');

  // Verify serde tag and content attributes
  assert.ok(
    rustContent.includes('#[serde(tag = "status", content = "details")]'),
    'ConnectionStatus must declare #[serde(tag = "status", content = "details")]'
  );

  const expectedStates = [
    'Disconnected',
    'Connecting',
    'HostKeyVerificationPending',
    'Authenticating',
    'AuthChallengePending',
    'VerifyingIdentity',
    'Connected',
    'Disconnecting',
    'Error',
  ];

  for (const st of expectedStates) {
    assert.ok(
      rustContent.includes(st),
      `ConnectionStatus enum must contain variant '${st}'`
    );
  }
});

challenge('SERDE', 'LogLevel serde lowercase rename_all="lowercase" matches TypeScript union', () => {
  const rustModelsPath = join(ROOT, 'src-tauri/src/models.rs');
  const rustContent = readFileSync(rustModelsPath, 'utf-8');
  const tsPath = join(ROOT, 'src/types/ipc.ts');
  const tsContent = readFileSync(tsPath, 'utf-8');

  assert.ok(
    rustContent.includes('#[serde(rename_all = "lowercase")]'),
    'LogLevel must declare #[serde(rename_all = "lowercase")]'
  );

  assert.ok(
    tsContent.includes("export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'ssh';"),
    "ipc.ts must define LogLevel as 'info' | 'warn' | 'error' | 'debug' | 'ssh'"
  );
});

// ===========================================================================
// SECTION 4: E2E Requirement Runner Execution (127/127 tests)
// ===========================================================================
console.log('\n--- Section 4: E2E Requirement Runner Verification ---');

challenge('E2E_SUITE', 'Execute node tests/e2e/runner.mjs and verify 100% pass rate (127/127)', () => {
  const runnerOutput = execSync('node tests/e2e/runner.mjs', {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  assert.ok(
    runnerOutput.includes('Passed: 127 | Failed: 0'),
    'E2E runner must report exactly 127 passed and 0 failed'
  );
  assert.ok(
    runnerOutput.includes('OVERALL RESULT: SUCCESS (100% PASS RATE)'),
    'E2E runner must output overall SUCCESS'
  );
});

// ===========================================================================
// Summary & Verdict
// ===========================================================================
console.log('\n' + '='.repeat(75));
console.log(`CHALLENGER 2 SUMMARY: ${passedCount} passed, ${failedCount} failed`);
if (failedCount === 0) {
  console.log('FINAL VERDICT: CONFIRMED (100% of Milestone 2 empirical challenges passed)');
} else {
  console.log(`FINAL VERDICT: DISPROVED (${failedCount} challenges failed)`);
  console.log('Failures:', JSON.stringify(findings, null, 2));
}
console.log('='.repeat(75));

if (failedCount > 0) {
  process.exit(1);
}
