#!/usr/bin/env node

/**
 * WDS Connect - Opaque-Box E2E Test Runner
 *
 * Runs all requirement-driven test cases across Tiers 1-4.
 * Generates structured pass/fail summaries by Tier and Feature.
 */

import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getTestFiles(dir, filter = null) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...getTestFiles(fullPath, filter));
    } else if (entry.endsWith('.test.mjs')) {
      if (!filter || fullPath.includes(filter)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

async function main() {
  const startTime = Date.now();
  const testFiles = getTestFiles(__dirname);

  console.log('='.repeat(74));
  console.log('  WDS Connect - Opaque-Box E2E Requirement Test Harness');
  console.log('='.repeat(74));
  console.log(`Discovered ${testFiles.length} test suites across Tiers 1-4.`);
  console.log('');

  const nodeArgs = [
    '--test',
    '--test-reporter=spec',
    ...testFiles,
  ];

  const child = spawn(process.execPath, nodeArgs, {
    cwd: resolve(__dirname, '../..'),
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let stdoutData = '';
  let stderrData = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdoutData += text;
    process.stdout.write(text);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrData += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise((resolvePromise) => {
    child.on('close', resolvePromise);
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  // Parse pass/fail statistics from spec output
  const passMatches = stdoutData.match(/ℹ pass (\d+)/);
  const failMatches = stdoutData.match(/ℹ fail (\d+)/);
  const totalMatches = stdoutData.match(/ℹ tests (\d+)/);

  const totalTests = totalMatches ? parseInt(totalMatches[1], 10) : 0;
  const passedTests = passMatches ? parseInt(passMatches[1], 10) : 0;
  const failedTests = failMatches ? parseInt(failMatches[1], 10) : 0;

  // Tier counts
  const t1Passed = (stdoutData.match(/T1\.\d+\.\d+/g) || []).length;
  const t2Passed = (stdoutData.match(/T2\.\d+\.\d+/g) || []).length;
  const t3Passed = (stdoutData.match(/T3\.\d+:/g) || []).length;
  const t4Passed = (stdoutData.match(/▶ Tier 4: Scenario/g) || []).length;

  console.log('');
  console.log('='.repeat(74));
  console.log('  TEST EXECUTION AUDIT BREAKDOWN');
  console.log('='.repeat(74));
  console.log(`Total Elapsed Time: ${durationSec}s`);
  console.log(`Total Tests Executed: ${totalTests} (Target: >=127)`);
  console.log(`Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('');

  console.log('--- Tier Compliance Table ---');
  console.log(`  [${t1Passed >= 55 ? '✔ PASS' : '✖ FAIL'}] Tier 1: Feature Coverage (≥5/feature)       : ${t1Passed}/55 passed`);
  console.log(`  [${t2Passed >= 55 ? '✔ PASS' : '✖ FAIL'}] Tier 2: Boundary & Corner Cases (≥5/feat)   : ${t2Passed}/55 passed`);
  console.log(`  [${t3Passed >= 11 ? '✔ PASS' : '✖ FAIL'}] Tier 3: Cross-Feature Pairwise (11 tests)   : ${t3Passed}/11 passed`);
  console.log(`  [${t4Passed >= 6  ? '✔ PASS' : '✖ FAIL'}] Tier 4: Real-World Scenarios (6 scenarios)  : ${t4Passed}/6 passed`);
  console.log('');

  const featureNames = [
    'Window & Desktop Shell',
    'Device Cards & Indicators',
    'Connect/Disconnect Transitions',
    'Sanitized Diagnostics Panel',
    'Host Key Verification',
    'Public Key Auth (Ed25519)',
    'Password Fallback Dialog',
    'OS Credential Storage',
    'Remote Identity Verification',
    'Keepalive Heartbeat',
    'Clean Disconnection & Reset',
  ];

  console.log('--- Feature Coverage Matrix (Tiers 1 & 2) ---');
  featureNames.forEach((name, i) => {
    const fId = i + 1;
    const t1FeatCount = (stdoutData.match(new RegExp(`T1\\.${fId}\\.\\d+`, 'g')) || []).length;
    const t2FeatCount = (stdoutData.match(new RegExp(`T2\\.${fId}\\.\\d+`, 'g')) || []).length;
    const totalFeat = t1FeatCount + t2FeatCount;
    const status = totalFeat >= 10 ? '✔' : '⚠';
    console.log(`  ${status} Feature ${String(fId).padStart(2)}: ${name.padEnd(32)} -> T1: ${t1FeatCount}/5, T2: ${t2FeatCount}/5 (Total: ${totalFeat}/10)`);
  });

  console.log('='.repeat(74));
  if (exitCode === 0 && failedTests === 0 && totalTests >= 127) {
    console.log('  OVERALL RESULT: SUCCESS (100% PASS RATE) - TEST HARNESS VALIDATED');
    console.log('='.repeat(74));
    process.exit(0);
  } else {
    console.log('  OVERALL RESULT: FAILURES ENCOUNTERED');
    console.log('='.repeat(74));
    process.exit(exitCode || 1);
  }
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
