/**
 * IARU Region 1 Band Plans: HF, VHF, UHF.
 * HF: DARC PDF (Oct 2020). VHF: iaru-r1.org VHF Bandplan (Dec 2020). UHF: iaru-r1.org UHF Bandplan (Dec 2020).
 * Hinweise-Auszüge weggelassen (gilt für alle Bereiche).
 */

import { useState, useCallback, useEffect } from "react";

// Segment: freq (kHz/MHz range string), bw (max bandwidth), usage (mode and notes)
const HF_BANDS = [
  {
    id: "2200m",
    band: "2200 m",
    segments: [
      { freq: "135,7 – 137,8", bw: "200", usage: "CW, QRSS and narrow band digital modes" },
    ],
  },
  {
    id: "630m",
    band: "630 m",
    segments: [
      { freq: "472 – 475", bw: "200", usage: "CW (NOTES)" },
      { freq: "475 – 479", bw: "(#)", usage: "Narrow band modes: CW, digimodes (NOTES)" },
    ],
  },
  {
    id: "160m",
    band: "160 m (1,8 MHz)",
    segments: [
      { freq: "1810 – 1838", bw: "200", usage: "CW (1836 kHz CW QRP Centre of Activity)" },
      { freq: "1838 – 1840", bw: "500", usage: "Narrow band modes" },
      { freq: "1840 – 1843", bw: "2700", usage: "All modes (1) – Digimodes" },
      { freq: "1843 – 2000", bw: "2700", usage: "All modes (1)" },
    ],
  },
  {
    id: "80m",
    band: "80 m (3,5 MHz)",
    segments: [
      { freq: "3500 – 3510", bw: "200", usage: "CW – Priority for inter-continental operation" },
      { freq: "3510 – 3560", bw: "200", usage: "CW – Contest preferred; 3555 kHz CW QRS, 3560 kHz CW QRP" },
      { freq: "3560 – 3570", bw: "200", usage: "CW – 3560 kHz CW QRP Centre of Activity" },
      { freq: "3570 – 3580", bw: "200", usage: "Narrow band modes – Digimodes" },
      { freq: "3580 – 3590", bw: "500", usage: "Narrow band modes – Digimodes" },
      { freq: "3590 – 3600", bw: "500", usage: "Narrow band modes – Digimodes, unattended" },
      { freq: "3600 – 3620", bw: "2700", usage: "All modes (1) – Digimodes, unattended" },
      { freq: "3600 – 3650", bw: "2700", usage: "All modes (1) – SSB contest preferred; 3630 kHz Digital Voice" },
      { freq: "3650 – 3700", bw: "2700", usage: "All modes – 3690 kHz SSB QRP Centre of Activity" },
      { freq: "3700 – 3775", bw: "2700", usage: "All modes – SSB contest; 3735 kHz Image, 3760 kHz R1 Emergency" },
      { freq: "3775 – 3800", bw: "2700", usage: "All modes – SSB contest; Priority for inter-continental" },
    ],
  },
  {
    id: "60m",
    band: "60 m (5 MHz)",
    segments: [
      { freq: "5351,5 – 5354,0", bw: "200", usage: "CW, Narrow band modes (NOTES)" },
      { freq: "5354,0 – 5366,0", bw: "2700", usage: "All modes – USB recommended for voice (##) (NOTES)" },
      { freq: "5366,0 – 5366,5", bw: "20 (I)", usage: "Weak signal narrow band modes (NOTES)" },
    ],
  },
  {
    id: "40m",
    band: "40 m (7 MHz)",
    segments: [
      { freq: "7000 – 7040", bw: "200", usage: "CW – 7030 kHz CW, QRP Centre of Activity" },
      { freq: "7040 – 7047", bw: "500", usage: "Narrow band modes – Digimodes" },
      { freq: "7047 – 7050", bw: "500", usage: "Narrow band modes – Digimodes, unattended" },
      { freq: "7050 – 7053", bw: "2700", usage: "All modes (1) – Digimodes, unattended" },
      { freq: "7053 – 7060", bw: "2700", usage: "All modes (1) – Digimodes" },
      { freq: "7060 – 7100", bw: "2700", usage: "All modes – SSB contest; 7070 Digital Voice, 7090 SSB QRP" },
      { freq: "7100 – 7130", bw: "2700", usage: "All modes – 7110 kHz Region 1 Emergency Centre" },
      { freq: "7130 – 7175", bw: "2700", usage: "All modes – SSB contest; 7165 kHz Image Centre of Activity" },
      { freq: "7175 – 7200", bw: "2700", usage: "All modes – SSB contest; Priority for inter-continental" },
    ],
  },
  {
    id: "30m",
    band: "30 m (10 MHz)",
    segments: [
      { freq: "10100 – 10130", bw: "200", usage: "CW – 10116 kHz CW QRP Centre of Activity" },
      { freq: "10130 – 10150", bw: "500", usage: "Narrow band modes – Digimodes" },
    ],
  },
  {
    id: "20m",
    band: "20 m (14 MHz)",
    segments: [
      { freq: "14000 – 14060", bw: "200", usage: "CW – Contest preferred; 14055 kHz QRS Centre of Activity" },
      { freq: "14060 – 14070", bw: "200", usage: "CW – 14060 kHz CW QRP Centre of Activity" },
      { freq: "14070 – 14089", bw: "500", usage: "Narrow band modes – Digimodes" },
      { freq: "14089 – 14099", bw: "500", usage: "Narrow band modes – Digimodes, unattended" },
      { freq: "14099 – 14101", bw: "—", usage: "International Beacon Project – Beacons exclusively" },
      { freq: "14101 – 14112", bw: "2700", usage: "All modes – Digimodes, unattended" },
      { freq: "14112 – 14125", bw: "2700", usage: "All modes" },
      { freq: "14125 – 14300", bw: "2700", usage: "All modes – SSB contest; 14130 Digital Voice, 14195 DX, 14230 Image, 14285 SSB QRP" },
      { freq: "14300 – 14350", bw: "2700", usage: "All modes – 14300 kHz Global Emergency Centre of Activity" },
    ],
  },
  {
    id: "17m",
    band: "17 m (18 MHz)",
    segments: [
      { freq: "18068 – 18095", bw: "200", usage: "CW – 18086 kHz CW QRP Centre of Activity" },
      { freq: "18095 – 18105", bw: "500", usage: "Narrow band modes – Digimodes" },
      { freq: "18105 – 18109", bw: "500", usage: "Narrow band modes – Digimodes, unattended" },
      { freq: "18109 – 18111", bw: "—", usage: "International Beacon Project – Beacons exclusively" },
      { freq: "18111 – 18120", bw: "2700", usage: "All modes – Digimodes, unattended" },
      { freq: "18120 – 18168", bw: "2700", usage: "All modes – 18130 SSB QRP, 18150 Digital Voice, 18160 Emergency" },
    ],
  },
  {
    id: "15m",
    band: "15 m (21 MHz)",
    segments: [
      { freq: "21000 – 21070", bw: "200", usage: "CW – 21055 kHz QRS, 21060 kHz QRP Centre of Activity" },
      { freq: "21070 – 21090", bw: "500", usage: "Narrow band modes – Digimodes" },
      { freq: "21090 – 21110", bw: "500", usage: "Narrow band modes – Digimodes, unattended" },
      { freq: "21110 – 21120", bw: "2700", usage: "All modes – Digimodes, unattended (not SSB)" },
      { freq: "21120 – 21149", bw: "500", usage: "Narrow band modes" },
      { freq: "21149 – 21151", bw: "—", usage: "International Beacon Project – Beacons exclusively" },
      { freq: "21151 – 21450", bw: "2700", usage: "All modes – 21180 Digital Voice, 21285 SSB QRP, 21340 Image, 21360 Global Emergency" },
    ],
  },
  {
    id: "12m",
    band: "12 m (24 MHz)",
    segments: [
      { freq: "24890 – 24915", bw: "200", usage: "CW – 24906 kHz CW QRP Centre of Activity" },
      { freq: "24915 – 24925", bw: "500", usage: "Narrow band modes – Digimodes" },
      { freq: "24925 – 24929", bw: "500", usage: "Narrow band modes – Digimodes, unattended" },
      { freq: "24929 – 24931", bw: "—", usage: "International Beacon Project – Beacons exclusively" },
      { freq: "24931 – 24940", bw: "2700", usage: "All modes – Digimodes, unattended" },
      { freq: "24940 – 24990", bw: "2700", usage: "All modes – 24950 SSB QRP, 24960 Digital Voice Centre of Activity" },
    ],
  },
  {
    id: "10m",
    band: "10 m (28 MHz)",
    segments: [
      { freq: "28000 – 28070", bw: "200", usage: "CW – 28055 kHz QRS, 28060 kHz QRP Centre of Activity" },
      { freq: "28070 – 28120", bw: "500", usage: "Narrow band modes – Digimodes" },
      { freq: "28120 – 28150", bw: "500", usage: "Narrow band modes – Digimodes, unattended" },
      { freq: "28150 – 28190", bw: "500", usage: "Narrow band modes" },
      { freq: "28190 – 28199", bw: "—", usage: "International Beacon Project – Regional time shared beacons" },
      { freq: "28199 – 28201", bw: "—", usage: "International Beacon Project – Worldwide time shared beacons" },
      { freq: "28201 – 28225", bw: "—", usage: "International Beacon Project – Continuous duty beacons" },
      { freq: "28225 – 28300", bw: "2700", usage: "All modes – Beacons" },
      { freq: "28300 – 28320", bw: "2700", usage: "All modes – Digimodes, unattended" },
      { freq: "28320 – 29000", bw: "2700", usage: "All modes – 28330 Digital Voice, 28360 SSB QRP, 28680 Image" },
      { freq: "29000 – 29100", bw: "(unrestricted)", usage: "All modes" },
      { freq: "29100 – 29200", bw: "(unrestricted)", usage: "All modes – FM simplex, 10 kHz channels" },
      { freq: "29200 – 29300", bw: "(unrestricted)", usage: "All modes – Digimodes, unattended" },
      { freq: "29300 – 29510", bw: "(unrestricted)", usage: "Satellite Links" },
      { freq: "29510 – 29520", bw: "—", usage: "Guard Channel" },
      { freq: "29520 – 29590", bw: "6000", usage: "All modes – FM Repeater input (RH1–RH8)" },
      { freq: "29600", bw: "6000", usage: "All modes – FM Calling channel" },
      { freq: "29610", bw: "6000", usage: "All modes – FM Simplex Repeater (parrot, input + output)" },
      { freq: "29620 – 29700", bw: "6000", usage: "All modes – FM Repeater output (RH1–RH8)" },
    ],
  },
];

// VHF: https://www.iaru-r1.org/wp-content/uploads/2020/12/VHF-Bandplan.pdf (effective Dec 2020)
const VHF_BANDS = [
  {
    id: "50m",
    band: "50 MHz (6 m)",
    segments: [
      { freq: "50 000 – 50 100", bw: "500", usage: "Coordinated Beacon Project, Telegraphy (50,05 / 50,09 Centre of Activity)" },
      { freq: "50 100 – 50 200", bw: "2700", usage: "SSB and Telegraphy (50,11 / 50,15 Centre of Activity)" },
      { freq: "50 200 – 50 300", bw: "2700", usage: "SSB and Telegraphy" },
      { freq: "50 300 – 50 400", bw: "2700", usage: "Narrow band modes, MGM (50,305 PSK, 50,31–50,32 EME/MS)" },
      { freq: "50 400 – 50 500", bw: "1000", usage: "MGM and Telegraphy; Beacons exclusive (50,401 WSPR)" },
      { freq: "50 500 – 52 000", bw: "12 KHz", usage: "All mode (SSTV, FM/DV gateways, RTTY, Digital, FM/DV Repeater, Simplex)" },
      { freq: "52 000 – 54 000", bw: "500 KHz", usage: "All mode" },
    ],
  },
  {
    id: "70m",
    band: "70 MHz (4 m)",
    segments: [
      { freq: "70 000 – 70 090", bw: "1000", usage: "MGM and Telegraphy, Coordinated beacons" },
      { freq: "70 090 – 70 100", bw: "1000", usage: "MGM and Telegraphy, Temporary and personal beacons (70,091 WSPR)" },
      { freq: "70 100 – 70 250", bw: "2700", usage: "SSB, Telegraphy, MGM (70,185 Crossband, 70,2 CW/SSB calling, 70,25 MS)" },
      { freq: "70 250 – 70 294", bw: "12 KHz", usage: "AM, FM (70,26 AM/FM calling, 70,27 MGM)" },
      { freq: "70 294 – 70 500", bw: "12 KHz", usage: "FM Channels 12,5 KHz spacing (70,45 FM calling)" },
    ],
  },
  {
    id: "144m",
    band: "144 MHz (2 m)",
    segments: [
      { freq: "144 000 – 144 025", bw: "2700", usage: "All mode, satellite downlink only" },
      { freq: "144 025 – 144 100", bw: "500", usage: "Telegraphy (144,05 calling, 144,1 Random MS)" },
      { freq: "144 100 – 144 150", bw: "500", usage: "MGM and Telegraphy (144,11–144,16 CW/MGM EME)" },
      { freq: "144 150 – 144 400", bw: "2700", usage: "SSB, Telegraphy, MGM (144,3 SSB Centre of Activity)" },
      { freq: "144 400 – 144 490", bw: "500", usage: "MGM and Telegraphy, Beacons exclusive" },
      { freq: "144 500 – 144 794", bw: "20 KHz", usage: "All mode (SSTV, Data, ATV)" },
      { freq: "144 794 – 144 9625", bw: "12 KHz", usage: "MGM/Digital (APRS 144,8, DV gateways)" },
      { freq: "144 975 – 145 194", bw: "12 KHz", usage: "FM/Digital Voice, Repeater input" },
      { freq: "145 206 – 145 5625", bw: "12 KHz", usage: "FM/DV (145,5 FM calling)" },
      { freq: "145 575 – 145 7935", bw: "12 KHz", usage: "FM/DV Repeater output" },
      { freq: "145 806 – 146 000", bw: "12 KHz", usage: "All mode, Satellite exclusive" },
    ],
  },
];

// UHF: https://www.iaru-r1.org/wp-content/uploads/2021/03/UHF-Bandplan.pdf (effective Dec 2020)
const UHF_BANDS = [
  {
    id: "430m",
    band: "430–440 MHz (70 cm)",
    segments: [
      { freq: "430 000 – 431 975", bw: "20 KHz", usage: "All mode (FM repeater out/in, digital, multimode)" },
      { freq: "432 000 – 432 100", bw: "500", usage: "MGM & Telegraphy (432,05 Centre of Activity)" },
      { freq: "432 100 – 432 400", bw: "2700", usage: "MGM, Telegraphy & SSB (432,2 SSB, 432,35 Microwave talkback, 432,37 MS)" },
      { freq: "432 400 – 432 490", bw: "500", usage: "MGM & Telegraphy, Beacons exclusive" },
      { freq: "432 500 – 432 975", bw: "12 KHz", usage: "All mode (APRS 432,5, Repeater input Region 1)" },
      { freq: "433 000 – 433 375", bw: "12 KHz", usage: "FM/Digital Voice repeaters input" },
      { freq: "433 400 – 433 575", bw: "12 KHz", usage: "FM/DV (433,4 SSTV, 433,45 DV calling, 433,5 FM calling)" },
      { freq: "433 600 – 434 000", bw: "none", usage: "All mode, digital communications" },
      { freq: "434 000 – 434 594", bw: "12 KHz", usage: "All mode, ATV" },
      { freq: "434 594 – 434 981", bw: "12 KHz", usage: "All mode, Repeater output" },
      { freq: "435 000 – 436 000", bw: "none", usage: "Satellite service" },
      { freq: "436 000 – 438 000", bw: "none", usage: "Satellite service & DATV/data" },
      { freq: "438 000 – 440 000", bw: "none", usage: "All mode (digital, repeater output, links)" },
    ],
  },
  {
    id: "1240m",
    band: "1240–1300 MHz (23 cm)",
    segments: [
      { freq: "1240 000 – 1240 500", bw: "2700", usage: "All modes, reserved for the future" },
      { freq: "1240 500 – 1240 750", bw: "500", usage: "MGM & Telegraphy, Beacons (reserved)" },
      { freq: "1241 000 – 1243 250", bw: "20 KHz", usage: "All modes (repeater output, digital)" },
      { freq: "1243 250 – 1260 000", bw: "*", usage: "(D)ATV" },
      { freq: "1260 000 – 1270 000", bw: "*", usage: "Satellite service" },
      { freq: "1270 000 – 1272 000", bw: "20 KHz", usage: "All modes (repeater input, digital)" },
      { freq: "1296 000 – 1296 150", bw: "500", usage: "MGM & Telegraphy (Moonbounce, PSK31)" },
      { freq: "1296 150 – 1296 800", bw: "2700", usage: "MGM, Telegraphy & SSB (narrow band, transponder, data)" },
      { freq: "1296 800 – 1296 994", bw: "500", usage: "MGM & Telegraphy, Beacons exclusive" },
      { freq: "1296 994 – 1297 481", bw: "20 KHz", usage: "FM/Digital Voice Repeater output" },
      { freq: "1297 494 – 1297 981", bw: "20 KHz", usage: "FM/DV (calling, gateways)" },
      { freq: "1299 000 – 1299 750", bw: "150 KHz", usage: "High speed Digital Data (5×150 kHz channels)" },
    ],
  },
  {
    id: "2300m",
    band: "2300–2450 MHz (13 cm)",
    segments: [
      { freq: "2300 000 – 2320 000", bw: "20 KHz", usage: "All modes" },
      { freq: "2320 000 – 2320 800", bw: "none", usage: "All modes (EME, SSB 2320,2, local beacons)" },
      { freq: "2320 800 – 2321 000", bw: "—", usage: "MGM & Telegraphy, Beacons exclusive" },
      { freq: "2321 000 – 2322 000", bw: "20 KHz", usage: "FM/Digital Voice simplex and repeaters" },
      { freq: "2322 000 – 2400 000", bw: "none", usage: "All modes (ATV, digital, repeaters)" },
      { freq: "2400 000 – 2450 000", bw: "—", usage: "Amateur satellite service" },
    ],
  },
];

const CATEGORIES = [
  { id: "HF", label: "HF", bands: HF_BANDS },
  { id: "VHF", label: "VHF", bands: VHF_BANDS },
  { id: "UHF", label: "UHF", bands: UHF_BANDS },
];

function getCategoryForBand(bandId) {
  for (const cat of CATEGORIES) {
    if (cat.bands.some((b) => b.id === bandId)) return cat.id;
  }
  return "HF";
}

const FILTER_KEY = "hamshack_bandplan_filter";

function loadSavedFilter() {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    if (v && CATEGORIES.some((c) => c.bands.some((b) => b.id === v))) return v;
  } catch {}
  return HF_BANDS[0].id;
}

function saveFilter(value) {
  try {
    localStorage.setItem(FILTER_KEY, value);
  } catch {}
}

export default function BandplanPanel() {
  const [bandFilter, setBandFilter] = useState(loadSavedFilter);
  const [category, setCategory] = useState(() => getCategoryForBand(loadSavedFilter()));
  const [segmentIndex, setSegmentIndex] = useState(0);

  const categoryBands = CATEGORIES.find((c) => c.id === category)?.bands ?? HF_BANDS;
  const item = categoryBands.find((b) => b.id === bandFilter) ?? categoryBands[0];

  useEffect(() => {
    if (!categoryBands.some((b) => b.id === bandFilter)) {
      setBandFilter(categoryBands[0]?.id ?? bandFilter);
    }
  }, [category, categoryBands, bandFilter]);

  useEffect(() => {
    saveFilter(bandFilter);
  }, [bandFilter]);

  useEffect(() => {
    if (categoryBands.length && !categoryBands.some((b) => b.id === bandFilter)) {
      setBandFilter(categoryBands[0].id);
    }
  }, [category, categoryBands, bandFilter]);

  const handleCategoryChange = useCallback((catId) => {
    setCategory(catId);
    const bands = CATEGORIES.find((c) => c.id === catId)?.bands ?? [];
    if (bands.length) setBandFilter(bands[0].id);
  }, []);

  useEffect(() => {
    setSegmentIndex(0);
  }, [item?.id]);

  const segments = item?.segments ?? [];
  const segmentCount = segments.length;
  const safeSegmentIndex = segmentCount
    ? Math.min(segmentIndex, segmentCount - 1)
    : 0;
  const segment = segments[safeSegmentIndex];
  const hasMultipleSegments = segmentCount > 1;

  const goSegment = useCallback((delta) => {
    setSegmentIndex((i) => (i + delta + segmentCount) % segmentCount);
  }, [segmentCount]);

  const handleSegmentKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goSegment(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goSegment(1);
      }
    },
    [goSegment]
  );

  return (
    <div className="panel-content-grid">
      <p className="panel-intro">
        IARU Region 1: HF (Oct 2020), VHF (Dec 2020), UHF (Dec 2020).{" "}
        <a href="https://www.darc.de/fileadmin/filemounts/referate/hf/hf_r1_bandplan.pdf" target="_blank" rel="noopener noreferrer" className="panel-intro-link">HF</a>
        {" · "}
        <a href="https://www.iaru-r1.org/wp-content/uploads/2020/12/VHF-Bandplan.pdf" target="_blank" rel="noopener noreferrer" className="panel-intro-link">VHF</a>
        {" · "}
        <a href="https://www.iaru-r1.org/wp-content/uploads/2021/03/UHF-Bandplan.pdf" target="_blank" rel="noopener noreferrer" className="panel-intro-link">UHF</a>.
      </p>
      <div className="bandplan-category-toggle" role="group" aria-label="Bereich">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`contests-toggle-btn ${category === cat.id ? "active" : ""}`}
            onClick={() => handleCategoryChange(cat.id)}
            aria-pressed={category === cat.id}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="spots-filters bandplan-filters">
        <label className="spots-filter bandplan-filter-band">
          <span className="spots-filter-label">Band</span>
          <select
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
            aria-label="Band"
            className="bandplan-band-select"
          >
            {categoryBands.map((b) => (
              <option key={b.id} value={b.id}>{b.band}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="news-panel-content news-panel-slider">
        {item ? (
        <div className="news-slider-card bandplan-card">
          <div className="news-slider-link news-slider-link--static bandplan-card-inner">
            <span className="news-slider-title bandplan-band-title">{item.band}</span>
            {segment ? (
              <>
                <div className="bandplan-segment-card" role="region" aria-label={`Segment ${safeSegmentIndex + 1}`}>
                  <span className="bandplan-segment-freq">{segment.freq} kHz</span>
                  <span className="bandplan-segment-bw">max. BW: {segment.bw}</span>
                  <p className="bandplan-segment-usage">{segment.usage}</p>
                </div>
                {hasMultipleSegments && (
                  <div
                    className="news-slider-nav bandplan-segment-nav"
                    role="group"
                    aria-label="Segment durchblättern"
                    tabIndex={0}
                    onKeyDown={handleSegmentKeyDown}
                  >
                    <div className="news-slider-nav-row">
                      <button
                        type="button"
                        className="news-slider-btn"
                        onClick={() => goSegment(-1)}
                        aria-label="Vorheriges Segment"
                      >
                        ‹
                      </button>
                      <span className="news-slider-counter" aria-live="polite">
                        {safeSegmentIndex + 1} / {segmentCount}
                      </span>
                      <button
                        type="button"
                        className="news-slider-btn"
                        onClick={() => goSegment(1)}
                        aria-label="Nächstes Segment"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="panel-empty">Keine Segmente.</div>
            )}
          </div>
        </div>
        ) : (
          <div className="panel-empty">Kein Eintrag.</div>
        )}
      </div>
    </div>
  );
}
