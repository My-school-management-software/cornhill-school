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
  $bytes = New-Object byte[] 36
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) }
  finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+","-").Replace("/","_")
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
$lockPath = Join-Path $root "package-lock.json"
if (-not (Test-Path $lockPath)) {
  Write-Host "No npm lockfile is present yet; generating a lockfile from the exact package versions..."
  Invoke-Checked "npm" @("install","--package-lock-only","--ignore-scripts","--no-audit","--no-fund") "Could not generate the local npm lockfile."
}
Write-Host "Installing Node dependencies from the generated or existing lockfile..."
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
    $versionText = [string]($versionCheck -join "")
    if ($versionText.Trim() -ne "t") { Stop-WithGuidance "PostgreSQL 17 or newer is required. The version check returned no valid result." }

    $roleExists = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atc "SELECT 1 FROM pg_roles WHERE rolname = 'cornhill_local_admin';"
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Could not inspect PostgreSQL roles." }
    $roleExistsText = [string]($roleExists -join "")
    $adminMatch = Select-String -Path $envPath -Pattern '^CORNHILL_DB_ADMIN_PASSWORD=(.+)$'
    if ($null -eq $adminMatch) { Stop-WithGuidance "CORNHILL_DB_ADMIN_PASSWORD is missing from the private .env file." }
    $adminPassword = $adminMatch.Matches.Groups[1].Value
    if ($adminPassword.Length -lt 24 -or $adminPassword -notmatch "^[A-Za-z0-9_-]+$") { Stop-WithGuidance "CORNHILL_DB_ADMIN_PASSWORD in .env must be a URL-safe random password of at least 24 characters." }

    if ($roleExistsText.Trim() -eq "1") {
      $roleSql = "ALTER ROLE cornhill_local_admin WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '$adminPassword';"
    } else {
      $roleSql = "CREATE ROLE cornhill_local_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '$adminPassword';"
    }
    Invoke-Checked $psql @("-X","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p","5432","-U","postgres","-d","postgres","-c",$roleSql) "Could not create or secure the isolated cornhill_local_admin role."

    Write-Host "Provisioning restricted authentication roles with the PostgreSQL administrator..."
    $authRoleSql = @'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'cornhill_auth_runtime') THEN
    CREATE ROLE cornhill_auth_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'cornhill_auth_api') THEN
    CREATE ROLE cornhill_auth_api NOLOGIN INHERIT;
  END IF;
END
$roles$;
ALTER ROLE cornhill_auth_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE cornhill_auth_api NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT cornhill_auth_runtime TO cornhill_auth_api;
'@
    Invoke-Checked $psql @("-X","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p","5432","-U","postgres","-d","postgres","-c",$authRoleSql) "Could not provision the restricted authentication roles."

    Write-Host "Provisioning separate restricted finance roles..."
    $financeRoleSql = @'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'cornhill_finance_runtime') THEN
    CREATE ROLE cornhill_finance_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'cornhill_finance_api') THEN
    CREATE ROLE cornhill_finance_api NOLOGIN INHERIT;
  END IF;
END
$roles$;
ALTER ROLE cornhill_finance_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE cornhill_finance_api NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT cornhill_finance_runtime TO cornhill_finance_api;
'@
    Invoke-Checked $psql @("-X","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p","5432","-U","postgres","-d","postgres","-c",$financeRoleSql) "Could not provision restricted finance roles."

    $exists = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = 'cornhill_local';"
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Could not inspect PostgreSQL databases." }
    $existsText = [string]($exists -join "")
    if ($existsText.Trim() -eq "1") {
      $owner = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atc "SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname = 'cornhill_local';"
      if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Could not verify ownership of the existing local database." }
      $ownerText = [string]($owner -join "")
      if ($ownerText.Trim() -ne "cornhill_local_admin") {
        Stop-WithGuidance "Database cornhill_local already exists but is not owned by cornhill_local_admin. It was preserved; do not delete it."
      }
      Write-Host "Found the existing CORNHILL local database owned by cornhill_local_admin; preserving it and resuming checksum-verified migrations."
    } else {
      Write-Host "Creating isolated database cornhill_local..."
      Invoke-Checked $createdb @("-h","127.0.0.1","-p","5432","-U","postgres","-O","cornhill_local_admin","cornhill_local") "Could not create cornhill_local. No existing database was deleted."
    }
    $env:PGPASSWORD = $adminPassword;

  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    $postgresPassword = $null
    $adminPassword = $null
  }
  $env:CORNHILL_ALLOW_LOCAL_MIGRATIONS = "true"
  $env:CORNHILL_DB_TARGET = "local-development"
  try {
    Write-Host "Applying local-only numbered migrations..."
    Invoke-Checked "npm" @("run","db:migrate") "Local migrations failed. Preserve the database and inspect the error before retrying."
    Write-Host "Verifying local schema and security..."
    foreach ($check in @("db:verify","db:verify-auth","db:verify-runtime","db:verify-school","db:verify-finance")) {
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
