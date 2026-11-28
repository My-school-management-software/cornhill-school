# CORNHILL V54: Collect LOCAL SOURCE CODE only for a safe, broad reconciliation
# with the tested GitHub V50 candidate. No learner database or secret collection.
# Does not stop/start CORNHILL, touch .env, run migrations, or change original files.
[CmdletBinding()]
param([string]$RepoDirectory = (Join-Path $env:USERPROFILE 'cornhill-school'))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$source = Join-Path $RepoDirectory 'local-server'
if (-not (Test-Path -LiteralPath (Join-Path $source 'package.json'))) {
  throw 'CORNHILL local source was not found. Nothing changed.'
}
$names = @(
  'public/academics.html','public/academics.js','public/academics.css',
  'public/bursar.html','public/bursar.js','public/bursar.css',
  'public/school.html','public/school.js','public/school.css',
  'public/guardian.html','public/guardian.js','public/guardian.css',
  'src/db/academics-repositories.mjs',
  'src/db/finance-repositories.mjs',
  'src/db/guardian-portal-repositories.mjs',
  'src/security/academics-http-handler.mjs',
  'src/security/finance-http-handler.mjs',
  'src/security/finance-operations-http-handler.mjs',
  'src/security/guardian-portal-http-handler.mjs',
  'src/security/auth-runtime.mjs',
  'src/https-server.mjs',
  'scripts/verify-local-school-schema.mjs',
  'test/academics-http-handler.test.mjs',
  'test/academics-repositories.test.mjs',
  'test/academics-workspace-ui.test.mjs',
  'test/academics-runtime-wiring.test.mjs',
  'test/finance-http-handler.test.mjs',
  'test/finance-workspace-ui.test.mjs',
  'test/guardian-portal-ui.test.mjs',
  'test/workspace-api-contract-batch.test.mjs',
  'migrations/095_local_academic_results_and_progression.sql',
  'migrations/096_local_individual_nursery_material_receipts.sql',
  'migrations/097_local_nursery_material_movement_accountability.sql',
  'migrations/098_local_annual_school_fees_income_b_prices.sql',
  'migrations/099_local_income_group_receipt_breakdown.sql',
  'migrations/100_local_finance_account_income_classification.sql'
)
$staging = Join-Path $env:TEMP ('CORNHILL-V54-source-' + [guid]::NewGuid().ToString('N'))
[void](New-Item -Path $staging -ItemType Directory)
$manifest = @()
try {
  foreach ($name in $names) {
    $full = Join-Path $source ($name -replace '/', '\')
    $file = [IO.FileInfo]::new($full)
    if (-not $file.Exists) {
      $manifest += [pscustomobject]@{ relative_path = $name; present = $false; sha256 = $null; size = 0 }
      continue
    }
    if ($file.Length -gt 2MB) { throw ('Unexpectedly large source file: ' + $name) }
    if ($file.Extension -notin @('.html','.css','.js','.mjs','.sql')) {
      throw ('Not an approved source-file extension: ' + $name)
    }
    $destination = Join-Path $staging ('local-server\' + ($name -replace '/', '\'))
    $folder = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $folder)) {
      [void](New-Item -ItemType Directory -Path $folder -Force)
    }
    Copy-Item -LiteralPath $full -Destination $destination -ErrorAction Stop
    $hash = Get-FileHash -LiteralPath $full -Algorithm SHA256
    $manifest += [pscustomobject]@{
      relative_path = $name; present = $true; sha256 = $hash.Hash; size = $file.Length
    }
  }
  $report = [ordered]@{
    kind = 'CORNHILL_V54_LOCAL_SOURCE_REVIEW'
    collected_at = (Get-Date).ToUniversalTime().ToString('o')
    school_records_read = $false
    database_connection_attempted = $false
    original_files_modified = $false
    sensitive_files_excluded = @('.env','.pem','.key','.pfx','.jks','*.log','*.bak','backups','learner exports')
    entries = $manifest
  }
  $manifestPath = Join-Path $staging 'SOURCE-MANIFEST.json'
  [IO.File]::WriteAllText($manifestPath,($report | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  $downloads = Join-Path $env:USERPROFILE 'Downloads'
  if (-not (Test-Path -LiteralPath $downloads)) { [void](New-Item -ItemType Directory -Path $downloads) }
  $zip = Join-Path $downloads ('CORNHILL-V54-ACADEMICS-FINANCE-SOURCE-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip -CompressionLevel Optimal -ErrorAction Stop
  Write-Host 'CORNHILL_V54_SOURCE_COLLECTION=PASS' -ForegroundColor Green
  Write-Host ('FILES_FOUND=' + @($manifest | Where-Object { $_.present }).Count)
  Write-Host ('FILES_NOT_PRESENT=' + @($manifest | Where-Object { -not $_.present }).Count)
  Write-Host 'ORIGINAL_FILES_MODIFIED=FALSE'
  Write-Host 'DATABASE_WRITES=0; FINANCE_WRITES=0; CLOUD_WRITES=0'
  Write-Host 'PRIVATE_ENV_AND_LEARNER_DATA_NOT_COLLECTED=TRUE'
  Write-Host ('REVIEW_SOURCE_ZIP=' + $zip) -ForegroundColor Cyan
  Write-Host 'Review the ZIP contents before uploading. Share only this source review ZIP.'
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
