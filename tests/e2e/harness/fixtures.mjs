/**
 * Concrete Test Fixtures & Observed Host Environment Vectors
 * Derived directly from empirical host audit and requirement specifications.
 */

export const OBSERVED_CONFIG = Object.freeze({
  local: {
    hostname: 'SUFYAN',
    username: 'sufya',
    platform: 'Windows 11',
    ip: '192.168.68.104',
  },
  remote: {
    hostname: 'Alis-MacBook-Pro-2.local',
    username: 'ali',
    host: '192.168.68.103',
    port: 22,
    platform: 'macOS',
  },
  ssh: {
    privateKeyPath: 'C:\\Users\\sufya\\.ssh\\wds_mac_ed25519',
    publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO1BZW4OBV3TYyJF/fU4KkBzNKzQEqzPd35QJ621nQoE wds-windows-to-mac',
    knownHostsKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIECtPpPXrjscYWqHDA/VFc1mV9zR3Xy91wK5nw4LZwkI',
    fingerprintSha256: 'uxXAgttSnSYGZoW2wHBB45XA4fxE8zAjVKavK1RSO/k',
    fingerprintMd5: '49:6a:07:d1:11:94:1b:39:18:65:6f:24:fe:a1:82:3f',
  },
});

export const REMOTE_IDENTITY_FIXTURES = Object.freeze({
  validDarwin: {
    exitCode: 0,
    stdout: 'Darwin 24.1.0 arm64\nali\nProductName:\tmacOS\nProductVersion:\t15.1\nBuildVersion:\t24B83\n',
    stderr: '',
  },
  invalidLinux: {
    exitCode: 0,
    stdout: 'Linux 6.8.0-45-generic x86_64\nali\n',
    stderr: '',
  },
  invalidUser: {
    exitCode: 0,
    stdout: 'Darwin 24.1.0 arm64\nroot\nProductName:\tmacOS\n',
    stderr: '',
  },
  commandFailure: {
    exitCode: 127,
    stdout: '',
    stderr: 'command not found: sw_vers\n',
  },
  timeoutFailure: {
    exitCode: -1,
    stdout: '',
    stderr: 'Command execution timed out after 10000ms\n',
  },
});

export const DESIGN_TOKENS = Object.freeze({
  bgBase: '#0b0d11',
  bgSurface: '#161920',
  bgElevated: '#1e222b',
  accentCyan: '#0ea5e9',
  accentCyanHover: '#38bdf8',
  statusConnected: '#10b981',
  statusConnecting: '#0ea5e9',
  statusVerification: '#f59e0b',
  statusError: '#ef4444',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
});

export const SAMPLE_SECRETS = Object.freeze({
  rawEd25519Key: `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACDtQWVuDgVd02MiRf31OCpAczSs0BKsz3d+UCettZ0KBAAAAJAw/4mOMP+J
jgAAAAtzc2gtZWQyNTUxOQAAACDtQWVuDgVd02MiRf31OCpAczSs0BKsz3d+UCettZ0KBA
AAAEA7O6yM1a4v/r6T0nFsmX5Jc9W1Y2N7h...
-----END OPENSSH PRIVATE KEY-----`,
  rawRsaKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAz5m8T...
-----END RSA PRIVATE KEY-----`,
  logWithPassword: 'Connecting with credentials: user=ali password=SuperSecretPassword123! to host=192.168.68.103',
  logWithToken: 'Authorization header sent: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  logWithSecretQuery: 'https://api.internal/connect?secret=abcdef1234567890',
});
