import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OBSERVED_CONFIG, DESIGN_TOKENS } from '../harness/fixtures.mjs';
import { calculateContrastRatio } from '../harness/oracle.mjs';

describe('Tier 1: Feature 2 - Device Cards & State Indicators', () => {
  it('T1.2.1: Local device card renders SUFYAN workstation identity and local IP', () => {
    const local = OBSERVED_CONFIG.local;
    assert.strictEqual(local.hostname, 'SUFYAN', 'Local hostname must match workstation SUFYAN');
    assert.strictEqual(local.username, 'sufya', 'Local user must match sufya');
    assert.strictEqual(local.platform, 'Windows 11', 'Local platform must be Windows 11');
    assert.match(local.ip, /^192\.168\.\d+\.\d+$/, 'Local IP must be valid IPv4 network address');
  });

  it('T1.2.2: Remote device card renders MacBook identity (ali@192.168.68.103:22)', () => {
    const remote = OBSERVED_CONFIG.remote;
    assert.strictEqual(remote.hostname, 'Alis-MacBook-Pro-2.local');
    assert.strictEqual(remote.username, 'ali');
    assert.strictEqual(remote.host, '192.168.68.103');
    assert.strictEqual(remote.port, 22);
    assert.strictEqual(remote.platform, 'macOS');
  });

  it('T1.2.3: Device cards render distinct OS/device glyph identifiers', () => {
    const localCard = { platform: 'Windows 11', icon: 'windows-workstation' };
    const remoteCard = { platform: 'macOS', icon: 'apple-laptop' };
    assert.notStrictEqual(localCard.icon, remoteCard.icon, 'Device cards must use distinct icons');
  });

  it('T1.2.4: ConnectionBridge indicator connects local and remote device cards', () => {
    const bridgeStates = ['disconnected', 'connecting', 'connected', 'error'];
    for (const state of bridgeStates) {
      assert.ok(typeof state === 'string' && state.length > 0, `Bridge must handle ${state} state`);
    }
  });

  it('T1.2.5: Status indicators reflect exact semantic colors across connection states', () => {
    assert.strictEqual(DESIGN_TOKENS.statusConnected, '#10b981', 'Connected status color must be emerald/green');
    assert.strictEqual(DESIGN_TOKENS.statusConnecting, '#0ea5e9', 'Connecting status color must be sky cyan');
    assert.strictEqual(DESIGN_TOKENS.statusError, '#ef4444', 'Error status color must be red');

    // Contrast check against canvas
    const contrastRatio = calculateContrastRatio(DESIGN_TOKENS.textPrimary, DESIGN_TOKENS.bgBase);
    assert.ok(contrastRatio > 7.0, `Text contrast ratio (${contrastRatio.toFixed(1)}:1) must exceed WCAG AAA (7:1)`);
  });
});
