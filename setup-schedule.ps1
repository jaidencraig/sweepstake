# World Cup 2026 Sweepstake — Auto-refresh Setup
# Run this ONCE from PowerShell to schedule a live data refresh every 3 hours.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File C:\sweepstake\setup-schedule.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = "C:\sweepstake"

Write-Host ""
Write-Host "  World Cup 2026 Sweepstake — Scheduler Setup"
Write-Host "  ============================================"
Write-Host ""

# ─── 1. Get API key ───────────────────────────────────────────────────────────

$apiKey = $env:WC_API_KEY

if (-not $apiKey) {
    $configPath = Join-Path $ScriptDir "config.json"
    if (Test-Path $configPath) {
        try {
            $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
            $apiKey = $cfg.WC_API_KEY
            if ($apiKey) { Write-Host "  Found existing API key in config.json" }
        } catch {}
    }
}

if (-not $apiKey) {
    Write-Host "  Enter your football-data.org API key"
    Write-Host "  (get one free at https://www.football-data.org/client/register)"
    Write-Host ""
    $apiKey = Read-Host "  API Key"
}

if (-not $apiKey) {
    Write-Host "  No API key provided. Exiting." -ForegroundColor Red
    exit 1
}

# ─── 2. Save key to config.json ───────────────────────────────────────────────

$configPath = Join-Path $ScriptDir "config.json"
"{`"WC_API_KEY`": `"$apiKey`"}" | Set-Content $configPath -Encoding utf8
Write-Host "  API key saved to config.json" -ForegroundColor Green

# ─── 3. Find node.exe ─────────────────────────────────────────────────────────

try {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
} catch {
    Write-Host "  Node.js not found. Install it from https://nodejs.org then re-run this script." -ForegroundColor Red
    exit 1
}
Write-Host "  Node.js: $nodePath"

# ─── 4. Write run-fetch.bat (avoids any quoting issues with spaces in paths) ──

$batPath = Join-Path $ScriptDir "run-fetch.bat"
$batContent = "@echo off`r`n`"$nodePath`" `"$ScriptDir\fetch-data.js`"`r`n"
[System.IO.File]::WriteAllText($batPath, $batContent, [System.Text.Encoding]::ASCII)
Write-Host "  Created run-fetch.bat"

# ─── 5. Create scheduled task (every 3 hours) ─────────────────────────────────

$taskName = "WC2026Sweepstake"

# Remove existing task silently
schtasks /delete /tn $taskName /f 2>$null | Out-Null

# Create new task — HOURLY with /MO 3 = every 3 hours, starting at midnight
$result = schtasks /create `
    /tn $taskName `
    /tr "`"$batPath`"" `
    /sc HOURLY /mo 3 /st 00:00 `
    /ru $env:USERNAME /f 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Could not create scheduled task automatically." -ForegroundColor Yellow
    Write-Host "  You can still refresh manually by running: node C:\sweepstake\fetch-data.js"
} else {
    Write-Host "  Scheduled task created (runs every 3 hours)" -ForegroundColor Green
}

# ─── 6. Run first sync now ────────────────────────────────────────────────────

Write-Host ""
Write-Host "  Running first data sync now..."
Write-Host ""

& $nodePath (Join-Path $ScriptDir "fetch-data.js")

Write-Host ""
Write-Host "  Done! The sweepstake will now refresh automatically every 3 hours."
Write-Host "  Reload your browser whenever you want the latest data."
Write-Host ""
