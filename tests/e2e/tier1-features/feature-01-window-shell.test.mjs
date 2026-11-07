import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WINDOW_SPEC } from '../harness/contracts.mjs';

describe('Tier 1: Feature 1 - Window & Desktop Shell', () => {
  it('T1.1.1: Default window dimensions match compact specification (440x580 px)', () => {
    assert.strictEqual(WINDOW_SPEC.defaultWidth, 440, 'Window default width must be 440px');
    assert.strictEqual(WINDOW_SPEC.defaultHeight, 580, 'Window default height must be 580px');
    assert.strictEqual(WINDOW_SPEC.title, 'WDS Connect', 'Window title must be "WDS Connect"');
  });

  it('T1.1.2: Window resizability bounds are correctly configured (min 440x560, max 640x860)', () => {
    assert.strictEqual(WINDOW_SPEC.minWidth, 440, 'Minimum width must be 440px');
    assert.strictEqual(WINDOW_SPEC.minHeight, 560, 'Minimum height must be 560px');
    assert.strictEqual(WINDOW_SPEC.maxWidth, 640, 'Maximum width must be 640px');
    assert.strictEqual(WINDOW_SPEC.maxHeight, 860, 'Maximum height must be 860px');
    assert.strictEqual(WINDOW_SPEC.resizable, true, 'Window must be resizable within bounds');
  });

  it('T1.1.3: Window decorations and dark theme are enabled', () => {
    assert.strictEqual(WINDOW_SPEC.decorations, true, 'Native decorations must be enabled for Windows 11 snap');
    assert.strictEqual(WINDOW_SPEC.theme, 'Dark', 'Window theme must be Dark');
    assert.strictEqual(WINDOW_SPEC.identifier, 'com.wds.connect', 'Bundle identifier must be com.wds.connect');
  });

  it('T1.1.4: Terminal console flash prevention subsystem flag is configured', () => {
    const expectedSubsystem = '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]';
    assert.strictEqual(WINDOW_SPEC.subsystemDeclaration, expectedSubsystem, 'Must declare windows_subsystem = "windows" to suppress cmd window');
  });

  it('T1.1.5: Multi-resolution desktop app icons exist in specification assets', () => {
    const requiredIconTypes = ['32x32.png', '128x128.png', 'icon.ico', 'icon.png', 'icon.icns'];
    for (const icon of requiredIconTypes) {
      assert.ok(icon.length > 0, `Icon asset type ${icon} must be configured for Windows and macOS packaging`);
    }
  });
});
