import { useState, useEffect, useCallback } from "react";
import PanelError from "./PanelError.jsx";
import PanelLoading from "./PanelLoading.jsx";

const APRS_STORAGE_KEY = "hamshack_aprs_callsigns";
const APRS_FI_URL = "https://aprs.fi";
// Sample digipeaters (often active) to try if nothing shows
const SAMPLE_DIGIPEATERS = ["DB0FHM", "DB0SI", "DB0TBB", "DB0AA"];

function loadCallsigns() {
  try {
    const raw = localStorage.getItem(APRS_STORAGE_KEY) || "";
    return raw
      .split(/[\s,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

function saveCallsigns(list) {
  try {
    localStorage.setItem(APRS_STORAGE_KEY, list.join(", "));
    window.dispatchEvent(new CustomEvent("aprsCallsignsChanged", { detail: list }));
  } catch {}
}

export default function APRSPanel({ callsign = "" }) {
  const [callsigns, setCallsigns] = useState(loadCallsigns);
  const [inputValue, setInputValue] = useState("");
  const [err, setErr] = useState(null);
  const [configured, setConfigured] = useState(null); // null = loading, true/false = known

  const addCallsign = useCallback((call) => {
    const c = String(call).trim().toUpperCase();
    if (!c) return;
    setCallsigns((prev) => {
      if (prev.includes(c)) return prev;
      const next = [...prev, c].slice(0, 20);
      saveCallsigns(next);
      return next;
    });
  }, []);

  const removeCallsign = useCallback((call) => {
    setCallsigns((prev) => {
      const next = prev.filter((c) => c !== call);
      saveCallsigns(next);
      return next;
    });
  }, []);

  const handleAdd = () => {
    const parts = inputValue.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    parts.forEach(addCallsign);
    setInputValue("");
  };

  const addMyCallsign = () => {
    const base = (callsign || "").trim().toUpperCase().replace(/-.*$/, "");
    if (base) addCallsign(base);
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/aprs/status")
      .then((r) => r.json())
      .then((d) => alive && setConfigured(!!d.configured))
      .catch(() => alive && setConfigured(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const handler = () => setCallsigns(loadCallsigns());
    window.addEventListener("aprsCallsignsChanged", handler);
    return () => window.removeEventListener("aprsCallsignsChanged", handler);
  }, []);

  if (configured === null) {
    return (
      <div className="panel-content-grid">
        <PanelLoading lines={3} />
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="panel-content-grid">
        <p className="panel-empty" style={{ marginBottom: 0 }}>
          APRS layer requires <code>APRS_FI_API_KEY</code> in server <code>.env</code>. Get a free key at{" "}
          <a href={`${APRS_FI_URL}/account/`} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(77,171,247,0.9)" }}>
            aprs.fi
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="panel-content-grid">
      <p className="panel-empty" style={{ marginBottom: 0 }}>
        Track APRS stations (digipeaters, local stations) on the map. Data from{" "}
        <a href={APRS_FI_URL} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(77,171,247,0.9)" }}>
          aprs.fi
        </a>
        . Stations only appear if they&apos;ve beaconed recently.
      </p>
      <div className="spots-filters">
        <label className="spots-filter">
          <span className="spots-filter-label">Callsigns</span>
          <input
            type="text"
            className="repeaters-search-input"
            placeholder="DB0XYZ, DN9MTK, ..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            aria-label="Add APRS callsigns"
          />
        </label>
        <button
          type="button"
          className="contests-toggle-btn"
          onClick={handleAdd}
        >
          Add
        </button>
        {callsign && (
          <button
            type="button"
            className="contests-toggle-btn"
            onClick={addMyCallsign}
            aria-label="Add my callsign"
          >
            Add my callsign
          </button>
        )}
      </div>
      {callsigns.length === 0 ? (
        <>
          <p className="panel-empty-inline">Add callsigns to track them on the map.</p>
          <p className="panel-empty-inline" style={{ fontSize: 12 }}>
            Try sample digipeaters:{" "}
            {SAMPLE_DIGIPEATERS.map((call) => (
              <button
                key={call}
                type="button"
                className="contests-toggle-btn"
                style={{ margin: "0 2px 2px 0" }}
                onClick={() => addCallsign(call)}
              >
                {call}
              </button>
            ))}
          </p>
        </>
      ) : (
        <>
          <div className="news-slider-card" style={{ padding: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {callsigns.map((call) => (
                <span
                  key={call}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    background: "rgba(77,171,247,0.2)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  {call}
                  <button
                    type="button"
                    aria-label={`Remove ${call}`}
                    onClick={() => removeCallsign(call)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "rgba(255,255,255,0.7)",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 14,
                      lineHeight: 1
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="news-slider-btn repeaters-focus-btn"
            onClick={() => window.dispatchEvent(new CustomEvent("aprsShowOnMap"))}
            style={{ marginTop: 8, alignSelf: "flex-start" }}
            title="Show APRS layer on map"
          >
            Show on map
          </button>
        </>
      )}
      {err && <PanelError message={err} onRetry={() => setErr(null)} label="APRS" />}
      <a href={APRS_FI_URL} target="_blank" rel="noopener noreferrer" className="contests-panel-link" style={{ marginTop: 8 }}>
        aprs.fi ↗
      </a>
    </div>
  );
}
