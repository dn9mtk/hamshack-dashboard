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

- **Same machine:** http://localhost:8787  
- **Other devices (e.g. Raspi in LAN):** `http://<IP>:8787` (e.g. http://192.168.1.10:8787)  

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

- Backend runs on: `http://localhost:8787`
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

- `PORT` - Server port (default: 8787)
- `DXCLUSTER_HOST` - DX Cluster hostname
- `DXCLUSTER_PORT` - DX Cluster port
- `DXCLUSTER_CALLSIGN` - Callsign for DX Cluster login (defaults to config callsign)
- `RBN_HOST` - RBN hostname
- `RBN_PORT` - RBN port
- `RBN_CALLSIGN` - Callsign for RBN login (defaults to config callsign)

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
