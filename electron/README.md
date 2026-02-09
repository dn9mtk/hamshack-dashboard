# Hamshack Dashboard – nativ unter Windows

Die App kann als **Desktop-Anwendung** unter Windows laufen (Electron).

## Voraussetzungen

- **Node.js** (z. B. LTS) installiert
- Abhängigkeiten installiert: `npm run install:all`

## Als Fenster starten (ohne .exe)

1. Client bauen und Electron starten:
   ```bash
   npm run electron
   ```
   Das baut zuerst den Client (`client/dist`), startet dann den Server und öffnet ein Fenster.

2. **Nur Fenster** (wenn Client schon gebaut ist und du den Server separat laufen lässt):
   ```bash
   npm run electron:dev
   ```
   Lädt `http://localhost:8787` – Server muss vorher laufen.

## Windows-.exe bauen

1. Client bauen:
   ```bash
   npm run build
   ```

2. Installer/Portable bauen:
   ```bash
   npm run electron:pack
   ```

Die Ausgabe liegt in **`dist-electron/`**:
- **NSIS-Installer**: z. B. `Hamshack Dashboard Setup 0.1.0.exe`
- Optional: Portable-/Unpacked-Version je nach electron-builder-Konfiguration

## Hinweise

- Beim ersten Start von `npm run electron` wird der Client einmal gebaut; danach startet Electron den Server und öffnet das Fenster.
- Beim Schließen des Fensters wird der Server beendet.
- Konfiguration (Callsign, Locator, .env) liegt weiterhin in `server/.env` bzw. `server/data/config.json`; bei gepackter App im Installationsordner unter `resources/server/`.

### Fehler „Cannot create symbolic link“ bei electron:pack

Wenn beim Packen unter Windows ein Fehler zu symbolischen Links (winCodeSign) auftritt: Der Build ist mit **`signAndEditExecutable: false`** so eingestellt, dass kein Code-Signing nötig ist. Tritt der Fehler trotzdem auf, einmal **PowerShell als Administrator** ausführen oder in den Windows-Einstellungen **Entwicklermodus** aktivieren (Einstellungen → Datenschutz & Sicherheit → Für Entwickler → Entwicklermodus).
