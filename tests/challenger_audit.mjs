#!/usr/bin/env node

/**
 * Challenger Empirical Audit Harness for Milestone 1 (Gate 1 & Gate 2)
 *
 * Directly tests disk artifacts, configuration files, git state,
 * frontend bundle integrity, and contract alignment between Rust and TypeScript.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

const ROOT = resolve(import.meta.dirname, '..');
console.log('='.repeat(70));
console.log('CHALLENGER EMPIRICAL AUDIT HARNESS: Milestone 1 Verification');
console.log('='.repeat(70));

let passes = 0;
let failures = 0;

function runAudit(name, testFn) {
  try {
    testFn();
    console.log(`  [PASS] ${name}`);
    passes++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failures++;
  }
}

// ---------------------------------------------------------------------------
// 1. Window Configuration & Console Suppression in src-tauri
// ---------------------------------------------------------------------------

runAudit('tauri.conf.json window dimensions and bounds match specification', () => {
  const confPath = join(ROOT, 'src-tauri', 'tauri.conf.json');
  assert.ok(existsSync(confPath), `Missing ${confPath}`);
  const conf = JSON.parse(readFileSync(confPath, 'utf-8'));

  assert.strictEqual(conf.productName, 'WDS Connect');
  assert.strictEqual(conf.identifier, 'com.wds.connect');

  const win = conf.app?.windows?.[0];
  assert.ok(win, 'Window configuration missing in tauri.conf.json');

  assert.strictEqual(win.width, 440, 'Default width must be 440');
  assert.strictEqual(win.height, 580, 'Default height must be 580');
  assert.strictEqual(win.minWidth, 440, 'minWidth must be 440');
  assert.strictEqual(win.minHeight, 560, 'minHeight must be 560');
  assert.strictEqual(win.maxWidth, 640, 'maxWidth must be 640');
  assert.strictEqual(win.maxHeight, 860, 'maxHeight must be 860');
  assert.strictEqual(win.resizable, true, 'Window must be resizable');
  assert.strictEqual(win.theme, 'Dark', 'Window theme must be Dark');
  assert.strictEqual(win.center, true, 'Window should be centered on launch');
  assert.strictEqual(win.decorations, true, 'Window must have native decorations for Windows 11 snap');

  assert.deepStrictEqual(conf.bundle?.targets, ['nsis', 'msi'], 'Bundle targets must include nsis and msi');
});

runAudit('src-tauri/src/main.rs console window suppression directive', () => {
  const mainPath = join(ROOT, 'src-tauri', 'src', 'main.rs');
  assert.ok(existsSync(mainPath), `Missing ${mainPath}`);
  const mainContent = readFileSync(mainPath, 'utf-8');

  const expectedDirective = '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]';
  assert.ok(
    mainContent.includes(expectedDirective),
    `main.rs must contain the windows_subsystem directive: ${expectedDirective}`
  );
});

// ---------------------------------------------------------------------------
// 2. Icon Assets Verification on Disk
// ---------------------------------------------------------------------------

runAudit('Multi-resolution app icon assets exist with non-zero byte size', () => {
  const iconsDir = join(ROOT, 'src-tauri', 'icons');
  assert.ok(existsSync(iconsDir), `Missing icons directory: ${iconsDir}`);

  const requiredIcons = [
    'icon.ico',
    'icon.icns',
    'icon.png',
    '32x32.png',
    '128x128.png',
    '128x128@2x.png',
  ];

  for (const icon of requiredIcons) {
    const iconPath = join(iconsDir, icon);
    assert.ok(existsSync(iconPath), `Missing icon file: ${icon}`);
    const stats = statSync(iconPath);
    assert.ok(stats.size > 0, `Icon file ${icon} is empty (0 bytes)`);
  }
});

// ---------------------------------------------------------------------------
// 3. Frontend Bundle Integrity & Zero-Warning Typecheck
// ---------------------------------------------------------------------------

runAudit('Frontend distribution bundle integrity in dist/', () => {
  const htmlPath = join(ROOT, 'dist', 'index.html');
  assert.ok(existsSync(htmlPath), 'Missing dist/index.html');
  const html = readFileSync(htmlPath, 'utf-8');
  assert.ok(html.includes('<div id="root"></div>'), 'index.html must include #root container');

  const assetsDir = join(ROOT, 'dist', 'assets');
  assert.ok(existsSync(assetsDir), 'Missing dist/assets directory');
  const assets = readdirSync(assetsDir);

  const jsBundle = assets.find((f) => f.endsWith('.js'));
  assert.ok(jsBundle, 'dist/assets must contain bundled JS file');
  const jsSize = statSync(join(assetsDir, jsBundle)).size;
  assert.ok(jsSize > 50_000, `JS bundle size (${jsSize} bytes) suspiciously small`);

  const cssBundle = assets.find((f) => f.endsWith('.css'));
  assert.ok(cssBundle, 'dist/assets must contain bundled CSS file');
  const cssContent = readFileSync(join(assetsDir, cssBundle), 'utf-8');
  assert.ok(cssContent.includes('#0b0d11'), 'CSS must include dark graphite base color token');
  assert.ok(cssContent.includes('#0ea5e9') || cssContent.includes('rgb(14 165 233'), 'CSS must include cyan accent token');
});

runAudit('Zero-warning TypeScript typecheck via tsc --noEmit', () => {
  const output = execSync('npx tsc --noEmit', { cwd: ROOT, encoding: 'utf-8' });
  assert.strictEqual(output.trim(), '', `TypeScript typecheck emitted output/errors: ${output}`);
});

// ---------------------------------------------------------------------------
// 4. Git Branch & .agents/ Preservation
// ---------------------------------------------------------------------------

runAudit('Git repository is initialized on branch develop', () => {
  const branch = execSync('git branch --show-current', { cwd: ROOT, encoding: 'utf-8' }).trim();
  assert.strictEqual(branch, 'develop', `Current git branch is "${branch}", expected "develop"`);
});

runAudit('.agents/ directory is 100% intact and preserved', () => {
  const originalRequest = join(ROOT, '.agents', 'teamwork', 'ORIGINAL_REQUEST.md');
  assert.ok(existsSync(originalRequest), 'ORIGINAL_REQUEST.md must exist in .agents/teamwork');
  const reqContent = readFileSync(originalRequest, 'utf-8');
  assert.ok(reqContent.includes('WDS Connect'), 'ORIGINAL_REQUEST.md content must be intact');
  assert.ok(reqContent.includes('440 × 560'), 'ORIGINAL_REQUEST.md must retain specifications');

  const orchProject = join(ROOT, '.agents', 'teamwork', 'orchestrator_1', 'PROJECT.md');
  assert.ok(existsSync(orchProject), 'PROJECT.md must exist in orchestrator_1');
});

// ---------------------------------------------------------------------------
// 5. IPC Contract Consistency between Rust and TypeScript
// ---------------------------------------------------------------------------

runAudit('IPC commands and models consistency between Rust and TypeScript', () => {
  const rustLibPath = join(ROOT, 'src-tauri', 'src', 'lib.rs');
  const rustLib = readFileSync(rustLibPath, 'utf-8');

  const tsIpcPath = join(ROOT, 'src', 'types', 'ipc.ts');
  const tsIpc = readFileSync(tsIpcPath, 'utf-8');

  const expectedCommands = [
    'get_system_info',
    'get_config',
    'save_config',
    'get_diagnostics',
    'connect',
    'disconnect',
    'confirm_host_key',
    'submit_password',
    'cancel_auth',
    'clear_credentials',
  ];

  for (const cmd of expectedCommands) {
    assert.ok(
      rustLib.includes(cmd),
      `Rust backend must declare/register IPC command "${cmd}"`
    );
    assert.ok(
      tsIpc.includes(cmd),
      `TypeScript ipc.ts must map invoke call for "${cmd}"`
    );
  }

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

  const rustModelsPath = join(ROOT, 'src-tauri', 'src', 'models.rs');
  const rustModels = readFileSync(rustModelsPath, 'utf-8');

  for (const state of expectedStates) {
    assert.ok(
      rustModels.includes(state),
      `Rust models.rs must contain ConnectionStatus enum variant "${state}"`
    );
    assert.ok(
      tsIpc.includes(`status: '${state}'`),
      `TypeScript ipc.ts must define ConnectionStatus discriminator "${state}"`
    );
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('='.repeat(70));
console.log(`CHALLENGER AUDIT RESULT: ${passes} Passed, ${failures} Failed`);
console.log('='.repeat(70));

if (failures > 0) {
  process.exit(1);
}
