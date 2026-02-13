# Hamshack Dashboard – nativ unter Windows

Die App kann als **Desktop-Anwendung** unter Windows laufen (Electron).

## Voraussetzungen

- **Node.js** (z. B. LTS) installiert
- Abhängigkeiten installiert: `npm run install:all`

---

## App als Windows-Anwendung installieren

### 1. Installer bauen (Entwickler)

```bash
npm run electron:pack
```

Die `.exe` liegt danach in **`dist-electron/`**, z. B.:

- `Hamshack Dashboard Setup 0.1.0.exe` (NSIS-Installer)

### 2. Installer ausführen (Nutzer)

1. `Hamshack Dashboard Setup 0.1.0.exe` starten  
2. Installationsordner wählen (Standard ist z. B. `C:\Users\<User>\AppData\Local\Programs\hamshack-dashboard`)  
3. Installation abschließen  

Die App kann danach über das Startmenü oder die Verknüpfung gestartet werden.

### 3. Optional: AI-Chat (Ollama)

Der eingebaute AI-Assistent nutzt **Ollama** auf `localhost:11434`.

1. Ollama für Windows installieren: https://ollama.com/download  
2. Nach der Installation startet Ollama automatisch im Hintergrund (Tray-Icon).  
3. Ein Modell laden (falls noch keins vorhanden):
   ```bash
   ollama run llama3.2
   ```
4. Hamshack Dashboard starten – der AI-Chat verbindet sich automatisch.

**Anderes Modell / andere URL:**  
Im Installationsordner unter `resources\server\` liegt der Server. Dort `.env.example` als `.env` kopieren und anpassen:

```
OLLAMA_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.2
```

---

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

---

## Hinweise

- Beim ersten Start von `npm run electron` wird der Client einmal gebaut; danach startet Electron den Server und öffnet das Fenster.
- Beim Schließen des Fensters wird der Server beendet.
- Konfiguration (Callsign, Locator, .env) liegt weiterhin in `server/.env` bzw. `server/data/config.json`; bei gepackter App im Installationsordner unter `resources\server\`.

### Fehler „Cannot create symbolic link“ bei electron:pack

Wenn beim Packen unter Windows ein Fehler zu symbolischen Links (winCodeSign) auftritt: Der Build ist mit **`signAndEditExecutable: false`** so eingestellt, dass kein Code-Signing nötig ist. Tritt der Fehler trotzdem auf, einmal **PowerShell als Administrator** ausführen oder in den Windows-Einstellungen **Entwicklermodus** aktivieren (Einstellungen → Datenschutz & Sicherheit → Für Entwickler → Entwicklermodus).
