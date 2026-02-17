/**
 * Settings modal with thematic tabs – QTH, Warn, DX, Wetter.
 * Compact layout so each tab fits on one page without scrolling.
 */
import { useEffect, useState, useRef } from "react";

const SETTINGS_TABS = [
  { id: "qth", label: "QTH" },
  { id: "warn", label: "Warn" },
  { id: "dx", label: "DX" },
  { id: "wetter", label: "Wetter" }
];

export default function Settings({ open, onClose, onSaved }) {
  const [config, setConfig] = useState({ callsign: "", locator: "", qthName: "", pwsStationId: "", lat: "", lon: "", elevation: "", antennaHeight: "", wantedPrefixes: "", ninaArs: "", ninaAreaFilter: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [ninaLoading, setNinaLoading] = useState(false);
  const [ninaMessage, setNinaMessage] = useState(null);
  const [tab, setTab] = useState("qth");
  const overlayRef = useRef(null);
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setLoading(true);
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        setConfig({
          callsign: data.callsign ?? "",
          locator: data.locator ?? "",
          qthName: data.qthName ?? "",
          pwsStationId: data.pwsStationId ?? "",
          lat: data.lat != null && data.lat !== "" ? String(data.lat) : "",
          lon: data.lon != null && data.lon !== "" ? String(data.lon) : "",
          elevation: data.elevation != null && data.elevation !== "" ? String(data.elevation) : "",
          antennaHeight: data.antennaHeight != null && data.antennaHeight !== "" ? String(data.antennaHeight) : "",
          wantedPrefixes: data.wantedPrefixes ?? "",
          ninaArs: data.ninaArs ?? "",
          ninaAreaFilter: data.ninaAreaFilter ?? ""
        });
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callsign: (config.callsign || "").trim().toUpperCase(),
        locator: (config.locator || "").trim().toUpperCase(),
        qthName: (config.qthName || "").trim(),
        pwsStationId: (config.pwsStationId || "").trim().toUpperCase() || undefined,
        lat: config.lat !== "" && config.lat != null && Number.isFinite(Number(config.lat)) ? Number(config.lat) : null,
        lon: config.lon !== "" && config.lon != null && Number.isFinite(Number(config.lon)) ? Number(config.lon) : null,
        antennaHeight: config.antennaHeight !== "" && config.antennaHeight != null && Number.isFinite(Number(config.antennaHeight)) && Number(config.antennaHeight) >= 0 ? Number(config.antennaHeight) : null,
        wantedPrefixes: (config.wantedPrefixes || "").trim(),
        ninaArs: (config.ninaArs || "").replace(/\D/g, "").slice(0, 12) || "",
        ninaAreaFilter: (config.ninaAreaFilter || "").trim()
      })
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then(() => {
        typeof onSaved === "function" && onSaved();
        onClose();
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setSaving(false));
  }

  useEffect(() => {
    if (open && !loading) firstInputRef.current?.focus();
  }, [open, loading]);

  // Pre-fill NINA fields from QTH when Warn tab is opened and fields are empty
  useEffect(() => {
    if (!open || loading || tab !== "warn") return;
    if (config.ninaArs || config.ninaAreaFilter) return;
    loadNinaFromQth();
  }, [open, loading, tab]);

  function loadNinaFromQth() {
    const lat = config.lat !== "" && config.lat != null && Number.isFinite(Number(config.lat)) ? Number(config.lat) : NaN;
    const lon = config.lon !== "" && config.lon != null && Number.isFinite(Number(config.lon)) ? Number(config.lon) : NaN;
    const loc = (config.locator || "").trim();
    let params = "";
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      params = `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    } else if (loc.length >= 4) {
      params = `locator=${encodeURIComponent(loc)}`;
    } else {
      setNinaMessage("QTH-Tab: Locator (4+ Zeichen) oder Lat/Lon eingeben.");
      return;
    }
    setNinaMessage(null);
    setNinaLoading(true);
    fetch(`/api/nina-lookup?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && (data.ninaArs || data.ninaAreaFilter)) {
          setConfig((c) => ({
            ...c,
            ninaArs: data.ninaArs || c.ninaArs || "",
            ninaAreaFilter: data.ninaAreaFilter || c.ninaAreaFilter || ""
          }));
          setNinaMessage(data.ninaArs ? "Geladen." : "Ortsfilter gefunden, ARS fehlt – ggf. manuell eintragen.");
        } else {
          setNinaMessage("Nichts gefunden. QTH prüfen (nur Deutschland).");
        }
      })
      .catch(() => setNinaMessage("Fehler beim Laden."))
      .finally(() => setNinaLoading(false));
  }

  if (!open) return null;

  const Field = ({ id, label, children }) => (
    <div className="settings-field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="modal-dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3 id="settings-title">Settings</h3>
          <div className="bandplan-category-toggle settings-tabs" role="tablist" aria-label="Settings sections">
            {SETTINGS_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`settings-panel-${t.id}`}
                id={`settings-tab-${t.id}`}
                className={`contests-toggle-btn ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="settings-loading">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit} className="settings-form">
            <div className="settings-panels">
              {tab === "qth" && (
                <div id="settings-panel-qth" role="tabpanel" aria-labelledby="settings-tab-qth" className="settings-panel">
                  <p className="settings-hint">Rufzeichen und QTH für Topbar, KI, Relais. Koordinaten → Locator und Höhe werden beim Speichern ermittelt.</p>
                  <Field id="settings-callsign" label="Callsign">
                    <input
                      ref={firstInputRef}
                      id="settings-callsign"
                      type="text"
                      value={config.callsign}
                      onChange={(e) => setConfig((c) => ({ ...c, callsign: e.target.value }))}
                      placeholder="e.g. DN9MTK"
                      autoComplete="off"
                    />
                  </Field>
                  <Field id="settings-qthname" label="QTH name / Ort">
                    <input
                      id="settings-qthname"
                      type="text"
                      value={config.qthName}
                      onChange={(e) => setConfig((c) => ({ ...c, qthName: e.target.value }))}
                      placeholder="e.g. Taunus Mountains * Germany"
                      autoComplete="off"
                    />
                  </Field>
                  <Field id="settings-locator" label="Maidenhead locator">
                    <input
                      id="settings-locator"
                      type="text"
                      value={config.locator}
                      onChange={(e) => setConfig((c) => ({ ...c, locator: e.target.value.toUpperCase() }))}
                      placeholder="e.g. JO40FD"
                      autoComplete="off"
                      maxLength={8}
                    />
                  </Field>
                  <div className="settings-row">
                    <Field id="settings-lat" label="WGS84 lat">
                      <input
                        id="settings-lat"
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        value={config.lat != null && config.lat !== "" ? config.lat : ""}
                        onChange={(e) => setConfig((c) => ({ ...c, lat: e.target.value }))}
                        placeholder="50.12"
                        autoComplete="off"
                      />
                    </Field>
                    <Field id="settings-lon" label="WGS84 lon">
                      <input
                        id="settings-lon"
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        value={config.lon != null && config.lon !== "" ? config.lon : ""}
                        onChange={(e) => setConfig((c) => ({ ...c, lon: e.target.value }))}
                        placeholder="8.57"
                        autoComplete="off"
                      />
                    </Field>
                  </div>
                  <div className={config.elevation !== "" ? "settings-row" : ""}>
                    {config.elevation !== "" && (
                      <Field id="settings-elevation" label="Elevation (auto)">
                        <input id="settings-elevation" type="text" value={`${config.elevation} m`} readOnly disabled className="settings-input-readonly" />
                      </Field>
                    )}
                    <Field id="settings-antennaheight" label="Antennenhöhe (m)">
                      <input
                        id="settings-antennaheight"
                        type="text"
                        inputMode="decimal"
                        value={config.antennaHeight != null && config.antennaHeight !== "" ? config.antennaHeight : ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
                          setConfig((c) => ({ ...c, antennaHeight: v }));
                        }}
                        placeholder="11"
                        autoComplete="off"
                      />
                    </Field>
                  </div>
                </div>
              )}
              {tab === "warn" && (
                <div id="settings-panel-warn" role="tabpanel" aria-labelledby="settings-tab-warn" className="settings-panel">
                  <p className="settings-hint">Katastrophenschutz-Warnungen (NINA/Katwarn). ARS und Ortsfilter aus QTH (Locator oder Koordinaten im QTH-Tab).</p>
                  <div style={{ marginBottom: 10 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={loadNinaFromQth}
                      disabled={ninaLoading}
                      aria-label="NINA ARS und Ortsfilter aus QTH laden"
                    >
                      {ninaLoading ? "Lade…" : "Von QTH laden"}
                    </button>
                    {ninaMessage && <p className="settings-hint" style={{ marginTop: 6, color: "var(--muted)" }}>{ninaMessage}</p>}
                  </div>
                  <Field id="settings-ninaars" label="NINA ARS (12 Ziffern)">
                    <input
                      id="settings-ninaars"
                      type="text"
                      inputMode="numeric"
                      value={config.ninaArs}
                      onChange={(e) => setConfig((c) => ({ ...c, ninaArs: e.target.value.replace(/\D/g, "").slice(0, 12) }))}
                      placeholder="e.g. 064340000000"
                      autoComplete="off"
                      maxLength={12}
                    />
                  </Field>
                  <Field id="settings-ninaareafilter" label="NINA Ortsfilter">
                    <input
                      id="settings-ninaareafilter"
                      type="text"
                      value={config.ninaAreaFilter}
                      onChange={(e) => setConfig((c) => ({ ...c, ninaAreaFilter: e.target.value }))}
                      placeholder="Ort, Landkreis (komma-getrennt)"
                      autoComplete="off"
                    />
                  </Field>
                  <p className="settings-hint" style={{ marginTop: 4 }}>
                    <a href="https://warnung.bund.de" target="_blank" rel="noopener noreferrer">warnung.bund.de</a> · ARS im Gemeindeverzeichnis
                  </p>
                </div>
              )}
              {tab === "dx" && (
                <div id="settings-panel-dx" role="tabpanel" aria-labelledby="settings-tab-dx" className="settings-panel">
                  <p className="settings-hint">Seltene DX-Prefixe: Alert in der Topbar, wenn sie in den Spots erscheinen.</p>
                  <Field id="settings-wanted" label="Wanted DX prefixes">
                    <input
                      id="settings-wanted"
                      type="text"
                      value={config.wantedPrefixes}
                      onChange={(e) => setConfig((c) => ({ ...c, wantedPrefixes: e.target.value.toUpperCase() }))}
                      placeholder="e.g. JA, VK, ZL, VK9"
                      autoComplete="off"
                    />
                  </Field>
                </div>
              )}
              {tab === "wetter" && (
                <div id="settings-panel-wetter" role="tabpanel" aria-labelledby="settings-tab-wetter" className="settings-panel">
                  <p className="settings-hint">PWS (Personal Weather Station) für lokales Wetter im Wetter-Panel.</p>
                  <Field id="settings-pws" label="PWS station ID">
                    <input
                      id="settings-pws"
                      type="text"
                      value={config.pwsStationId}
                      onChange={(e) => setConfig((c) => ({ ...c, pwsStationId: e.target.value.toUpperCase() }))}
                      placeholder="e.g. IKELKH27"
                      autoComplete="off"
                    />
                  </Field>
                </div>
              )}
            </div>
            {err && <p className="settings-err">{err}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} aria-label="Cancel">Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving} aria-label="Save settings">{saving ? "Saving…" : "Save"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
