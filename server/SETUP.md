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
