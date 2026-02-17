/**
 * VHF tropo – Hepburn forecast and live APRS conditions.
 * vhf.dxview.org blocks iframe embedding (X-Frame-Options), so links only.
 */
const TROPO_LINKS = [
  {
    url: "https://www.dxinfocentre.com/tropo_eur.html",
    label: "Hepburn – Europe",
    desc: "6-day tropo forecast"
  },
  {
    url: "https://vhf.dxview.org/map?center=50.1,8.7,5.5",
    label: "VHF DX View – Live",
    desc: "Real-time APRS propagation"
  }
];

export default function TropoPanel() {
  return (
    <div className="panel-content-grid">
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px 0" }}>
        Tropospheric ducting: 2m and 70cm beyond line-of-sight.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TROPO_LINKS.map((item) => (
          <a
            key={item.url}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="news-slider-card news-slider-link"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: 12,
              textDecoration: "none"
            }}
          >
            <span className="news-slider-title">{item.label}</span>
            <span className="news-slider-date">{item.desc}</span>
            <span className="news-slider-hint" style={{ marginTop: 4 }}>Open ↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
