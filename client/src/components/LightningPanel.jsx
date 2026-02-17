/**
 * Lightning / thunderstorms – links and info. Map via Lightning layer on main map.
 * Blitzortung.org provides real-time lightning detection; storms correlate with QRN and VHF tropo.
 */
export default function LightningPanel() {
  return (
    <div className="panel-content-grid">
      <div className="news-slider-card" style={{ padding: 12 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 8px 0", fontWeight: 700 }}>Links</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <a
            href="https://www.blitzortung.org/"
            target="_blank"
            rel="noreferrer"
            className="news-slider-link"
          >
            Blitzortung.org – live lightning network
          </a>
          <a
            href="https://www.lightningmaps.org/"
            target="_blank"
            rel="noreferrer"
            className="news-slider-link"
          >
            LightningMaps.org – alternative view
          </a>
        </div>
      </div>
      <div className="news-slider-card" style={{ padding: 12 }}>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Use the <strong>Lightning ON</strong> button on the map to show the Blitzortung live map overlay.
          Lightning causes QRN (atmospheric noise) on HF. Storms also affect VHF tropo propagation.
          Before outdoor operations, check storm activity for safety.
        </p>
      </div>
    </div>
  );
}
