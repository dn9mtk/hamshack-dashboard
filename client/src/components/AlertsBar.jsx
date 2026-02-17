import { useEffect, useState } from "react";

export default function AlertsBar() {
  const [alerts, setAlerts] = useState([]);
  const [wantedDx, setWantedDx] = useState([]);
  const [civilProtection, setCivilProtection] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/alerts")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then((data) => {
          if (!cancelled) {
            setAlerts(data.alerts || []);
            setWantedDx(data.wantedDx || []);
            setCivilProtection(data.civilProtection || []);
          }
        })
        .catch((e) => { if (!cancelled) setErr(String(e)); });
    }
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (err && !alerts.length && !wantedDx.length) {
    return (
      <div
        className="alerts-bar alerts-bar-error"
        role="alert"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px 16px",
          padding: "6px 12px",
          background: "rgba(240, 62, 62, 0.15)",
          borderBottom: "1px solid rgba(240, 62, 62, 0.3)",
          fontSize: 13,
          color: "rgba(255,255,255,0.9)"
        }}
      >
        <span style={{ fontWeight: 700, color: "#f03e3e" }}>⚠ Alerts</span>
        <span>Failed to load alerts. Retrying…</span>
      </div>
    );
  }

  const spaceAlerts = alerts.filter((a) => a.type !== "militaryAircraft");
  const militaryAlerts = alerts.filter((a) => a.type === "militaryAircraft");
  const hasSpaceAlerts = spaceAlerts.length > 0;
  const hasWantedDx = wantedDx.length > 0;
  const hasMilitaryAlerts = militaryAlerts.length > 0;
  const hasCivilProtection = civilProtection.length > 0;
  if (!hasSpaceAlerts && !hasWantedDx && !hasMilitaryAlerts && !hasCivilProtection) return null;

  return (
    <>
      {hasMilitaryAlerts && (
        <div
          className="alerts-bar alerts-bar-military"
          role="alert"
          aria-live="polite"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px 16px",
            padding: "6px 12px",
            background: "rgba(245,159,0,0.15)",
            borderBottom: "1px solid rgba(245,159,0,0.4)",
            fontSize: 13,
            color: "rgba(255,255,255,0.95)"
          }}
        >
          <span style={{ fontWeight: 700, color: "#f59f00" }}>✈ Military aircraft in radius</span>
          {militaryAlerts.map((a, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {a.message}
            </span>
          ))}
        </div>
      )}
      {hasSpaceAlerts && (
        <div
          className="alerts-bar"
          role="alert"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px 16px",
            padding: "6px 12px",
            background: "rgba(240, 62, 62, 0.2)",
            borderBottom: "1px solid rgba(240, 62, 62, 0.4)",
            fontSize: 13,
            color: "rgba(255,255,255,0.95)"
          }}
        >
          <span style={{ fontWeight: 700, color: "#f03e3e" }}>⚠ Alerts</span>
          {spaceAlerts.map((a, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {a.message}
            </span>
          ))}
        </div>
      )}
      {hasCivilProtection && (
        <div
          className="alerts-bar alerts-bar-civil"
          role="alert"
          aria-live="polite"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px 16px",
            padding: "6px 12px",
            background: "rgba(220,53,69,0.15)",
            borderBottom: "1px solid rgba(220,53,69,0.4)",
            fontSize: 13,
            color: "rgba(255,255,255,0.95)"
          }}
        >
          <span style={{ fontWeight: 700, color: "#dc3545" }}>⚠ Katastrophenschutz</span>
          {civilProtection.slice(0, 4).map((w, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {w.url ? (
                <a href={w.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                  [{w.source}] {w.title}
                </a>
              ) : (
                <span>[{w.source}] {w.title}</span>
              )}
            </span>
          ))}
          {civilProtection.length > 4 && (
            <span style={{ color: "rgba(255,255,255,0.6)" }}>+{civilProtection.length - 4} more</span>
          )}
          <a href="https://warnung.bund.de" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.9)", fontSize: 11, marginLeft: "auto" }}>
            warnung.bund.de ↗
          </a>
        </div>
      )}
      {hasWantedDx && (
        <div
          className="alerts-bar alerts-bar-wanted"
          role="alert"
          aria-live="polite"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px 16px",
            padding: "6px 12px",
            background: "rgba(77,171,247,0.15)",
            borderBottom: "1px solid rgba(77,171,247,0.4)",
            fontSize: 13,
            color: "rgba(255,255,255,0.95)"
          }}
        >
          <span style={{ fontWeight: 700, color: "rgba(77,171,247,0.95)" }}>🎯 Wanted DX spotted</span>
          {wantedDx.slice(0, 6).map((s, i) => (
            <span key={i}>
              {s.dx} {s.freq} MHz {s.mode || ""}
              {s.entity ? ` (${s.entity})` : ""}
            </span>
          ))}
          {wantedDx.length > 6 && (
            <span style={{ color: "rgba(255,255,255,0.6)" }}>+{wantedDx.length - 6} more</span>
          )}
        </div>
      )}
    </>
  );
}
