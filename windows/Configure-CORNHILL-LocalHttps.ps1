[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

if (-not (Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue)) {
    throw "Windows certificate tools are unavailable. This setup requires New-SelfSignedCertificate."
}

$localServerRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\local-server"))
$envPath = Join-Path $localServerRoot ".env"
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    throw "CORNHILL local-server .env file was not found. Run the local database installer first."
}

$certDirectory = Join-Path $env:LOCALAPPDATA "Cornhill\certs"
New-Item -ItemType Directory -Path $certDirectory -Force | Out-Null
$pfxPath = Join-Path $certDirectory "localhost.pfx"
$certPath = Join-Path $certDirectory "localhost.cer"

Write-Host "Creating a locally trusted HTTPS certificate for localhost..."
$certificate = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "Cert:\CurrentUser\My" -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -Type SSLServerAuthentication -NotAfter (Get-Date).AddYears(2) -FriendlyName "CORNHILL Local HTTPS"

$randomBytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($randomBytes)
} finally {
    $rng.Dispose()
}
$pfxPassword = [Convert]::ToBase64String($randomBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
[Array]::Clear($randomBytes, 0, $randomBytes.Length)
$securePassword = ConvertTo-SecureString -String $pfxPassword -AsPlainText -Force

Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $securePassword -Force | Out-Null
Export-Certificate -Cert $certificate -FilePath $certPath -Force | Out-Null
Import-Certificate -FilePath $certPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null

$settings = [ordered]@{
    "CORNHILL_LOCAL_ORIGIN" = "https://localhost:4174"
    "CORNHILL_TLS_CERT_PATH" = $certPath
    "CORNHILL_TLS_PFX_PATH" = $pfxPath
    "CORNHILL_TLS_PFX_PASSWORD" = $pfxPassword
}
$lines = [System.Collections.Generic.List[string]]::new()
foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
    if ($line -notmatch '^\s*(CORNHILL_LOCAL_ORIGIN|CORNHILL_TLS_CERT_PATH|CORNHILL_TLS_PFX_PATH|CORNHILL_TLS_PFX_PASSWORD)\s*=') {
        $lines.Add($line)
    }
}
foreach ($entry in $settings.GetEnumerator()) {
    $lines.Add($entry.Key + "=" + $entry.Value)
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, (($lines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)

Write-Host "Trusted localhost certificate created."
Write-Host "Private PFX and its generated passphrase are stored outside the source repository and in the local .env file."
Write-Host "The passphrase is not displayed."
Write-Host "Configured origin: https://localhost:4174"
Write-Host "Next: run npm run start:auth from the local-server directory after pulling the PFX-support update."
