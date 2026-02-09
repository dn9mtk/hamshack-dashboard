/**
 * Quick links to logging / QSL services. Uses callsign from config for URLs.
 * UI: panel-content-grid, link list in card style (like news-slider-link--static).
 */
const LINKS = [
  { id: "lotw", label: "LoTW", url: "https://lotw.arrl.org/lotwuser/default", desc: "ARRL Logbook of the World" },
  { id: "eqsl", label: "eQSL", url: "https://www.eqsl.cc/qslcard/", desc: "eQSL.cc" },
  { id: "clublog", label: "ClubLog", url: "https://clublog.org/", desc: "ClubLog DXCC & awards" },
  { id: "qrz", label: "QRZ", url: "https://www.qrz.com/", desc: "QRZ.com Logbook & DB" },
];

function logbookUrl(id, callsign) {
  const call = (callsign || "").trim().toUpperCase();
  if (!call) return LINKS.find((l) => l.id === id)?.url ?? "#";
  switch (id) {
    case "qrz":
      return `https://www.qrz.com/db/${encodeURIComponent(call)}`;
    case "clublog":
      return `https://clublog.org/dxcc?call=${encodeURIComponent(call)}`;
    default:
      return LINKS.find((l) => l.id === id)?.url ?? "#";
  }
}

export default function LogbookPanel({ callsign = "" }) {
  return (
    <div className="panel-content-grid">
      <p className="panel-intro">
        Schnellzugriff auf Logbuch- und QSL-Dienste.
        {callsign ? ` Callsign ${callsign} für QRZ/ClubLog verwendet.` : " Callsign in Einstellungen eintragen für personalisierte Links."}
      </p>
      <div className="news-panel-content">
        <div className="news-slider-card">
          <div className="news-slider-link news-slider-link--static logbook-links">
            {LINKS.map(({ id, label, desc }) => (
              <a
                key={id}
                href={logbookUrl(id, callsign)}
                target="_blank"
                rel="noopener noreferrer"
                className="logbook-link"
              >
                <span className="logbook-link-label">{label}</span>
                <span className="logbook-link-desc">{desc}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
