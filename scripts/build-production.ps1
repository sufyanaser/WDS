$ErrorActionPreference = 'Continue'
$reportPath = Join-Path $env:TEMP 'wds-connect-tauri-build-report.txt'
$repo = 'G:\PROJECTS\2-WDS'
$sw = [System.Diagnostics.Stopwatch]::StartNew()

try {
    try {
        Set-Location $repo
        "=== WDS Connect Production Build Report ===" | Out-File $reportPath -Encoding utf8
        "Started : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $reportPath -Append -Encoding utf8
        "" | Out-File $reportPath -Append -Encoding utf8
        "--- Git status ---" | Out-File $reportPath -Append -Encoding utf8
        git status | Out-File $reportPath -Append -Encoding utf8
        "" | Out-File $reportPath -Append -Encoding utf8
        "--- Building Tauri production bundle (NSIS + MSI) ---" | Out-File $reportPath -Append -Encoding utf8

        $output = & npm run tauri build 2>&1
        $code = $LASTEXITCODE
        $output | Out-File $reportPath -Append -Encoding utf8

        "" | Out-File $reportPath -Append -Encoding utf8
        "--- Artifacts ---" | Out-File $reportPath -Append -Encoding utf8
        $exe = Join-Path $repo 'src-tauri\target\release\wds-connect.exe'
        if (Test-Path $exe) {
            $exeItem = Get-Item $exe
            "Executable : $($exeItem.FullName) ($([math]::Round($exeItem.Length/1MB,2)) MB)" | Out-File $reportPath -Append -Encoding utf8
            (Get-FileHash $exe -Algorithm SHA256).Hash + "  wds-connect.exe" | Out-File $reportPath -Append -Encoding utf8
        } else {
            "Executable : MISSING ($exe)" | Out-File $reportPath -Append -Encoding utf8
        }

        $bundleDirs = @('src-tauri\target\release\bundle\nsis', 'src-tauri\target\release\bundle\msi')
        foreach ($d in $bundleDirs) {
            $full = Join-Path $repo $d
            if (Test-Path $full) {
                Get-ChildItem $full -File | ForEach-Object {
                    "Installer  : $($_.FullName) ($([math]::Round($_.Length/1MB,2)) MB)" | Out-File $reportPath -Append -Encoding utf8
                    (Get-FileHash $_.FullName -Algorithm SHA256).Hash + "  $($_.Name)" | Out-File $reportPath -Append -Encoding utf8
                }
            } else {
                "Installer  : directory missing ($d)" | Out-File $reportPath -Append -Encoding utf8
            }
        }

        $sw.Stop()
        "" | Out-File $reportPath -Append -Encoding utf8
        "Exit code  : $code" | Out-File $reportPath -Append -Encoding utf8
        "Duration   : $([math]::Round($sw.Elapsed.TotalMinutes,1)) minutes" | Out-File $reportPath -Append -Encoding utf8
        "Finished   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $reportPath -Append -Encoding utf8
        exit $code
    } catch {
        "EXCEPTION  : $($_.Exception.Message)" | Out-File $reportPath -Append -Encoding utf8
        exit 500
    }
} finally {
    "=== End Report ===" | Out-File $reportPath -Append -Encoding utf8
    Set-Clipboard -Path $reportPath
}
