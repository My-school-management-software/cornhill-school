# CORNHILL V63 - source-only inventory and learner materials workflow review.
# Does not stop school server, change files, query DB, or run migrations.
# Unlike V62, scans source TEXT for materials-related API references,
# so modules named "school-requirements" and admissions intake are included.
[CmdletBinding()]
param([string]$RepoDirectory=(Join-Path $env:USERPROFILE 'cornhill-school'))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root=Join-Path $RepoDirectory 'local-server'
if(!(Test-Path -LiteralPath (Join-Path $root 'package.json'))) { throw 'CORNHILL local source not found.' }
$include=@{}
$maxFile=2MB
$maxTotal=16MB
$maxFiles=95
$rootItems=@('src','public','migrations','test')
$extensions=@('.mjs','.js','.sql','.html','.css')
$basenamePattern='(?i)(requirement|inventory|stock[-_]|handover|clearance|material[-_](?:receipt|deliver|intake|collect|custody|movement|ledger|class|office))'
$contentPattern='(?i)(cornhill_school\.material_(?:definitions|editions|class_assignments|deliveries|clearances|handover_offers|handover_acceptances)|materialsIntake|materialsRequest|renderMaterialItems|school-requirements|/requirements(?:/|\?|["'']|$)|material[s]?[ -]?(?:intake|handover|receiv|collect|deliver|issue))'
$needed=@(
 'public\school.js', 'public\school.html',
 'migrations\116_local_inventory_stock_ledger.sql'
)
foreach($relative in $needed) {
 $full=Join-Path $root $relative
 if(Test-Path -LiteralPath $full -PathType Leaf) { $include[$relative]=$true }
}
foreach($name in $rootItems) {
 $folder=Join-Path $root $name
 if(!(Test-Path -LiteralPath $folder)) { continue }
 foreach($file in (Get-ChildItem -LiteralPath $folder -Recurse -File -ErrorAction Stop)) {
   if($file.Extension -notin $extensions -or $file.Length -gt $maxFile) {continue}
   $relative=$file.FullName.Substring($root.Length).TrimStart([char]'\')
   # Never include credentials or test TLS/certification resources.
   if($relative -match '(?i)(\.env|secret|private[-_]?key|credential|password|token[-_]?secret|verify-test-tls-material|\.pem|\.pfx|\.jks|backup|node_modules)') {continue}
   $matchesName=$file.Name -match $basenamePattern
   $matchesContent=$false
   if(!$matchesName) {
     try {
       # Read source only; never evaluate it. Bound 2 MiB/file.
       $source=[IO.File]::ReadAllText($file.FullName)
       $matchesContent=$source -match $contentPattern
     }catch { throw ('Could not inspect candidate source file '+$relative) }
   }
   if($matchesName -or $matchesContent){$include[$relative]=$true}
 }
}
$relativeFiles=@($include.Keys | Sort-Object)
if($relativeFiles.Count -eq 0){throw 'No school requirements or inventory source located.'}
if($relativeFiles.Count -gt $maxFiles){throw ('Source review exceeds safe file cap: '+$relativeFiles.Count)}
$bytes=0L
foreach($relative in $relativeFiles){
 $info=Get-Item -LiteralPath (Join-Path $root $relative) -ErrorAction Stop
 if($info.Length -gt $maxFile){throw ('Source file too large: '+$relative)}
 $bytes += $info.Length
}
if($bytes -gt $maxTotal){throw ('Source review exceeds 16 MiB cap. Actual bytes: '+$bytes)}
$temp=Join-Path $env:TEMP ('CORNHILL-V63-SOURCE-'+[guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $temp -Force)
$manifest=New-Object System.Collections.Generic.List[object]
try {
 foreach($relative in $relativeFiles){
   $source=Join-Path $root $relative
   $dest=Join-Path $temp ('local-server\'+$relative)
   $parent=Split-Path -Parent $dest
   if(!(Test-Path -LiteralPath $parent)) { [void](New-Item -ItemType Directory -Path $parent -Force) }
   Copy-Item -LiteralPath $source -Destination $dest -ErrorAction Stop
   $manifest.Add([pscustomobject]@{
     path=$relative
     bytes=(Get-Item -LiteralPath $source).Length
     sha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
   })
 }
 $notes=@'
CORNHILL V63 SOURCE ONLY - NO INSTALL, NO DATABASE EXPORT

Selected school requirements, classroom materials, learner intake and inventory
source files plus relevant migrations/tests. No database records, PINs, passwords,
live payment receipts or backups were requested or included by this script.

IMPORTANT: The working PC uses a DIFFERENT 140-migration history. It already
contains material deliveries and handover records. GitHub V50 has only 100
migrations with COLLIDING numbers 096-100. NEVER RUN THAT BRANCH MIGRATIONS
AGAINST THE WORKING CORNHILL DATABASE.

Review archive contents for private information before uploading.
'@
 [IO.File]::WriteAllText((Join-Path $temp 'README-FIRST.txt'),$notes,[Text.UTF8Encoding]::new($false))
 $metadata=[ordered]@{
   version='CORNHILL_V63_SCHOOL_REQUIREMENTS_SOURCE_REVIEW'
   created_utc=(Get-Date).ToUniversalTime().ToString('o')
   files=$relativeFiles.Count
   total_bytes=$bytes
   database_read=$false
   working_source_modified=$false
   database_writes=0
   cloud_writes=0
   migration_application=$false
   selected=$manifest
 }
 [IO.File]::WriteAllText((Join-Path $temp 'SOURCE-MANIFEST.json'),
   ($metadata | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 $downloads=Join-Path $env:USERPROFILE 'Downloads'
 if(!(Test-Path -LiteralPath $downloads)) {[void](New-Item -ItemType Directory -Path $downloads)}
 $zip=Join-Path $downloads ('CORNHILL-V63-REAL-MATERIALS-WORKFLOW-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.zip')
 Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $zip -CompressionLevel Optimal -ErrorAction Stop
 Write-Host 'CORNHILL_V63_REAL_MATERIALS_SOURCE_REVIEW=PASS' -ForegroundColor Green
 Write-Host ('SOURCE_FILES_COLLECTED='+$relativeFiles.Count)
 Write-Host ('TOTAL_SOURCE_BYTES='+$bytes)
 Write-Host 'EXISTING_FILES_CHANGED=0; DATABASE_WRITES=0; FINANCE_WRITES=0; CLOUD_WRITES=0'
 Write-Host 'MIGRATIONS_APPLIED=0'
 Write-Host 'PLEASE_REVIEW_ZIP_FOR_EMBEDDED_PRIVATE_DATA_BEFORE_UPLOAD=true'
 Write-Host ('UPLOAD_REVIEWED_ZIP='+$zip) -ForegroundColor Cyan
}finally{
 Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
