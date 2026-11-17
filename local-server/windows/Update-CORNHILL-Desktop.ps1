[CmdletBinding()]
param(
  [switch]$SkipTests,
  [switch]$SkipDatabase,
  [switch]$Launch
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Import-Module (Join-Path $PSScriptRoot "Local-DatabaseBackup.psm1") -Force
$Branch = "feat/cornhill-integration-batch-20261115"

function Stop-WithGuidance([string]$Message) {
  Write-Host ""
  Write-Host "CORNHILL DESKTOP UPDATE STOPPED: $Message" -ForegroundColor Red
  exit 1
}
function Invoke-Checked([string]$Command,[string[]]$Arguments,[string]$Failure) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { Stop-WithGuidance $Failure }
}
function Read-EnvFile([string]$Path) {
  $values = @{}
  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) { continue }
    $parts = $line.Split("=",2)
    if ($parts.Length -eq 2) { $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'") }
  }
  return $values
}

function Stop-ExistingLocalAuthService([string]$LocalServerRoot) {
  if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
    Stop-WithGuidance "Cannot safely inspect port 4174 on this Windows installation. The existing service was not stopped."
  }
  $connections = @(Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue)
  if ($connections.Count -eq 0) { return }

  $owners = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -ne 1) {
    Stop-WithGuidance "Port 4174 has more than one listener owner. No running process was stopped."
  }

  $listenerPid = [int]$owners[0]
  $listener = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $listenerPid)
  if (-not $listener -or $listener.Name -notmatch "^node(\.exe)?$" -or
      $listener.CommandLine -notmatch "(?i)(?:^|\s)scripts[\\/]start-local-auth\.mjs(?:\s|$)") {
    Stop-WithGuidance "Port 4174 is occupied by a process that is not positively identified as the CORNHILL local authentication server. Nothing was stopped."
  }

  $expectedPath = [System.IO.Path]::GetFullPath($LocalServerRoot).TrimEnd([char[]]@([char]92,[char]47))
  $ancestorId = [int]$listener.ParentProcessId
  $verifiedLauncher = $false
  for ($depth = 0; $depth -lt 10 -and $ancestorId -gt 0; $depth++) {
    $ancestor = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $ancestorId) -ErrorAction SilentlyContinue
    if (-not $ancestor) { break }
    $isPowerShell = $ancestor.Name -match "^(powershell|pwsh)(\.exe)?$"
    $hasExpectedPath = $ancestor.CommandLine -and
      $ancestor.CommandLine.IndexOf($expectedPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    $startsExpectedService = $ancestor.CommandLine -match "(?i)npm(?:\.cmd)?\s+run\s+start:auth"
    if ($isPowerShell -and $hasExpectedPath -and $startsExpectedService) {
      $verifiedLauncher = $true
      break
    }
    $ancestorId = [int]$ancestor.ParentProcessId
  }
  if (-not $verifiedLauncher) {
    Stop-WithGuidance "Port 4174 is running a CORNHILL-like Node command, but its launcher path could not be verified. Nothing was stopped."
  }

  Write-Host "Found the existing CORNHILL local HTTPS service (PID $listenerPid). Sending a graceful interrupt so the updated routes can load..."
  & node -e "process.kill($listenerPid, 'SIGINT')"
  if ($LASTEXITCODE -ne 0) {
    Stop-WithGuidance "Could not signal the verified local service. No replacement service was started."
  }

  $stopped = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    $remaining = @(Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue)
    if (-not ($remaining | Where-Object { $_.OwningProcess -eq $listenerPid })) {
      $stopped = $true
      break
    }
  }
  if (-not $stopped) {
    Stop-WithGuidance "The existing local service did not release port 4174 after the graceful stop request. No duplicate service was started."
  }
}

$localServerRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $localServerRoot ".."))
Set-Location $repoRoot
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Stop-WithGuidance "Git for Windows is required for safe branch updates." }
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Stop-WithGuidance "Install Node.js 22 or newer, then reopen PowerShell."
}
$rootFromGit = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($rootFromGit.Trim()) -ne $repoRoot) {
  Stop-WithGuidance "Run this updater from inside the CORNHILL Git working copy."
}
$currentBranch = (& git branch --show-current).Trim()
if ($currentBranch -ne $Branch) { Stop-WithGuidance "Switch to the expected local branch $Branch before updating. Current branch: $currentBranch" }
$dirty = @(& git status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Could not inspect the working tree." }
if ($dirty.Count -gt 0) { Stop-WithGuidance "Your source folder has uncommitted changes. Commit or back them up before updating; nothing has been overwritten." }

Write-Host "CORNHILL INTEGRATED DESKTOP UPDATE" -ForegroundColor Cyan
Write-Host "Release batch: Director + Bursar + School Office + Academics + Staff Operations + Attendance Devices & Imports + Parent/Guardian Portal."
Write-Host "First checking for local changes, then fast-forwarding the approved development branch."
Invoke-Checked "git" @("fetch","origin",$Branch) "Could not fetch the approved CORNHILL branch."
Invoke-Checked "git" @("merge","--ff-only","origin/$Branch") "The local branch cannot be fast-forwarded. No reset or forced overwrite was attempted."

Set-Location $localServerRoot
$nodeMajor = [int]((node --version).Trim().TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) { Stop-WithGuidance "Node.js 22 or newer is required." }
Write-Host "Installing the dependency versions pinned in package.json..."
Invoke-Checked "npm" @("install","--no-package-lock","--no-audit","--no-fund") "Node dependency installation failed."
if (-not $SkipTests) {
  Write-Host "Running the complete combined Windows test suite..."
  Invoke-Checked "npm" @("test") "The Windows test suite failed. Database migrations were not started."
}

if (-not $SkipDatabase) {
  $envPath = Join-Path $localServerRoot ".env"
  if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { Stop-WithGuidance "Private .env is missing. Run the first-time local installer before this update." }
  $config = Read-EnvFile $envPath
  $dbHost = if ($config.ContainsKey("CORNHILL_DB_HOST")) { $config["CORNHILL_DB_HOST"] } else { "127.0.0.1" }
  $dbPort = if ($config.ContainsKey("CORNHILL_DB_PORT")) { $config["CORNHILL_DB_PORT"] } else { "5432" }
  $dbName = if ($config.ContainsKey("CORNHILL_DB_NAME")) { $config["CORNHILL_DB_NAME"] } else { "" }
  if ($dbHost -notin @("127.0.0.1","localhost","::1") -or $dbPort -ne "5432" -or $dbName -ne "cornhill_local") {
    Stop-WithGuidance "The update only supports the isolated local cornhill_local database on loopback PostgreSQL port 5432. No remote database was touched."
  }
  $service = Get-Service -Name "postgresql-x64-17" -ErrorAction SilentlyContinue
  if (-not $service -or $service.Status -ne "Running") { Stop-WithGuidance "Start the PostgreSQL 17 Windows service, then run the update again." }

  $pgBin = "C:\Program Files\PostgreSQL\17\bin"
  $databaseUser = if ($config.ContainsKey("CORNHILL_DB_ADMIN_USER")) { $config["CORNHILL_DB_ADMIN_USER"] } else { "" }
  $databasePassword = if ($config.ContainsKey("CORNHILL_DB_ADMIN_PASSWORD")) { $config["CORNHILL_DB_ADMIN_PASSWORD"] } else { "" }
  Write-Host "Creating and validating a private pre-migration database backup..."
  try {
    $preMigrationBackup = New-CornhillPreMigrationBackup `
      -PostgresBin $pgBin -ServerHost "127.0.0.1" -Port 5432 `
      -Database $dbName -Username $databaseUser -Password $databasePassword
  } catch {
    Stop-WithGuidance "The pre-migration backup could not be created and verified. No database migrations were started. Preserve any partial archive and resolve the backup problem before retrying."
  } finally {
    $databasePassword = $null
  }
  Write-Host "Verified pre-migration backup: $($preMigrationBackup.Path)"
  $databaseUser = $null

  $env:CORNHILL_ALLOW_LOCAL_MIGRATIONS = "true"
  $env:CORNHILL_DB_TARGET = "local-development"
  try {
    Write-Host "Applying only new checksum-verified local database migrations..."
    Invoke-Checked "npm" @("run","db:migrate") "A local migration failed. The existing database has been preserved; stop and review the error."
    Write-Host "Running database, identity, permissions, school and finance verification..."
    foreach ($check in @("db:verify","db:verify-auth","db:verify-runtime","db:verify-school","db:verify-finance")) {
      Invoke-Checked "npm" @("run",$check) "Database verification failed at $check. Do not treat the installation as ready."
    }
    $directorStatus = (& npm run db:director-status 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { Stop-WithGuidance "Could not verify the first Director account state." }
    if ($directorStatus -match "(?m)^READY\s*$") {
      Write-Host "No first Director account is configured."
      $choice = Read-Host "Run the one-time Director account setup now? (Y/N)"
      if ($choice -match "^(Y|YES)$") {
        Invoke-Checked "npm" @("run","setup:director") "Director setup failed. No existing account or permission matrix was overwritten."
      } else {
        Write-Host "Director setup was deferred. Staff sign-in remains unavailable until the first Director account is created." -ForegroundColor Yellow
      }
    } elseif ($directorStatus -match "(?m)^CONFIGURED\s*$") {
      Write-Host "Existing first Director setup verified; no account was recreated."
    } else {
      Write-Host "Director permission state needs administrator review. The updater did not attempt to change it." -ForegroundColor Yellow
    }
  } finally {
    Remove-Item Env:CORNHILL_ALLOW_LOCAL_MIGRATIONS -ErrorAction SilentlyContinue
    Remove-Item Env:CORNHILL_DB_TARGET -ErrorAction SilentlyContinue
  }

  $updatedConfig = Read-EnvFile $envPath
  if (-not $updatedConfig.ContainsKey("CORNHILL_TLS_PFX_PATH") -or
      -not $updatedConfig.ContainsKey("CORNHILL_TLS_PFX_PASSWORD") -or
      -not $updatedConfig.ContainsKey("CORNHILL_LOCAL_ORIGIN")) {
    $configure = Read-Host "Configure the trusted localhost HTTPS certificate now? (Y/N)"
    if ($configure -match "^(Y|YES)$") {
      $certificateSetup = Join-Path $repoRoot "windows\Configure-CORNHILL-LocalHttps.ps1"
      Invoke-Checked "powershell.exe" @("-NoProfile","-ExecutionPolicy","Bypass","-File",$certificateSetup) "Local HTTPS certificate setup failed."
    } else {
      Write-Host "HTTPS setup is required before the local service can start." -ForegroundColor Yellow
    }
  }
}

Write-Host ""
Write-Host "INTEGRATED SOURCE UPDATE AND REQUESTED CHECKS COMPLETED" -ForegroundColor Green
Write-Host "Installed workspaces: Director/Staff leadership, Bursar finance, School Office, Academics, Staff Operations, Attendance Devices & Imports and Parent & Guardian Portal."
Write-Host "The existing local database was retained; only unapplied checksum-verified migrations were considered."
Write-Host "Attendance import remains disabled until the Director delegates staff.attendance_import. Other high-risk actions require explicit staff.attendance_review, staff.leave_review, staff.payroll_disbursements_manage or staff.payroll_disbursements_verify permissions."
Write-Host "To start the local service: Set-Location '$localServerRoot'; npm run start:auth"
Write-Host "Then open https://localhost:4174/app for the local workspace launcher. The listener remains restricted to this computer."

if ($Launch) {
  Stop-ExistingLocalAuthService $localServerRoot
  $command = "Set-Location -LiteralPath '" + $localServerRoot.Replace("'","''") + "'; npm run start:auth"
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile","-NoExit","-Command",$command)
  Start-Sleep -Seconds 3
  Start-Process "https://localhost:4174/app"
}
