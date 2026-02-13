/**
 * Glossary of ham radio and propagation terms.
 * Used for tooltips and the help overlay.
 */
export const GLOSSARY = {
  MUF: {
    term: "MUF",
    full: "Maximum Usable Frequency",
    def: "Highest frequency that will be reflected by the ionosphere between two points. Above MUF, signals pass through to space. Estimated from foF2 and path geometry.",
  },
  LUF: {
    term: "LUF",
    full: "Lowest Usable Frequency",
    def: "Lowest frequency that provides usable communication. Below LUF, D-layer absorption kills the signal. D-RAP estimates absorption.",
  },
  FOT: {
    term: "FOT",
    full: "Frequency of Optimum Traffic",
    def: "Often taken as 0.85 × MUF. Best compromise for reliable F2-layer propagation.",
  },
  foF2: {
    term: "foF2",
    full: "F2 layer critical frequency",
    def: "Critical frequency of the F2 ionospheric layer. Used with MUF factor to estimate path MUF.",
  },
  SFI: {
    term: "SFI",
    full: "Solar Flux Index",
    def: "10.7 cm solar radio flux at 2800 MHz. Correlates with ionization; higher = better HF propagation. Typical: 70–250.",
  },
  Kp: {
    term: "Kp",
    full: "Planetary K-index",
    def: "0–9 scale of geomagnetic activity. Kp < 3: calm. Kp 5+: disturbed, aurora, degraded HF.",
  },
  "A-index": {
    term: "A-index",
    full: "Planetary A-index",
    def: "Daily geomagnetic activity (0–400). Derived from K-indices. Low = quiet conditions.",
  },
  "D-RAP": {
    term: "D-RAP",
    full: "D-Region Absorption Product",
    def: "NOAA product: absorption in the D-layer. Higher absorption = worse low-band propagation.",
  },
  grayline: {
    term: "Grayline",
    full: "Terminator / twilight zone",
    def: "Dawn/dusk band where ionosphere transitions. Often excellent for long-path DX.",
  },
  EIRP: {
    term: "EIRP",
    full: "Equivalent Isotropically Radiated Power",
    def: "Power in dBm that would need to be fed to an ideal isotropic antenna to match your signal level.",
  },
  FSPL: {
    term: "FSPL",
    full: "Free-Space Path Loss",
    def: "Signal loss over distance in empty space. FSPL (dB) ≈ 32.4 + 20·log₁₀(d_km) + 20·log₁₀(f_MHz).",
  },
  QTH: {
    term: "QTH",
    full: "Location",
    def: "Your station location (Q-code). Shown as Maidenhead locator or WGS84 coordinates.",
  },
  locator: {
    term: "Locator",
    full: "Maidenhead grid",
    def: "E.g. JO40FD. Encodes latitude/longitude in a compact form for ham radio.",
  },
  "radio horizon": {
    term: "Radio horizon",
    full: "Line-of-sight limit",
    def: "Distance to geometric horizon. d_km ≈ 4.12 × (√h₁ + √h₂) with 4/3 Earth radius.",
  },
  "terrain horizon": {
    term: "Terrain horizon",
    full: "Terrain-blocked visibility",
    def: "Where hills/mountains block line of sight. Inside the purple polygon on the map.",
  },
  DX: {
    term: "DX",
    full: "Long-distance",
    def: "Distant station or long-haul contact. DXpedition = expedition for rare DX.",
  },
  beacon: {
    term: "Beacon",
    full: "NCDXF/IARU beacons",
    def: "18 HF beacons worldwide. One transmits at a time; test propagation to different regions.",
  },
  repeater: {
    term: "Repeater",
    full: "VHF/UHF relay",
    def: "Receives on one frequency, retransmits on another. Extends range for mobile/portable.",
  },
  SOTA: {
    term: "SOTA",
    full: "Summits on the Air",
    def: "Awards program for activating summits. Often uses VHF/UHF with limited horizon.",
  },
  POTA: {
    term: "POTA",
    full: "Parks on the Air",
    def: "Activators operate portable in parks; hunters contact them. Spots show live activators, park reference, band, and mode.",
  },
  IOTA: {
    term: "IOTA",
    full: "Islands on the Air",
    def: "Awards program for activating islands. Activators are spotted with island reference (e.g. EU-001).",
  },
  COTA: {
    term: "COTA",
    full: "Castles on the Air",
    def: "World Castles Award. Activators operate from castles; hunters contact them for the award.",
  },
  xOTA: {
    term: "xOTA",
    full: "POTA, SOTA, IOTA, COTA",
    def: "Combined activators panel. Select program, view spots and map layer. Colors: POTA teal, SOTA amber, IOTA purple, COTA blue.",
  },
  "DX Cluster": {
    term: "DX Cluster",
    full: "DX spotting network",
    def: "Real-time spots from DX Cluster nodes. Shows who is active, frequency, mode, and spotter. RBN = Reverse Beacon Network (CW spots).",
  },
  spot: {
    term: "Spot",
    full: "Activator report",
    def: "Someone heard an activator and reported it. Contains callsign, frequency, mode, and reference (park/summit/island/castle).",
  },
  "path forecast": {
    term: "Path forecast",
    full: "Propagation path prediction",
    def: "Click map → forecast from your QTH to that point. Shows MUF, band reliability, elevation profile.",
  },
  "PSK Reporter": {
    term: "PSK Reporter",
    full: "Digital mode reports",
    def: "Real-time reports of FT8, FT4, etc. Shows who heard whom. Green = you heard them, purple = they heard you.",
  },
  "band status": {
    term: "Band status",
    full: "Open / marginal / closed",
    def: "Open: MUF well above band. Marginal: MUF near band. Closed: MUF below band or disturbed.",
  },
  "X-ray": {
    term: "X-ray",
    full: "Solar X-ray flux",
    def: "Short and long wavelength. Flares cause sudden ionospheric disturbances (SID).",
  },
  "solar wind": {
    term: "Solar wind",
    full: "Particle flux from Sun",
    def: "Speed (km/s), density (p/cc), Bz (nT). Southward Bz drives aurora and geomagnetic storms.",
  },
  "Link Budget": {
    term: "Link Budget",
    full: "Power budget",
    def: "EIRP minus path loss minus fade margin. Positive = link feasible. Used for VHF/UHF planning.",
  },
};

/** Shortcuts for the help overlay */
export const SHORTCUTS = [
  { key: "?", desc: "Show this help overlay" },
  { key: "Esc", desc: "Close modal or cancel edit" },
  { key: "← →", desc: "Prev/next sidebar tab; also navigate in sliders (News, Spots, xOTA, etc.)" },
  { key: "Home / End", desc: "First / last sidebar tab" },
  { key: "Enter", desc: "Confirm frequency edit in rig display" },
  { key: "Map click", desc: "Click map to show path forecast from your QTH to that point" },
];
