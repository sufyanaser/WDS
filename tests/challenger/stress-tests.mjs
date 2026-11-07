/**
 * Empirical Challenger Stress Test Suite
 * Milestone 1 (Gate 1 & Gate 2 Windows App Foundation)
 *
 * Tests:
 * 1. WCAG 2.2 AAA Contrast Ratios (7.0:1 normal text, 4.5:1 large text)
 * 2. 44px Minimum Touch Target Sizing on Interactive Controls
 * 3. Log Buffer Sanitization & Secret Leakage Prevention
 * 4. IPC State Machine Transitions & Edge Cases (Error retry, Cancellation, In-flight races)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers: Relative Luminance and Contrast Ratio (WCAG 2.2 Formula)
// ---------------------------------------------------------------------------
function parseHex(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function relativeLuminance(r, g, b) {
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;

  const R = rs <= 0.04045 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const G = gs <= 0.04045 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const B = bs <= 0.04045 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(hex1, hex2) {
  const rgb1 = parseHex(hex1);
  const rgb2 = parseHex(hex2);

  const l1 = relativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = relativeLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// 1. WCAG 2.2 AAA Contrast Compliance Tests
// ---------------------------------------------------------------------------
describe('Empirical Challenge 1: WCAG 2.2 AAA Contrast Compliance', () => {
  const colors = {
    bgBase: '#0b0d11',
    bgSurface: '#161920',
    bgElevated: '#1e222b',
    bgInput: '#12141a',
    bgViewport: '#0e1015',
    slate100: '#f1f5f9',
    slate200: '#e2e8f0',
    slate300: '#cbd5e1',
    slate400: '#94a3b8',
    slate500: '#64748b',
    sky400: '#38bdf8',
    slate950: '#020617',
    rose300: '#fda4af',
    slate900: '#0f172a',
    emerald300: '#6ee7b7',
    emerald950: '#022c22',
  };

  it('Primary text (slate-100) on base background exceeds WCAG AAA 7.0:1', () => {
    const ratio = contrastRatio(colors.slate100, colors.bgBase);
    assert.ok(ratio >= 7.0, `Expected ratio >= 7.0, got ${ratio.toFixed(2)}`);
  });

  it('Primary action CTA (slate-950 on sky-400) exceeds WCAG AAA 7.0:1', () => {
    const ratio = contrastRatio(colors.slate950, colors.sky400);
    assert.ok(ratio >= 7.0, `Expected ratio >= 7.0, got ${ratio.toFixed(2)}`);
  });

  it('Connected status badge (emerald-300 on emerald-950) exceeds WCAG AAA 7.0:1', () => {
    const ratio = contrastRatio(colors.emerald300, colors.emerald950);
    assert.ok(ratio >= 7.0, `Expected ratio >= 7.0, got ${ratio.toFixed(2)}`);
  });

  it('[FAILURE MODE] Secondary text (slate-400 on bg-surface) fails WCAG 2.2 AAA 7.0:1 standard', () => {
    const ratio = contrastRatio(colors.slate400, colors.bgSurface);
    // slate-400 is #94a3b8, bgSurface is #161920 -> ratio is 6.86:1 (< 7.0:1)
    const passesAAA = ratio >= 7.0;
    assert.strictEqual(
      passesAAA,
      false,
      `Observed ratio ${ratio.toFixed(2)}:1 falls short of WCAG 2.2 AAA enhanced contrast threshold (7.0:1)`
    );
  });

  it('[FAILURE MODE] Diagnostic timestamp text (slate-500 on bg-viewport) fails WCAG 2.2 AAA 7.0:1 standard', () => {
    const ratio = contrastRatio(colors.slate500, colors.bgViewport);
    // slate-500 is #64748b, bgViewport is #0e1015 -> ratio is 4.00:1 (< 7.0:1)
    const passesAAA = ratio >= 7.0;
    assert.strictEqual(
      passesAAA,
      false,
      `Observed ratio ${ratio.toFixed(2)}:1 falls far short of WCAG 2.2 AAA threshold (7.0:1)`
    );
  });
});

// ---------------------------------------------------------------------------
// 2. 44px Minimum Touch Target Compliance Tests
// ---------------------------------------------------------------------------
describe('Empirical Challenge 2: 44px Minimum Touch Targets', () => {
  it('PrimaryAction button variants satisfy 44px min height constraint', () => {
    const primaryActionCode = fs.readFileSync('g:\\PROJECTS\\2-WDS\\src\\components\\PrimaryAction.tsx', 'utf-8');
    // Ensure all button elements have h-11 / min-h-[44px]
    const buttonTags = primaryActionCode.match(/<button[\s\S]*?className="([^"]*)"/g) || [];
    for (const tag of buttonTags) {
      assert.ok(
        tag.includes('h-11') || tag.includes('min-h-[44px]'),
        `PrimaryAction button missing 44px height: ${tag}`
      );
    }
  });

  it('[FAILURE MODE] Header settings button (w-8 h-8) is only 32px by 32px, violating 44px touch target', () => {
    const headerCode = fs.readFileSync('g:\\PROJECTS\\2-WDS\\src\\components\\Header.tsx', 'utf-8');
    const settingsBtnMatch = headerCode.match(/aria-label="Open connection settings"[\s\S]*?className="([^"]*)"/);
    assert.ok(settingsBtnMatch, 'Settings button must be present in Header.tsx');
    const classes = settingsBtnMatch[1];
    assert.ok(classes.includes('w-8') && classes.includes('h-8'), 'Header settings button has w-8 h-8 class (32x32px)');
    assert.ok(!classes.includes('min-h-[44px]'), 'Header settings button lacks 44px minimum touch target');
  });

  it('[FAILURE MODE] HostKeyDialog "Reject and Abort" button is h-10 (40px), violating 44px touch target', () => {
    const dialogCode = fs.readFileSync('g:\\PROJECTS\\2-WDS\\src\\components\\HostKeyDialog.tsx', 'utf-8');
    const rejectBtnMatch = dialogCode.match(/onConfirm\(false,\s*false\)[\s\S]*?className="([^"]*)"/);
    assert.ok(rejectBtnMatch, 'Reject button must be present');
    const classes = rejectBtnMatch[1];
    assert.ok(classes.includes('h-10'), 'Reject button uses h-10 (40px)');
    assert.ok(!classes.includes('min-h-[44px]'), 'Reject button lacks 44px touch target');
  });

  it('[FAILURE MODE] PasswordDialog "Cancel" button is h-10 (40px), violating 44px touch target', () => {
    const dialogCode = fs.readFileSync('g:\\PROJECTS\\2-WDS\\src\\components\\PasswordDialog.tsx', 'utf-8');
    const cancelBtnMatch = dialogCode.match(/onClick=\{onCancel\}[\s\S]*?className="([^"]*)"/);
    assert.ok(cancelBtnMatch, 'Cancel button must be present');
    const classes = cancelBtnMatch[1];
    assert.ok(classes.includes('h-10'), 'Cancel button uses h-10 (40px)');
    assert.ok(!classes.includes('min-h-[44px]'), 'Cancel button lacks 44px touch target');
  });
});

// ---------------------------------------------------------------------------
// 3. Log Buffer Sanitization & Secret Leakage Prevention Tests
// ---------------------------------------------------------------------------
describe('Empirical Challenge 3: Log Buffer Sanitization & Secret Redaction', () => {
  it('E2E harness specification oracle sanitizeLog successfully redacts known secrets', async () => {
    const { sanitizeLog } = await import('../e2e/harness/oracle.mjs');
    const rawKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA\n-----END OPENSSH PRIVATE KEY-----';
    const sanitized = sanitizeLog(`Loaded key: ${rawKey}`);
    assert.ok(!sanitized.includes('OPENSSH PRIVATE KEY'));
    assert.ok(sanitized.includes('[REDACTED_PRIVATE_KEY]'));
  });

  it('[FAILURE MODE] Rust AppState in src-tauri/src/lib.rs lacks log sanitization filter', () => {
    const libRsCode = fs.readFileSync('g:\\PROJECTS\\2-WDS\\src-tauri\\src\\lib.rs', 'utf-8');
    // Inspect add_log method
    const addLogFn = libRsCode.slice(libRsCode.indexOf('pub fn add_log'), libRsCode.indexOf('// Tauri IPC Commands'));
    assert.ok(addLogFn.includes('message: message.into()'), 'add_log passes message.into() directly');
    assert.ok(
      !addLogFn.includes('regex') && !addLogFn.includes('sanitize') && !addLogFn.includes('redact'),
      'src-tauri add_log does NOT call any sanitization or regex redaction routine'
    );
  });
});

// ---------------------------------------------------------------------------
// 4. IPC State Machine Transitions & Edge Cases
// ---------------------------------------------------------------------------
describe('Empirical Challenge 4: IPC State Machine Transitions & Edge Cases', () => {
  it('[FAILURE MODE] Rust connect() command rejects retry when in Error state', () => {
    const libRsCode = fs.readFileSync('g:\\PROJECTS\\2-WDS\\src-tauri\\src\\lib.rs', 'utf-8');
    const connectCmdMatch = libRsCode.match(/async fn connect\([^)]*\)[\s\S]*?\{([\s\S]*?)let start_status/);
    assert.ok(connectCmdMatch, 'connect command must exist');
    const connectLogic = connectCmdMatch[1];
    
    // Check line: if *status != ConnectionStatus::Disconnected { return Err(...) }
    assert.ok(
      connectLogic.includes('*status != ConnectionStatus::Disconnected'),
      'connect() enforces strict Disconnected check, failing to allow retry from Error state'
    );
  });

  it('[FAILURE MODE] Rust connect() tokio::spawn lacks cancellation handle or state check', () => {
    const libRsCode = fs.readFileSync('g:\\PROJECTS\\2-WDS\\src-tauri\\src\\lib.rs', 'utf-8');
    const spawnMatch = libRsCode.match(/tokio::spawn\(async move\s*\{([\s\S]*?)\}\);/);
    assert.ok(spawnMatch, 'tokio::spawn block must exist in connect()');
    const spawnBody = spawnMatch[1];
    
    // Verify that tokio::spawn does NOT check state or cancellation token
    assert.ok(!spawnBody.includes('cancel'), 'tokio::spawn does not monitor cancellation');
    assert.ok(!spawnBody.includes('state.status'), 'tokio::spawn does not verify if backend state.status was cancelled');
    assert.ok(!spawnBody.includes('CancellationToken'), 'tokio::spawn does not use tokio_util::sync::CancellationToken');
  });

  it('[FAILURE MODE] Rust connect() tokio::spawn fails to update state.status to Connected', () => {
    const libRsCode = fs.readFileSync('g:\\PROJECTS\\2-WDS\\src-tauri\\src\\lib.rs', 'utf-8');
    const spawnMatch = libRsCode.match(/tokio::spawn\(async move\s*\{([\s\S]*?)\}\);/);
    assert.ok(spawnMatch, 'tokio::spawn block must exist in connect()');
    const spawnBody = spawnMatch[1];
    
    // In spawnBody, it only calls app.emit("connection-status-changed", &connected_status)
    // It NEVER locks state.status or updates backend state!
    assert.ok(
      !spawnBody.includes('state.status'),
      'Backend state.status is never updated to Connected upon successful simulation!'
    );
  });
});
