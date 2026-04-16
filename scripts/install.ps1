$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$Ps1Path = Join-Path $ProjectDir "cli\myg.ps1"

# Add function to PowerShell profile
$profileDir = Split-Path -Parent $PROFILE
if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir -Force | Out-Null }
if (-not (Test-Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force | Out-Null }

$marker = "# myg-cli"
$funcLine = "$marker`nfunction myg { `$input | & '$Ps1Path' @args }"
$profileContent = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
if ($profileContent -and $profileContent.Contains($marker)) {
    # Update existing entry
    $profileContent = $profileContent -replace "(?m)$marker\r?\n.*myg.*", $funcLine
    Set-Content -Path $PROFILE -Value $profileContent -NoNewline
} else {
    Add-Content -Path $PROFILE -Value "`n$funcLine"
}

# Load into current session
Invoke-Expression "function global:myg { `$input | & '$Ps1Path' @args }"

Write-Host "Installed myg (PowerShell function) -> $PROFILE" -ForegroundColor Green
Write-Host "Run ``myg auth`` to get started." -ForegroundColor Cyan
