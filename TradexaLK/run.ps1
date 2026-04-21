$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $projectRoot "backend"
$frontendPath = Join-Path $projectRoot "frontend"
$backendActivate = Join-Path $backendPath ".venv\Scripts\Activate.ps1"

if (-not (Test-Path $backendPath)) {
    throw "Backend folder not found: $backendPath"
}

if (-not (Test-Path $frontendPath)) {
    throw "Frontend folder not found: $frontendPath"
}

$backendCommand = @(
    "Set-Location '$backendPath'"
    "if (Test-Path '$backendActivate') { . '$backendActivate' }"
    "uvicorn app.main:app --reload"
) -join "; "

$frontendCommand = @(
    "Set-Location '$frontendPath'"
    "npm run dev"
) -join "; "

Start-Process pwsh -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand | Out-Null
Start-Process pwsh -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand | Out-Null

Write-Host "Started backend and frontend in separate terminals."
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:8000"
Write-Host "Docs:     http://localhost:8000/docs"
