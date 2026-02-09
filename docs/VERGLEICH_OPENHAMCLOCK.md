# Hamshack Dashboard vs. OpenHamClock

Vergleich basierend auf dem [OpenHamClock-Repository](https://github.com/accius/openhamclock) (README, Stand der Beschreibung). OpenHamClock ist der „Nachfolger“ des originalen HamClock (läuft laut Projekt nur bis Juni 2026) und zielt auf eine moderne, community-gepflegte Implementierung.

---

## Kurzüberblick

| Aspekt | Hamshack Dashboard | OpenHamClock |
|--------|--------------------|--------------|
| **Ziel** | Echtzeit-Dashboard für die eigene Shack, DX-Cluster + RBN, Propagation, Karte | Echtzeit-Dashboard „für den modernen OM“, sehr feature-reich, HamClock-Ersatz |
| **Stack** | React (Vite) + Node.js | React (Vite) + Node.js |
| **Karte** | Leaflet, eine Kartenbasis | Leaflet, mehrere Overlays/Plugins |
| **DX-Cluster** | Direkt Telnet + RBN, Spots auf Karte mit Verbindungslinien | DX Spider Proxy (Telnet), optional HamQTH/DXWatch, Spots + Pfade DE→DX |

---

## 1. Karte (World Map)

| Feature | Hamshack Dashboard | OpenHamClock |
|---------|-------------------|--------------|
| Basis-Karte | CARTO (light), keine Kartenwahl | Tile-Style abhängig vom Theme (dark/light) |
| **Eigene Station (DE)** | Über Config (Locator), nicht als Marker auf der Karte | Deutlich sichtbarer DE-Marker mit Callsign |
| **DX-Cluster auf Karte** | Ja: Verbindungslinien Spotter→DX + Callsign-Labels (blau/orange nach Quelle) | Ja: farbige Kreise pro Band, Great-Circle-Pfade **von DE zu jedem DX** |
| **Pfade** | Spotter → gespotteter DX (wer hat wen gemeldet) | DE → DX (von deinem QTH zum DX) |
| **POTA** | Nein | Ja (grüne Dreiecke, Park-Infos) |
| **Satelliten** | Nur ISS-Position | Viele Satelliten + Bahnlinien, TLE/SGP4 |
| **PSKReporter** | Ja (Layer) | Ja (Signalpfade) |
| **Tag/Nacht-Terminator** | Ja | Ja |
| **Propagation auf Karte** | Ja: MUF/LUF-Gitter, Band-Heatmap (spots- oder MUF-basiert), Legende | Nein (Propagation nur als separates Panel) |
| **Beacons** | NCDXF-Beacons | — |
| **Maidenhead-Gitter** | Ja (Feldgrenzen) | — |
| **DX-Ziel setzen** | Path Forecast (QTH→DX) mit separatem Panel | Klick auf Karte setzt DX-Ziel für Propagation Panel |
| **Legende** | Für MUF/LUF/Band-View | Für Bänder, DE, DX, Sun, Moon |
| **Plugins/Overlays** | Keine | Aurora, Erdbeben, Wetter-Radar (konfigurierbar) |

**Fazit Karte:**  
- Hamshack: Starker Fokus auf **Propagation (MUF/LUF/Band)** direkt auf der Karte und auf **„Wer hat wen gespottet“** (Linien Spotter→DX).  
- OpenHamClock: Fokus auf **„Von dir zum DX“** (Great-Circle DE→DX), POTA, Satelliten, erweiterbare Karten-Overlays.

---

## 2. DX-Cluster / Spots

| Feature | Hamshack Dashboard | OpenHamClock |
|---------|-------------------|--------------|
| **Quellen** | Eigenes Telnet (DX Cluster) + RBN | DX Spider Proxy (Telnet), optional HamQTH, DXWatch, „Auto“ |
| **Filter** | Band, Mode, Src (ALL/dxcluster/rbn), in Panel + gleiche Filter für Karte | Ausführlicher Filter-Manager: Zonen, Bands, Modi, Watchlist, Exclude, Einstellungen |
| **Spots auf Karte** | Immer (mit aktuellem Filter), Linien + Labels | Toggle „Map ON/OFF“, Bänder farbig, Pfade DE→DX |
| **„My Spots“** | Nein | Ja (wenn dein Callsign von anderen gespottet wird) |
| **Spot-Retention** | Server-seitig (z. B. 500 Spots) | Konfigurierbar (z. B. 5–30 Min) |
| **RBN** | Ja (gleichberechtigt mit DXC) | In der Beschreibung nicht als eigene Quelle hervorgehoben |

**Fazit DX-Cluster:**  
- Hamshack: Einfache Filter, **RBN + DXC** direkt integriert, Karte zeigt bewusst **Spotter→DX**.  
- OpenHamClock: Starke Filter- und Quellen-Optionen, Karte zeigt **DE→DX**, „My Spots“, Proxy-Architektur für Telnet.

---

## 3. Weitere Panels / Module

| Modul | Hamshack Dashboard | OpenHamClock |
|-------|-------------------|--------------|
| **Space Weather** | Ja (SFI, Kp, SSN, etc.) | Ja (+ Band-Bedingungen daraus) |
| **Alerts** | Ja (Alerts-Bar oben, z. B. geomagnetisch) | In Space Weather / Kontext integriert |
| **Band Conditions** | Ja (QTH-basiert) | Ja |
| **Propagation / MUF** | Ja: MUF-Balken, Band-Status, Path Forecast (QTH→DX) | Ja: Reliability pro Band zum gewählten DX-Ziel, optional ITU-R P.533 |
| **Sun Times** | Ja (QTH) | In DE-Panel / Location |
| **Path Forecast** | Ja (QTH → DX) | Über Propagation + DX-Ziel auf Karte |
| **PSKReporter** | Ja (Panel + Karte) | Ja (TX/RX Tabs, MQTT + HTTP Fallback) |
| **News** | Ja: „Local Ham News“, RSS (z. B. DARC), Slider links | DX News Ticker (DXNews.com), oben scrollend |
| **Wetter** | Ja (z. B. PWS) | Ja (Open-Meteo / optional OpenWeatherMap) |
| **Uhr** | Ja (Topbar) | Ja (UTC + Local, 12/24h) |
| **POTA** | Nein | Ja (Activators, Karte) |
| **Satelliten** | Nur ISS | Viele, TLE, Bahnen |
| **Contests** | Nein | Ja (Kalender) |
| **DXpeditions** | Nein | Ja |
| **WSJT-X** | Nein | Ja (UDP, optional Relay für Cloud) |
| **Solar Panel** | Nein | Ja (4 Ansichten: Sonnenbild, Indices, X-Ray, Mondphase) |
| **DE/DX Location** | Config + Path Forecast | Eigene DE- und DX-Panels (Details, Grid, Zonen, Sun times) |

**Fazit Module:**  
- Hamshack: Kompakt, Schwerpunkt Propagation, Spots, News, Alerts, kein POTA/Satelliten/Contests/DXpeditions/WSJT-X.  
- OpenHamClock: Sehr viele Module (POTA, Satelliten, Contests, DXpeditions, WSJT-X, Solar Panel, DE/DX-Panels).

---

## 4. UI / Konfiguration

| Feature | Hamshack Dashboard | OpenHamClock |
|---------|-------------------|--------------|
| **Layout** | 3-Spalten: News links, Karte Mitte, Panels rechts | Modern (3-Spalten) oder Classic (HamClock-Style) |
| **Themes** | Ein Dark-Theme (CSS-Variablen) | Dark, Light, Legacy (grün/schwarz), Retro |
| **Sprachen** | Eine (aktuell DE/EN im Text) | 8 Sprachen (i18n) |
| **Einstellungen** | Modal, Persistenz auf Server (`config.json`) | Modal + .env, Priorität localStorage → .env |
| **Fullscreen** | — | Ja |
| **Header** | Callsign, Locator, Settings, Uhr | Callsign, Version, UTC, Local, Wetter, SFI/K/SSN, Donate, Settings, Fullscreen |

**Fazit UI:**  
- Hamshack: Einfaches, festes Layout, eine Theme-Richtung, Config auf Server.  
- OpenHamClock: Zwei Layouts, vier Themes, i18n, Fullscreen, ausführliche Header-Infos.

---

## 5. Technik / Deployment

| Aspekt | Hamshack Dashboard | OpenHamClock |
|--------|-------------------|--------------|
| **Backend** | Monolith (Express), DX + RBN im Prozess | Monolith + DX Spider Proxy (separater Prozess), optional iturhfprop-service |
| **APIs** | /api/spots, /api/band-grid, /api/muf-grid, /api/drap-grid, /api/propagation, /api/news, /api/alerts, … | /api/dxcluster/spots, /api/dxcluster/paths, viele weitere (POTA, Satelliten, Contests, …) |
| **Deployment** | Node starten, ggf. Electron | Local, Raspberry Pi (Scripts), Docker, Railway |
| **Dokumentation** | README, SETUP | Sehr ausführliches README, Konfigurationsreferenz, FAQ |

---

## 6. Stärken pro Anwendung

**Hamshack Dashboard**  
- Propagation direkt auf der Karte (MUF/LUF/Band-Heatmap, Legende).  
- Klare Darstellung „Wer hat wen gespottet“ (Linien Spotter→DX + Callsign-Labels).  
- RBN und DX-Cluster in einer Spot-Liste, einheitliche Filter für Liste und Karte.  
- NCDXF-Beacons, Maidenhead-Gitter, ISS.  
- Lokale News (RSS) als eigenes Panel, Alerts-Bar.  
- Einfache Struktur, Config auf Server, gut erweiterbar im eigenen Repo.

**OpenHamClock**  
- Sehr viele Datenquellen (POTA, Satelliten, Contests, DXpeditions, WSJT-X).  
- Starker DX-Cluster mit Filter-Manager und mehreren Quellen (inkl. Proxy).  
- Karte: DE→DX-Pfade, POTA, Satelliten, Plugins (Aurora, Erdbeben, Radar).  
- Zwei Layouts (Modern/Classic), vier Themes, 8 Sprachen.  
- Klare Dokumentation, Deployment-Optionen (Pi, Docker, Railway), Plugin-System.

---

## 7. Mögliche Erweiterungen für Hamshack (orientiert an OpenHamClock)

- **DE-Marker auf der Karte** mit Callsign/Locator (wie OpenHamClock).  
- **Optional: Great-Circle DE→DX** zusätzlich zu Spotter→DX (Toggle oder zweiter Modus).  
- **Filter erweitern:** z. B. Watchlist/Exclude, Zonen (z. B. CQ/ITU), Speichern in localStorage.  
- **„My Spots“:** Spots hervorheben, bei denen das eigene Callsign gespottet wurde.  
- **POTA-Panel** (und ggf. POTA-Marker auf der Karte), wenn gewünscht.  
- **Satelliten:** neben ISS weitere Satelliten + TLE (z. B. CelesTrak).  
- **Contest-Kalender** (RSS/API wie contestcalendar.com).  
- **DXpeditions-Liste** (z. B. NG3K).  
- **News:** optional DX-News-Ticker (z. B. DXNews) zusätzlich zu Local Ham News.  
- **Theme/Layout:** zweites Theme (z. B. Light) oder Classic-Layout für Kiosk.  
- **Sprachen:** i18n vorbereiten (z. B. DE/EN), Keys wie in OpenHamClock.

Wenn du willst, kann ich eine davon konkret im Hamshack-Code ausarbeiten (z. B. DE-Marker, DE→DX-Pfade oder erweiterte Spot-Filter).
