#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

$Base = "https://script.google.com/macros/s/$DEPLOY_ID/exec"

function Show-Help {
    @"
myg - My Google Workspace CLI

Usage: myg <action> [key=value ...]

Actions:
  auth                          Authenticate via browser and save token
  spreadsheets [max=<N>]        List all spreadsheets (default: 20)
  spreadsheet id=<ID or URL>    List sheets in a spreadsheet
  sheet id=<ID or URL> name=<SHEET>  Get sheet data
  sheet create id=<ID or URL> name=<SHEET>  Create new sheet
  sheet write id=<ID or URL> name=<SHEET> [range=A1]  Write CSV data from stdin
  docs [max=<N>]                List all documents (default: 20)
  doc id=<ID or URL>            Get document content
  doc create name="TITLE"       Create new document (stdin for body)
  doc append id=<ID or URL>     Append text from stdin
  doc overwrite id=<ID or URL>  Overwrite with text from stdin
    Note: Add format=markdown to convert Markdown with styling
  mails [q=<QUERY>] [max=<N>]  List emails (default: inbox, 20)
  mail id=<MESSAGE_ID>          Get email content
  mail draft to=<ADDR> subject="..." (stdin for body)  Create draft
  mail draft id=<DRAFT_ID> to=<ADDR> subject="..." (stdin for body)  Update draft
  mail draft delete id=<DRAFT_ID>  Delete draft
  mail filters                    List Gmail filters
  mail filter create q="<QUERY>" label="<LABEL>"  Create filter
  mail filter delete id=<FILTER_ID>  Delete filter
  files [id=<FOLDER_ID>] [max=<N>]  List Drive files (default: root, 20)
  files search q=<QUERY> [max=<N>]  Search files across Drive
  file id=<FILE_ID>               Download file content
  file upload folder=<FOLDER_ID> name=<NAME> file=<PATH>  Upload file
  file move id=<FILE_ID> folder=<FOLDER_ID>  Move file
  file copy id=<FILE_ID> [folder=<FOLDER_ID>] [name=<NAME>]  Copy file
  file history id=<FILE_ID> [max=<N>]  List revision history
  file diff id=<FILE_ID> rev1=<REV_ID> rev2=<REV_ID>  Diff two revisions
  slides [max=<N>]                List all presentations (default: 20)
  slide id=<ID or URL>            Get all slide content
  slide id=<ID or URL> page=<N>   Get specific page content
  slide create name="TITLE"       Create new presentation
  slide addpage id=<ID or URL>    Add blank page
  slide addtext id=<ID or URL> page=<N> text="TEXT"  Add text box (or stdin)
  forms [max=<N>]               List all forms (default: 20)
  form id=<ID or URL>           Get form detail (questions)
  form responses id=<ID or URL> Get form responses
  form create name="TITLE" [description="..."]  Create new form
  form additem id=<ID> type=<TYPE> title="Q" [choices="A,B,C"] [required]
    Types: text, paragraph, choice, checkbox, dropdown, scale
    Scale options: low=1 high=5 lowLabel="Low" highLabel="High"
  tasklists                     List task lists
  tasks id=<TASKLIST_ID>        List tasks in a task list
  task create id=<TASKLIST_ID> title="TITLE" [due=YYYY-MM-DD] [notes="..."]  Create task
  task update id=<TASKLIST_ID> task=<TASK_ID> [title=...] [due=...] [notes="..."]  Update task
  task delete id=<TASKLIST_ID> task=<TASK_ID>  Delete task
  task done id=<TASKLIST_ID> task=<TASK_ID>  Complete task
  contacts [max=<N>]            List personal contacts (default: 20)
  contacts search q=<QUERY> [max=<N>]  Search organization directory
  contact id=<RESOURCE_NAME>    Get contact detail (relations, externalIds, etc.)
  calendars                     List calendars
  events id=<CAL_ID> [from=YYYY-MM-DD] [to=YYYY-MM-DD]  List events (default: next 7 days)
  event create id=<CAL_ID> title="TITLE" start=<ISO> end=<ISO> [location=<LOC>]  Create event
    Note: id=self or omit id to use your default calendar
  event freebusy emails=<EMAIL,EMAIL,...> [from=YYYY-MM-DD] [to=YYYY-MM-DD] [duration=<MIN>]
    Find free time slots across multiple people (default: today, 30min)
"@
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
    if ([Console]::IsInputRedirected) {
        return [Console]::In.ReadToEnd()
    }
    return ""
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
        $resp = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -MaximumRedirection 5
    } else {
        $json = $Body | ConvertTo-Json -Depth 10 -Compress
        $resp = Invoke-RestMethod -Uri $Base -Headers $headers -Method Post -Body $json -ContentType "application/json; charset=utf-8" -MaximumRedirection 5
    }
    return $resp
}

function Format-Output {
    param($Response)
    if ($Response -is [string] -and $Response -match '(?i)<html') {
        Write-Error "Received HTML response. Your token may have expired.`nRun: myg auth"
        exit 1
    }
    if ($Response -is [string]) {
        try { $Response | ConvertFrom-Json | ConvertTo-Json -Depth 20 }
        catch { $Response }
    } else {
        $Response | ConvertTo-Json -Depth 20
    }
}

# --- Main ---
$action = if ($args.Count -gt 0) { $args[0] } else { "--help" }
$remaining = if ($args.Count -gt 1) { $args[1..($args.Count - 1)] } else { @() }

if ($action -in "--help", "-h", "help") { Show-Help }

# Auth
if ($action -eq "auth") {
    $authUrl = "$Base`?action=auth"
    Write-Host "Opening browser for authentication..." -ForegroundColor Cyan
    Start-Process $authUrl
    $token = Read-Host "Paste token"
    Set-Content -Path $TokenFile -Value $token -NoNewline
    Write-Host "Token saved." -ForegroundColor Green
    exit 0
}

# Load token
if (Test-Path $TokenFile) {
    $script:AccessToken = (Get-Content $TokenFile -Raw).Trim()
} elseif (Test-Path "$env:USERPROFILE\.clasprc.json") {
    $clasp = Get-Content "$env:USERPROFILE\.clasprc.json" -Raw | ConvertFrom-Json
    $script:AccessToken = $clasp.token.access_token
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
    $remaining = if ($remaining.Count -gt 1) { $remaining[1..($remaining.Count - 1)] } else { @() }
    $parsed = Parse-Args $remaining
    $flags = $parsed["_flags"]
}

function Get-Val { param([string]$key, [string]$default = "") ; if ($parsed.ContainsKey($key)) { $parsed[$key] } else { $default } }

switch ($action) {
    # --- Files search (GET) ---
    { $_ -eq "files" -and $subaction -eq "search" } {
        Format-Output (Invoke-Api -Method GET -Query @{
            action = "files:search"; q = (Get-Val "q"); max = (Get-Val "max" "20")
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
        } elseif ([Console]::IsInputRedirected) {
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

    # --- File move/copy (POST) ---
    { $_ -eq "file" -and $subaction -in "move", "copy" } {
        $body = @{
            action = "file:$subaction"; id = Get-Val "id"
            folder = Get-Val "folder"; name = Get-Val "name"
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Mail filters (GET) ---
    { $_ -eq "mail" -and $subaction -eq "filters" } {
        Format-Output (Invoke-Api -Method GET -Query @{ action = "mail:filters" })
        break
    }

    # --- Mail filter create/delete (POST) ---
    { $_ -eq "mail" -and $subaction -eq "filter" } {
        $filterSub = if ($remaining.Count -gt 0 -and $remaining[0] -notmatch '=') { $remaining[0] } else { "" }
        if ($filterSub) {
            $remaining = if ($remaining.Count -gt 1) { $remaining[1..($remaining.Count - 1)] } else { @() }
            $parsed = Parse-Args $remaining; $flags = $parsed["_flags"]
        }
        $body = @{
            action = "mail:filter:$filterSub"; id = Get-Val "id"
            query = Get-Val "q"; label = Get-Val "label"
            skipInbox = if ("skipInbox" -in $flags) { "true" } else { "" }
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
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
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

    # --- Event create (POST) ---
    { $_ -eq "event" -and $subaction -eq "create" } {
        $body = @{
            action = "event:create"; id = Get-Val "id"; title = Get-Val "title"
            start = Get-Val "start"; end = Get-Val "end"; location = Get-Val "location"
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Task subcommands (POST) ---
    { $_ -eq "task" -and $subaction -in "create", "done", "update", "delete" } {
        $body = @{
            action = "task:$subaction"; id = Get-Val "id"; title = Get-Val "title"
            due = Get-Val "due"; task = Get-Val "task"; notes = Get-Val "notes"
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

    # --- Sheet write (POST + stdin) ---
    { $_ -eq "sheet" -and $subaction -eq "write" } {
        $text = Read-Stdin
        if (-not $text) { Write-Error "No data provided via stdin"; exit 1 }
        $body = @{
            action = "sheet:write"; id = Get-Val "id"; name = Get-Val "name"
            range = (Get-Val "range" "A1"); text = $text
        }
        Format-Output (Invoke-Api -Method POST -Body $body)
        break
    }

    # --- Doc subcommands (POST + stdin) ---
    { $_ -eq "doc" -and $subaction -in "create", "append", "overwrite" } {
        $body = @{
            action = "doc:$subaction"; id = Get-Val "id"; name = Get-Val "name"
            text = Read-Stdin; format = Get-Val "format"
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
