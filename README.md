# HamShack Dashboard

A real-time ham radio dashboard showing spots, space weather, ISS position, and more.

## Running locally (Raspberry Pi, Windows, Linux)

The app runs the same way on **Raspberry Pi**, **Windows**, and **Linux**: one Node.js server serves the built frontend. No platform-specific code.

**Requirements:** Node.js **18** or newer.

### One-time setup (all platforms)

```bash
# From the project root
npm run install:all
npm run build
```

Optional: configure DX Cluster, RBN, port, etc. in `server/.env` (copy from `server/.env.example`).

### Start the app

```bash
# Builds the client (if needed) and starts the server
npm start
```

If the client is already built:

```bash
npm run start:server
```

Then open in a browser:

- **Same machine:** http://localhost:8788  
- **Other devices (e.g. Raspi in LAN):** `http://<IP>:8788` (e.g. http://192.168.1.10:8788)  

The server listens on all interfaces, so you can use the Pi’s IP to open the dashboard from another device.

### Raspberry Pi notes

- **Node.js 18+:** Install via [NodeSource](https://github.com/nodesource/distributions) or your OS package manager (e.g. Raspberry Pi OS 64-bit).
- **Memory:** Building the client on a Pi can be slow; you can build once on a PC and copy the `client/dist` and `server` folders to the Pi, then run `npm run start:server` (with Node and `server/node_modules` installed on the Pi).
- **Auto-start (optional):** Use a systemd service or `pm2` to run `node server/index.js` from the project root after boot.

### Windows / Linux

- **Windows:** Same commands in PowerShell or Command Prompt. For dev (hot reload), use `npm run dev` (requires two terminals or the combined dev script).
- **Linux:** Same as above; use `npm start` for production-style run.

---

## Quick Start (development)

### Option 1: Using npm script (Recommended)

1. Install dependencies for all projects:
```bash
npm run install:all
```

2. Start both servers:
```bash
npm run dev
```

### Option 2: Using Node.js script

```bash
node start-dev.js
```

### Option 3: Using PowerShell (Windows)

```powershell
.\start-dev.ps1
```

### Option 4: Using Batch script (Windows)

```cmd
start-dev.bat
```

### Option 5: Native Windows (Electron)

Als eigenständiges Fenster ohne Browser:

```bash
npm run install:all
npm run electron
```

Das baut den Client einmal, startet den Server und öffnet ein Desktop-Fenster. Für eine Windows-.exe: `npm run electron:pack` (Ausgabe in `dist-electron/`). Details: [electron/README.md](electron/README.md).

### Manual Start

Start backend:
```bash
cd server
npm start
```

Start frontend (in another terminal):
```bash
cd client
npm run dev
```

## Development

- Backend runs on: `http://localhost:8788`
- Frontend runs on: `http://localhost:5173` (Vite default)

## Production Build

Build the client:
```bash
npm run build
```

Then start the server (it will serve the built files):
```bash
cd server
npm start
```

## Configuration

### Environment Variables

The backend supports configuration via environment variables. You can set them in two ways:

#### Option 1: Using .env file (Recommended)

1. Copy the example file:
```bash
cd server
cp .env.example .env
```

2. Edit `.env` and add your configuration:
```env
DXCLUSTER_HOST=dxcluster.net
DXCLUSTER_PORT=7300
DXCLUSTER_CALLSIGN=YOURCALL

RBN_HOST=reversebeacon.net
RBN_PORT=7000
RBN_CALLSIGN=YOURCALL
```

#### Option 2: Set environment variables directly

**Windows (PowerShell):**
```powershell
$env:DXCLUSTER_HOST="dxcluster.net"
$env:DXCLUSTER_PORT="7300"
$env:DXCLUSTER_CALLSIGN="YOURCALL"
```

**Windows (CMD):**
```cmd
set DXCLUSTER_HOST=dxcluster.net
set DXCLUSTER_PORT=7300
set DXCLUSTER_CALLSIGN=YOURCALL
```

**Linux/macOS:**
```bash
export DXCLUSTER_HOST=dxcluster.net
export DXCLUSTER_PORT=7300
export DXCLUSTER_CALLSIGN=YOURCALL
```

### Available Environment Variables

- `PORT` - Server port (default: 8788)
- `DXCLUSTER_HOST` - DX Cluster hostname
- `DXCLUSTER_PORT` - DX Cluster port
- `DXCLUSTER_CALLSIGN` - Callsign for DX Cluster login (defaults to config callsign)
- `RBN_HOST` - RBN hostname
- `RBN_PORT` - RBN port
- `RBN_CALLSIGN` - Callsign for RBN login (defaults to config callsign)
- `CARTO_API_KEY` - CARTO API key for the CARTO Positron base map (optional)
- `MAP_TILE_URL` - Custom tile URL template with `{z}`, `{x}`, `{y}` (optional)
- `MAP_TILE_ATTRIBUTION` - Attribution HTML for `MAP_TILE_URL` (optional)
- `RIGCTLD_ENABLED`, `RIGCTLD_HOST`, `RIGCTLD_PORT`, `RIG_POLL_MS`, `RIGCTLD_TIMEOUT_MS`, `RIG_LICENCE_CLASS` - Rig control (optional, see below)

### Map tiles

The server fetches base map tiles and serves them at `/api/tiles/{z}/{x}/{y}.png`, so provider keys never reach the browser. Tiles are cached in memory (7 days, max. 2000 tiles). The provider is chosen from `server/.env`:

| Configuration | Provider | Attribution |
|---------------|----------|-------------|
| `MAP_TILE_URL` set (must contain `{z}`, `{x}`, `{y}`) | custom | `MAP_TILE_ATTRIBUTION` or OpenStreetMap |
| `CARTO_API_KEY` set | CARTO Positron (`light_all`) | OpenStreetMap contributors, CARTO |
| nothing set | OpenStreetMap Standard | OpenStreetMap contributors |

```env
# CARTO key from https://carto.com/basemaps/apikey
CARTO_API_KEY=your_key
# or any other provider
MAP_TILE_URL=https://tiles.example.com/{z}/{x}/{y}.png?key=your_key
MAP_TILE_ATTRIBUTION=&copy; Example Tiles
```

The startup log shows the active provider (`✓ Map tiles: osm|carto|custom`), and every tile response carries an `X-Tile-Provider` header. An invalid or expired CARTO key cannot be detected: CARTO then returns normal images with an "API KEY REQUIRED" watermark. Restart the server after changing these variables.

### Rig control (Yaesu FT-991A via hamlib rigctld)

The header display can show and set the frequency and mode of a Yaesu FT-991A. The dashboard talks to [hamlib](https://hamlib.github.io/) `rigctld` on `127.0.0.1:4532`; rigctld owns the CAT port, so WSJT-X and fldigi can share the rig through "Hamlib NET rigctl". Rig control is **off by default**; without it the display keeps working as a manual frequency field.

| Variable | Default | Description |
|----------|---------|-------------|
| `RIGCTLD_ENABLED` | `false` | `true` turns rig control on |
| `RIGCTLD_HOST` | `127.0.0.1` | rigctld host – loopback only (`127.x.x.x`, `::1`, `localhost`), anything else disables rig control |
| `RIGCTLD_PORT` | `4532` | rigctld TCP port |
| `RIG_POLL_MS` | `1000` | Polling interval while a dashboard is open (minimum 500) |
| `RIGCTLD_TIMEOUT_MS` | `5000` | Timeout per rigctld command |
| `RIG_LICENCE_CLASS` | `N` | German licence class `N`, `E` or `A`: the dashboard only tunes to the bands of this class |

- **Display:** live frequency, mode, S-meter, a "Live" indicator and a TX badge. Band label and the Range panel follow the live frequency. While the rig or rigctld is offline, the display shows "Rig offline" and your last manual frequency.
- **Control:** click the frequency, type it in MHz and press Enter to tune VFO A; pick the mode from the list. Frequencies outside the bands of `RIG_LICENCE_CLASS` are refused with a message and nothing is sent to the rig. A frequency entry keeps the shown mode even across bands (the FT-991A would otherwise recall the band's last mode), and a mode change keeps the frequency (the rig may shift it by a few hundred Hz; the dashboard tunes it back within your licence bands).
- **Safety:** the server only sends `get_freq`, `get_mode`, `get_ptt`, `get_level STRENGTH`, `set_freq` and `set_mode` (allowlist checked right before the socket write). It cannot key the transmitter, switch the rig on or off, change power or send raw CAT commands. Changes are refused while the rig transmits (HTTP 409).
- **Access:** `POST /api/rig/freq`, `POST /api/rig/mode` and `POST /api/rig/tune` accept JSON only and reject requests from other web sites (Origin check). There is no PIN: anyone who can reach the dashboard on the LAN can tune the rig. Residual risk: a malicious web page could get past the Origin check through DNS rebinding; the worst it can do is retune the rig or change its mode within your licence bands – transmitting is impossible.
- **API:** `GET /api/rig` returns `{ enabled, connected, freqHz, mode, tx, sMeterDb, updatedAt, error, licenceClass, bands, modes }`. `POST /api/rig/tune` with `{ freqHz, mode? }` sets frequency and mode in one step and answers with the same status, or, when a mode is given, 502 `rig_mismatch` if the rig did not end on both.

Setting up rigctld as a LaunchAgent on macOS, the FT-991A menu settings and WSJT-X/fldigi are described in [server/SETUP.md](server/SETUP.md#rig-control-yaesu-ft-991a).

### Popular DX Cluster Servers

- `dxcluster.net:7300`
- `dxc.ve7cc.net:7300`
- `dxc.sp7dxc.pl:7300`
- `dxc.dxcluster.org:7300`

### Popular RBN Servers

- `reversebeacon.net:7000`
- `rbn.telegraphy.de:7000`

### AI Assistant (Ollama)

The chat assistant uses **Ollama** (local, free). Set these in `server/.env` when deploying:

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434/v1` | Ollama API base URL |
| `OLLAMA_MODEL` | `llama3.2` | Model name (must be pulled) |

**Same machine:** Install [Ollama](https://ollama.com), run `ollama serve` (or start as service), then:

```bash
ollama pull llama3.2
```

**Different machine:** If Ollama runs on another host (e.g. `192.168.1.20`):

```env
OLLAMA_URL=http://192.168.1.20:11434/v1
OLLAMA_MODEL=llama3.2
```

**Docker / Docker Compose:** Run Ollama in a container and point the app to it:

```yaml
# docker-compose.yml example
services:
  ollama:
    image: ollama/ollama
    ports: ["11434:11434"]
  app:
    build: .
    environment:
      OLLAMA_URL: http://ollama:11434/v1
      OLLAMA_MODEL: llama3.2
```

**Without Ollama:** The dashboard works normally; the chat returns "Ollama not running". No API key required.

**Note:** The app works without DX Cluster/RBN configuration - you just won't receive real-time spots. Space weather, ISS tracking, and QTH display will still work.

### Quick Setup Script

You can use the interactive setup script:

```bash
cd server
npm run setup
```

This will guide you through configuring your `.env` file interactively.

## Band Conditions & Alerts

- The dashboard now derives simple band readiness (10/15/20/40m) from public space-weather feeds (Kp, SFI, solar wind). No extra config is needed.
- Alert flags (geomagnetic disturbance, radio blackout risk, solar wind southward Bz) are shown under Space Weather when applicable.
- These are quick heuristics, not full propagation predictions.

## Publish to GitHub

The project is already a Git repo (branch `main`). To push it to GitHub:

1. **Create a new repository** on [github.com](https://github.com/new):
   - Repository name: e.g. `hamshack-dashboard`
   - Visibility: Public or Private
   - Do **not** add a README, .gitignore, or license (they already exist locally).

2. **Add the remote and push** (replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub user and repo name):

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

If you use SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```
