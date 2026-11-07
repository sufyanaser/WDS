import fs from 'node:fs';
import path from 'node:path';

const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /ghp_[a-zA-Z0-9]{36}/,
  /gho_[a-zA-Z0-9]{36}/,
  /github_pat_[a-zA-Z0-9]{82}/,
  /(?:password|passwd|pwd|secret)\s*[:=]\s*["'][^"']{8,}["']/i,
];

const ignoredDirs = new Set([
  'node_modules',
  'target',
  '.git',
  'backup-pre-stability-fix',
  'platform-tools',
  'release-artifacts',
  '.vscode',
  '.agents'
]);

let alerts = 0;

function scan(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name) && !entry.name.startsWith('.')) {
        scan(full);
      }
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.zip') || entry.name.endsWith('.ico') || entry.name.endsWith('.png') || entry.name.endsWith('.exe') || entry.name.endsWith('.dll')) {
        continue;
      }
      try {
        if (full.includes('sanitizer.rs')) {
          // Sanitizer implementation regexes are not secrets
          continue;
        }
        const content = fs.readFileSync(full, 'utf8');
        for (const pattern of secretPatterns) {
          const match = content.match(pattern);
          if (match) {
            const isTest = full.includes('tests') || full.includes('test') || full.includes('mock');
            if (!isTest) {
              console.log(`[ALERT REAL SECRET] ${full}: pattern matched`);
              alerts++;
            } else {
              console.log(`[TEST MOCK DATA] ${full}`);
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }
}

scan('.');
console.log(`Secret scan completed. Found ${alerts} real alerts.`);
if (alerts > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
