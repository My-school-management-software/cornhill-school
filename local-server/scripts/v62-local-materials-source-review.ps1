# CORNHILL V62 -- SOURCE ONLY reconciliation of existing material/inventory workflows.
# Does not inspect .env, passwords, learner records, backups or the database.
# Read this script and REVIEW THE ZIP CONTENTS before sharing it.
[CmdletBinding()]
param([string]$RepoDirectory=(Join-Path $env:USERPROFILE 'cornhill-school'))
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path $RepoDirectory 'local-server'
if(!(Test-Path -LiteralPath (Join-Path $root 'package.json'))) { throw 'CORNHILL local source not found. Nothing changed.' }
$includeList=New-Object System.Collections.Generic.List[string]
foreach($folderName in @('src\db','src\security','public','test','scripts')) {
  $folder=Join-Path $root $folderName
  if(!(Test-Path -LiteralPath $folder)) { continue }
  foreach($file in Get-ChildItem -LiteralPath $folder -Recurse -File -ErrorAction Stop) {
    if($file.Extension -notin @('.mjs','.js','.css','.html')) { continue }
    if($file.Name -match '(?i)(material|inventory|stock|handover|clearance)') {
      $relative=$file.FullName.Substring($root.Length).TrimStart([char]'\')
      $includeList.Add($relative)
    }
  }
}
foreach($relative in @(
  'migrations\116_local_inventory_stock_ledger.sql',
  'public\school.html','public\school.js','public\school.css',
  'src\security\school-catalog-http-handler.mjs',
  'src\db\school-catalog-repositories.mjs'
)) {
  $path=Join-Path $root $relative
  if((Test-Path -LiteralPath $path) -and -not $includeList.Contains($relative)) {
    $includeList.Add($relative)
  }
}
if($includeList.Count -eq 0) { throw 'No matching source files found. Nothing changed.' }
$stage=Join-Path $env:TEMP ('CORNHILL-V62-MATERIALS-'+[guid]::NewGuid().ToString('N'))
[void](New-Item -Path $stage -ItemType Directory)
$manifest=New-Object System.Collections.Generic.List[object]
try {
  foreach($relative in ($includeList | Sort-Object -Unique)) {
    $full=Join-Path $root $relative
    $info=Get-Item -LiteralPath $full -ErrorAction Stop
    if($info.Length -gt 1024*1024) { throw ('Refusing unexpectedly large source: '+$relative) }
    if($relative -match '(?i)(\.env|secret|credential|password|\.pem|\.key|\.pfx|backup|\.jks|\.db)') {
      throw ('Refusing sensitive-looking path: '+$relative)
    }
    $dest=Join-Path $stage ('local-server\'+$relative)
    $parent=Split-Path -Parent $dest
    if(!(Test-Path -LiteralPath $parent)) {[void](New-Item -Path $parent -ItemType Directory -Force)}
    Copy-Item -LiteralPath $full -Destination $dest -ErrorAction Stop
    $manifest.Add([pscustomobject]@{
      source=$relative
      bytes=$info.Length
      sha256=(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
    })
  }
  $readme=@'
CORNHILL V62 - MATERIALS SOURCE REVIEW, NOT AN INSTALLER

This archive contains only selected local software source code about school materials,
inventory, handovers and the school screen. It does NOT contain the database,
learner records, finance receipts, authentication secrets or backup files by design.

IMPORTANT: Review the archived files for any unexpectedly embedded private data
before uploading. Do not send .env, PINs, passwords, private keys, backups,
student spreadsheets or payment exports.

This review addresses a serious database lineage discrepancy: the Windows
school database has different migrations 096-140 from the 100-file GitHub V50
candidate. Never run the old V50 migrations on this working database.
'@
  [IO.File]::WriteAllText((Join-Path $stage 'README-FIRST.txt'),$readme,[Text.UTF8Encoding]::new($false))
  $meta=[ordered]@{
    audit='CORNHILL_V62_LOCAL_MATERIALS_SOURCE_REVIEW'
    created_utc=(Get-Date).ToUniversalTime().ToString('o')
    source_file_count=$manifest.Count
    database_accessed=$false
    learner_or_payment_data_exported=$false
    original_files_modified=$false
    local_migrations_executed=$false
    selected_source_files=$manifest
  }
  [IO.File]::WriteAllText(
    (Join-Path $stage 'SOURCE-MANIFEST.json'),
    ($meta | ConvertTo-Json -Depth 6),
    [Text.UTF8Encoding]::new($false)
  )
  $downloads=Join-Path $env:USERPROFILE 'Downloads'
  if(!(Test-Path -LiteralPath $downloads)){[void](New-Item -ItemType Directory -Path $downloads)}
  $zip=Join-Path $downloads ('CORNHILL-V62-MATERIALS-SOURCE-REVIEW-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.zip')
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal -ErrorAction Stop
  Write-Host 'CORNHILL_V62_LOCAL_SOURCE_REVIEW=SUCCESS' -ForegroundColor Green
  Write-Host ('SOURCE_FILES_COLLECTED='+$manifest.Count)
  Write-Host 'ORIGINAL_SOURCE_FILES_CHANGED=0'
  Write-Host 'DATABASE_WRITES=0; FINANCE_WRITES=0; CLOUD_WRITES=0'
  Write-Host 'LIVE_MIGRATIONS_APPLIED=0'
  Write-Host 'ZIP_REVIEW_REQUIRED_BEFORE_UPLOAD=true'
  Write-Host ('SHARE_REVIEWED_SOURCE_ZIP='+$zip) -ForegroundColor Cyan
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
