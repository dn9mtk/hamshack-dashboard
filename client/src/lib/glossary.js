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
};

/** Shortcuts for the help overlay */
export const SHORTCUTS = [
  { key: "?", desc: "Show this help" },
  { key: "Esc", desc: "Close modal / cancel" },
  { key: "← →", desc: "Prev/next sidebar tab" },
  { key: "Home / End", desc: "First / last sidebar tab" },
];
