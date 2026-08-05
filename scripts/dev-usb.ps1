<#
.SYNOPSIS
  Brings up MedApp end to end and puts it on a USB-connected Android phone.

.DESCRIPTION
  One command for the whole loop: backend slice -> migrations -> seed data ->
  USB tunnels -> Metro. Written for Windows PowerShell, because that is the shell
  this machine actually has (`bash scripts/seed.sh` reaches for WSL, which has no
  distro installed here).

  WHY USB AND NOT WI-FI. The office network (AMALITECH-NSP) has wireless client
  isolation switched on: the laptop and the phone can sit on the same /24 and
  still not exchange a single packet, so Metro's LAN URL and any http://<lan-ip>
  API base are both unreachable from the phone. `adb reverse` tunnels sidestep the
  network entirely - the phone opens 127.0.0.1:PORT on ITSELF and adb forwards it
  down the cable to the laptop. That is why API_BASE_URL below is a loopback
  address even though the server is on a different machine to the app.

.PARAMETER SkipDocker
  Assume the backend containers are already up. Skips compose, migrations, health
  waits. Use when you are only restarting the app.

.PARAMETER SkipSeed
  Skip re-seeding. The seed is idempotent, so this is only about saving ~20s.

.PARAMETER NoMetro
  Do everything except start Metro. Prints the exact command to run yourself.

.PARAMETER Full
  Start every backend service instead of the six the app actually needs. Slower
  and heavier; you almost never want this.

.EXAMPLE
  .\scripts\dev-usb.ps1
  The normal run. Takes ~2 min cold, ~30s warm.

.EXAMPLE
  .\scripts\dev-usb.ps1 -SkipDocker -SkipSeed
  Metro crashed and you just want it back.
#>

[CmdletBinding()]
param(
  [switch]$SkipDocker,
  [switch]$SkipSeed,
  [switch]$NoMetro,
  [switch]$Full
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Paths and constants
# ---------------------------------------------------------------------------

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MobileDir = Join-Path $RepoRoot "frontend\mobile\MedAPP"
$ComposeBase = Join-Path $RepoRoot "infra\docker\docker-compose.yml"
$ComposePorts = Join-Path $RepoRoot "infra\docker\docker-compose.ports.yml"
$SeedScript = Join-Path $RepoRoot "scripts\seed_dev_data.py"

# The gateway's HOST port. 8010, not 8000, because docker-compose.ports.yml
# offsets every published port by +10 so MedApp can share this machine with
# another project's containers. Inside the compose network nothing moved.
$GatewayPort = 8010
# Metro's port. Not negotiable in the same way - Expo Go looks for 8081.
$MetroPort = 8081

# Only what the app touches. postgres/rabbitmq are dependencies; api_gateway is
# the only thing the phone talks to directly.
$SliceServices = @(
  "postgres", "rabbitmq", "api_gateway",
  "user_service", "doctor_service", "booking_service", "telemedicine_service"
)
# Services whose schema the seed (or the booking flow right after it) needs.
$MigrateServices = @("user_service", "doctor_service", "booking_service", "telemedicine_service")

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "    $msg" -ForegroundColor DarkGray }
function Write-Warn2($msg) { Write-Host "    ! $msg" -ForegroundColor Yellow }

# Both compose files, base first. Order matters: the second file's `!override`
# tags replace the first's port lists rather than appending to them.
$Compose = @("compose", "-f", $ComposeBase, "-f", $ComposePorts)

# ---------------------------------------------------------------------------
# 0. Find adb
# ---------------------------------------------------------------------------

Write-Step "Locating adb"
$adb = $null
$onPath = Get-Command adb -ErrorAction SilentlyContinue
if ($null -ne $onPath) {
  $adb = $onPath.Source
} else {
  # Where Android Studio puts it on Windows.
  $guess = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
  if (Test-Path $guess) { $adb = $guess }
}
if ($null -eq $adb) {
  throw "adb not found. Install Android Studio's platform-tools, or add it to PATH. Looked in: PATH, $env:LOCALAPPDATA\Android\Sdk\platform-tools"
}
Write-Ok $adb

# ---------------------------------------------------------------------------
# 1. Backend
# ---------------------------------------------------------------------------

if (-not $SkipDocker) {
  Write-Step "Checking Docker"
  docker info *> $null
  if (-not $?) { throw "Docker is not running. Start Docker Desktop, wait for the whale to settle, and retry." }
  Write-Ok "running"

  $services = if ($Full) { @() } else { $SliceServices }
  $label = if ($Full) { "every service" } else { "$($SliceServices.Count) services" }

  Write-Step "Starting backend ($label)"
  Write-Ok "first run pulls and builds images - this is the slow part"
  & docker @Compose up -d @services
  if (-not $?) { throw "compose up failed. If it says 'port is already allocated', something else on this machine holds 5442/6389/8010/8011." }

  # Health-wait before migrating: alembic against a Postgres that has not
  # finished initialising fails in a way that looks like a migration bug.
  Write-Step "Waiting for services to answer /healthz"
  $portFor = @{ user_service = 8001; doctor_service = 8002; booking_service = 8003 }
  foreach ($svc in @("user_service", "doctor_service")) {
    $ready = $false
    foreach ($attempt in 1..60) {
      & docker @Compose exec -T $svc curl -fsS "http://127.0.0.1:$($portFor[$svc])/healthz" *> $null
      if ($?) { $ready = $true; break }
      Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw "$svc never became healthy. Look at: docker compose -f `"$ComposeBase`" -f `"$ComposePorts`" logs $svc" }
    Write-Ok "$svc ready"
  }

  Write-Step "Applying migrations"
  foreach ($svc in $MigrateServices) {
    & docker @Compose exec -T $svc alembic upgrade head *> $null
    if (-not $?) { throw "alembic failed for $svc. Run it without the output redirect to see why." }
    Write-Ok $svc
  }
} else {
  Write-Step "Skipping Docker (-SkipDocker)"
}

# ---------------------------------------------------------------------------
# 2. Seed
# ---------------------------------------------------------------------------

if (-not $SkipSeed) {
  Write-Step "Seeding dev data"
  # `Get-Content | docker ... python -` and NOT `python - < file`: PowerShell has
  # no input redirection operator, so `<` is a syntax error here. The seeder runs
  # INSIDE the container so it can use each service's own layer over the compose
  # network - no host Python, no published ports, no gateway rate limiter.
  Get-Content -Raw $SeedScript | & docker @Compose exec -T user_service python -
  if (-not $?) { throw "Seeding failed. The stack is up, so this is the seeder's problem - re-run with -SkipDocker to iterate." }
} else {
  Write-Step "Skipping seed (-SkipSeed)"
}

# ---------------------------------------------------------------------------
# 3. The phone
# ---------------------------------------------------------------------------

Write-Step "Looking for a USB device"
$devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\S" }
$authorized = $devices | Where-Object { $_ -match "\sdevice$" }

if ($null -eq $authorized) {
  $unauth = $devices | Where-Object { $_ -match "unauthorized" }
  if ($null -ne $unauth) {
    throw "Phone is connected but UNAUTHORIZED. Unlock it and tap 'Allow' on the USB-debugging prompt, then re-run. If no prompt appears: & '$adb' kill-server, unplug, replug."
  }
  throw "No device. Check: cable in a USB port that carries data, phone unlocked, Developer options -> USB debugging ON, and 'File transfer / MTP' rather than 'Charging only'."
}
Write-Ok ($authorized -join ", ")

Write-Step "Keeping the screen awake"
# A dozing phone returns blank frames to screencap and drops the socket that
# Metro's fast-refresh rides on. This survives until the cable comes out.
& $adb shell svc power stayon usb
Write-Ok "stay-on while charging over USB"

Write-Step "Opening reverse tunnels"
# BOTH are required and they fail differently, which is worth knowing:
#   8081 missing -> Expo Go cannot download the bundle at all ("Something went
#                   wrong", or Android's opaque "Error type 3")
#   8010 missing -> the app opens, renders, and every request fails. It looks
#                   like a backend bug and is not one.
& $adb reverse "tcp:$MetroPort" "tcp:$MetroPort" | Out-Null
& $adb reverse "tcp:$GatewayPort" "tcp:$GatewayPort" | Out-Null
& $adb reverse --list
Write-Ok "the phone's own 127.0.0.1:$MetroPort and :$GatewayPort now come down the cable"

# ---------------------------------------------------------------------------
# 4. Metro
# ---------------------------------------------------------------------------

# API_BASE_URL, *not* EXPO_PUBLIC_API_BASE_URL. app.config.ts reads
# `process.env.API_BASE_URL` (line 41) and puts it in `extra.apiBaseUrl`;
# docs/runbooks/local-dev.md's EXPO_PUBLIC_ spelling is read by nothing.
#
# It is baked at STARTUP, when app.config.ts is evaluated. Changing it later
# means restarting Metro - a reload will not pick it up.
$env:API_BASE_URL = "http://127.0.0.1:$GatewayPort"
$env:APP_ENV = "dev"

Write-Step "Sign in with"
Write-Host "    ama.mensah@medapp.dev / MedApp!2026" -ForegroundColor Green

if ($NoMetro) {
  Write-Step "Not starting Metro (-NoMetro). Run this yourself:"
  Write-Host "    cd `"$MobileDir`"" -ForegroundColor Green
  Write-Host "    `$env:API_BASE_URL = `"http://127.0.0.1:$GatewayPort`"" -ForegroundColor Green
  Write-Host "    npx expo start" -ForegroundColor Green
  exit 0
}

# Warn rather than fail: an already-running Metro is a normal state, and Expo
# will offer to use another port (which the tunnel above does NOT cover).
$portBusy = Get-NetTCPConnection -LocalPort $MetroPort -State Listen -ErrorAction SilentlyContinue
if ($null -ne $portBusy) {
  Write-Warn2 "Port $MetroPort is already in use - probably a Metro you forgot about."
  Write-Warn2 "If Expo offers a different port, say NO and close the old one instead:"
  Write-Warn2 "  Get-NetTCPConnection -LocalPort $MetroPort -State Listen | Select-Object -Expand OwningProcess | ForEach-Object { Stop-Process -Id `$_ -Force }"
}

Write-Step "Starting Metro (Ctrl+C to stop)"
Write-Ok "API_BASE_URL=$env:API_BASE_URL"
Write-Ok "Press 'a' to open on the phone, or scan the QR with Expo Go"
Write-Ok "IMPORTANT: run this from $MobileDir - `npx expo` in the wrong folder offers to INSTALL a different Expo. Say no."

Set-Location $MobileDir
& npx expo start
