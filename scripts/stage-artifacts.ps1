$ErrorActionPreference = 'Continue'
$reportPath = Join-Path $env:TEMP 'wds-connect-stage-artifacts-report.txt'
$repo = 'G:\PROJECTS\2-WDS'
$stage = Join-Path $repo 'release-artifacts'

try {
    try {
        Set-Location $repo
        "=== WDS Connect Artifact Staging Report ===" | Out-File $reportPath -Encoding utf8
        "Started : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $reportPath -Append -Encoding utf8
        "" | Out-File $reportPath -Append -Encoding utf8
        "--- Git status ---" | Out-File $reportPath -Append -Encoding utf8
        git status | Out-File $reportPath -Append -Encoding utf8
        "" | Out-File $reportPath -Append -Encoding utf8

        if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $stage | Out-Null

        $copied = 0
        $exe = Join-Path $repo 'src-tauri\target\release\wds-connect.exe'
        if (Test-Path $exe) {
            Copy-Item $exe (Join-Path $stage 'wds-connect.exe')
            $copied++
        } else {
            "MISSING: $exe" | Out-File $reportPath -Append -Encoding utf8
        }

        foreach ($d in @('nsis', 'msi')) {
            $src = Join-Path $repo "src-tauri\target\release\bundle\$d"
            if (Test-Path $src) {
                Get-ChildItem $src -File | ForEach-Object {
                    Copy-Item $_.FullName (Join-Path $stage $_.Name)
                    $copied++
                }
            }
        }

        "" | Out-File $reportPath -Append -Encoding utf8
        "--- Staged artifacts with SHA-256 ---" | Out-File $reportPath -Append -Encoding utf8
        Get-ChildItem $stage -File | ForEach-Object {
            $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
            "{0}  {1}  ({2} bytes)" -f $hash, $_.Name, $_.Length | Out-File $reportPath -Append -Encoding utf8
        }

        "" | Out-File $reportPath -Append -Encoding utf8
        "Staged file count: $copied" | Out-File $reportPath -Append -Encoding utf8
        "Staging directory : $stage" | Out-File $reportPath -Append -Encoding utf8
        exit 0
    } catch {
        "EXCEPTION: $($_.Exception.Message)" | Out-File $reportPath -Append -Encoding utf8
        exit 500
    }
} finally {
    "=== End Report ===" | Out-File $reportPath -Append -Encoding utf8
    Set-Clipboard -Path $reportPath
}
