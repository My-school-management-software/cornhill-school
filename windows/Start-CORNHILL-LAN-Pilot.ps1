[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 8088,

  [string]$BindAddress = ''
)

# CORNHILL LAN pilot: a temporary, read-only web page for testing device-to-PC
# connectivity. It does not install software, create firewall rules, access
# school data, connect to Supabase/Vercel, or write files.
$ErrorActionPreference = 'Stop'

$page = @'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#14532d">
<title>CORNHILL &middot; Local Network Pilot</title>
<style>
:root{color-scheme:light;--ink:#17251c;--muted:#647267;--line:#d9e2da;--green:#14532d;--soft:#edf5ef}
*{box-sizing:border-box}
body{margin:0;background:#f4f7f4;color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:7vh auto;padding:20px}
.panel{background:#fff;border:1px solid var(--line);border-radius:18px;padding:clamp(22px,5vw,38px);box-shadow:0 12px 34px rgba(20,83,45,.07)}
.eyebrow{color:var(--green);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
h1{margin:8px 0 6px;font-size:clamp(28px,5vw,40px);line-height:1.12}
.muted{color:var(--muted)}
.status{display:flex;align-items:center;gap:10px;margin:24px 0;padding:14px 16px;border-radius:12px;background:var(--soft);font-weight:700}
.dot{width:11px;height:11px;border-radius:50%;background:#d97706;flex:none}
.status.ok .dot{background:#15803d}
.status.bad .dot{background:#b91c1c}
.details{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0}
.tile{border:1px solid var(--line);border-radius:12px;padding:14px}
.tile strong{display:block;font-size:13px}
.tile span{color:var(--muted);font-size:14px}
.notice{margin-top:24px;padding:16px;border-left:4px solid var(--green);background:#f6faf6;border-radius:8px}
footer{margin-top:18px;color:var(--muted);font-size:12px}
@media(max-width:520px){main{margin:2vh auto;padding:12px}.details{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
<section class="panel">
<div class="eyebrow">CORNHILL NURSERY AND PRIMARY SCHOOL</div>
<h1>Local network test</h1>
<p class="muted">A temporary test page served directly by the Windows computer.</p>
<div id="status" class="status"><span class="dot"></span><span id="statusText">Checking the local test server...</span></div>
<div class="details">
<div class="tile"><strong>Connection</strong><span id="connection">Checking...</span></div>
<div class="tile"><strong>Test page</strong><span>Served from this PC</span></div>
<div class="tile"><strong>Internet dependency</strong><span>None for this page</span></div>
<div class="tile"><strong>Database</strong><span>Not connected</span></div>
</div>
<div class="notice">
<strong>What this proves</strong>
<p>If this page opens on your phone, the phone can reach a small web service running on the PC over the current Wi-Fi/hotspot connection.</p>
<strong>What this does not prove</strong>
<p>This is not the full CORNHILL application or database. It does not sign users in, save records, or connect to the live Supabase or Vercel services.</p>
</div>
<footer>Experimental local-network copy &middot; Synthetic test only &middot; No school records are used</footer>
</section>
</main>
<script>
(async function () {
  const box = document.getElementById('status');
  const text = document.getElementById('statusText');
  const connection = document.getElementById('connection');
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    if (result.status !== 'ok') throw new Error('Unexpected response');
    box.classList.add('ok');
    text.textContent = 'Connected to the CORNHILL test server';
    connection.textContent = 'Successful';
  } catch (error) {
    box.classList.add('bad');
    text.textContent = 'The page opened, but its health check failed';
    connection.textContent = 'Check required';
  }
})();
</script>
</body>
</html>
'@

$listener = $null

try {
  if ([string]::IsNullOrWhiteSpace($BindAddress)) {
    $network = Get-NetIPConfiguration |
      Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
      Select-Object -First 1

    if ($network -and $network.IPv4Address.Count -gt 0) {
      $BindAddress = $network.IPv4Address[0].IPAddress
    } else {
      throw 'No active IPv4 network with a default gateway was found. Connect the PC to the school Wi-Fi or phone hotspot and try again.'
    }
  }

  $ip = [System.Net.IPAddress]::Parse($BindAddress)
  if ($ip.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    throw 'Please provide an IPv4 address, not an IPv6 address.'
  }

  $listener = [System.Net.Sockets.TcpListener]::new($ip, $Port)
  $listener.Start()

  Write-Host ''
  Write-Host 'CORNHILL LOCAL NETWORK PILOT' -ForegroundColor Green
  Write-Host 'Temporary test page only. No database or school records are connected.' -ForegroundColor Yellow
  Write-Host ''
  Write-Host "On this PC, open: http://127.0.0.1:$Port/"
  Write-Host "On a phone using the same Wi-Fi/hotspot, open: http://$($BindAddress):$Port/"
  Write-Host ''
  Write-Host 'Keep this PowerShell window open while testing.' -ForegroundColor Cyan
  Write-Host 'To stop the test server, press Ctrl+C.' -ForegroundColor Cyan
  Write-Host 'The script does not create or change Windows Firewall rules.' -ForegroundColor DarkYellow
  Write-Host ''

  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $stream.ReadTimeout = 5000
      $reader = [System.IO.StreamReader]::new(
        $stream,
        [System.Text.Encoding]::ASCII,
        $false,
        1024,
        $true
      )

      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        continue
      }

      while ($true) {
        $headerLine = $reader.ReadLine()
        if ($null -eq $headerLine -or $headerLine.Length -eq 0) { break }
      }

      $parts = $requestLine.Split(' ')
      $method = if ($parts.Length -ge 1) { $parts[0] } else { '' }
      $path = if ($parts.Length -ge 2) { ($parts[1] -split '\?')[0] } else { '/' }

      $status = '200 OK'
      $contentType = 'text/html; charset=utf-8'
      $body = $page

      if ($method -ne 'GET') {
        $status = '405 Method Not Allowed'
        $contentType = 'text/plain; charset=utf-8'
        $body = 'This temporary pilot accepts GET requests only.'
      } elseif ($path -eq '/health') {
        $contentType = 'application/json; charset=utf-8'
        $serverTime = [DateTime]::UtcNow.ToString('o')
        $body = '{"status":"ok","service":"cornhill-lan-pilot","serverTimeUtc":"' + $serverTime + '"}'
      } elseif ($path -ne '/' -and $path -ne '/index.html') {
        $status = '404 Not Found'
        $contentType = 'text/plain; charset=utf-8'
        $body = 'Not found.'
      }

      $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
      $crlf = [Environment]::NewLine
      $headers = "HTTP/1.1 $status" + $crlf +
        "Content-Type: $contentType" + $crlf +
        "Content-Length: $($bodyBytes.Length)" + $crlf +
        "Connection: close" + $crlf +
        "Cache-Control: no-store" + $crlf +
        "X-Content-Type-Options: nosniff" + $crlf + $crlf
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)

      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($bodyBytes, 0, $bodyBytes.Length)
      $stream.Flush()
      Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $method $path" -ForegroundColor Gray
    } catch {
      Write-Warning "A local test request could not be completed: $($_.Exception.Message)"
    } finally {
      $client.Close()
    }
  }
} catch {
  Write-Error "CORNHILL LAN pilot could not start: $($_.Exception.Message)"
  exit 1
} finally {
  if ($listener) {
    $listener.Stop()
    Write-Host 'CORNHILL local test server stopped.' -ForegroundColor Yellow
  }
}
