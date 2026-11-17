Set-StrictMode -Version Latest

function New-CornhillPreMigrationBackup {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$PostgresBin,
    [Parameter(Mandatory = $true)][string]$ServerHost,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Username,
    [Parameter(Mandatory = $true)][string]$Password
  )

  if ($ServerHost -notin @("127.0.0.1", "::1") -or
      $Port -ne 5432 -or $Database -ne "cornhill_local") {
    throw "Backup stopped: only the loopback CORNHILL local database is permitted."
  }
  if ([string]::IsNullOrWhiteSpace($Username) -or [string]::IsNullOrEmpty($Password)) {
    throw "Backup stopped: local database authentication is not configured."
  }

  $psql = Join-Path $PostgresBin "psql.exe"
  $pgDump = Join-Path $PostgresBin "pg_dump.exe"
  $pgRestore = Join-Path $PostgresBin "pg_restore.exe"
  foreach ($tool in @($psql, $pgDump, $pgRestore)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
      throw "Backup stopped: PostgreSQL 17 psql, pg_dump and pg_restore tools are required."
    }
  }

  $dumpVersion = (& $pgDump --version 2>$null) -join " "
  if ($LASTEXITCODE -ne 0 -or $dumpVersion -notmatch "PostgreSQL\) 17(?:\.|\s)") {
    throw "Backup stopped: pg_dump must be PostgreSQL 17."
  }
  $restoreVersion = (& $pgRestore --version 2>$null) -join " "
  if ($LASTEXITCODE -ne 0 -or $restoreVersion -notmatch "PostgreSQL\) 17(?:\.|\s)") {
    throw "Backup stopped: pg_restore must be PostgreSQL 17."
  }

  $priorPassword = $env:PGPASSWORD
  try {
    $env:PGPASSWORD = $Password
    $identity = & $psql -X --no-password -v ON_ERROR_STOP=1 `
      --host $ServerHost --port $Port --username $Username --dbname $Database `
      --tuples-only --no-align --command "SELECT current_database() || '|' || current_setting('server_version_num') || '|' || inet_server_addr()::text" 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "Backup stopped: could not verify the local database identity."
    }
    $identityText = [string]($identity -join "")
    $identityParts = $identityText.Trim().Split("|", 2)
    if ($identityParts.Length -ne 3 -or $identityParts[0] -ne "cornhill_local" -or
        $identityParts[1] -notmatch "^17[0-9]{4,}$" -or
        $identityParts[2] -notin @("127.0.0.1", "::1")) {
      throw "Backup stopped: the connected database is not the expected local PostgreSQL 17 database."
    }

    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
      throw "Backup stopped: a private Windows local application-data folder is unavailable."
    }
    $backupRoot = Join-Path $env:LOCALAPPDATA "CORNHILL\Backups"
    [void](New-Item -ItemType Directory -Path $backupRoot -Force)
    $backupFolderName = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ") + "-" + [guid]::NewGuid().ToString("N")
    $backupFolder = Join-Path $backupRoot $backupFolderName

    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $currentIdentity.User) { throw "Backup stopped: the current Windows account could not be verified." }
    $folderAcl = [System.Security.AccessControl.DirectorySecurity]::new()
    $folderAcl.SetAccessRuleProtection($true, $false)
    $folderAcl.SetOwner($currentIdentity.User)
    $privateRule = [System.Security.AccessControl.FileSystemAccessRule]::new(
      $currentIdentity.User,
      [System.Security.AccessControl.FileSystemRights]::FullControl,
      [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit",
      [System.Security.AccessControl.PropagationFlags]::None,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
    [void]$folderAcl.AddAccessRule($privateRule)
    [void][System.IO.Directory]::CreateDirectory($backupFolder, $folderAcl)

    $dumpPath = Join-Path $backupFolder "cornhill_local_pre_migration.dump"
    $dumpArgs = @(
      "--no-password", "--format=custom", "--host", $ServerHost,
      "--port", [string]$Port, "--username", $Username,
      "--dbname", $Database, "--file", $dumpPath
    )
    $null = & $pgDump @dumpArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Backup stopped: pg_dump could not complete the pre-migration archive. No migration was started."
    }
    $dumpFile = Get-Item -LiteralPath $dumpPath -ErrorAction SilentlyContinue
    if (-not $dumpFile -or $dumpFile.Length -le 0) {
      throw "Backup stopped: pg_dump produced no readable archive. No migration was started."
    }

    $archiveList = & $pgRestore --no-password --list $dumpPath 2>$null
    if ($LASTEXITCODE -ne 0 -or $archiveList.Count -eq 0) {
      throw "Backup stopped: pg_restore could not read the new archive. No migration was started."
    }
    $hash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $metadata = [ordered]@{
      database = "cornhill_local"
      serverVersionMajor = 17
      createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
      archive = [System.IO.Path]::GetFileName($dumpPath)
      archiveLengthBytes = $dumpFile.Length
      archiveSha256 = $hash
      validation = "pg_restore-list-passed"
    } | ConvertTo-Json -Depth 3
    [System.IO.File]::WriteAllText(
      (Join-Path $backupFolder "backup-metadata.json"),
      $metadata,
      [System.Text.UTF8Encoding]::new($false)
    )

    return [pscustomobject]@{
      Path = $dumpPath
      MetadataPath = (Join-Path $backupFolder "backup-metadata.json")
      Sha256 = $hash
    }
  } finally {
    if ($null -eq $priorPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    else { $env:PGPASSWORD = $priorPassword }
    $Password = $null
    $priorPassword = $null
  }
}

Export-ModuleMember -Function New-CornhillPreMigrationBackup
