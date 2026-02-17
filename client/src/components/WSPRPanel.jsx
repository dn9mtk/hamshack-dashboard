/**
 * WSPR Statistics – real propagation data from PSK Reporter (mode=WSPR).
 * Shows max distance, band distribution, and top reports – actual propagation instead of prediction.
 */
import { useEffect, useState, useMemo } from "react";
import { formatDateTimeUtc } from "../lib/time.js";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";
import { gridCenter } from "../lib/grid.js";
import { distanceKm } from "../lib/geo.js";

const HOURS_OPTIONS = [
  { value: "2", label: "2 h" },
  { value: "6", label: "6 h" },
  { value: "24", label: "24 h" }
];

/** Map frequency (kHz) to band name */
function freqToBand(kHz) {
  if (!Number.isFinite(kHz)) return null;
  const k = Number(kHz);
  if (k < 500) return "630m/2200m";
  if (k >= 1800 && k <= 2000) return "160m";
  if (k >= 3500 && k <= 4000) return "80m";
  if (k >= 7000 && k <= 7300) return "40m";
  if (k >= 10100 && k <= 10150) return "30m";
  if (k >= 14000 && k <= 14350) return "20m";
  if (k >= 18068 && k <= 18110) return "17m";
  if (k >= 21060 && k <= 21150) return "15m";
  if (k >= 24890 && k <= 24930) return "12m";
  if (k >= 28000 && k <= 29700) return "10m";
  if (k >= 50000 && k <= 54000) return "6m";
  return "other";
}

export default function WSPRPanel({ locator = "" }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [hours, setHours] = useState("24");

  async function load() {
    try {
      setErr(null);
      const r = await fetch(
        `/api/pskreporter?filter=both&mode=WSPR&hours=${encodeURIComponent(hours)}`
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = j.detail || j.error || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      setData(j);
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [hours]);

  const qth = useMemo(
    () => (locator && locator !== "—" ? gridCenter(locator) : null),
    [locator]
  );

  const { reports, stats } = useMemo(() => {
    const reps = data?.reports || [];
    if (!reps.length) return { reports: [], stats: null };

    const getOtherLatLon = (r) => {
      const lat = r.direction === "heard_you" ? r.receiverLat : r.senderLat;
      const lon = r.direction === "heard_you" ? r.receiverLon : r.senderLon;
      return { lat: lat ?? r.lat, lon: lon ?? r.lon };
    };
    const withDist = reps
      .filter((r) => {
        const { lat, lon } = getOtherLatLon(r);
        return qth && Number.isFinite(lat) && Number.isFinite(lon);
      })
      .map((r) => {
        const { lat, lon } = getOtherLatLon(r);
        const dist = qth ? distanceKm(qth.lat, qth.lon, lat, lon) : null;
        const band = freqToBand(
          r.frequency != null ? r.frequency / 1000 : null
        );
        return { ...r, distKm: dist, band };
      });

    const maxDist =
      withDist.length > 0
        ? Math.max(...withDist.map((r) => r.distKm || 0))
        : null;
    const bandCounts = {};
    withDist.forEach((r) => {
      const b = r.band || "other";
      bandCounts[b] = (bandCounts[b] || 0) + 1;
    });
    const bandList = Object.entries(bandCounts).sort((a, b) => b[1] - a[1]);

    return {
      reports: withDist.slice(0, 8),
      stats: { maxDistKm: maxDist, bandList, total: withDist.length }
    };
  }, [data, qth]);

  if (err) return <PanelError message={err} onRetry={load} label="WSPR Stats" />;
  if (!data) return <PanelLoading lines={5} />;

  const callsign = data.callsign || "—";

  return (
    <div className="panel-content-grid">
      <div className="spots-filters" style={{ flexWrap: "wrap" }}>
        <label className="spots-filter-label">Period</label>
        <select
          className="ui-select"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          aria-label="Time period"
        >
          {HOURS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        <strong>{callsign}</strong> · WSPR · Last {hours} h ·{" "}
        <a
          href="https://pskreporter.info/pskmap.html"
          target="_blank"
          rel="noreferrer"
        >
          PSK Reporter
        </a>
      </div>

      {stats && stats.total > 0 && (
        <div className="news-slider-card" style={{ padding: 12 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 8px 0", fontWeight: 700 }}>
            Statistics
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "4px 16px",
              fontSize: 13
            }}
          >
            <span style={{ color: "var(--muted)" }}>Max distance</span>
            <strong>
              {stats.maxDistKm != null
                ? `${Math.round(stats.maxDistKm)} km`
                : "—"}
            </strong>
            <span style={{ color: "var(--muted)" }}>Bands</span>
            <span>
              {stats.bandList
                .map(([b, c]) => `${b}: ${c}`)
                .join(" · ")}
            </span>
            <span style={{ color: "var(--muted)" }}>Reports</span>
            <span>{stats.total}</span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {reports.length === 0 ? (
          <div className="panel-empty">
            No WSPR reports yet. Ensure WSPR is running and PSK Reporter is
            receiving your spots.
          </div>
        ) : (
          reports.map((r, i) => {
            const otherCall =
              r.direction === "heard_you" ? r.senderCallsign : r.receiverCallsign;
            const isHeardYou = r.direction === "heard_you";
            return (
              <div
                key={`${otherCall}-${r.flowStartSeconds}-${i}`}
                className="news-slider-card"
                style={{ padding: 8 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center"
                  }}
                >
                  <span style={{ fontWeight: 800 }}>{otherCall || "—"}</span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 6,
                      background: isHeardYou
                        ? "rgba(55,178,77,0.3)"
                        : "rgba(77,171,247,0.3)",
                      color: "rgba(255,255,255,0.9)"
                    }}
                  >
                    {isHeardYou ? "Heard you" : "You heard"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {r.band || "—"} · {r.frequency != null ? `${(r.frequency / 1000).toFixed(1)} kHz` : "—"}
                  {r.distKm != null ? ` · ${Math.round(r.distKm)} km` : ""}
                  {r.sNR != null ? ` · SNR ${r.sNR}` : ""}
                  {r.flowStartSeconds != null
                    ? ` · ${formatDateTimeUtc(new Date(r.flowStartSeconds * 1000).toISOString())}`
                    : ""}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
