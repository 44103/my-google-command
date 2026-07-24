#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$script:PipelineInput = @($input) -join [char]10

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$EnvFile = Join-Path $ProjectDir ".env"
$TokenFile = Join-Path $ProjectDir ".token"

# Load .env
if (-not (Test-Path $EnvFile)) { Write-Error ".env not found: $EnvFile"; exit 1 }
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        Set-Variable -Name $Matches[1].Trim() -Value $Matches[2].Trim() -Scope Script
    }
}
if (-not $DEPLOY_ID) { Write-Error "DEPLOY_ID not set in .env"; exit 1 }
if (-not (Get-Variable -Name GW_DOMAIN -Scope Script -ErrorAction SilentlyContinue)) { $GW_DOMAIN = "" }
if (-not (Get-Variable -Name DEV_DEPLOY_ID -Scope Script -ErrorAction SilentlyContinue)) { $DEV_DEPLOY_ID = "" }

$Base = "https://script.google.com/macros/s/$DEPLOY_ID/exec"

# --- Daemon configuration ---
$DaemonScript = Join-Path $ProjectDir "daemon\index.js"
$DaemonPort = if ($env:MYG_DAEMON_PORT) { $env:MYG_DAEMON_PORT } else { "19333" }
$DaemonHost = "127.0.0.1"
$DaemonUrl = "http://${DaemonHost}:${DaemonPort}"
$DaemonPidFile = Join-Path $ProjectDir ".daemon-pid"
$DaemonLog = Join-Path $env:TEMP "myg-daemon.log"

function Daemon-CheckNode {
    $nodePath = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodePath) {
        Write-Error "Node.js is required but not found in PATH.`nInstall Node.js 18+ from https://nodejs.org/"
        exit 1
    }
    $ver = (node -v) -replace '^v', ''
    $major = [int]($ver.Split('.')[0])
    if ($major -lt 18) {
        Write-Error "Node.js 18+ required (found: v$ver)`nInstall Node.js 18+ from https://nodejs.org/"
        exit 1
    }
}

function Daemon-IsRunning {
    try {
        $resp = Invoke-RestMethod -Uri "$DaemonUrl/status" -TimeoutSec 1 -ErrorAction Stop
        return $true
    } catch { return $false }
}

function Daemon-Start {
    if (Daemon-IsRunning) { return }
    Daemon-CheckNode

    # Check port
    $listener = Get-NetTCPConnection -LocalPort $DaemonPort -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        Write-Error "Port $DaemonPort is already in use."
        exit 1
    }

    # Clear log
    if (Test-Path $DaemonLog) { "" | Set-Content $DaemonLog }

    # Start daemon
    $proc = Start-Process -FilePath "node" -ArgumentList $DaemonScript `
        -RedirectStandardError $DaemonLog -WindowStyle Hidden -PassThru

    # Wait with exponential backoff (max ~5s)
    $waitMs = 100; $totalMs = 0; $maxMs = 5000
    while ($totalMs -lt $maxMs) {
        Start-Sleep -Milliseconds $waitMs
        $totalMs += $waitMs
        if (Daemon-IsRunning) { return }
        if ($proc.HasExited) {
            Write-Host "Error: Failed to start myg daemon." -ForegroundColor Red
            if ((Test-Path $DaemonLog) -and (Get-Item $DaemonLog).Length -gt 0) {
                Write-Host "--- Daemon log ---" -ForegroundColor Yellow
                Get-Content $DaemonLog | Write-Host
                Write-Host "--- End log ---" -ForegroundColor Yellow
            }
            exit 1
        }
        $waitMs = [Math]::Min($waitMs * 2, 1000)
    }
    Write-Error "Daemon did not respond within ${maxMs}ms."
    if ((Test-Path $DaemonLog) -and (Get-Item $DaemonLog).Length -gt 0) {
        Write-Host "--- Daemon log ---" -ForegroundColor Yellow
        Get-Content $DaemonLog | Write-Host
        Write-Host "--- End log ---" -ForegroundColor Yellow
    }
    exit 1
}

function Daemon-Stop {
    if (Daemon-IsRunning) {
        try { Invoke-RestMethod -Uri "$DaemonUrl/shutdown" -Method Post -TimeoutSec 3 -ErrorAction SilentlyContinue } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (Test-Path $DaemonPidFile) {
        $pid = Get-Content $DaemonPidFile -ErrorAction SilentlyContinue
        if ($pid) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue }
        Remove-Item $DaemonPidFile -Force -ErrorAction SilentlyContinue
    }
}

function Daemon-Status {
    if (Daemon-IsRunning) {
        Invoke-RestMethod -Uri "$DaemonUrl/status" | ConvertTo-Json -Depth 10
    } else {
        Write-Error "Daemon is not running."
        exit 1
    }
}

function Show-Help {
    Get-Content (Join-Path $PSScriptRoot "help.txt")
    exit 0
}
function Parse-Args {
    param([string[]]$Arguments)
    $result = @{}
    $flags = @()
    foreach ($arg in $Arguments) {
        if ($arg -match '^([^=]+)=(.*)$') {
            $result[$Matches[1]] = $Matches[2]
        } else {
            $flags += $arg
        }
    }
    $result["_flags"] = $flags
    return $result
}

function Read-Stdin {
    if ($script:PipelineInput) { return $script:PipelineInput }
    if ([Console]::IsInputRedirected) { return [Console]::In.ReadToEnd() }
    return ""
}

Add-Type -AssemblyName System.Net.Http

function Follow-Redirects {
    param([string]$Url, [hashtable]$Headers, [string]$Method = "Get", [string]$ReqBody = $null, [string]$ContentType = $null)
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $client = New-Object System.Net.Http.HttpClient($handler)
    try {
        for ($i = 0; $i -lt 6; $i++) {
            $httpMethod = if ($Method -eq "Post") { [System.Net.Http.HttpMethod]::Post } else { [System.Net.Http.HttpMethod]::Get }
            $req = New-Object System.Net.Http.HttpRequestMessage($httpMethod, $Url)
            foreach ($k in $Headers.Keys) { $req.Headers.TryAddWithoutValidation($k, $Headers[$k]) | Out-Null }
            if ($ReqBody -and $Method -eq "Post") {
                $req.Content = New-Object System.Net.Http.StringContent($ReqBody, [System.Text.Encoding]::UTF8, "application/json")
            }
            $task = $client.SendAsync($req)
            $task.Wait()
            $resp = $task.Result
            $code = [int]$resp.StatusCode
            if ($code -in 301,302,303,307,308) {
                $Url = [string]$resp.Headers.Location
                if ($code -in 302, 303) { $Method = "Get"; $ReqBody = $null }
            } elseif ($code -ge 200 -and $code -lt 300) {
                $readTask = $resp.Content.ReadAsStringAsync()
                $readTask.Wait()
                return $readTask.Result
            } else {
                $readTask = $resp.Content.ReadAsStringAsync()
                $readTask.Wait()
                throw "HTTP $code : $($readTask.Result)"
            }
        }
        throw "Too many redirects"
    } finally {
        $client.Dispose()
    }
}

function Invoke-Api {
    param(
        [string]$Method = "GET",
        [hashtable]$Query = @{},
        [hashtable]$Body = $null
    )
    $headers = @{ Authorization = "Bearer $script:AccessToken" }

    if ($Method -eq "GET") {
        $parts = @()
        foreach ($k in $Query.Keys) {
            $parts += "$k=$([uri]::EscapeDataString($Query[$k]))"
        }
        $url = "$Base`?$($parts -join '&')"
        $content = Follow-Redirects -Url $url -Headers $headers
        return $content
    } else {
        $json = $Body | ConvertTo-Json -Depth 10 -Compress
        $content = Follow-Redirects -Url $Base -Headers $headers -Method Post -ReqBody $json -ContentType "application/json; charset=utf-8"
        return $content
    }
}

function Format-Output {
    param($Response)
    if ($Response -is [string] -and $Response -match '(?i)<html') {
        Write-Error "Received HTML response. Your token may have expired.`nRun: myg auth"
        exit 1
    }
    if ($Response -is [string]) {
        try {
            $parsed = $Response | ConvertFrom-Json
            if ($Response.TrimStart().StartsWith('[')) {
                $items = @($parsed) | ForEach-Object { $_ | ConvertTo-Json -Depth 20 -Compress }
                "[
  " + (($items | ForEach-Object { ($_ | ConvertFrom-Json | ConvertTo-Json -Depth 20) -replace "`n", "`n  " }) -join ",`n  ") + "
]"
            } else {
                $parsed | ConvertTo-Json -Depth 20
            }
        } catch { $Response }
    } else {
        $Response | ConvertTo-Json -Depth 20
    }
}

# --- Main ---
$action = if ($args.Count -gt 0) { $args[0] } else { "--help" }
$remaining = @(if ($args.Count -gt 1) { $args[1..($args.Count - 1)] })

if ($action -in "--help", "-h", "help") { Show-Help }

# --- daemon subcommand ---
if ($action -eq "daemon") {
    $daemonVerb = if ($remaining.Count -gt 0) { $remaining[0] } else { "status" }
    switch ($daemonVerb) {
        "start"  { Daemon-Start; Write-Host "Daemon is running." -ForegroundColor Green }
        "stop"   { Daemon-Stop; Write-Host "Daemon stopped." -ForegroundColor Green }
        "status" { Daemon-Status }
        default  { Write-Error "Usage: myg daemon [start|stop|status]"; exit 1 }
    }
    exit 0
}

# Auth
if ($action -eq "auth") {
    # Auto-update check
    try {
        $oldRev = git -C $ProjectDir rev-parse HEAD 2>$null
        git -C $ProjectDir fetch --quiet 2>$null
        $newRev = git -C $ProjectDir rev-parse origin/main 2>$null
        if ($oldRev -and $newRev -and $oldRev -ne $newRev) {
            git -C $ProjectDir reset --hard origin/main --quiet 2>$null
            $count = git -C $ProjectDir rev-list "$oldRev..$newRev" --count
            Write-Host "Updated myg ($count new commit(s)):" -ForegroundColor Yellow
            git -C $ProjectDir log --oneline "$oldRev..$newRev" | ForEach-Object { Write-Host "  - $_" }
            Write-Host ""
        }
    } catch {}

    # Try daemon-based auth (no copy-paste needed)
    $_daemonAuth = $false
    try {
        if (Daemon-IsRunning) { $_daemonAuth = $true }
        elseif (Get-Command node -ErrorAction SilentlyContinue) {
            Daemon-Start
            if (Daemon-IsRunning) { $_daemonAuth = $true }
        }
    } catch {}

    if ($_daemonAuth) {
        $_callbackRaw = "http://${DaemonHost}:${DaemonPort}/auth/callback"
        $_callbackB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($_callbackRaw))
        $authUrl = if ($GW_DOMAIN) {
            "https://script.google.com/a/macros/$GW_DOMAIN/s/$DEPLOY_ID/exec?action=auth&callback=$_callbackB64"
        } else {
            "$Base`?action=auth&callback=$_callbackB64"
        }
        Write-Host "Opening browser for authentication..." -ForegroundColor Cyan
        Start-Process $authUrl

        Write-Host "Waiting for authentication in browser..." -ForegroundColor Cyan
        $elapsed = 0
        while ($elapsed -lt 15) {
            Start-Sleep -Seconds 1
            $elapsed++
            try {
                $status = Invoke-RestMethod -Uri "$DaemonUrl/status" -TimeoutSec 1
                if ($status.hasToken) {
                    # Save token to file for fallback
                    try {
                        $tokenVal = Invoke-RestMethod -Uri "$DaemonUrl/token" -TimeoutSec 1
                        if ($tokenVal) { Set-Content -Path $TokenFile -Value $tokenVal -NoNewline }
                    } catch {}
                    Write-Host "Authentication complete." -ForegroundColor Green
                    exit 0
                }
            } catch {}
        }
        Write-Host "Timed out. Falling back to manual token entry..." -ForegroundColor Yellow
    }

    # Fallback: traditional copy-paste auth
    $authUrl = if ($GW_DOMAIN) {
        "https://script.google.com/a/macros/$GW_DOMAIN/s/$DEPLOY_ID/exec?action=auth"
    } else {
        "$Base`?action=auth"
    }
    if (-not $_daemonAuth) {
        Write-Host "Opening browser for authentication..." -ForegroundColor Cyan
        Start-Process $authUrl
    }
    $token = Read-Host "Paste token"
    Set-Content -Path $TokenFile -Value $token -NoNewline
    Write-Host "Token saved." -ForegroundColor Green
    exit 0
}

if ($action -eq "token") {
    if ($remaining.Count -gt 0 -and $remaining[0] -ne "") {
        Set-Content -Path $TokenFile -Value $remaining[0] -NoNewline
        # Also send to daemon if running
        if (Daemon-IsRunning) {
            try {
                Invoke-RestMethod -Uri "$DaemonUrl/auth/callback" -Method Post `
                    -ContentType "application/json" `
                    -Body "{`"token`":`"$($remaining[0])`"}" -ErrorAction SilentlyContinue
            } catch {}
        }
        Write-Host "Token saved." -ForegroundColor Green
    } else {
        if ($GW_DOMAIN) {
            $authUrl = "https://script.google.com/a/macros/$GW_DOMAIN/s/$DEPLOY_ID/exec?action=auth"
        } else {
            $authUrl = "$Base`?action=auth"
        }
        Start-Process $authUrl
        Write-Output $authUrl
    }
    exit 0
}

# --- ACL management (local, no token required for command subcommand) ---
if ($action -eq "acl") {
    $PermFile = Join-Path $ProjectDir ".permission.json"

    # Ensure .permission.json exists
    if (-not (Test-Path $PermFile)) {
        Set-Content -Path $PermFile -Value "{}" -NoNewline
        Set-ItemProperty -Path $PermFile -Name IsReadOnly -Value $true
    }

    function Perm-Write {
        param([string]$Content)
        if (Test-Path $PermFile) {
            Set-ItemProperty -Path $PermFile -Name IsReadOnly -Value $false
        }
        Set-Content -Path $PermFile -Value $Content -NoNewline
        Set-ItemProperty -Path $PermFile -Name IsReadOnly -Value $true
    }

    function Perm-Read {
        return (Get-Content $PermFile -Raw | ConvertFrom-Json)
    }

    $aclTarget = if ($remaining.Count -gt 0) { $remaining[0] } else { "" }
    $aclRemaining = @(if ($remaining.Count -gt 1) { $remaining[1..($remaining.Count - 1)] })

    if ($aclTarget -eq "command") {
        $aclVerb = if ($aclRemaining.Count -gt 0) { $aclRemaining[0] } else { "" }
        $aclValue = if ($aclRemaining.Count -gt 1) { ($aclRemaining[1..($aclRemaining.Count - 1)]) -join " " } else { "" }

        switch ($aclVerb) {
            "" {
                Write-Host "Current .permission.json:" -ForegroundColor Cyan
                Get-Content $PermFile -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 10
            }
            "deny" {
                if (-not $aclValue) { Write-Error 'Usage: myg acl command deny "<command>"'; exit 1 }
                $perm = Perm-Read
                if ($perm.PSObject.Properties["allow"]) {
                    Write-Error "Cannot add deny rule when allow list exists. Use 'myg acl command reset' first."
                    exit 1
                }
                $denyList = @()
                if ($perm.PSObject.Properties["deny"]) { $denyList = @($perm.deny) }
                if ($aclValue -notin $denyList) { $denyList += $aclValue }
                $perm | Add-Member -NotePropertyName "deny" -NotePropertyValue $denyList -Force
                Perm-Write ($perm | ConvertTo-Json -Depth 10)
                Write-Host "Denied: $aclValue" -ForegroundColor Yellow
            }
            "allow" {
                if (-not $aclValue) { Write-Error 'Usage: myg acl command allow "<command>"'; exit 1 }
                $perm = Perm-Read
                if ($perm.PSObject.Properties["deny"]) {
                    Write-Error "Cannot add allow rule when deny list exists. Use 'myg acl command reset' first."
                    exit 1
                }
                $allowList = @()
                if ($perm.PSObject.Properties["allow"]) { $allowList = @($perm.allow) }
                if ($aclValue -notin $allowList) { $allowList += $aclValue }
                $perm | Add-Member -NotePropertyName "allow" -NotePropertyValue $allowList -Force
                Perm-Write ($perm | ConvertTo-Json -Depth 10)
                Write-Host "Allowed: $aclValue" -ForegroundColor Green
            }
            "remove" {
                if (-not $aclValue) { Write-Error 'Usage: myg acl command remove "<command>"'; exit 1 }
                if (-not [Environment]::UserInteractive) {
                    Write-Error "ACL change (remove) requires interactive terminal"; exit 1
                }
                Write-Host "This will remove '$aclValue' from the restriction list."
                $confirm = Read-Host "Proceed? [y/N]"
                if ($confirm -ne "y" -and $confirm -ne "Y") { Write-Host "Cancelled."; exit 0 }
                $perm = Perm-Read
                if ($perm.PSObject.Properties["deny"]) {
                    $filtered = @($perm.deny | Where-Object { $_ -ne $aclValue })
                    if ($filtered.Count -eq 0) {
                        $perm.PSObject.Properties.Remove("deny")
                    } else {
                        $perm.deny = $filtered
                    }
                }
                if ($perm.PSObject.Properties["allow"]) {
                    $filtered = @($perm.allow | Where-Object { $_ -ne $aclValue })
                    if ($filtered.Count -eq 0) {
                        $perm.PSObject.Properties.Remove("allow")
                    } else {
                        $perm.allow = $filtered
                    }
                }
                Perm-Write ($perm | ConvertTo-Json -Depth 10)
                Write-Host "Removed: $aclValue" -ForegroundColor Yellow
            }
            "reset" {
                if (-not [Environment]::UserInteractive) {
                    Write-Error "ACL change (reset) requires interactive terminal"; exit 1
                }
                Write-Host "WARNING: This will clear ALL permission restrictions."
                $confirm = Read-Host "Proceed? [y/N]"
                if ($confirm -ne "y" -and $confirm -ne "Y") { Write-Host "Cancelled."; exit 0 }
                Perm-Write "{}"
                Write-Host "All restrictions cleared." -ForegroundColor Green
            }
            default {
                Write-Error "Unknown acl command verb: $aclVerb"
                Write-Host 'Usage: myg acl command [deny|allow|remove|reset] ["<command>"]'
                exit 1
            }
        }
    } elseif ($aclTarget -eq "file") {
        $aclFileId = if ($aclRemaining.Count -gt 0) { $aclRemaining[0] } else { "" }
        $aclFileVerb = if ($aclRemaining.Count -gt 1) { $aclRemaining[1] } else { "" }

        if (-not $aclFileId) {
            Write-Error "Usage: myg acl file <FILE_ID> [deny|readonly|allow]"
            exit 1
        }

        # Load token for file ACL operations
        if (Test-Path $TokenFile) {
            $script:AccessToken = (Get-Content $TokenFile -Raw).Trim()
        } else {
            Write-Error "No credentials. Run: myg auth"
            exit 1
        }

        switch ($aclFileVerb) {
            "" {
                Format-Output (Invoke-Api -Method GET -Query @{ action = "file:props"; id = $aclFileId })
            }
            "deny" {
                if (-not [Environment]::UserInteractive) {
                    Write-Error "ACL change requires interactive terminal"; exit 1
                }
                Write-Host "WARNING: This will DENY all myg access (read & write) to this file."
                $confirm = Read-Host "Proceed? [y/N]"
                if ($confirm -ne "y" -and $confirm -ne "Y") { Write-Host "Cancelled."; exit 0 }
                Format-Output (Invoke-Api -Method POST -Body @{ action = "file:props:set"; id = $aclFileId; value = "-" })
            }
            "readonly" {
                if (-not [Environment]::UserInteractive) {
                    Write-Error "ACL change requires interactive terminal"; exit 1
                }
                Write-Host "This will set the file to READ-ONLY via myg."
                $confirm = Read-Host "Proceed? [y/N]"
                if ($confirm -ne "y" -and $confirm -ne "Y") { Write-Host "Cancelled."; exit 0 }
                Format-Output (Invoke-Api -Method POST -Body @{ action = "file:props:set"; id = $aclFileId; value = "r" })
            }
            "allow" {
                if (-not [Environment]::UserInteractive) {
                    Write-Error "ACL change requires interactive terminal"; exit 1
                }
                Write-Host "This will set the file to READ+WRITE via myg."
                $confirm = Read-Host "Proceed? [y/N]"
                if ($confirm -ne "y" -and $confirm -ne "Y") { Write-Host "Cancelled."; exit 0 }
                Format-Output (Invoke-Api -Method POST -Body @{ action = "file:props:set"; id = $aclFileId; value = "w" })
            }
            default {
                Write-Error "Unknown verb: $aclFileVerb"
                Write-Host "Usage: myg acl file <FILE_ID> [deny|readonly|allow]"
                exit 1
            }
        }
    } else {
        Write-Host 'Usage: myg acl command [deny|allow|remove|reset] ["<command>"]'
        Write-Host "       myg acl file <FILE_ID> [deny|readonly|allow]"
        exit 1
    }
    exit 0
}

# Load token
if (Test-Path $TokenFile) {
    $script:AccessToken = (Get-Content $TokenFile -Raw).Trim()
} else {
    Write-Error "No credentials. Run: myg auth"
    exit 1
}

$parsed = Parse-Args $remaining
$flags = $parsed["_flags"]

# Detect subaction
$subaction = ""
if ($remaining.Count -gt 0 -and $remaining[0] -notmatch '=') {
    $subaction = $remaining[0]
    $remaining = @(if ($remaining.Count -gt 1) { $remaining[1..($remaining.Count - 1)] })
    $parsed = Parse-Args $remaining
    $flags = $parsed["_flags"]
}

function Get-Val { param([string]$key, [string]$default = "") ; if ($parsed.ContainsKey($key)) { $parsed[$key] } else { $default } }

# Permission check via .permission.json
function Check-Permission {
    param([string]$FullAction)
    $permFile = Join-Path $ProjectDir ".permission.json"
    if (-not (Test-Path $permFile)) { return }
    $perm = Get-Content $permFile -Raw | ConvertFrom-Json

    if ($perm.PSObject.Properties["allow"]) {
        if ($FullAction -notin @($perm.allow)) {
            Write-Error "Action '$FullAction' is not in allow list. Check .permission.json"
            exit 1
        }
    }

    if ($perm.PSObject.Properties["deny"]) {
        if ($FullAction -in @($perm.deny)) {
            Write-Error "Action '$FullAction' is denied. Check .permission.json"
            exit 1
        }
    }
}

# Resolve full action name for permission check
$fullAction = $action
if ($subaction) { $fullAction = "$action $subaction" }
Check-Permission $fullAction

switch ($action) {
    # --- Files search (GET) ---
    { $_ -eq "files" -and $subaction -eq "search" } {
        Format-Output (Invoke-Api -Method GET -Query @{
            action = "files:search"; q = (Get-Val "q"); max = (Get-Val "max" "20")
        })
        break
    }

    # --- Tasks completed (GET) ---
    { $_ -eq "tasks" -and $subaction -eq "completed" } {
        Format-Output (Invoke-Api -Method GET -Query @{
            action = "tasks:completed"; id = (Get-Val "id")
        })
        break
    }

    # --- Contacts search (GET with query) ---
    { $_ -eq "contacts" -and $subaction -eq "search" } {
        Format-Output (Invoke-Api -Method GET -Query @{
            action = "contacts:search"; q = (Get-Val "q"); max = (Get-Val "max" "20")
        })
        break
    }

    # --- Form responses (GET) ---
    { $_ -eq "form" -and $subaction -eq "responses" } {
        Format-Output (Invoke-Api -Method GET -Query @{
            action = "form:responses"; id = (Get-Val "id")
        })
        break
    }

    # --- Form create/additem (POST) ---
    { $_ -eq "form" -and $subaction -in "create", "additem" } {
        $body = @{
            action = "form:$subaction"; id = Get-Val "id"; name = Get-Val "name"
            description = Get-Val "description"; type = Get-Val "type"; title = Get-Val "title"
            choices = Get-Val "choices"; required = if ("required" -in $flags) { "true" } else { "" }
            low = Get-Val "low"; high = Get-Val "high"
            lowLabel = Get-Val "lowLabel"; highLabel = Get-Val "highLabel"
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Slide subcommands (POST) ---
    { $_ -eq "slide" -and $subaction -in "create", "addpage", "addtext", "overwrite" } {
        $text = Get-Val "text"
        if ($subaction -in "addtext", "create", "overwrite" -and -not $text) { $text = Read-Stdin }
        $body = @{
            action = "slide:$subaction"; id = Get-Val "id"; name = Get-Val "name"
            page = Get-Val "page"; text = $text; format = Get-Val "format"
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Slide notes (GET) ---
    { $_ -eq "slide" -and $subaction -eq "notes" } {
        $q = @{ action = "slide:notes"; id = Get-Val "id" }
        $page = Get-Val "page"
        if ($page) { $q["page"] = $page }
        Format-Output (Invoke-Api -Method GET -Query $q)
        break
    }

    # --- Slide note set/clear (POST) ---
    { $_ -eq "slide" -and $subaction -eq "note" } {
        $sub2 = if ($remaining.Count -gt 0 -and $remaining[0] -notmatch '=') { $remaining[0] } else { "" }
        if ($sub2 -eq "set") {
            $remaining = @(if ($remaining.Count -gt 1) { $remaining[1..($remaining.Count - 1)] })
            $parsed = Parse-Args $remaining
            $text = Read-Stdin
            if (-not $text) { Write-Error "No note text provided via stdin"; exit 1 }
            Format-Output (Invoke-Api -Method POST -Body @{
                action = "slide:note:set"; id = Get-Val "id"; page = Get-Val "page"; text = $text
            })
        } elseif ($sub2 -eq "clear") {
            $remaining = @(if ($remaining.Count -gt 1) { $remaining[1..($remaining.Count - 1)] })
            $parsed = Parse-Args $remaining
            Format-Output (Invoke-Api -Method POST -Body @{
                action = "slide:note:clear"; id = Get-Val "id"; page = Get-Val "page"
            })
        } else {
            Write-Error "Unknown note subcommand. Use: set, clear"; exit 1
        }
        break
    }

    # --- Comment create/update/delete (POST + stdin) ---
    { $_ -eq "comment" -and $subaction -in "create", "update", "delete" } {
        if ($subaction -eq "delete") {
            $body = @{ action = "comment:delete"; id = Get-Val "id"; comment = Get-Val "comment" }
        } else {
            $text = Read-Stdin
            if (-not $text) { Write-Error "No comment text provided via stdin"; exit 1 }
            $body = @{ action = "comment:$subaction"; id = Get-Val "id"; comment = Get-Val "comment"; text = $text }
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- File history (GET) ---
    { $_ -eq "file" -and $subaction -eq "history" } {
        Format-Output (Invoke-Api -Method GET -Query @{
            action = "file:history"; id = (Get-Val "id"); max = (Get-Val "max" "20")
        })
        break
    }

    # --- File diff (server-side diff) ---
    { $_ -eq "file" -and $subaction -eq "diff" } {
        Format-Output (Invoke-Api -Method GET -Query @{
            action = "file:revision"; id = (Get-Val "id")
            rev1 = (Get-Val "rev1"); rev2 = (Get-Val "rev2")
        })
        break
    }

    # --- File upload (POST with base64) ---
    { $_ -eq "file" -and $subaction -eq "upload" } {
        $filePath = Get-Val "file"
        if ($filePath) {
            $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $filePath))
            $data = [Convert]::ToBase64String($bytes)
            $isBase64 = "true"
            $mimeType = "application/octet-stream"
        } elseif ($script:PipelineInput -or [Console]::IsInputRedirected) {
            $data = Read-Stdin
            $isBase64 = ""; $mimeType = ""
        } else {
            Write-Error "file= parameter or stdin required"; exit 1
        }
        $body = @{
            action = "file:upload"; folder = Get-Val "folder"; name = Get-Val "name"
            data = $data; isBase64 = $isBase64; mimeType = $mimeType
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- File move/copy/mkdir (POST) ---
    { $_ -eq "file" -and $subaction -in "move", "copy", "rename", "shortcut", "mkdir" } {
        $body = @{
            action = "file:$subaction"; id = Get-Val "id"
            folder = Get-Val "folder"; name = Get-Val "name"
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- File share (GET=list, POST=add) ---
    { $_ -eq "file" -and $subaction -eq "share" } {
        $role = Get-Val "role"
        if (-not $role) {
            Format-Output (Invoke-Api -Method GET -Query @{ action = "file:share"; id = (Get-Val "id") })
        } else {
            $shareType = Get-Val "type" "user"
            $shareValue = if ($shareType -eq "domain") { Get-Val "domain" } else { Get-Val "email" }
            $body = @{ action = "file:share"; id = Get-Val "id"; type = $shareType; role = $role; value = $shareValue }
            Format-Output (Invoke-Api -Method POST -Body $body)
        }
        break
    }

    # --- File unshare (POST) ---
    { $_ -eq "file" -and $subaction -eq "unshare" } {
        $body = @{ action = "file:unshare"; id = Get-Val "id"; permission = Get-Val "permission" }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Mail filters (GET) ---
    { $_ -eq "mail" -and $subaction -eq "filters" } {
        Format-Output (Invoke-Api -Method GET -Query @{ action = "mail:filters" })
        break
    }

    # --- Mail labels (GET) ---
    { $_ -eq "mail" -and $subaction -eq "labels" } {
        Format-Output (Invoke-Api -Method GET -Query @{ action = "mail:labels" })
        break
    }

    # --- Mail filter create/delete (POST) ---
    { $_ -eq "mail" -and $subaction -eq "filter" } {
        $filterSub = if ($remaining.Count -gt 0 -and $remaining[0] -notmatch '=') { $remaining[0] } else { "" }
        if ($filterSub) {
            $remaining = @(if ($remaining.Count -gt 1) { $remaining[1..($remaining.Count - 1)] })
            $parsed = Parse-Args $remaining; $flags = $parsed["_flags"]
        }
        $body = @{
            action = "mail:filter:$filterSub"; id = Get-Val "id"
            query = Get-Val "q"; label = Get-Val "label"
            skipInbox = if ("skipInbox" -in $flags) { "true" } else { "" }
            markAsRead = if ("markAsRead" -in $flags) { "true" } else { "" }
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Mail label (POST) ---
    { $_ -eq "mail" -and $subaction -eq "label" } {
        $body = @{
            action = "mail:label"; query = Get-Val "q"; label = Get-Val "label"
            skipInbox = if ("skipInbox" -in $flags) { "true" } else { "" }
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Mail draft delete (POST) ---
    { $_ -eq "mail" -and $subaction -eq "draft" -and "delete" -in $flags } {
        Format-Output (Invoke-Api -Method POST -Body @{
            action = "mail:draft:delete"; id = Get-Val "id"
        })
        break
    }

    # --- Mail draft create/update (POST + stdin) ---
    { $_ -eq "mail" -and $subaction -eq "draft" } {
        $body = @{
            action = "mail:draft"; id = Get-Val "id"
            to = Get-Val "to"; subject = Get-Val "subject"; text = Read-Stdin
            cc = Get-Val "cc"; bcc = Get-Val "bcc"
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- GAS subcommands (GET) ---
    { $_ -eq "gas" -and $subaction -in "info", "list", "files", "file" } {
        $q = @{ action = "gas:$subaction" }
        $script = Get-Val "script"
        if ($script) { $q["script"] = $script }
        $name = Get-Val "name"
        if ($name) { $q["name"] = $name }
        $max = Get-Val "max"
        if ($max) { $q["max"] = $max }
        Format-Output (Invoke-Api -Method GET -Query $q)
        break
    }

    # --- Event freebusy (GET) ---
    { $_ -eq "event" -and $subaction -eq "freebusy" } {
        Format-Output (Invoke-Api -Method GET -Query @{
            action = "event:freebusy"; emails = Get-Val "emails"
            from = Get-Val "from"; to = Get-Val "to"; duration = Get-Val "duration"
        })
        break
    }

    # --- Event rooms (GET) ---
    { $_ -eq "event" -and $subaction -eq "rooms" } {
        Format-Output (Invoke-Api -Method GET -Query @{
            action = "rooms"; q = Get-Val "q"
        })
        break
    }

    # --- Event create/update/delete (POST) ---
    { $_ -eq "event" -and $subaction -in "create", "update", "delete" } {
        $body = @{
            action = "event:$subaction"; id = Get-Val "id"; event = Get-Val "event"
            title = Get-Val "title"; start = Get-Val "start"; end = Get-Val "end"
            location = Get-Val "location"; color = Get-Val "color"
            description = Get-Val "description"
            guests = Get-Val "guests"; visibility = Get-Val "visibility"
            reminders = Get-Val "reminders"
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Task subcommands (POST) ---
    { $_ -eq "task" -and $subaction -in "create", "done", "update", "delete" } {
        $body = @{
            action = "task:$subaction"; id = Get-Val "id"; title = Get-Val "title"
            due = Get-Val "due"; task = Get-Val "task"; notes = Get-Val "notes"
            parent = Get-Val "parent"
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Tasklist subcommands (POST) ---
    { $_ -eq "tasklist" -and $subaction -in "create", "update", "delete" } {
        $body = @{
            action = "tasklist:$subaction"; id = Get-Val "id"; title = Get-Val "title"
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Spreadsheet create (POST) ---
    { $_ -eq "spreadsheet" -and $subaction -eq "create" } {
        Format-Output (Invoke-Api -Method POST -Body @{
            action = "spreadsheet:create"; name = Get-Val "name"
        })
        break
    }

    # --- Sheet create (POST) ---
    { $_ -eq "sheet" -and $subaction -eq "create" } {
        Format-Output (Invoke-Api -Method POST -Body @{
            action = "sheet:create"; id = Get-Val "id"; name = Get-Val "name"
        })
        break
    }

    # --- Sheet delete (POST) ---
    { $_ -eq "sheet" -and $subaction -eq "delete" } {
        Format-Output (Invoke-Api -Method POST -Body @{
            action = "sheet:delete"; id = Get-Val "id"; name = Get-Val "name"
        })
        break
    }

    # --- Sheet rename (POST) ---
    { $_ -eq "sheet" -and $subaction -eq "rename" } {
        Format-Output (Invoke-Api -Method POST -Body @{
            action = "sheet:rename"; id = Get-Val "id"; name = Get-Val "name"
            newName = Get-Val "newname"
        })
        break
    }

    # --- Sheet write (POST + stdin) ---
    { $_ -eq "sheet" -and $subaction -eq "write" } {
        $text = Read-Stdin
        if (-not $text) { Write-Error "No data provided via stdin"; exit 1 }
        $body = @{
            action = "sheet:write"; id = Get-Val "id"; name = Get-Val "name"
            range = (Get-Val "range" "A1"); text = $text
            header = (Get-Val "header")
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Sheet lastrow (GET) ---
    { $_ -eq "sheet" -and $subaction -eq "lastrow" } {
        $q = @{ action = "sheet:lastrow"; id = Get-Val "id"; name = Get-Val "name" }
        Format-Output (Invoke-Api -Method GET -Query $q)
        break
    }

    # --- Sheet notes (GET) ---
    { $_ -eq "sheet" -and $subaction -eq "notes" } {
        $q = @{ action = "sheet:notes"; id = Get-Val "id"; name = Get-Val "name" }
        $range = Get-Val "range"
        if ($range) { $q["range"] = $range }
        Format-Output (Invoke-Api -Method GET -Query $q)
        break
    }

    # --- Sheet note set/clear (POST) ---
    { $_ -eq "sheet" -and $subaction -eq "note" } {
        $sub2 = if ($remaining.Count -gt 0 -and $remaining[0] -notmatch '=') { $remaining[0] } else { "" }
        if ($sub2 -eq "set") {
            $remaining = @(if ($remaining.Count -gt 1) { $remaining[1..($remaining.Count - 1)] })
            $parsed = Parse-Args $remaining
            $text = Read-Stdin
            if (-not $text) { Write-Error "No note text provided via stdin"; exit 1 }
            Format-Output (Invoke-Api -Method POST -Body @{
                action = "sheet:note:set"; id = Get-Val "id"; name = Get-Val "name"
                cell = Get-Val "cell"; text = $text
            })
        } elseif ($sub2 -eq "clear") {
            $remaining = @(if ($remaining.Count -gt 1) { $remaining[1..($remaining.Count - 1)] })
            $parsed = Parse-Args $remaining
            Format-Output (Invoke-Api -Method POST -Body @{
                action = "sheet:note:clear"; id = Get-Val "id"; name = Get-Val "name"
                cell = Get-Val "cell"
            })
        } else {
            Write-Error "Unknown note subcommand. Use: set, clear"; exit 1
        }
        break
    }

    # --- Sheet color (POST) ---
    { $_ -eq "sheet" -and $subaction -eq "color" } {
        $range = Get-Val "range"
        $cell = Get-Val "cell"
        $target = if ($range) { $range } else { $cell }
        if (-not $target) { Write-Error "Specify range= or cell= for the target cells"; exit 1 }
        $color = Get-Val "color"
        if (-not $color) { Write-Error "Specify color= (e.g., color=#ff0000 or color=- to clear)"; exit 1 }
        Format-Output (Invoke-Api -Method POST -Body @{
            action = "sheet:color"; id = Get-Val "id"; name = Get-Val "name"
            range = $target; color = $color
        })
        break
    }

    # --- Doc subcommands (POST + stdin) ---
    { $_ -eq "doc" -and $subaction -in "create", "append", "overwrite", "addtab", "renametab", "movetab", "copytab" } {
        $body = @{
            action = "doc:$subaction"; id = Get-Val "id"; name = Get-Val "name"
            text = Read-Stdin; format = Get-Val "format"
            tab = Get-Val "tab"; index = Get-Val "index"; parent = Get-Val "parent"
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Default: GET with all args as query params ---
    default {
        $query = @{ action = $action }
        if ($subaction) {
            # subaction wasn't consumed, put it back as first arg
            $allArgs = @($subaction) + $remaining
            $parsed = Parse-Args $allArgs
        }
        foreach ($k in $parsed.Keys) {
            if ($k -ne "_flags") { $query[$k] = $parsed[$k] }
        }
        Format-Output (Invoke-Api -Method GET -Query $query)
    }
}
