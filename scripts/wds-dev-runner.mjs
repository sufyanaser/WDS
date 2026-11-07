#!/usr/bin/env node
/**
 * WDS Intelligent Development Server Runner
 *
 * Prevents "Port 1420 is already in use" errors by:
 * 1. Checking whether a healthy WDS Vite server is already active on port 1420.
 * 2. If healthy and responding, reuses the existing instance without duplicate spawning.
 * 3. If port is free, spawns Vite cleanly.
 * 4. Preserves proxy partitions (5174, 5175) and WDS Connect integrity.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function checkHealthyServer(port = 1420, timeoutMs = 800) {
  return new Promise((resolve) => {
    const urls = [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`];
    let resolved = false;

    for (const url of urls) {
      try {
        const req = http.get(url, { timeout: timeoutMs }, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (!resolved) {
              const isWds = res.statusCode === 200 && (data.includes('@vite/client') || data.includes('WDS') || data.includes('root'));
              resolved = true;
              resolve({ alive: true, isWds, statusCode: res.statusCode });
            }
          });
        });
        req.on('error', () => {
          // try next url or timeout
        });
        req.on('timeout', () => {
          req.destroy();
        });
      } catch {
        // ignore
      }
    }

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ alive: false, isWds: false });
      }
    }, timeoutMs + 100);
  });
}

async function main() {
  const isTauriContext = process.env.TAURI_ENV_DEBUG !== undefined || process.env.TAURI_DEV_HOST !== undefined;
  
  const status = await checkHealthyServer(1420);
  if (status.alive && status.isWds) {
    console.log(`[WDS Runner] Healthy WDS Vite server already running on http://localhost:1420 (Status: ${status.statusCode})`);
    console.log(`[WDS Runner] Reusing active dev instance. Proxy ports: 5174 (Android) & 5175 (iPhone).`);
    
    if (isTauriContext || process.argv.includes('--exit-if-running')) {
      // Tauri CLI beforeDevCommand can proceed immediately
      process.exit(0);
    }

    // Keep alive in terminal so Ctrl+C works normally
    console.log(`[WDS Runner] Server is active. Press Ctrl+C to close runner.`);
    process.stdin.resume();
    const shutdown = () => process.exit(0);
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  // Not running; spawn Vite cleanly
  console.log(`[WDS Runner] Starting WDS Vite development server on http://localhost:1420...`);
  const viteCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const viteProcess = spawn(viteCmd, ['vite'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, BROWSER: 'none' },
  });

  viteProcess.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  const forwardSignal = () => {
    try {
      viteProcess.kill('SIGINT');
    } catch {
      process.exit(0);
    }
  };
  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);
}

main().catch((err) => {
  console.error('[WDS Runner Error]', err);
  process.exit(1);
});
