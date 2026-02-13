import { useState, useCallback } from "react";

const STORAGE_KEY = "hamshack_local_nets";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function loadNets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveNets(nets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nets));
  } catch {}
}

/** Next occurrence of net (day + time local) */
function nextOccurrence(net) {
  const day = typeof net.day === "number" ? net.day : DAYS.indexOf(String(net.day || "").slice(0, 3));
  const timeStr = String(net.time || "20:00").trim();
  const [h = 20, m = 0] = timeStr.split(":").map(Number);
  const now = new Date();
  const today = now.getDay();
  let daysAhead = (day - today + 7) % 7;
  const target = new Date(now);
  target.setDate(target.getDate() + daysAhead);
  target.setHours(h, m, 0, 0);
  if (daysAhead === 0 && target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 7);
  }
  return target;
}

function formatNext(net) {
  const t = nextOccurrence(net);
  const now = Date.now();
  const ms = t.getTime() - now;
  const mins = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (ms < 0) return "—";
  if (days > 0) return `in ${days}d`;
  if (hours > 0) return `in ${hours}h`;
  if (mins > 0) return `in ${mins}m`;
  return "Soon";
}

export default function LocalNetsPanel() {
  const [nets, setNets] = useState(loadNets);
  const [index, setIndex] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [newNet, setNewNet] = useState({ name: "", day: 1, time: "20:00", freq: "", notes: "" });

  const addNet = useCallback(() => {
    const n = { ...newNet };
    n.name = String(n.name || "").trim();
    if (!n.name) return;
    setNets((prev) => {
      const next = [...prev, { ...n, id: Date.now() }];
      saveNets(next);
      return next;
    });
    setNewNet({ name: "", day: 1, time: "20:00", freq: "", notes: "" });
    setAddOpen(false);
  }, [newNet]);

  const removeNet = useCallback((id) => {
    setNets((prev) => {
      const next = prev.filter((n) => n.id !== id);
      saveNets(next);
      return next;
    });
    setIndex((i) => Math.max(0, Math.min(i, nets.length - 2)));
  }, [nets.length]);

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (nets.length <= 1) return i;
      return (i + delta + nets.length) % nets.length;
    });
  }, [nets.length]);

  const currentNet = nets[index];

  return (
    <div className="panel">
      <h2 className="panel-heading">Local Nets</h2>
      <div className="panel-content-grid">
        <p className="panel-empty" style={{ marginBottom: 0, fontSize: 13 }}>
          Add your local nets (time/day/frequency). Stored in browser.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="contests-toggle-btn"
            onClick={() => setAddOpen((o) => !o)}
            aria-pressed={addOpen}
          >
            Add net
          </button>
        </div>
        {addOpen && (
          <div className="news-slider-card" style={{ padding: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="spots-filter">
                <span className="spots-filter-label">Name</span>
                <input
                  type="text"
                  className="repeaters-search-input"
                  placeholder="Monday Net"
                  value={newNet.name}
                  onChange={(e) => setNewNet((n) => ({ ...n, name: e.target.value }))}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <label className="spots-filter">
                  <span className="spots-filter-label">Day</span>
                  <select
                    className="ui-select"
                    value={newNet.day}
                    onChange={(e) => setNewNet((n) => ({ ...n, day: Number(e.target.value) }))}
                    aria-label="Day"
                  >
                    {DAYS.map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </label>
                <label className="spots-filter">
                  <span className="spots-filter-label">Time (local)</span>
                  <input
                    type="text"
                    className="repeaters-search-input"
                    placeholder="20:00"
                    value={newNet.time}
                    onChange={(e) => setNewNet((n) => ({ ...n, time: e.target.value }))}
                  />
                </label>
              </div>
              <label className="spots-filter">
                <span className="spots-filter-label">Freq / Repeater</span>
                <input
                  type="text"
                  className="repeaters-search-input"
                  placeholder="145.575 or DB0XYZ"
                  value={newNet.freq}
                  onChange={(e) => setNewNet((n) => ({ ...n, freq: e.target.value }))}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="contests-toggle-btn active" onClick={addNet}>Save</button>
                <button type="button" className="contests-toggle-btn" onClick={() => setAddOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {nets.length === 0 && !addOpen ? (
          <div className="panel-empty">No nets yet. Click Add net to add your first.</div>
        ) : (
          <div className="news-panel-content news-panel-slider">
            <div className="news-slider-card">
              {currentNet ? (
                <div className="news-slider-link" style={{ cursor: "default" }}>
                  <span className="news-slider-title">{currentNet.name || "—"}</span>
                  <div className="news-slider-date">
                    {DAYS[currentNet.day] ?? currentNet.day} {String(currentNet.time || "—")} local
                    {currentNet.freq ? ` · ${currentNet.freq}` : ""}
                  </div>
                  <div className="news-slider-date" style={{ marginTop: 4, color: "rgba(77,171,247,0.9)" }}>
                    {formatNext(currentNet)}
                  </div>
                  {currentNet.notes && (
                    <div className="news-slider-date" style={{ marginTop: 2, fontSize: 12 }}>
                      {currentNet.notes}
                    </div>
                  )}
                  <button
                    type="button"
                    className="news-slider-btn"
                    style={{ marginTop: 8, alignSelf: "flex-start", fontSize: 11 }}
                    onClick={() => removeNet(currentNet.id)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="panel-empty-inline">No nets</div>
              )}
            </div>
            {nets.length > 1 && (
              <div className="news-slider-nav" role="group" aria-label="Navigate nets" tabIndex={0}>
                <div className="news-slider-nav-row">
                  <button type="button" className="news-slider-btn" onClick={() => go(-1)} aria-label="Previous">&#60;</button>
                  <span className="news-slider-counter" aria-live="polite">{index + 1} / {nets.length}</span>
                  <button type="button" className="news-slider-btn" onClick={() => go(1)} aria-label="Next">&#62;</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
