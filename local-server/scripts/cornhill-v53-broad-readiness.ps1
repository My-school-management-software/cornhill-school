# CORNHILL V53 — broad read-only local installation readiness report.
# No database connection, no production edits, no secrets, no online deployment.
# Expected environment: Windows 10/11, PowerShell 5.1+, CORNHILL local repository.
[CmdletBinding()]
param([string]$RepoDirectory = (Join-Path $env:USERPROFILE 'cornhill-school'))

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$now = Get-Date
$server = Join-Path $RepoDirectory 'local-server'
$downloads = Join-Path $env:USERPROFILE 'Downloads'
if (-not (Test-Path -LiteralPath (Join-Path $RepoDirectory '.git'))) {
  throw 'The expected CORNHILL repository was not found. No changes were made.'
}
if (-not (Test-Path -LiteralPath (Join-Path $server 'package.json'))) {
  throw 'The CORNHILL local-server package file was not found. No changes were made.'
}
if (-not (Test-Path -LiteralPath $downloads)) {
  [void](New-Item -ItemType Directory -Path $downloads)
}
function ContainsText([string]$relative, [string]$snippet) {
  $path = Join-Path $server $relative
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  $reader = [IO.StreamReader]::new($path)
  try {
    return $reader.ReadToEnd().Contains($snippet)
  } finally {
    $reader.Dispose()
  }
}
function GetCommandVersion([string]$name) {
  try {
    $command = Get-Command $name -ErrorAction Stop
    $result = & $command.Source --version 2>$null
    return ($result | Select-Object -First 1)
  } catch { return 'not_detected' }
}
Push-Location $RepoDirectory
try {
  $branch = (& git branch --show-current 2>$null | Select-Object -First 1)
  $head = (& git rev-parse --short HEAD 2>$null | Select-Object -First 1)
  $statusLines = @(& git status --porcelain=v1 -uall 2>$null)
  $tracked = @($statusLines | Where-Object { $_ -notmatch '^\?\?' }).Count
  $untracked = @($statusLines | Where-Object { $_ -match '^\?\?' }).Count
} finally { Pop-Location }
$guardian = @{
  page_present = Test-Path -LiteralPath (Join-Path $server 'public\guardian.html')
  learner_code_field_present = ContainsText 'public\guardian.html' 'id="pupil-code"'
  registered_phone_field_present = ContainsText 'public\guardian.html' 'id="phone"'
  pin_field_present = ContainsText 'public\guardian.html' 'id="pin"'
  distinct_pin_step_present = ContainsText 'public\guardian.html' 'id="pin-form"'
  code_phone_verification_route_present = ContainsText 'src\security\guardian-portal-http-handler.mjs' '/api/v1/guardian/entry-check'
  guardian_approval_enforced = ContainsText 'src\db\guardian-portal-repositories.mjs' "access.access_status = 'approved'"
}
$migrationInventory = @{}
foreach ($number in @(94,95,96,97,98,99,100)) {
  $matches = @(Get-ChildItem (Join-Path $server 'migrations') -Filter ('{0:D3}_*.sql' -f $number) -ErrorAction SilentlyContinue)
  $migrationInventory[('{0:D3}' -f $number)] = ($matches.Count -eq 1)
}
$ports = @{}
foreach ($port in @(4174,5432)) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  $ports["$port"] = @{
    listener_count = $listeners.Count
    loopback_only = ($listeners.Count -gt 0 -and
      @($listeners | Where-Object {
        $_.LocalAddress -notin @('127.0.0.1','::1')
      }).Count -eq 0)
    bound_all_interfaces = (@($listeners | Where-Object {
      $_.LocalAddress -in @('0.0.0.0','::')
    }).Count -gt 0)
  }
}
$blocking = @(
  'frontend_not_integrated',
  'school_api_parity_incomplete',
  'hosted_dependencies_pending',
  'offline_sync_not_accepted',
  'multi_device_acceptance_pending'
)
$report = [ordered]@{
  operation = 'CORNHILL_V53_BROAD_READ_ONLY_RELEASE_PREFLIGHT'
  date_uganda = $now.ToString('dd/MM/yyyy HH:mm:ss')
  local_git_branch = [string]$branch
  local_git_head_short = [string]$head
  tracked_changed_paths = $tracked
  untracked_paths = $untracked
  node_version = GetCommandVersion 'node'
  npm_version = GetCommandVersion 'npm.cmd'
  guardian_portal = $guardian
  migration_files_present_not_applied = $migrationInventory
  listener_4174 = $ports["4174"]
  listener_postgresql_5432 = $ports["5432"]
  postgres_non_loopback_listener_security_review = ($ports['5432'].bound_all_interfaces -eq $true -or
    ($ports['5432'].listener_count -gt 0 -and -not $ports['5432'].loopback_only))
  cloud_local_finance_reconciliation = 'NOT_VERIFIED_NO_PAYMENTS_POSTED'
  guardian_live_sign_in = 'NOT_TESTED_BY_THIS_READ_ONLY_PREFLIGHT'
  database_migration_status = 'NOT_READ_OR_CHANGED'
  formal_release_blockers_not_cleared_by_this_script = $blocking
  formal_release_blockers_cleared_by_this_script = 0
  windows_exe_acceptance = 'NOT_VERIFIED'
  android_apk_acceptance = 'NOT_VERIFIED'
  offline_sync_acceptance = 'NOT_VERIFIED'
  multi_device_acceptance = 'NOT_VERIFIED'
  local_database_writes = 0
  finance_postings = 0
  cloud_writes = 0
  secrets_read = $false
  learner_or_parent_records_read = $false
  verdict = 'READ_ONLY_AUDIT_COMPLETED_RELEASE_REMAINS_BLOCKED'
}
$filename = 'CORNHILL-V53-SAFE-INSTALL-READINESS-' + $now.ToString('yyyyMMdd-HHmmss') + '.json'
$out = Join-Path $downloads $filename
[IO.File]::WriteAllText($out, ($report | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Host 'CORNHILL_V53_READ_ONLY_PREFLIGHT=PASS' -ForegroundColor Green
Write-Host ('GUARDIAN_PRECHECK_AND_PIN_FIELDS_PRESENT=' + (
  $guardian.learner_code_field_present -and $guardian.registered_phone_field_present -and
  $guardian.distinct_pin_step_present))
Write-Host ('TRACKED_CHANGED_PATHS=' + $tracked)
Write-Host ('POSTGRES_NON_LOOPBACK_SECURITY_REVIEW=' + $report.postgres_non_loopback_listener_security_review)
Write-Host 'FORMAL_RELEASE_BLOCKERS_VERIFIED_CLEARED=0_OF_5'
Write-Host 'DATABASE_WRITES=0; FINANCE_WRITES=0; CLOUD_WRITES=0'
Write-Host ('UPLOAD_SAFE_REPORT_ONLY=' + $out)
