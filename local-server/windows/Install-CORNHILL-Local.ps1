[CmdletBinding()]
param(
  [switch]$SkipDatabase,
  [switch]$RunTests
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Stop-WithGuidance([string]$Message) {
  Write-Host ""
  Write-Host "CORNHILL LOCAL SETUP STOPPED: $Message" -ForegroundColor Red
  exit 1
}
function Require-Command([string]$Name,[string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Stop-WithGuidance "$Name is missing. $InstallHint"
  }
}
$os = Get-CimInstance Win32_OperatingSystem
if ([int]$os.BuildNumber -lt 19041) {
  Stop-WithGuidance "Windows 10 version 2004 or newer, or Windows 11, is required."
}
Write-Host "CORNHILL LOCAL DEVELOPMENT SETUP" -ForegroundColor Cyan
Write-Host "This installs an isolated local database foundation. It does NOT replace the live CORNHILL app."
Require-Command "node" "Install Node.js 22 LTS, then reopen PowerShell."
Require-Command "npm" "Install Node.js 22 LTS, then reopen PowerShell."
$nodeMajor = [int]((node --version).Trim().TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) { Stop-WithGuidance "Node.js 22 or newer is required. Found $(node --version)." }
if (-not $SkipDatabase) {
  Require-Command "docker" "Install Docker Desktop and enable its Linux container engine."
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Docker Desktop is installed but not running. Start Docker Desktop and retry." }
}
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  $secret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36)).TrimEnd("=").Replace("+","-").Replace("/","_")
  $envText = Get-Content ".env" -Raw
  $envText = $envText.Replace("REPLACE_WITH_A_LONG_RANDOM_PASSWORD",$secret)
  Set-Content -Path ".env" -Value $envText -NoNewline
  Write-Host "Created a private local .env file with a generated database password."
} else {
  Write-Host "Existing .env found; leaving it unchanged."
}
Write-Host "Installing pinned Node dependencies..."
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "npm dependency installation failed." }
if ($RunTests) {
  Write-Host "Running local Windows tests..."
  npm test
  if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Windows test suite failed. No database migration was run." }
}
if (-not $SkipDatabase) {
  Write-Host "Starting the isolated PostgreSQL 17 service..."
  docker compose up -d database
  if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "PostgreSQL did not start. Existing CORNHILL hosted service is unchanged." }
  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    docker compose exec -T database pg_isready -U cornhill_local_admin -d cornhill_local *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) { Stop-WithGuidance "PostgreSQL did not become ready. Preserve the volume; inspect docker compose logs database." }
  $env:CORNHILL_ALLOW_LOCAL_MIGRATIONS = "true"
  $env:CORNHILL_DB_TARGET = "local-development"
  try {
    Write-Host "Applying local-only database migrations..."
    npm run db:migrate
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Local migrations failed. Do not delete the database volume." }
    Write-Host "Verifying local schema..."
    npm run db:verify
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Identity/schema verification failed." }
    npm run db:verify-auth
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Authentication repository verification failed." }
    npm run db:verify-runtime
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Runtime role verification failed." }
    npm run db:verify-school
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "School schema verification failed." }
  } finally {
    Remove-Item Env:CORNHILL_ALLOW_LOCAL_MIGRATIONS -ErrorAction SilentlyContinue
    Remove-Item Env:CORNHILL_DB_TARGET -ErrorAction SilentlyContinue
  }
}
Write-Host ""
Write-Host "LOCAL FOUNDATION SETUP COMPLETED" -ForegroundColor Green
Write-Host "Database: localhost port 54329 (loopback only)."
Write-Host "Data volume: cornhill-local-postgres-data. Do not run docker compose down -v."
Write-Host "The full local school app, staff sign-in, LAN access and offline sync are NOT enabled yet."
