$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFilePath = Join-Path $projectRoot '.env'

function Get-PortFromEnvFile {
  param(
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    return 3000
  }

  $line = Get-Content $Path | Where-Object { $_ -match '^PORT=' } | Select-Object -First 1

  if (-not $line) {
    return 3000
  }

  $value = $line.Substring(5).Trim()

  if ($value -match '^[0-9]+$') {
    return [int]$value
  }

  return 3000
}

$port = Get-PortFromEnvFile -Path $envFilePath
Write-Host "[dev:safe] Using PORT=$port from .env"

$conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

if ($conns) {
  $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($procId in $procIds) {
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host "[dev:safe] Stopped stale PID $procId on port $port"
    }
    catch {
      Write-Host "[dev:safe] Failed to stop PID ${procId}: $($_.Exception.Message)"
    }
  }
}
else {
  Write-Host "[dev:safe] Port $port is free"
}

Set-Location $projectRoot
npx tsx watch src/server.ts
