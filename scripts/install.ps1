$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$InstallDir = if ($args.Count -gt 0) { $args[0] } else { Join-Path $env:LOCALAPPDATA "myg\bin" }

if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }

# Create myg.cmd wrapper that points to the project's ps1
$cmdContent = "@powershell -ExecutionPolicy Bypass -File `"$ProjectDir\cli\myg.ps1`" %*"
Set-Content -Path (Join-Path $InstallDir "myg.cmd") -Value $cmdContent -Encoding ASCII

Write-Host "Installed myg -> $InstallDir\myg.cmd" -ForegroundColor Green

# Check PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$InstallDir*") {
    $reply = Read-Host "Add $InstallDir to your PATH? (y/n)"
    if ($reply -eq "y") {
        [Environment]::SetEnvironmentVariable("Path", "$InstallDir;$userPath", "User")
        Write-Host "PATH updated. Restart your terminal to take effect." -ForegroundColor Green
    } else {
        Write-Host "`nAdd this to your PATH manually:" -ForegroundColor Yellow
        Write-Host "  $InstallDir"
    }
}
