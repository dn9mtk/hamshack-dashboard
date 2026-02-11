import { useEffect, useState, useRef } from "react";

export default function Settings({ open, onClose, onSaved }) {
  const [config, setConfig] = useState({ callsign: "", locator: "", qthName: "", pwsStationId: "", heyWhatsThatViewId: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
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
          heyWhatsThatViewId: data.heyWhatsThatViewId ?? ""
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
        heyWhatsThatViewId: (config.heyWhatsThatViewId || "").trim() || undefined
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

  if (!open) return null;

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
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 id="settings-title">Settings</h3>
        {loading ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label htmlFor="settings-callsign">Callsign</label>
            <input
              ref={firstInputRef}
              id="settings-callsign"
              type="text"
              value={config.callsign}
              onChange={(e) => setConfig((c) => ({ ...c, callsign: e.target.value }))}
              placeholder="e.g. DN9MTK"
              autoComplete="off"
              aria-describedby="settings-callsign-desc"
            />
            <label htmlFor="settings-locator">Maidenhead locator (QTH)</label>
            <input
              id="settings-locator"
              type="text"
              value={config.locator}
              onChange={(e) => setConfig((c) => ({ ...c, locator: e.target.value.toUpperCase() }))}
              placeholder="e.g. JO40FD"
              autoComplete="off"
              maxLength={8}
            />
            <label htmlFor="settings-qthname">QTH name / location</label>
            <input
              id="settings-qthname"
              type="text"
              value={config.qthName}
              onChange={(e) => setConfig((c) => ({ ...c, qthName: e.target.value }))}
              placeholder="e.g. Taunus Mountains * Germany"
              autoComplete="off"
            />
            <label htmlFor="settings-pws">PWS station ID (Local Weather)</label>
            <input
              id="settings-pws"
              type="text"
              value={config.pwsStationId}
              onChange={(e) => setConfig((c) => ({ ...c, pwsStationId: e.target.value.toUpperCase() }))}
              placeholder="e.g. IKELKH27"
              autoComplete="off"
            />
            <label htmlFor="settings-heywhatsthat">HeyWhatsThat View ID (Map layer)</label>
            <input
              id="settings-heywhatsthat"
              type="text"
              value={config.heyWhatsThatViewId}
              onChange={(e) => setConfig((c) => ({ ...c, heyWhatsThatViewId: e.target.value.trim() }))}
              placeholder="e.g. JJMXK9TK (from heywhatsthat.com/?view=...)"
              autoComplete="off"
            />
            {err && (
              <p id="settings-callsign-desc" style={{ color: "#ffb4b4", fontSize: 12, marginBottom: 8 }}>
                {err}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} aria-label="Cancel">
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving} aria-label="Save settings">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
