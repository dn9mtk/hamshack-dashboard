import { useEffect, useState, useCallback } from "react";
import Clock from "./components/Clock.jsx";
import MapPanel from "./components/MapPanel.jsx";
import SpaceWeather from "./components/SpaceWeather.jsx";
import Weather from "./components/Weather.jsx";
import Propagation from "./components/Propagation.jsx";
import Spots from "./components/Spots.jsx";
import PSKReporter from "./components/PSKReporter.jsx";
import DXpeditions from "./components/DXpeditions.jsx";
import XOTAPanel from "./components/xOTAPanel.jsx";
import Settings from "./components/Settings.jsx";
import AlertsBar from "./components/AlertsBar.jsx";
import AircraftPanel from "./components/AircraftPanel.jsx";
import EarthquakePanel from "./components/EarthquakePanel.jsx";
import WarningsPanel from "./components/WarningsPanel.jsx";
import LightningPanel from "./components/LightningPanel.jsx";
import TropoPanel from "./components/TropoPanel.jsx";
import WSPRPanel from "./components/WSPRPanel.jsx";
import DigitalPanel from "./components/DigitalPanel.jsx";
import NewsPanel from "./components/NewsPanel.jsx";
import SatellitesPanel from "./components/SatellitesPanel.jsx";
import ContestsPanel from "./components/ContestsPanel.jsx";
import RepeatersPanel from "./components/RepeatersPanel.jsx";
import APRSPanel from "./components/APRSPanel.jsx";
import LocalNetsPanel from "./components/LocalNetsPanel.jsx";
import BandplanPanel from "./components/BandplanPanel.jsx";
import LogbookPanel from "./components/LogbookPanel.jsx";
import RigDisplay from "./components/RigDisplay.jsx";
import RefPanel from "./components/RefPanel.jsx";
import RangePanel from "./components/RangePanel.jsx";
import ChatAssistant from "./components/ChatAssistant.jsx";
import HelpOverlay from "./components/HelpOverlay.jsx";
import { loadRigFreq, saveRigFreq } from "./lib/rigFreqStorage.js";
import { gridCenter } from "./lib/grid.js";

function horizonKm(h1, h2) {
  if (!Number.isFinite(h1) || !Number.isFinite(h2) || h1 < 0 || h2 < 0) return null;
  return 4.12 * (Math.sqrt(h1) + Math.sqrt(h2));
}
function getAntennaHeight(configAntennaHeight) {
  if (configAntennaHeight != null && Number.isFinite(Number(configAntennaHeight)) && Number(configAntennaHeight) >= 0) {
    return Number(configAntennaHeight);
  }
  try {
    const v = parseFloat(localStorage.getItem("hamshack_horizon_height"));
    return Number.isFinite(v) && v >= 0 ? v : 11;
  } catch {
    return 11;
  }
}

const SIDEBAR_TAB_KEY = "hamshack_sidebar_tab";
const SIDEBAR_TABS = [
  { id: "news", label: "News", title: "Local ham radio news feed" },
  { id: "contests", label: "Contests", title: "Upcoming and active contests" },
  { id: "dxpeditions", label: "DXped", title: "DXpeditions – active and upcoming rare DX operations" },
  { id: "xota", label: "xOTA", title: "POTA, SOTA, IOTA, COTA – activator spots and map layer" },
  { id: "repeaters", label: "Repeater", title: "German repeaters (2m, 70cm, 10m) with map" },
  { id: "aprs", label: "APRS", title: "APRS stations on map (track callsigns via aprs.fi)" },
  { id: "nets", label: "Nets", title: "Local nets schedule" },
  { id: "band", label: "Band", title: "IARU band plan" },
  { id: "log", label: "Log", title: "Logbook and QSL info" },
  { id: "ref", label: "Ref", title: "Quick reference / Kurzreferenz" },
  { id: "range", label: "Range", title: "Radio horizon, terrain horizon, link budget" },
  { id: "space", label: "Space", title: "Space weather – SFI, Kp, X-ray, solar wind" },
  { id: "weather", label: "Weather", title: "Local weather (PWS)" },
  { id: "muf", label: "MUF", title: "MUF and propagation prediction" },
  { id: "spots", label: "Spots", title: "DX Cluster / RBN spots – who is on the air" },
  { id: "psk", label: "PSK", title: "PSK Reporter – FT8, FT4 reports" },
  { id: "wspr", label: "WSPR", title: "WSPR statistics – real propagation data" },
  { id: "digital", label: "Digital", title: "DMR/D-Star/Fusion reflectors + FT8 activity heatmap" },
  { id: "lightning", label: "Blitz", title: "Lightning / thunderstorms – Blitzortung, outdoor safety, QRN" },
  { id: "tropo", label: "Tropo", title: "VHF tropo – Hepburn, DXMaps, 2m/70cm propagation" },
  { id: "sat", label: "Sat", title: "Satellite positions (ISS, amateur sats)" },
  { id: "aircraft", label: "Aircraft", title: "ADS-B aircraft within configurable radius (OpenSky)" },
  { id: "earthquakes", label: "Quakes", title: "Earthquakes – USGS feed with map layer" },
  { id: "warnings", label: "Warn", title: "Katastrophenschutz – NINA/Katwarn (warnung.bund.de)" }
];

function getInitialTab() {
  try {
    const s = sessionStorage.getItem(SIDEBAR_TAB_KEY);
    if (s && SIDEBAR_TABS.some((t) => t.id === s)) return s;
  } catch {}
  return "news";
}

export default function App() {
  const [config, setConfig] = useState({ callsign: "", locator: "", qthName: "", pwsStationId: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dxpeditionsFilter, setDxpeditionsFilter] = useState("all"); // "all" | "active" | "upcoming"
  const [xotaProgram, setXotaProgram] = useState("POTA"); // "POTA" | "SOTA" | "IOTA" | "COTA"
  const [focusedXotaItem, setFocusedXotaItem] = useState(null); // { lat, lon, activator?, reference? }
  const [repeatersBandFilter, setRepeatersBandFilter] = useState("2m"); // "2m" | "70cm" | "10m"
  const [selectedRepeater, setSelectedRepeater] = useState(null);
  const [focusedRepeater, setFocusedRepeater] = useState(null);
  const [focusedAircraft, setFocusedAircraft] = useState(null);
  const [focusedEarthquake, setFocusedEarthquake] = useState(null);
  const [sunData, setSunData] = useState(null);
  const [sidebarTab, setSidebarTab] = useState(getInitialTab);
  const [rigFreq, setRigFreq] = useState(loadRigFreq);
  const [radioHorizon, setRadioHorizon] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aircraftRadiusKm, setAircraftRadiusKm] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem("hamshack_aircraft_radius_km"), 10);
      return Number.isFinite(v) && v >= 5 && v <= 100 ? v : 12;
    } catch {
      return 12;
    }
  });
  const [earthquakeMag, setEarthquakeMag] = useState(() => {
    try {
      const raw = localStorage.getItem("hamshack_earthquake_filters");
      const j = raw ? JSON.parse(raw) : {};
      return ["2.5", "4.5", "all"].includes(j.mag) ? j.mag : "2.5";
    } catch {
      return "2.5";
    }
  });
  const [earthquakePeriod, setEarthquakePeriod] = useState(() => {
    try {
      const raw = localStorage.getItem("hamshack_earthquake_filters");
      const j = raw ? JSON.parse(raw) : {};
      return ["day", "week"].includes(j.period) ? j.period : "week";
    } catch {
      return "week";
    }
  });

  function handleRigFreqChange(value) {
    setRigFreq(value);
    saveRigFreq(value);
  }

  const setSidebarTabAndPersist = useCallback((id) => {
    setSidebarTab(id);
    try {
      sessionStorage.setItem(SIDEBAR_TAB_KEY, id);
    } catch {}
  }, []);

  const handleSelectPanel = useCallback((panelId, data) => {
    setSidebarTabAndPersist(panelId);
    if (panelId === "aircraft" && data) setFocusedAircraft(data);
    if (panelId === "earthquakes" && data) setFocusedEarthquake({ ...data, lat: data.latitude ?? data.lat, lon: data.longitude ?? data.lon });
  }, [setSidebarTabAndPersist]);

  function loadConfig() {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : Promise.resolve({})))
      .then((data) => setConfig({
        callsign: data.callsign ?? "—",
        locator: data.locator ?? "—",
        qthName: data.qthName ?? "",
        pwsStationId: data.pwsStationId ?? "",
        lat: data.lat,
        lon: data.lon,
        elevation: data.elevation,
        antennaHeight: data.antennaHeight,
        wantedPrefixes: data.wantedPrefixes ?? ""
      }))
      .catch(() => {});
  }

  useEffect(() => { loadConfig(); }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
        e.preventDefault();
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Compute radio horizon from config so Range circles show without opening Range tab
  useEffect(() => {
    const lat = Number(config.lat);
    const lon = Number(config.lon);
    const loc = (config.locator || "").trim();
    const qth = (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)
      ? { lat, lon }
      : (loc && loc !== "—" && loc.length >= 4 ? gridCenter(loc) : null);
    if (!qth || !Number.isFinite(qth.lat) || !Number.isFinite(qth.lon)) {
      setRadioHorizon(null);
      return;
    }
    const h1 = getAntennaHeight(config.antennaHeight);
    const ground = horizonKm(h1, 0);
    if (ground == null) return;
    setRadioHorizon({
      center: qth,
      ground,
      mobile: horizonKm(h1, 2),
      base: horizonKm(h1, 10)
    });
  }, [config.locator, config.lat, config.lon, config.antennaHeight]);

  useEffect(() => {
    function loadSun() {
      fetch("/api/sun")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setSunData(data))
        .catch(() => {});
    }
    loadSun();
    const id = setInterval(loadSun, 60_000);
    return () => clearInterval(id);
  }, []);

  const subLine = [config.locator, config.qthName].filter(Boolean).join(" * ") || "—";

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="callsign">{config.callsign}</div>
          <div className="sub">{subLine}</div>
          <div className="tagline">73 from the heart of Europe</div>
        </div>
        <div className="topbar-center">
          <RigDisplay
            freqValue={rigFreq}
            onFreqChange={handleRigFreqChange}
          />
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn-settings btn-chat"
            onClick={() => setChatOpen(true)}
            aria-label="Open AI assistant"
            title="AI Assistant"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3 10.09 8.81a2 2 0 0 1-1.27 1.27L3 12l5.81 1.91a2 2 0 0 1 1.27 1.27L12 21l1.91-5.81a2 2 0 0 1 1.27-1.27L21 12l-5.81-1.91a2 2 0 0 1-1.27-1.27L12 3Z"/>
            </svg>
          </button>
          <button
            type="button"
            className="btn-settings"
            onClick={() => setHelpOpen(true)}
            aria-label="Quick reference (?)"
            title="Quick reference (?)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <path d="M12 17h.01"/>
            </svg>
          </button>
          <button
            type="button"
            className="btn-settings"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <Clock sunData={sunData} />
        </div>
      </header>
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={loadConfig}
      />
      <ChatAssistant
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        context={{
          panel: sidebarTab,
          locator: config.locator,
          callsign: config.callsign,
          qthName: config.qthName
        }}
      />

      <AlertsBar />
      <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />

      <main className="grid">
        <aside className="sidebar sidebar-onepage">
          <div
            className="sidebar-tabs"
            role="tablist"
            aria-label="Sidebar panels"
            onKeyDown={(e) => {
              const idx = SIDEBAR_TABS.findIndex((t) => t.id === sidebarTab);
              if (e.key === "ArrowRight" && idx < SIDEBAR_TABS.length - 1) {
                e.preventDefault();
                setSidebarTabAndPersist(SIDEBAR_TABS[idx + 1].id);
              } else if (e.key === "ArrowLeft" && idx > 0) {
                e.preventDefault();
                setSidebarTabAndPersist(SIDEBAR_TABS[idx - 1].id);
              } else if (e.key === "Home") {
                e.preventDefault();
                setSidebarTabAndPersist(SIDEBAR_TABS[0].id);
              } else if (e.key === "End") {
                e.preventDefault();
                setSidebarTabAndPersist(SIDEBAR_TABS[SIDEBAR_TABS.length - 1].id);
              }
            }}
          >
            {SIDEBAR_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={sidebarTab === t.id}
                aria-controls="sidebar-panel"
                id={`tab-${t.id}`}
                className={`sidebar-tab ${sidebarTab === t.id ? "active" : ""}`}
                onClick={() => setSidebarTabAndPersist(t.id)}
                title={t.title}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="sidebar-content" id="sidebar-panel" role="tabpanel" aria-labelledby={`tab-${sidebarTab}`}>
            {sidebarTab === "news" && (
              <div className="panel">
                <h2>Local Ham News</h2>
                <NewsPanel />
              </div>
            )}
            {sidebarTab === "contests" && (
              <div className="panel">
                <h2>Contests</h2>
                <ContestsPanel />
              </div>
            )}
            {sidebarTab === "dxpeditions" && (
              <div className="panel">
                <h2>DXpeditions</h2>
                <DXpeditions filter={dxpeditionsFilter} onFilterChange={setDxpeditionsFilter} />
              </div>
            )}
            {sidebarTab === "xota" && (
              <div className="panel">
                <h2>xOTA Activators</h2>
                <XOTAPanel
                  program={xotaProgram}
                  onProgramChange={setXotaProgram}
                  onFocusOnMap={setFocusedXotaItem}
                  locator={config.locator}
                />
              </div>
            )}
            {sidebarTab === "repeaters" && (
              <div className="panel">
                <h2>Repeater Deutschland</h2>
                <RepeatersPanel
                  band={repeatersBandFilter}
                  onBandChange={setRepeatersBandFilter}
                  selectedRepeater={selectedRepeater}
                  onFocusRepeater={(rep) => {
                    if (rep?.band) {
                      setRepeatersBandFilter(rep.band);
                    }
                    setFocusedRepeater(rep);
                  }}
                />
              </div>
            )}
            {sidebarTab === "aprs" && (
              <div className="panel">
                <h2>APRS</h2>
                <APRSPanel callsign={config.callsign} />
              </div>
            )}
            {sidebarTab === "nets" && <LocalNetsPanel />}
            {sidebarTab === "band" && (
              <div className="panel">
                <h2>IARU Band Plan</h2>
                <BandplanPanel />
              </div>
            )}
            {sidebarTab === "log" && (
              <div className="panel">
                <h2>Logbook / QSL</h2>
                <LogbookPanel callsign={config.callsign} />
              </div>
            )}
            {sidebarTab === "ref" && (
              <div className="panel">
                <h2>Kurzreferenz</h2>
                <RefPanel />
              </div>
            )}
            {sidebarTab === "range" && (
              <div className="panel">
                <h2>Range</h2>
                <RangePanel
                  locator={config.locator}
                  rigFreq={rigFreq}
                  antennaHeight={config.antennaHeight != null && config.antennaHeight !== "" ? Number(config.antennaHeight) : getAntennaHeight()}
                  onHorizonChange={setRadioHorizon}
                />
              </div>
            )}
            {sidebarTab === "space" && (
              <div className="panel">
                <h2>Space Weather</h2>
                <SpaceWeather />
              </div>
            )}
            {sidebarTab === "weather" && (
              <div className="panel">
                <h2>Local Weather{config.pwsStationId ? ` (PWS ${config.pwsStationId})` : ""}</h2>
                <Weather stationId={config.pwsStationId} />
              </div>
            )}
            {sidebarTab === "muf" && (
              <div className="panel">
                <h2>MUF / Propagation</h2>
                <Propagation />
              </div>
            )}
            {sidebarTab === "spots" && (
              <div className="panel">
                <h2>Spots</h2>
                <Spots wantedPrefixes={config.wantedPrefixes} />
              </div>
            )}
            {sidebarTab === "psk" && (
              <div className="panel">
                <h2>PSK Reporter</h2>
                <PSKReporter />
              </div>
            )}
            {sidebarTab === "wspr" && (
              <div className="panel">
                <h2>WSPR Statistics</h2>
                <WSPRPanel locator={config.locator} />
              </div>
            )}
            {sidebarTab === "digital" && (
              <div className="panel">
                <h2>Digital modes</h2>
                <DigitalPanel callsign={config.callsign} />
              </div>
            )}
            {sidebarTab === "lightning" && (
              <div className="panel">
                <h2>Lightning / Thunderstorms</h2>
                <LightningPanel />
              </div>
            )}
            {sidebarTab === "tropo" && (
              <div className="panel">
                <h2>VHF Tropo</h2>
                <TropoPanel />
              </div>
            )}
            {sidebarTab === "sat" && (
              <div className="panel">
                <h2>Satellites</h2>
                <SatellitesPanel />
              </div>
            )}
            {sidebarTab === "aircraft" && (
              <div className="panel">
                <h2>Aircraft</h2>
                <AircraftPanel
                  radiusKm={aircraftRadiusKm}
                  onRadiusChange={(km) => setAircraftRadiusKm(km)}
                  locator={config.locator}
                  onFocusOnMap={setFocusedAircraft}
                />
              </div>
            )}
            {sidebarTab === "earthquakes" && (
              <div className="panel">
                <h2>Earthquakes</h2>
                <EarthquakePanel
                  mag={earthquakeMag}
                  period={earthquakePeriod}
                  onMagChange={setEarthquakeMag}
                  onPeriodChange={setEarthquakePeriod}
                  locator={config.locator}
                  onFocusOnMap={setFocusedEarthquake}
                />
              </div>
            )}
            {sidebarTab === "warnings" && (
              <div className="panel">
                <h2>Katastrophenschutz</h2>
                <WarningsPanel />
              </div>
            )}
          </div>
        </aside>
        <section className="map">
          <MapPanel
            dxpeditionsFilter={dxpeditionsFilter}
            focusedXotaItem={focusedXotaItem}
            focusedAircraft={focusedAircraft}
            focusedEarthquake={focusedEarthquake}
            repeatersBandFilter={repeatersBandFilter}
            onRepeatersBandChange={setRepeatersBandFilter}
            focusedRepeater={focusedRepeater}
            radioHorizon={radioHorizon}
            antennaHeight={getAntennaHeight(config.antennaHeight)}
            aircraftRadiusKm={aircraftRadiusKm}
            earthquakeMag={earthquakeMag}
            earthquakePeriod={earthquakePeriod}
            onSelectRepeater={(rep) => {
              if (rep?.band) {
                setRepeatersBandFilter(rep.band);
              }
              setSelectedRepeater(rep || null);
              setSidebarTabAndPersist("repeaters");
            }}
            onSelectXota={(program) => {
              setSidebarTabAndPersist("xota");
              if (program) setXotaProgram(program);
            }}
            onSelectPanel={handleSelectPanel}
          />
        </section>
      </main>
    </div>
  );
}
