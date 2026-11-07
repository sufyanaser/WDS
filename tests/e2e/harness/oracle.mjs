/**
 * Authoritative Specification Oracle
 * Derived strictly from mathematical properties and requirements in ORIGINAL_REQUEST.md & PROJECT.md
 */

import crypto from 'node:crypto';
import { REDACTION_LABELS, VALID_TRANSITIONS, HEARTBEAT_SPEC } from './contracts.mjs';

/**
 * Calculates SHA-256 (base64, unpadded) and MD5 (colon-separated hex) fingerprints
 * from a raw base64-encoded public key.
 */
export function calculateFingerprints(base64PublicKey) {
  const cleanKey = base64PublicKey.trim();
  const buffer = Buffer.from(cleanKey, 'base64');

  const sha256 = crypto.createHash('sha256').update(buffer).digest('base64').replace(/=+$/, '');
  const md5Hex = crypto.createHash('md5').update(buffer).digest('hex');
  const md5Formatted = md5Hex.match(/.{1,2}/g)?.join(':') ?? md5Hex;

  return {
    sha256,
    md5: md5Formatted,
    fullSha256: `SHA256:${sha256}`,
    fullMd5: `MD5:${md5Formatted}`,
  };
}

/**
 * Sanitizes sensitive secrets from log strings:
 * - OpenSSH / RSA / EC private keys
 * - Plaintext passwords
 * - Bearer tokens / API secrets
 */
export function sanitizeLog(text) {
  if (typeof text !== 'string') return '';

  let sanitized = text;

  // 1. Redact Private Key blocks
  const privateKeyRegex = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
  sanitized = sanitized.replace(privateKeyRegex, REDACTION_LABELS.privateKey);

  // 2. Redact passwords in key-value format (password=..., password: ..., pass=..., etc.)
  const passwordRegex = /(?<=\b(?:password|pass|passwd|secret)\s*[:=]\s*["']?)[^"',\s\r\n]+/gi;
  sanitized = sanitized.replace(passwordRegex, REDACTION_LABELS.password);

  // 3. Redact Bearer tokens
  const bearerRegex = /(?<=Bearer\s+)[a-zA-Z0-9._~+/-]+=*/gi;
  sanitized = sanitized.replace(bearerRegex, REDACTION_LABELS.token);

  // 4. Redact tokens in key-value format (token=..., token: ...)
  const tokenRegex = /(?<=\b(?:token|auth_token|access_token|secret_key)\s*[:=]\s*["']?)[^"',\s\r\n]+/gi;
  sanitized = sanitized.replace(tokenRegex, REDACTION_LABELS.token);

  return sanitized;
}

/**
 * Validates remote identity command output:
 * - Must have exitCode === 0
 * - Must identify Darwin OS (macOS)
 * - Must match expected target user
 */
export function verifyRemoteIdentity(result, expectedUser = 'ali') {
  if (!result || typeof result.exitCode !== 'number') {
    return { verified: false, reason: 'Invalid or missing command execution result' };
  }

  if (result.exitCode !== 0) {
    return {
      verified: false,
      reason: `Remote command failed with non-zero exit code: ${result.exitCode} (${result.stderr || 'No stderr'})`,
    };
  }

  const lines = (result.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return {
      verified: false,
      reason: `Unexpected output format from remote identity probe: received ${lines.length} lines, expected >= 2`,
    };
  }

  const unameLine = lines[0]; // e.g. "Darwin 24.1.0 arm64"
  const userLine = lines[1];  // e.g. "ali"

  if (!unameLine.startsWith('Darwin')) {
    return {
      verified: false,
      reason: `Remote OS identity mismatch: expected 'Darwin', got '${unameLine}'`,
    };
  }

  if (userLine !== expectedUser) {
    return {
      verified: false,
      reason: `Remote user identity mismatch: expected '${expectedUser}', got '${userLine}'`,
    };
  }

  return {
    verified: true,
    details: {
      os: unameLine,
      user: userLine,
      swVers: lines.slice(2).join('\n'),
    },
  };
}

/**
 * Validates state transition legality in the 9-state machine
 */
export function isValidTransition(fromState, toState) {
  const allowed = VALID_TRANSITIONS[fromState];
  if (!allowed) return false;
  return allowed.includes(toState);
}

/**
 * Evaluates heartbeat health status based on consecutive misses
 */
export function evaluateHeartbeatHealth(consecutiveMisses) {
  if (consecutiveMisses <= 0) {
    return { status: 'healthy', shouldDrop: false };
  }
  if (consecutiveMisses === 1) {
    return { status: 'warning', shouldDrop: false };
  }
  if (consecutiveMisses === 2) {
    return { status: 'degraded', shouldDrop: false };
  }
  return {
    status: 'dropped',
    shouldDrop: true,
    reason: `Heartbeat missed ${consecutiveMisses} consecutive ticks (threshold: ${HEARTBEAT_SPEC.missedThresholdBeforeDrop})`,
  };
}

/**
 * WCAG Relative Luminance and Contrast Ratio calculation
 */
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function luminance(r, g, b) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function calculateContrastRatio(hex1, hex2) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const lum1 = luminance(r1, g1, b1);
  const lum2 = luminance(r2, g2, b2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}
