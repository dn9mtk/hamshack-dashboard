export const RIG_FREQ_KEY = "hamshack_rig_freq_mhz";

export function loadRigFreq() {
  try {
    const v = localStorage.getItem(RIG_FREQ_KEY);
    if (v === null || v === "") return "";
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? String(n) : v;
  } catch {}
  return "";
}

export function saveRigFreq(value) {
  try {
    const v = String(value).trim();
    if (v === "") {
      localStorage.removeItem(RIG_FREQ_KEY);
      return;
    }
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n) && n > 0) localStorage.setItem(RIG_FREQ_KEY, String(n));
  } catch {}
}
