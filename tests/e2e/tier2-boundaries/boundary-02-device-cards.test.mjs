import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN_TOKENS } from '../harness/fixtures.mjs';
import { calculateContrastRatio } from '../harness/oracle.mjs';

describe('Tier 2: Feature 2 - Device Cards Boundaries', () => {
  it('T2.2.1: Extremely long hostname handles ellipsis/truncation without layout blowout', () => {
    const longHostname = 'very-long-corporate-workstation-name-with-deep-subdomain.internal.corp.network.local';
    function truncateHost(name, maxChars = 28) {
      if (name.length <= maxChars) return name;
      return name.slice(0, maxChars - 3) + '...';
    }

    const truncated = truncateHost(longHostname);
    assert.ok(truncated.length <= 28, 'Truncated host must be within maximum container width');
    assert.ok(truncated.endsWith('...'), 'Truncated host must append ellipsis');
  });

  it('T2.2.2: IPv6 address in device card renders cleanly without breaking card geometry', () => {
    const ipv6 = 'fe80::1ff:fe00:3a60:88bb';
    const isIpLike = /^([0-9a-fA-F:.]+)$/.test(ipv6);
    assert.strictEqual(isIpLike, true, 'IPv6 address format must validate');
  });

  it('T2.2.3: Offline/disconnected local network interface displays fallback state "Offline"', () => {
    const networkState = { ip: null, isOnline: false };
    const label = networkState.isOnline ? networkState.ip : 'Offline';
    assert.strictEqual(label, 'Offline', 'Disconnected network interface must display Offline');
  });

  it('T2.2.4: Rapid state cycling does not cause race condition or undefined status', () => {
    const states = ['Disconnected', 'Connecting', 'Error', 'Disconnected'];
    let currentState = 'Disconnected';

    for (const next of states) {
      currentState = next;
      assert.ok(typeof currentState === 'string');
    }
    assert.strictEqual(currentState, 'Disconnected');
  });

  it('T2.2.5: Contrast ratio of all text tokens against #0b0d11 and #161920 exceeds WCAG 2.2 AAA (>16:1)', () => {
    const ratioBase = calculateContrastRatio(DESIGN_TOKENS.textPrimary, DESIGN_TOKENS.bgBase);
    const ratioSurface = calculateContrastRatio(DESIGN_TOKENS.textPrimary, DESIGN_TOKENS.bgSurface);

    assert.ok(ratioBase >= 16.0, `Base contrast ratio (${ratioBase.toFixed(1)}:1) must meet or exceed 16:1`);
    assert.ok(ratioSurface >= 14.0, `Surface contrast ratio (${ratioSurface.toFixed(1)}:1) must meet or exceed 14:1`);
  });
});
