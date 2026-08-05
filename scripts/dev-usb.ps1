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

.PARAMETER ClearCache
  Pass --clear to Metro. Needed after a dependency change; otherwise the bundler
  serves a stale graph and you debug a bug that is not in your code.

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
  [switch]$Full,
  [switch]$ClearCache
)

# DELIBERATELY "Continue", NOT "Stop" - this cost a run, so it is worth the note.
#
# Windows PowerShell 5.1 wraps every stderr line from a NATIVE command in an
# ErrorRecord (NativeCommandError). Under `Stop`, that makes any tool writing a
# WARNING to stderr fatal. `docker compose` writes
#   level=warning msg="The \"ANTHROPIC_API_KEY\" variable is not set"
# for each agent service in the compose file - services this script does not even
# start, but compose parses the whole file - so the first health check aborted the
# script while the backend was in fact up and healthy.
#
# So: `Continue`, and every native call is checked on $LASTEXITCODE explicitly,
# which is the only reliable success signal for an .exe. `throw` is still
# terminating regardless of this preference, so the guard clauses below behave the
# same way they read.
# ASCII ONLY IN THIS FILE. Windows PowerShell 5.1 decodes .ps1 as the system ANSI
# codepage unless the file has a UTF-8 BOM, so one em dash becomes three bytes and
# the parser dies with "Unexpected token" pointing at innocent-looking words. Use
# plain hyphens and straight quotes.
$ErrorActionPreference = "Continue"

# ---------------------------------------------------------------------------
# .env - created on first run, and this is why compose was warning
# ---------------------------------------------------------------------------
# docs/runbooks/local-dev.md's first instruction is `cp .env.example .env`, and
# skipping it is what produces six
#   level=warning msg="The \"ANTHROPIC_API_KEY\" variable is not set"
# lines on every compose call. Harmless in themselves - none of the AI agents is
# in $SliceServices - but six warnings on every run train you to stop reading
# compose's output, and the next warning will be a real one.
#
# --env-file is passed EXPLICITLY below rather than relying on auto-discovery:
# Compose resolves a bare `.env` against the project directory, which defaults to
# the COMPOSE FILE's directory (infra/docker/), not the repo root where .env lives.

# ---------------------------------------------------------------------------
# Paths and constants
# ---------------------------------------------------------------------------

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MobileDir = Join-Path $RepoRoot "frontend\mobile\MedAPP"
$ComposeBase = Join-Path $RepoRoot "infra\docker\docker-compose.yml"
$ComposePorts = Join-Path $RepoRoot "infra\docker\docker-compose.ports.yml"
$SeedScript = Join-Path $RepoRoot "scripts\seed_dev_data.py"
$EnvFile = Join-Path $RepoRoot ".env"
$EnvExample = Join-Path $RepoRoot ".env.example"

if (-not (Test-Path $EnvFile)) {
  if (Test-Path $EnvExample) {
    Copy-Item $EnvExample $EnvFile
    Write-Host "==> Created .env from .env.example (first-run step from local-dev.md)" -ForegroundColor Cyan
  }
}

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
$Compose = @("compose", "--env-file", $EnvFile, "-f", $ComposeBase, "-f", $ComposePorts)

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
  # `> $null` redirects stdout ONLY. Never `*> $null` on a native command here -
  # see the note at the top of the file; that is what broke this script once.
  docker info > $null 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Docker is not running. Start Docker Desktop, wait for the whale to settle, and retry." }
  Write-Ok "running"

  $services = if ($Full) { @() } else { $SliceServices }
  $label = if ($Full) { "every service" } else { "$($SliceServices.Count) services" }

  Write-Step "Starting backend ($label)"
  Write-Ok "first run pulls and builds images - this is the slow part"
  & docker @Compose up -d @services
  if ($LASTEXITCODE -ne 0) { throw "compose up failed. If it says 'port is already allocated', something else on this machine holds 5442/6389/8010/8011." }

  # Health-wait before migrating: alembic against a Postgres that has not
  # finished initialising fails in a way that looks like a migration bug.
  Write-Step "Waiting for services to answer /healthz"
  $portFor = @{ user_service = 8001; doctor_service = 8002; booking_service = 8003; telemedicine_service = 8007 }
  foreach ($svc in @("user_service", "doctor_service")) {
    $ready = $false
    foreach ($attempt in 1..60) {
      & docker @Compose exec -T $svc curl -fsS "http://127.0.0.1:$($portFor[$svc])/healthz" > $null 2>$null
      if ($LASTEXITCODE -eq 0) { $ready = $true; break }
      Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw "$svc never became healthy. Look at: docker compose -f `"$ComposeBase`" -f `"$ComposePorts`" logs $svc" }
    Write-Ok "$svc ready"
  }

  Write-Step "Applying migrations"
  foreach ($svc in $MigrateServices) {
    # Captured rather than discarded: on failure the output IS the diagnosis, and
    # "run it again without the redirect" is a poor answer at 1am.
    $out = & docker @Compose exec -T $svc alembic upgrade head 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host ($out | Out-String) -ForegroundColor Red
      throw "alembic failed for $svc - output above."
    }
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
  if ($LASTEXITCODE -ne 0) { throw "Seeding failed. The stack is up, so this is the seeder's problem - re-run with -SkipDocker -SkipSeed=`$false to iterate." }
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
# A crashed Metro can leave a listener holding the port on ::1 only - alive enough
# to block a rebind, dead enough to serve nothing. That is not a state worth asking
# the user to reason about, so it is cleared automatically.
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
# TWO SETTINGS, AND BOTH ARE LOAD-BEARING. Getting this wrong produces an Expo Go
# that loads forever with NO error message, which is the least debuggable failure
# in this whole setup - so the reasoning is written out.
#
# 1. WHY NOT PLAIN `expo start`: it defaults to advertising exp://<lan-ip>:8081 and
#    encodes that into the QR code. This network isolates wireless clients, so the
#    phone cannot reach the laptop's LAN address at all.
#
# 2. WHY NOT `--localhost` EITHER, which was this script's first fix: `--localhost`
#    made Metro bind ONLY to `::1` - IPv6 loopback. But `adb reverse tcp:8081
#    tcp:8081` forwards the phone's port to the host's IPv4 loopback, so the phone
#    connected to 127.0.0.1:8081 where NOTHING was listening. Measured:
#      Get-NetTCPConnection -LocalPort 8081 -State Listen  ->  LocalAddress ::1
#      curl http://127.0.0.1:8081/status                   ->  connection refused
#    Same silent infinite spinner, one layer deeper.
#
# So: `--host lan` to make Metro bind `::` (dual-stack, which covers IPv4 - verified
# by curl returning 200 on 127.0.0.1 afterwards), and
# REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1 to make the ADVERTISED url and the QR
# code point at the loopback the tunnel actually carries. Bind broadly, advertise
# narrowly.
$env:REACT_NATIVE_PACKAGER_HOSTNAME = "127.0.0.1"

$expoArgs = @('expo', 'start', '--host', 'lan')
if ($ClearCache) { $expoArgs += '--clear' }
& npx @expoArgs
