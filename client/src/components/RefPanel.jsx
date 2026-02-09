/**
 * Kurz-Referenz: Phonetik (ICAO), RST, Q-Codes. Toggle wie Contests/Bandplan.
 */
import { useState } from "react";

const TABS = [
  { id: "phonetik", label: "Phonetik" },
  { id: "rst", label: "RST" },
  { id: "qcodes", label: "Q-Codes" },
];

const PHONETIK = [
  "A Alpha", "B Bravo", "C Charlie", "D Delta", "E Echo", "F Foxtrot", "G Golf", "H Hotel",
  "I India", "J Juliett", "K Kilo", "L Lima", "M Mike", "N November", "O Oscar", "P Papa",
  "Q Quebec", "R Romeo", "S Sierra", "T Tango", "U Uniform", "V Victor", "W Whiskey", "X X-ray",
  "Y Yankee", "Z Zulu",
];

const RST = [
  { title: "R (Readability)", items: ["1 Unreadable", "2 Barely readable", "3 Readable with difficulty", "4 Readable", "5 Perfectly readable"] },
  { title: "S (Strength)", items: ["1 Faint", "2 Very weak", "3 Weak", "4 Fair", "5 Moderate", "6 Good", "7 Moderately strong", "8 Strong", "9 Very strong"] },
  { title: "T (Tone, CW)", items: ["1 Very rough", "2 Rough", "3 Clean", "4 Clean", "5 Musical", "6 Musical", "7 Pure tone", "8 Pure tone", "9 Pure tone"] },
];

const QCODES = [
  "QRA Name?", "QRG Freq?", "QRL Busy?", "QRM Interference", "QRN Static", "QRO Increase power", "QRP Low power", "QRQ Faster", "QRS Slower",
  "QRT Stop", "QRV Ready", "QRX Wait", "QRZ Who calls?", "QSB Fading", "QSL Confirm", "QSO Contact", "QSY Change freq", "QTH Location",
];

export default function RefPanel() {
  const [tab, setTab] = useState("phonetik");

  return (
    <div className="panel-content-grid">
      <p className="panel-intro">
        Kurzreferenz für Phonetik (ICAO), RST und häufige Q-Codes.
      </p>
      <div className="bandplan-category-toggle ref-panel-tabs" role="group" aria-label="Referenz">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`contests-toggle-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="news-panel-content">
        <div className="news-slider-card">
          <div className="news-slider-link news-slider-link--static ref-panel-content">
            {tab === "phonetik" && (
              <div className="ref-phonetik">
                <span className="news-slider-title ref-section-title">ICAO-Alphabet</span>
                <div className="ref-phonetik-grid">
                  {PHONETIK.map((line) => (
                    <span key={line.slice(0, 1)} className="ref-phonetik-item">{line}</span>
                  ))}
                </div>
              </div>
            )}
            {tab === "rst" && (
              <div className="ref-rst">
                {RST.map(({ title, items }) => (
                  <div key={title} className="ref-rst-block">
                    <span className="ref-rst-title">{title}</span>
                    <ul className="ref-rst-list">
                      {items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {tab === "qcodes" && (
              <div className="ref-qcodes">
                <span className="news-slider-title ref-section-title">Häufige Q-Codes</span>
                <div className="ref-qcodes-grid">
                  {QCODES.map((q) => (
                    <span key={q} className="ref-qcodes-item">{q}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
