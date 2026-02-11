import { useEffect, useState } from "react";
import Clock from "./components/Clock.jsx";
import MapPanel from "./components/MapPanel.jsx";
import SpaceWeather from "./components/SpaceWeather.jsx";
import Weather from "./components/Weather.jsx";
import Propagation from "./components/Propagation.jsx";
import Spots from "./components/Spots.jsx";
import PSKReporter from "./components/PSKReporter.jsx";
import DXpeditions from "./components/DXpeditions.jsx";
import Settings from "./components/Settings.jsx";
import AlertsBar from "./components/AlertsBar.jsx";
import NewsPanel from "./components/NewsPanel.jsx";
import SatellitesPanel from "./components/SatellitesPanel.jsx";
import ContestsPanel from "./components/ContestsPanel.jsx";
import RepeatersPanel from "./components/RepeatersPanel.jsx";
import BandplanPanel from "./components/BandplanPanel.jsx";
import LogbookPanel from "./components/LogbookPanel.jsx";
import RigDisplay from "./components/RigDisplay.jsx";
import RefPanel from "./components/RefPanel.jsx";
import RangePanel from "./components/RangePanel.jsx";
import { loadRigFreq, saveRigFreq } from "./lib/rigFreqStorage.js";

const SIDEBAR_TAB_KEY = "hamshack_sidebar_tab";
const SIDEBAR_TABS = [
  { id: "news", label: "News" },
  { id: "contests", label: "Contests" },
  { id: "dxpeditions", label: "DXped" },
  { id: "repeaters", label: "Repeater" },
  { id: "band", label: "Band" },
  { id: "log", label: "Log" },
  { id: "ref", label: "Ref" },
  { id: "range", label: "Range" },
  { id: "space", label: "Space" },
  { id: "weather", label: "Weather" },
  { id: "muf", label: "MUF" },
  { id: "spots", label: "Spots" },
  { id: "psk", label: "PSK" },
  { id: "sat", label: "Sat" }
];

function getInitialTab() {
  try {
    const s = sessionStorage.getItem(SIDEBAR_TAB_KEY);
    if (s && SIDEBAR_TABS.some((t) => t.id === s)) return s;
  } catch {}
  return "news";
}

export default function App() {
  const [config, setConfig] = useState({ callsign: "", locator: "", qthName: "", pwsStationId: "", heyWhatsThatViewId: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dxpeditionsFilter, setDxpeditionsFilter] = useState("all"); // "all" | "active" | "upcoming"
  const [repeatersBandFilter, setRepeatersBandFilter] = useState("2m"); // "2m" | "70cm" | "10m"
  const [selectedRepeater, setSelectedRepeater] = useState(null);
  const [focusedRepeater, setFocusedRepeater] = useState(null);
  const [sunData, setSunData] = useState(null);
  const [sidebarTab, setSidebarTab] = useState(getInitialTab);
  const [rigFreq, setRigFreq] = useState(loadRigFreq);
  const [radioHorizon, setRadioHorizon] = useState(null);

  function handleRigFreqChange(value) {
    setRigFreq(value);
    saveRigFreq(value);
  }

  function setSidebarTabAndPersist(id) {
    setSidebarTab(id);
    try {
      sessionStorage.setItem(SIDEBAR_TAB_KEY, id);
    } catch {}
  }

  function loadConfig() {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : Promise.resolve({})))
      .then((data) => setConfig({
        callsign: data.callsign ?? "—",
        locator: data.locator ?? "—",
        qthName: data.qthName ?? "",
        pwsStationId: data.pwsStationId ?? "",
        heyWhatsThatViewId: data.heyWhatsThatViewId ?? ""
      }))
      .catch(() => {});
  }

  useEffect(() => { loadConfig(); }, []);

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

      <AlertsBar />

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
                <Spots />
              </div>
            )}
            {sidebarTab === "psk" && (
              <div className="panel">
                <h2>PSK Reporter</h2>
                <PSKReporter />
              </div>
            )}
            {sidebarTab === "sat" && (
              <div className="panel">
                <h2>Satellites</h2>
                <SatellitesPanel />
              </div>
            )}
          </div>
        </aside>
        <section className="map">
          <MapPanel
            dxpeditionsFilter={dxpeditionsFilter}
            repeatersBandFilter={repeatersBandFilter}
            onRepeatersBandChange={setRepeatersBandFilter}
            focusedRepeater={focusedRepeater}
            radioHorizon={radioHorizon}
            onSelectRepeater={(rep) => {
              if (rep?.band) {
                setRepeatersBandFilter(rep.band);
              }
              setSelectedRepeater(rep || null);
              setSidebarTabAndPersist("repeaters");
            }}
          />
        </section>
      </main>
    </div>
  );
}
