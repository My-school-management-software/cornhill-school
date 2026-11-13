# Read-only readiness check for a proposed CORNHILL Windows host.
# This script does not install software, alter settings, start containers, or read secrets.

$ErrorActionPreference = 'SilentlyContinue'
$checks = @()

function Add-Check([string]$Name, [string]$Value, [string]$Status, [string]$Notes) {
  $script:checks += [pscustomobject]@{
    Check = $Name
    Result = $Value
    Status = $Status
    Notes = $Notes
  }
}

$os = Get-CimInstance Win32_OperatingSystem
$cpu = @(Get-CimInstance Win32_Processor)
$computer = Get-CimInstance Win32_ComputerSystem
$ramGb = if ($computer.TotalPhysicalMemory) { [math]::Round($computer.TotalPhysicalMemory / 1GB, 1) } else { 0 }
$cores = ($cpu | Measure-Object -Property NumberOfCores -Sum).Sum
$osName = if ($os.Caption) { $os.Caption } else { 'Unknown Windows version' }
$osVersion = if ($os.Version) { $os.Version } else { 'Unknown build' }

Add-Check 'Operating system' "$osName ($osVersion)" 'INFO' 'Windows host detected; confirm it receives supported security updates.'
Add-Check 'Physical memory' "$ramGb GB" $(if ($ramGb -ge 8) {'PASS'} elseif ($ramGb -ge 4) {'MINIMUM'} else {'FAIL'}) 'Supabase stack minimum 4 GB; recommended 8 GB or more.'
Add-Check 'CPU cores' "$cores cores" $(if ($cores -ge 4) {'PASS'} elseif ($cores -ge 2) {'MINIMUM'} else {'FAIL'}) 'Supabase stack minimum 2 cores; recommended 4 or more.'

$systemDrive = $env:SystemDrive
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$systemDrive'"
$freeGb = if ($disk.FreeSpace) { [math]::Round($disk.FreeSpace / 1GB, 1) } else { 0 }
$sizeGb = if ($disk.Size) { [math]::Round($disk.Size / 1GB, 1) } else { 0 }
Add-Check 'System drive free space' "$freeGb GB free of $sizeGb GB" $(if ($freeGb -ge 80) {'PASS'} elseif ($freeGb -ge 40) {'MINIMUM'} else {'FAIL'}) 'Supabase stack guidance: 40 GB SSD minimum, 80 GB+ recommended. Verify the drive is SSD.'

$docker = Get-Command docker
if ($docker) {
  $dockerVersion = (& docker --version 2>&1 | Out-String).Trim()
  $dockerInfo = & docker info --format '{{.ServerVersion}}' 2>$null
  if ($LASTEXITCODE -eq 0 -and $dockerInfo) {
    Add-Check 'Docker engine' "$dockerVersion; engine $dockerInfo" 'PASS' 'Docker command and running engine detected.'
  } else {
    Add-Check 'Docker engine' "$dockerVersion; engine not responding" 'WARN' 'Docker is installed but its engine is not currently responding.'
  }
} else {
  Add-Check 'Docker engine' 'Not installed or not on PATH' 'NOT READY' 'Docker Desktop is required for the Windows pilot.'
}

$wsl = Get-Command wsl
if ($wsl) {
  $wslStatus = (& wsl --status 2>&1 | Out-String).Trim()
  Add-Check 'WSL' 'Command available' 'INFO' ($wslStatus -replace '\s+', ' ')
} else {
  Add-Check 'WSL' 'Not detected' 'WARN' 'Docker Desktop on Windows commonly uses WSL 2; check Docker Desktop requirements.'
}

Write-Host ''
Write-Host 'CORNHILL LOCAL HOST READINESS — READ ONLY' -ForegroundColor Cyan
$checks | Format-Table -AutoSize -Wrap
Write-Host ''
if (($checks | Where-Object { $_.Status -eq 'FAIL' }).Count -gt 0) {
  Write-Host 'RESULT: BELOW MINIMUM — do not install the full pilot stack on this host.' -ForegroundColor Red
} elseif (($checks | Where-Object { $_.Status -in @('MINIMUM','WARN','NOT READY') }).Count -gt 0) {
  Write-Host 'RESULT: PARTIAL — review warnings and confirm hardware/network requirements before proceeding.' -ForegroundColor Yellow
} else {
  Write-Host 'RESULT: BASIC HOST CHECK PASSED — this is not yet proof of production readiness.' -ForegroundColor Green
}
Write-Host ''
Write-Host 'No settings or files were changed. No credentials were read.'
