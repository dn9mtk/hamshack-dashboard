# DX Cluster & RBN Setup Guide

## Quick Setup

1. Copy the example environment file:
```bash
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

3. Restart the server

## Popular DX Cluster Servers

| Server | Host | Port |
|--------|------|------|
| DX Cluster Network | `dxcluster.net` | 7300 |
| VE7CC | `dxc.ve7cc.net` | 7300 |
| SP7DXC | `dxc.sp7dxc.pl` | 7300 |
| DX Cluster Org | `dxc.dxcluster.org` | 7300 |

## Popular RBN Servers

| Server | Host | Port |
|--------|------|------|
| Reverse Beacon Network | `reversebeacon.net` | 7000 |
| RBN Germany | `rbn.telegraphy.de` | 7000 |

## Testing Your Connection

After configuring, check the status in the dashboard:
- Look at the "Spots" panel - it should show connection status
- If connected, you'll see spots appearing on the map and in the list
- If disconnected, check the error message for details

## Troubleshooting

**"Not configured" error:**
- Make sure `.env` file exists in the `server` directory
- Check that variables are set correctly (no extra spaces)
- Restart the server after editing `.env`

**Connection errors:**
- Verify the host and port are correct
- Try a different server if one doesn't work
- Check your firewall/network settings
- Some servers may require registration or have usage limits

**No spots appearing:**
- Wait a few minutes - spots may take time to appear
- Check the filter settings (try ALL/ALL/ALL)
- Verify the connection status shows "connected"

**"Spots on map: 0" but list shows spots:**
- Spots need coordinates (lat/lon) to be drawn on the map. The server resolves these from the callsign (DXCC lookup).
- If `server/data/cty.dat` is missing or empty, the server uses `server/data/dxcc_centroids.json` as fallback (covers many common prefixes).
- For full DXCC coverage, use a **cty.dat** from [country-files.com](https://www.country-files.com/) (maintained by Jim Reisert AD1C). Download e.g. [CTY-3420](https://www.country-files.com/cty/download/3420/cty-3420.zip), extract `cty.dat` into `server/data/cty.dat`, then restart the server.
- Restart the server after adding or updating cty.dat so the prefix list is loaded.

## Repeaters (Germany 2 m / 70 cm / 10 m)

Repeater-Daten werden aus einem **lokalen Modell** geladen (`server/data/repeaters.json`). Panel und Karte lesen nur diese Datei – kein Aufruf von RepeaterBook oder Geocoding zur Laufzeit.

**Einmalig (oder bei Bedarf) ausführen:**

```bash
npm run sync-repeaters
```

Das Skript:
1. Lädt alle Repeater für Deutschland von RepeaterBook (2 m / 70 cm / 10 m)
2. Ermittelt fehlende Standorte per Geocoding (Nominatim/OpenStreetMap: „Ort, Germany“)
3. Speichert alles in `server/data/repeaters.json`

Dauer je nach Anzahl Orte (Nominatim: 1 Anfrage/Sekunde). Danach liefert `/api/repeaters` sofort aus der Datei.

## Optional: Running Without DX Cluster/RBN

The dashboard works fine without these connections! You'll still get:
- Space weather data
- ISS position tracking
- QTH location display
- Map with night/day terminator

You just won't see real-time DX spots.

## Rig control (Yaesu FT-991A)

The dashboard reads and tunes the FT-991A through hamlib `rigctld`. rigctld owns the CAT port and listens on `127.0.0.1:4532`; the dashboard, WSJT-X and fldigi all connect to it, so the rig can be shared. Rig control is off until you set `RIGCTLD_ENABLED=true`.

### Safety model

- The dashboard sends only `get_freq`, `get_mode`, `get_ptt`, `get_level STRENGTH`, `set_freq` and `set_mode`. Every command passes an allowlist right before it is written to the socket; anything else (PTT, power on/off, raw CAT, functions, levels, configuration) is refused before it leaves the server.
- Frequency and mode changes are refused while the rig transmits (fresh PTT check) and outside the bands of your licence class.
- rigctld listens on `127.0.0.1` only (`-T 127.0.0.1`; its default would be every interface), never powers the rig on or off and keeps RTS and DTR off.
- WSJT-X and fldigi talk to the same rigctld and *can* key the transmitter – that is their job, the dashboard's guarantee covers the dashboard only.
- Write requests must be JSON from the dashboard's own origin. There is no PIN: everyone who can open the dashboard on your LAN can tune the rig. Residual risk: a malicious web page could get past the Origin check through DNS rebinding; the worst it can do is retune the rig or change its mode within your licence bands – transmitting is impossible.

### Licence class and power

`RIG_LICENCE_CLASS` (default `N`) limits the frequencies the dashboard tunes to, following AFuV Anlage 1 (version in force since 24 June 2024, https://www.gesetze-im-internet.de/afuv_2005/anlage_1.html), limited to what the FT-991A covers:

| Class | Bands |
|-------|-------|
| `N` | 10 m (28.000–29.700 MHz), 2 m (144–146 MHz), 70 cm (430–440 MHz) |
| `E` | 160 m (1.810–2.000 MHz), 80 m (3.500–3.800 MHz), 15 m (21.000–21.450 MHz), 10 m, 2 m, 70 cm |
| `A` | 2200 m, 630 m, 160 m, 80 m, 60 m, 40 m, 30 m, 20 m, 17 m, 15 m, 12 m, 10 m, 6 m (50–52 MHz), 2 m, 70 cm |

The dashboard does not control transmit power. Keeping within the power limit of your class (class N: 10 W ERP on 10 m, 6.1 W ERP on 2 m and 70 cm) stays your responsibility at the rig. Band edges are checked for the carrier frequency only; keep your signal's bandwidth inside the band.

### 1. Prepare the rig

On the FT-991A set:

| Menu | Setting |
|------|---------|
| 031 CAT RATE | 9600 bps |
| 032 CAT TOT | 100 msec |
| 033 CAT RTS | DISABLE |

Make sure no transmit keying setting of the rig uses RTS or DTR of the CAT port: some USB drivers toggle those lines briefly when a port opens.

The CAT port runs at 9600 baud, 8 data bits, no parity, **2 stop bits** (8N2) – the FT-991A does not answer CAT commands sent with 1 stop bit, and hamlib's FT-991 backend (model 1035) also uses 8N2. The generated LaunchAgent sets this for rigctld.

The USB cable shows up as two serial ports (Silicon Labs CP2105): the **Enhanced** port ends in `0` and carries CAT, the **Standard** port ends in `1`. Use the Enhanced port:

```bash
ls /dev/cu.usbserial-*
```

Install hamlib if it is missing: `brew install hamlib`.

### 2. Start rigctld as a LaunchAgent (macOS)

Add the CAT port to `server/.env` (see `.env.example`). `RIGCTLD_DEVICE` is required – the generator has no default, because the device name is specific to your cable:

```env
RIGCTLD_DEVICE=/dev/cu.usbserial-XXXXXXXX0
```

Optional generator settings: `RIGCTLD_BIN` (`/opt/homebrew/bin/rigctld`), `RIGCTLD_MODEL` (`1035`, FT-991), `RIGCTLD_BAUD` (`9600`, must match menu 031), `RIGCTLD_STOP_BITS` (`2`; `1` only for a rig that needs it), `RIGCTLD_PORT` (`4532`), `RIGCTLD_LAUNCHAGENT_LABEL` (`de.dn9mtk.rigctld`).

Print the plist and review it, then write it to `~/Library/LaunchAgents`:

```bash
npm run rig:launchagent
npm run rig:launchagent -- --write          # add --force to overwrite an existing file
```

The preview prints only the plist on stdout, so you can also save it and compare it with an installed one: `npm run --silent rig:launchagent > /tmp/rigctld.plist`.

The generator refuses `/dev/tty.*` devices, the Standard port (`…1`), baud rates the FT-991A does not offer (allowed: 4800, 9600, 19200, 38400), stop bits other than 1 or 2 and ports outside 1024–65535. It never runs launchctl – close WSJT-X and fldigi (or switch them to rigctld first, see below), then load the agent yourself:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/de.dn9mtk.rigctld.plist   # load and start
launchctl kickstart -k gui/$(id -u)/de.dn9mtk.rigctld                               # restart
launchctl bootout gui/$(id -u)/de.dn9mtk.rigctld                                    # stop and unload
tail -f ~/Library/Logs/rigctld.log                                                  # log
```

rigctld starts at login and while the USB device exists (`KeepAlive` / `PathState`); after a crash launchd waits 30 s before restarting it. If it does not come back after replugging the cable, run the `kickstart` command.

Check rigctld without the dashboard (read-only):

```bash
rigctl -m 2 -r 127.0.0.1:4532 f
```

### 3. Enable rig control in the dashboard

```env
RIGCTLD_ENABLED=true
RIG_LICENCE_CLASS=N
```

Restart the server and check `curl -s http://localhost:8788/api/rig` – `connected` should become `true` within a second or two of the first request. The dashboard only polls rigctld while a browser shows the dashboard (and stops 15 s after the last request).

When you type a frequency in the dashboard, it keeps the mode shown in the header: tuning to another band makes the FT-991A recall that band's last mode (band stack), so the dashboard sets the frequency, puts the mode back if the rig changed it and corrects the frequency once if the mode change moved it (`POST /api/rig/tune`). A mode change on its own keeps the frequency in the same way.

### 4. WSJT-X and fldigi

Only one program can open the serial port. Switch the other programs to rigctld:

- **WSJT-X:** Settings → Radio → Rig `Hamlib NET rigctl`, Network Server `127.0.0.1:4532`, PTT method `CAT`.
- **fldigi:** Configure → Rig Control → Hamlib → Rig `Hamlib NET rigctl`, Device `127.0.0.1:4532`, then Initialize.

With `Hamlib NET rigctl` the serial settings shown in WSJT-X or fldigi (baud rate, data and stop bits) are not used – rigctld owns the port and uses the settings of its LaunchAgent. Only a program that opens the CAT port directly needs 9600 8N2.

### Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| "Rig offline", log `rigctld is not running (connection refused)` | rigctld is not running: check `launchctl print gui/$(id -u)/de.dn9mtk.rigctld` and `~/Library/Logs/rigctld.log` |
| `rigctld error -5` (rig did not answer) | Rig switched off, wrong port (Standard instead of Enhanced), CAT RATE (menu 031) does not match `RIGCTLD_BAUD` or rigctld runs with 1 stop bit instead of 2 (regenerate the LaunchAgent) |
| rigctld log: port busy / resource busy | WSJT-X, fldigi or another program still opens the serial port directly |
| `RIGCTLD_HOST must be a loopback address` in the server log | Rig control was disabled because `RIGCTLD_HOST` is not `127.x.x.x`, `::1` or `localhost` |
| 409 "The rig is transmitting" | Changes are refused while PTT is active; wait until the transmission ends |
| 400 "… outside the bands allowed for licence class …" | The frequency is not in the band table of `RIG_LICENCE_CLASS`; nothing was sent |
| 502 `rig_mismatch` "The rig is on … instead of the requested …" | The rig did not end on the requested frequency and mode after one correction; the header shows where it is. Check the rig (e.g. a locked dial or a mode the band does not allow) and tune again |

After a mode change the dashboard puts the previous frequency back only if it lies within the bands of `RIG_LICENCE_CLASS`; outside them (for example a receive-only frequency) the shifted frequency stays and no `set_freq` is sent.

The server logs one line per state change (connected, offline, timeout), not one per failed poll; reconnect attempts back off from 1 s to 30 s.
