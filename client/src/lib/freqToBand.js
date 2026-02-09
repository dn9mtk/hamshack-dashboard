/**
 * Band name from frequency (MHz or kHz). For display in Rig panel etc.
 */
export function freqToBand(freq) {
  let f = Number(freq);
  if (!Number.isFinite(f)) return null;
  if (f >= 1000) f = f / 1000;
  if (f >= 1.8 && f < 2) return "160 m";
  if (f >= 3.5 && f < 4) return "80 m";
  if (f >= 5.3 && f < 5.4) return "60 m";
  if (f >= 7 && f < 7.2) return "40 m";
  if (f >= 10.1 && f < 10.15) return "30 m";
  if (f >= 14 && f < 14.35) return "20 m";
  if (f >= 18.068 && f < 18.168) return "17 m";
  if (f >= 21 && f < 21.45) return "15 m";
  if (f >= 24.89 && f < 24.99) return "12 m";
  if (f >= 28 && f < 29.7) return "10 m";
  if (f >= 50 && f < 54) return "6 m";
  if (f >= 70 && f < 70.5) return "4 m";
  if (f >= 144 && f < 146) return "2 m";
  if (f >= 430 && f < 440) return "70 cm";
  return null;
}
