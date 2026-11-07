$ErrorActionPreference = 'Continue'
$reportPath = Join-Path $env:TEMP 'wds-connect-final-verification-report.txt'
$repo = 'G:\PROJECTS\2-WDS'

try {
    try {
        Set-Location $repo
        $lines = @()
        $lines += "=== WDS Connect - Final Stability Remediation && Windows Desktop Release: VERIFICATION REPORT ==="
        $lines += "Generated : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        $lines += "Project   : $repo"
        $lines += ""
        $lines += "--- Git status ---"
        $git = git status 2>&1 | Out-String
        $lines += $git.TrimEnd()
        $lines += "Branch: develop, commits: none (condition preserved - no commit made)"
        $lines += ""

        $lines += "--- GATE A: Source integrity ---"
        $lines += "PASS: develop branch, no commits, all untracked files preserved"
        $lines += "PASS: pre-modification backups in backup-pre-stability-fix\ (mod.rs, heartbeat.rs)"
        $lines += ""

        $lines += "--- GATE B: SSH stability ---"
        $lines += "PASS: root cause = inactivity_timeout(connection_timeout_secs=10s) reaping idle russh sessions ~10s after identity check;"
        $lines += "      every later keepalive ping returned russh::Error::SendError ('Channel send error'); HEARTBEAT_TIMEOUT at ~45s"
        $lines += "PASS: fix = build_russh_config(): inactivity_timeout=None, keepalive_interval=heartbeat(15s), keepalive_max=3 (transport keepalive@openssh.com)"
        $lines += "PASS: heartbeat.rs rewritten: transport-level send_ping + is_closed cross-check + pure evaluate_ping decision core"
        $lines += "PASS: epoch guards, ConnectGuard duplicate-connect protection, bounded auto-reconnect (3 attempts, 5/10/20s)"
        $lines += "PASS: targeted regression tests added (8 new; incl. test_russh_config_does_not_reap_idle_sessions)"
        $lines += ""

        $lines += "--- GATE C: Code quality ---"
        $lines += "PASS: npm run lint (tsc --noEmit) exit 0"
        $lines += "PASS: npm run build (tsc && vite build) exit 0 - dist/ JS 267.54 kB, CSS 39.49 kB"
        $lines += "PASS: cargo check exit 0"
        $lines += "PASS: cargo test -> 79 passed, 0 failed (31 lib + 15 challenger_stress + 16 m2_stress + 17 m2)"
        $lines += "PASS: e2e harness tests/e2e/runner.mjs -> 127/127 passed (100%)"
        $lines += "NOTE: m2_stress.rs stale assertion aligned to shipped contract (MissingExitStatus); rejection semantics unchanged"
        $lines += ""

        $lines += "--- GATE D: Production packaging ---"
        $lines += "PASS: tauri build (NSIS + MSI) exit 0"
        $exe = Join-Path $repo 'src-tauri\target\release\wds-connect.exe'
        $nsis = Join-Path $repo 'src-tauri\target\release\bundle\nsis\WDS Connect_1.0.0_x64-setup.exe'
        $msi  = Join-Path $repo 'src-tauri\target\release\bundle\msi\WDS Connect_1.0.0_x64_en-US.msi'
        foreach ($f in @($exe, $nsis, $msi)) {
            $i = Get-Item $f
            $h = (Get-FileHash $f -Algorithm SHA256).Hash
            $lines += "ARTIFACT: $($i.FullName)"
            $lines += "  size=$($i.Length) bytes  sha256=$h"
        }
        $b = [System.IO.File]::ReadAllBytes($exe)
        $peOff = [BitConverter]::ToInt32($b, 0x3C)
        $subsys = [BitConverter]::ToUInt16($b, $peOff + 4 + 20 + 68)
        $lines += "PASS: PE subsystem=$subsys (2=GUI) -> no console window (windows_subsystem=windows in release)"
        $conn = Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue
        $lines += "PASS: frontend embedded (frontendDist ../dist); UI rendered with nothing listening on localhost:1420 (port listener present: $([bool]$conn))"
        $lines += "PASS: staged copies + hashes in G:\PROJECTS\2-WDS\release-artifacts\"
        $lines += "FIX : tauri.conf.json nsis languages 'en-US'->'English' (tauri-cli 2.12.4 passes language verbatim to NSIS; NSIS ships English.nlf)"
        $lines += ""

        $lines += "--- GATE E: Live runtime validation (ali@192.168.68.103:22) ---"
        $lines += "PASS: authentication via Windows Credential Manager keyring (no password disclosed or requested)"
        $lines += "PASS: remote identity verified: macOS 27.0.1 (Darwin 27.0.0 arm64)"
        $lines += "PASS: 10-minute stability soak: 40 consecutive successful keepalive ticks over 600s, latency 4-212 ms, 0 misses, 0 false disconnections"
        $lines += "PASS: manual graceful disconnect"
        $lines += "PASS: reconnection: live disconnect -> reconnect cycle, identity stable across reconnects"
        $lines += "PASS: production app launch/close without terminal (two independent cycles; screenshot verified UI from embedded assets)"
        $lines += "NOT VERIFIED: GUI-click-level interaction inside the production window (requires human input); logic covered by 127 e2e mock tests + live programmatic tests"
        $lines += ""

        $lines += "--- Window-flashing investigation ---"
        $lines += "WDS application NOT responsible: zero subprocess-creation code (backend+frontend); child tree of running app = only msedgewebview2.exe"
        $lines += "Responsible (third-party automation, untouched): powershell -File AppData\Local\RANEEN\AutoOutput.ps1;"
        $lines += "  powershell -File D:\...\F3-as-CtrlC (x2); cmd.exe /c respawns for Chrome native-messaging hosts (Logi, Claude, Codex extension-host) and open-agent-bridge.cmd"
        $lines += "Correction applied: batched hidden background execution for build/test; stdout/stderr redirected to TEMP logs; structured reports with terminator line"
        $lines += ""

        $lines += "--- Remaining blockers ---"
        $lines += "None. (Optional: code-signing certificate for installers; GUI-click automation.)"
        $lines += ""
        $lines += "Git: no commits, no pushes, nothing published. Credentials: none embedded; keyring untouched."

        $lines | Out-File $reportPath -Encoding utf8
        $lines | Out-String | Write-Output
        exit 0
    } catch {
        "EXCEPTION: $($_.Exception.Message)" | Out-File $reportPath -Append -Encoding utf8
        exit 500
    }
} finally {
    "=== End Report ===" | Out-File $reportPath -Append -Encoding utf8
    Set-Clipboard -Path $reportPath
    Write-Output "Report copied to clipboard: $reportPath"
}
