// FT-991A operating modes: dashboard label <-> hamlib mode token.
// hamlib accepts unknown set_mode tokens silently, so only tokens from this table are ever sent.
const MODES = [
  { label: "LSB", hamlib: "LSB" },
  { label: "USB", hamlib: "USB" },
  { label: "CW-U", hamlib: "CW" },
  { label: "CW-L", hamlib: "CWR" },
  { label: "AM", hamlib: "AM" },
  { label: "AM-N", hamlib: "AMN" },
  { label: "FM", hamlib: "FM" },
  { label: "FM-N", hamlib: "FMN" },
  { label: "RTTY-L", hamlib: "RTTY" },
  { label: "RTTY-U", hamlib: "RTTYR" },
  { label: "DATA-L", hamlib: "PKTLSB" },
  { label: "DATA-U", hamlib: "PKTUSB" },
  { label: "DATA-FM", hamlib: "PKTFM" },
  { label: "C4FM", hamlib: "C4FM" }
];

// The FT-991 backend reports DATA-FM as FM-D
const READ_ALIASES = { "FM-D": "DATA-FM" };

export const MODE_LABELS = MODES.map((m) => m.label);
export const HAMLIB_MODE_TOKENS = MODES.map((m) => m.hamlib);

export function hamlibModeForLabel(label) {
  return MODES.find((m) => m.label === label)?.hamlib ?? null;
}

/** Dashboard label for a mode reported by rigctld, or the raw token if it is not in the table. */
export function labelForHamlibMode(token) {
  return MODES.find((m) => m.hamlib === token)?.label ?? READ_ALIASES[token] ?? token;
}
