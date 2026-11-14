[CmdletBinding()]
param([switch]$SkipDatabase,[switch]$RunTests)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
function Stop-WithGuidance([string]$Message) {
  Write-Host ""
  Write-Host "CORNHILL LOCAL SETUP STOPPED: $Message" -ForegroundColor Red
  exit 1
}
function Require-Command([string]$Name,[string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { Stop-WithGuidance "$Name is missing. $InstallHint" }
}
function Invoke-Checked([string]$Command,[string[]]$Arguments,[string]$Failure) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { Stop-WithGuidance $Failure }
}
function New-LocalSecret {
  return [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36)).TrimEnd("=").Replace("+","-").Replace("/","_")
}
$os = Get-CimInstance Win32_OperatingSystem
if ([int]$os.BuildNumber -lt 19041) { Stop-WithGuidance "Windows 10 version 2004 or newer, or Windows 11, is required." }
Write-Host "CORNHILL LOCAL DEVELOPMENT SETUP" -ForegroundColor Cyan
Write-Host "Native PostgreSQL mode: no Docker Desktop required."
Write-Host "This installs an isolated local database foundation. It does NOT replace the live CORNHILL app."
Require-Command "node" "Install Node.js 22 or newer, then reopen PowerShell."
Require-Command "npm" "Install Node.js 22 or newer, then reopen PowerShell."
$nodeMajor = [int]((node --version).Trim().TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) { Stop-WithGuidance "Node.js 22 or newer is required. Found $(node --version)." }
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$envPath = Join-Path $root ".env"
if (-not (Test-Path $envPath)) {
  $envText = Get-Content ".env.example" -Raw
  $envText = $envText.Replace("REPLACE_WITH_A_LONG_RANDOM_PASSWORD",(New-LocalSecret))
  $envText = $envText.Replace("REPLACE_WITH_A_LONG_RANDOM_RUNTIME_PASSWORD",(New-LocalSecret))
  $envText = $envText.Replace("REPLACE_WITH_A_LONG_RANDOM_SECRET",(New-LocalSecret))
  $envText = $envText.Replace("CORNHILL_DB_PORT=54329","CORNHILL_DB_PORT=5432")
  Set-Content -Path $envPath -Value $envText -NoNewline
  Write-Host "Created a private .env file with generated local secrets."
} else {
  $envText = Get-Content $envPath -Raw
  $envText = [regex]::Replace($envText,"(?m)^CORNHILL_DB_PORT=.*$","CORNHILL_DB_PORT=5432")
  Set-Content -Path $envPath -Value $envText -NoNewline
  Write-Host "Existing .env preserved; database port set to native PostgreSQL port 5432."
}
Write-Host "Installing pinned Node dependencies..."
Invoke-Checked "npm" @("ci","--no-audit","--no-fund") "npm dependency installation failed."
if ($RunTests) {
  Write-Host "Running local Windows tests..."
  Invoke-Checked "npm" @("test") "Windows test suite failed. No database migration was run."
}
if (-not $SkipDatabase) {
  $pgBin = "C:\Program Files\PostgreSQL\17\bin"
  $psql = Join-Path $pgBin "psql.exe"
  $createdb = Join-Path $pgBin "createdb.exe"
  if (-not (Test-Path $psql) -or -not (Test-Path $createdb)) { Stop-WithGuidance "PostgreSQL 17 command-line tools were not found at $pgBin. Install PostgreSQL 17 with Command Line Tools." }
  $securePassword = Read-Host "Enter the PostgreSQL postgres administrator password (input is hidden)" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try { $postgresPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  $env:PGPASSWORD = $postgresPassword
  try {
    Write-Host "Checking native PostgreSQL 17 on 127.0.0.1:5432..."
    $versionCheck = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atc "SELECT current_setting('server_version_num')::int >= 170000;"
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Could not connect as postgres. Check the password and ensure service postgresql-x64-17 is running." }
    if ($versionCheck.Trim() -ne "t") { Stop-WithGuidance "PostgreSQL 17 or newer is required." }
    $exists = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = 'cornhill_local';"
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Could not inspect PostgreSQL databases." }
    if ($exists.Trim() -eq "1") { Stop-WithGuidance "Database cornhill_local already exists. Setup stopped without changing or deleting it; inspect and back it up before continuing." }
    $roleExists = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atc "SELECT 1 FROM pg_roles WHERE rolname = 'cornhill_local_admin';"
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Could not inspect PostgreSQL roles." }
    $adminPassword = (Select-String -Path $envPath -Pattern '^CORNHILL_DB_ADMIN_PASSWORD=(.+)$').Matches.Groups[1].Value
    if ($adminPassword.Length -lt 24 -or $adminPassword.StartsWith("REPLACE_WITH_")) { Stop-WithGuidance "CORNHILL_DB_ADMIN_PASSWORD in .env must be a unique random password of at least 24 characters." }
    if ($roleExists.Trim() -eq "1") {
      $roleSql = "ALTER ROLE cornhill_local_admin WITH LOGIN CREATEDB PASSWORD '$adminPassword';"
    } else {
      $roleSql = "CREATE ROLE cornhill_local_admin LOGIN CREATEDB PASSWORD '$adminPassword';"
    }
    Invoke-Checked $psql @("-X","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p","5432","-U","postgres","-d","postgres","-c",$roleSql) "Could not create the isolated cornhill_local_admin role."
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    $postgresPassword = $null
  }
  $adminPassword = (Select-String -Path $envPath -Pattern '^CORNHILL_DB_ADMIN_PASSWORD=(.+)$').Matches.Groups[1].Value
  $env:PGPASSWORD = $adminPassword
  try {
    Write-Host "Creating isolated database cornhill_local..."
    Invoke-Checked $createdb @("-h","127.0.0.1","-p","5432","-U","cornhill_local_admin","-O","cornhill_local_admin","cornhill_local") "Could not create cornhill_local. No existing database was deleted."
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    $adminPassword = $null
  }
  $env:CORNHILL_ALLOW_LOCAL_MIGRATIONS = "true"
  $env:CORNHILL_DB_TARGET = "local-development"
  try {
    Write-Host "Applying local-only numbered migrations..."
    Invoke-Checked "npm" @("run","db:migrate") "Local migrations failed. Preserve the database and inspect the error before retrying."
    Write-Host "Verifying local schema and security..."
    foreach ($check in @("db:verify","db:verify-auth","db:verify-runtime","db:verify-school")) {
      Invoke-Checked "npm" @("run",$check) "Verification failed at $check. Do not treat this installation as ready."
    }
  } finally {
    Remove-Item Env:CORNHILL_ALLOW_LOCAL_MIGRATIONS -ErrorAction SilentlyContinue
    Remove-Item Env:CORNHILL_DB_TARGET -ErrorAction SilentlyContinue
  }
}
Write-Host ""
Write-Host "LOCAL DATABASE FOUNDATION SETUP COMPLETED" -ForegroundColor Green
Write-Host "Database: 127.0.0.1 port 5432 (loopback only)."
Write-Host "Database name: cornhill_local."
Write-Host "The full local school app, staff sign-in, LAN access and offline sync are NOT enabled yet."
