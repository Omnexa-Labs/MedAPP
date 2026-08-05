# Running MedApp yourself, on the phone, over USB

The short version:

```powershell
.\scripts\dev-usb.ps1
```

Then press `a` in the Metro terminal, and sign in as `ama.mensah@medapp.dev` / `MedApp!2026`.

That script does everything this document explains. Read the rest when it fails, or when
you want to know why any of it is the way it is.

> **This supersedes [local-dev.md](local-dev.md) for phone work.** That file is written for
> `make` + bash + an emulator, and one of its instructions is actively wrong: it says to set
> `EXPO_PUBLIC_API_BASE_URL`, but `app.config.ts` reads **`API_BASE_URL`**. Setting the
> `EXPO_PUBLIC_` spelling does nothing at all — the app silently keeps its default
> (`http://10.0.2.2:8000`, the *emulator's* host address) and every request fails on a real
> phone. If you followed that file and got an app that rendered but could not log in, that
> was why, and it was not your mistake.

---

## The one thing that makes this setup unusual

**The office Wi-Fi cannot carry this.** `AMALITECH-NSP` has wireless client isolation on: the
laptop and the phone can be on the same subnet and still not exchange a single packet. It was
measured — 0 of 2 pings across the same /24. So the two things that normally work do not:

- Metro's LAN URL (`exp://192.168.x.x:8081`) — the phone cannot reach it
- an API base of `http://<laptop-lan-ip>:8010` — same

**USB fixes it by not using the network at all.** `adb reverse tcp:8010 tcp:8010` tells the
phone: "open port 8010 on your *own* loopback, and send anything arriving there down the cable
to the laptop." So the app is configured to call `http://127.0.0.1:8010` — an address that, on
the phone, means the laptop. That is the whole trick, and it is why the API base looks like it
is pointing at the phone itself.

Two tunnels are needed, and they fail differently:

| Tunnel | If it's missing |
|---|---|
| `8081` (Metro) | Expo Go can't download the bundle. "Something went wrong", or Android's useless `Error type 3`. |
| `8010` (gateway) | The app **opens and renders fine**, and every network call fails. Looks exactly like a backend bug. It isn't. |

The second one has cost us time more than once. If the UI is up but nothing loads, check
`adb reverse --list` before you look at a single log line.

---

## Doing it by hand

Five steps. The script is these, with checks.

### 1. Backend

From the repo root, in PowerShell:

```powershell
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.ports.yml up -d postgres rabbitmq api_gateway user_service doctor_service booking_service telemedicine_service
```

**Both `-f` files, base first.** The second one moves every published port up by 10
(8000→8010, 5432→5442, 6379→6389, 8001→8011) so MedApp can share this machine with another
project's containers. Nothing *inside* the compose network moves — services still reach each
other on their original names and ports — so only the host-side mapping changes.

Seven services, not all thirty-odd. These are what the app touches; `-Full` on the script
starts everything if you ever need it.

### 2. Migrations

```powershell
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.ports.yml exec -T user_service alembic upgrade head
```

…and the same for `doctor_service`, `booking_service`, `telemedicine_service`.

Wait for `/healthz` first. Alembic against a Postgres that hasn't finished initialising fails
in a way that reads like a broken migration.

### 3. Seed

```powershell
Get-Content -Raw scripts/seed_dev_data.py | docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.ports.yml exec -T user_service python -
```

**`Get-Content | …` and not `python - < file`.** PowerShell has no `<` input-redirection
operator; that's a syntax error, not a subtle failure.

Also: **don't run `scripts/seed.sh`.** It's bash, and `bash` on this machine resolves to WSL,
which has no distro installed — you'll get `Windows Subsystem for Linux has no installed
distributions`. It also can't take both compose files: it does `-f "$COMPOSE_FILE"` with a
single value, so the colon-joined `COMPOSE_FILE` form breaks it. Use the PowerShell line above,
or run the `.sh` from Git Bash if you prefer it.

The seed is **idempotent** — users are matched by email, doctors by owning user id — so running
it twice updates rather than duplicates, and re-asserts the passwords.

It creates one verified patient and six doctors:

- **`ama.mensah@medapp.dev` / `MedApp!2026`** ← sign in with this
- Kwabena Osei, Adjoa Boateng, Yaw Darko, Efua Asante, Nii Tetteh, Abena Owusu

Those names matter beyond convenience: any clinician name you see in the app that *isn't* on
that list is invented mock data, and that's a bug to report.

### 4. The phone

```powershell
adb devices
adb shell svc power stayon usb
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8010 tcp:8010
adb reverse --list
```

`adb` lives at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` if it isn't on PATH.

`svc power stayon usb` keeps the screen on while the cable is in. A dozing phone drops the
socket fast-refresh rides on, and returns blank frames to `screencap`.

The tunnels do **not** survive a replug. Re-run the two `reverse` lines any time you unplug —
that alone is the fix for "it was working an hour ago".

### 5. Metro

```powershell
cd frontend\mobile\MedAPP
$env:API_BASE_URL = "http://127.0.0.1:8010"
npx expo start
```

Then `a` to launch on the device, or scan the QR with Expo Go.

Two traps here:

- **`API_BASE_URL` is baked at startup**, when `app.config.ts` is evaluated. Reloading the app
  does not pick up a change; you have to restart Metro.
- **Run `npx expo` from `frontend\mobile\MedAPP`.** From anywhere else — your home directory,
  the repo root — npx doesn't find the local Expo and *offers to install a different version*.
  Say **no**. Installing Expo 57 over an SDK 55 project is a bad afternoon.

---

## When it breaks

| What you see | What it is |
|---|---|
| `Windows Subsystem for Linux has no installed distributions` | You ran a `.sh`. Use the PowerShell equivalent above. |
| `Bind for 0.0.0.0:5442 failed: port is already allocated` | Something else holds an offset port. `docker ps` to find it. |
| npx asks to install `expo@57` | Wrong directory. `cd frontend\mobile\MedAPP`. Answer **n**. |
| Expo Go: `Error type 3` | No 8081 tunnel, or Metro isn't running. Re-run `adb reverse tcp:8081 tcp:8081`. |
| App opens, every screen empty or spinning | No 8010 tunnel, or `API_BASE_URL` unset/wrong. Check `adb reverse --list`, then restart Metro. |
| Login fails with valid credentials | Seed never ran, or ran against a fresh volume. Re-seed. |
| `adb` says `unauthorized` | Unlock the phone, tap **Allow** on the USB-debugging prompt. If no prompt: `adb kill-server`, unplug, replug. |
| `adb` says `offline`, or lists nothing | Cable in a data port? Phone unlocked? USB mode **File transfer**, not **Charging only**? Then `adb kill-server`. |
| Metro dies whenever a file is saved | Known: Metro on this project falls over when the file tree changes under it while something else is also writing. Don't run a build or a code-editing agent against the repo while Metro is up. Restart with `.\scripts\dev-usb.ps1 -SkipDocker -SkipSeed`. |
| Port 8081 already in use | An old Metro. Don't accept Expo's offer of another port — the tunnel only covers 8081. Kill the old one: `Get-NetTCPConnection -LocalPort 8081 -State Listen \| Select-Object -Expand OwningProcess \| ForEach-Object { Stop-Process -Id $_ -Force }` |

### Starting clean

```powershell
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.ports.yml down -v
```

`-v` drops the volumes, so Postgres is empty and **you must re-seed**. Do this when the
database is in a state you can't explain — it's faster than diagnosing it.

To wipe just the app: `adb shell pm clear host.exp.exponent` clears Expo Go's data, including
cached bundles and the app's stored auth token, which puts you back on the sign-in screen.

---

## Faster loops

```powershell
.\scripts\dev-usb.ps1 -SkipDocker -SkipSeed   # Metro only - the common one
.\scripts\dev-usb.ps1 -SkipDocker             # re-seed, then Metro
.\scripts\dev-usb.ps1 -NoMetro                # set everything up, start Metro yourself
.\scripts\dev-usb.ps1 -Full                   # every backend service
```

Backend containers survive Metro restarts and laptop sleep. You usually only need the first
line.

---

## What actually works today

Most of the app still runs on mock data — worth knowing so you don't file a bug against a
screen that was never wired. Reading **live** from the backend:

- **Sign in / sign up** → `user_service`
- **Find Care** (the provider directory) → `doctor_service` and friends
- **Appointments** → `GET /v1/bookings`, with a per-doctor lookup for names and specialties
- **Booking a slot** → `POST /v1/bookings`, including consultation mode and a provisioned
  video room

Everything else renders designed screens against static data. `docs/PIPELINE.md` §4 has the
current per-screen state.
