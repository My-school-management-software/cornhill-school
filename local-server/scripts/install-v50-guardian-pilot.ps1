# CORNHILL V50 Guardian Portal safe source-only installer.
# Does not access .env or modify PostgreSQL/cloud data, learner records or receipts.
param([string]$RepoDirectory = (Join-Path $env:USERPROFILE 'cornhill-school'), [switch]$DoNotStartServer)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$serverPath = Join-Path $RepoDirectory 'local-server'
$branch = 'feat/cornhill-v50-annual-fee-income-groups-20261128'
$baseBranch = 'feat/cornhill-v49-direct-development-20261128'
$targetRef = 'refs/remotes/origin/' + $branch
$baseRef = 'refs/remotes/origin/' + $baseBranch
$files = @('local-server/public/guardian.html','local-server/public/guardian.js',
  'local-server/src/db/guardian-portal-repositories.mjs',
  'local-server/src/security/guardian-portal-http-handler.mjs')
$encoding = New-Object System.Text.UTF8Encoding($false)
$backupPath = $null
$modified = $false

function Git-Call([string[]]$arguments) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'git.exe'
  $psi.WorkingDirectory = $RepoDirectory
  $psi.Arguments = (($arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' ')
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  return @{ ExitCode = $p.ExitCode; Output = $stdout }
}
function Git-Required([string[]]$arguments, [string]$label) {
  $result = Git-Call $arguments
  if ($result.ExitCode -ne 0) { throw ($label + ' failed. No database changes have been made.') }
  return $result.Output
}
function Restore-Code {
  if (-not $modified -or -not $backupPath) { return }
  foreach ($relative in $files) {
    $saved = Join-Path $backupPath ($relative -replace '[/\]', '__')
    if (Test-Path -LiteralPath $saved) {
      Copy-Item -LiteralPath $saved -Destination (Join-Path $RepoDirectory $relative) -Force
    }
  }
  Write-Host 'Previous source files restored. No school records changed.' -ForegroundColor Yellow
}

Write-Host 'CORNHILL V50 Guardian Portal pilot installation: learner code, registered phone, then PIN.' -ForegroundColor Cyan
try {
  if (-not (Test-Path -LiteralPath (Join-Path $RepoDirectory '.git'))) {
    throw 'Expected CORNHILL Git directory was not found.'
  }
  if (-not (Test-Path -LiteralPath (Join-Path $serverPath 'package.json'))) {
    throw 'Expected CORNHILL local server was not found.'
  }
  $origin = (Git-Required @('remote','get-url','origin') 'Git origin check').Trim()
  if ($origin -notmatch 'My-school-management-software[/\\]cornhill-school(?:\.git)?$') {
    throw 'Not the authorised CORNHILL repository.'
  }
  $listener = @(Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue)
  if ($listener.Count -gt 0) {
    throw 'Stop the CORNHILL server first: in its server PowerShell window press Ctrl+C, then run this installer again. No files were changed.'
  }
  [void](Git-Required @('fetch','--no-tags','origin',
    ('+refs/heads/' + $baseBranch + ':' + $baseRef)) 'V49 reference fetch')
  [void](Git-Required @('fetch','--no-tags','origin',
    ('+refs/heads/' + $branch + ':' + $targetRef)) 'V50 guardian source fetch')
  $baseSha = (Git-Required @('merge-base',$baseRef,$targetRef) 'Git merge-base check').Trim()
  if ($baseSha -notmatch '^[0-9a-f]{40}$') { throw 'Invalid source ancestry.' }

  $stageDir = Join-Path $env:TEMP ('CORNHILL-V50-guardian-' + [guid]::NewGuid().ToString('N'))
  [void](New-Item -Path $stageDir -ItemType Directory)
  $pending = @{}
  foreach ($relative in $files) {
    $local = Join-Path $RepoDirectory $relative
    if (-not (Test-Path -LiteralPath $local)) { throw ('Missing file: ' + $relative) }
    $filename = $relative -replace '[/\]', '__'
    $baseFile = Join-Path $stageDir ($filename + '.base')
    $updatedFile = Join-Path $stageDir ($filename + '.updated')
    $baseText = Git-Required @('show',($baseSha + ':' + $relative)) ('Base source: ' + $relative)
    $newText = Git-Required @('show',($targetRef + ':' + $relative)) ('Updated source: ' + $relative)
    [IO.File]::WriteAllText($baseFile, $baseText, $encoding)
    [IO.File]::WriteAllText($updatedFile, $newText, $encoding)
    $localText = [IO.File]::ReadAllText($local, $encoding)
    if ($localText -eq $newText) {
      $pending[$relative] = $newText
    } elseif ($localText -eq $baseText) {
      $pending[$relative] = $newText
    } else {
      $merge = Git-Call @('merge-file','-p',$local,$baseFile,$updatedFile)
      if ($merge.ExitCode -ne 0 -or $merge.Output -match '(?m)^(<{7}|>{7})') {
        throw ('Existing local changes conflict with reviewed V50 source in ' + $relative +
          '. No original files were changed.')
      }
      $pending[$relative] = $merge.Output
    }
  }

  $downloads = Join-Path $env:USERPROFILE 'Downloads'
  if (-not (Test-Path -LiteralPath $downloads)) { [void](New-Item -Path $downloads -ItemType Directory) }
  $backupPath = Join-Path $downloads ('CORNHILL-V50-GUARDIAN-CODE-BACKUP-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  [void](New-Item -Path $backupPath -ItemType Directory)
  foreach ($relative in $files) {
    Copy-Item -LiteralPath (Join-Path $RepoDirectory $relative) -Destination (
      Join-Path $backupPath ($relative -replace '[/\]', '__'))
  }
  $modified = $true
  foreach ($relative in $files) {
    [IO.File]::WriteAllText((Join-Path $RepoDirectory $relative), $pending[$relative], $encoding)
  }

  Push-Location $serverPath
  try {
    foreach ($source in @('public/guardian.js',
      'src/db/guardian-portal-repositories.mjs',
      'src/security/guardian-portal-http-handler.mjs')) {
      & node --check $source
      if ($LASTEXITCODE -ne 0) { throw ('Syntax test failed: ' + $source) }
    }
    & node --test test/guardian-portal-ui.test.mjs test/guardian-portal-http-handler.test.mjs test/guardian-portal-repositories.test.mjs test/workspace-api-contract-batch.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Guardian regression tests did not pass.' }
  } finally {
    Pop-Location
  }

  $modified = $false
  Write-Host 'V50_GUARDIAN_SOURCE_INSTALLED=TRUE' -ForegroundColor Green
  Write-Host 'LEARNER_CODE_AND_REGISTERED_PHONE_FIRST=TRUE'
  Write-Host 'SCHOOL_ISSUED_PIN_REQUIRED=TRUE'
  Write-Host 'FILES_CHANGED=4'
  Write-Host 'DATABASE_WRITES=0; FINANCE_WRITES=0; CLOUD_WRITES=0'
  Write-Host ('Original four files saved to ' + $backupPath)
  if (-not $DoNotStartServer) {
    Write-Host 'Restarting CORNHILL local HTTPS server. Keep this PowerShell window open.' -ForegroundColor Cyan
    Set-Location $serverPath
    & npm.cmd run start:auth
  }
} catch {
  Restore-Code
  Write-Host ('V50_GUARDIAN_SOURCE_INSTALLED=FALSE: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
