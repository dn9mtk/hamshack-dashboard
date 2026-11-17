// Frequencies the dashboard may tune the rig to, per German licence class (AFuV Anlage 1),
// limited to what the FT-991A covers. Source of the class E and class N columns:
// AFuV Anlage 1 as amended on 27 May 2024 (BGBl. 2024 I Nr. 175), in force since 24 June 2024,
// https://www.gesetze-im-internet.de/afuv_2005/anlage_1.html (checked 2026-11-17).
// Bands above 470 MHz are left out because the FT-991A cannot tune them.

export const DEFAULT_LICENCE_CLASS = "N";

const band = (name, lowHz, highHz) => ({ name, lowHz, highHz });

const BAND_10M = band("10 m", 28_000_000, 29_700_000);
const BAND_2M = band("2 m", 144_000_000, 146_000_000);
const BAND_70CM = band("70 cm", 430_000_000, 440_000_000);

const BANDS_BY_CLASS = {
  N: [BAND_10M, BAND_2M, BAND_70CM],
  E: [
    band("160 m", 1_810_000, 2_000_000),
    band("80 m", 3_500_000, 3_800_000),
    band("15 m", 21_000_000, 21_450_000),
    BAND_10M,
    BAND_2M,
    BAND_70CM
  ],
  A: [
    band("2200 m", 135_700, 137_800),
    band("630 m", 472_000, 479_000),
    band("160 m", 1_810_000, 2_000_000),
    band("80 m", 3_500_000, 3_800_000),
    band("60 m", 5_351_500, 5_366_500),
    band("40 m", 7_000_000, 7_200_000),
    band("30 m", 10_100_000, 10_150_000),
    band("20 m", 14_000_000, 14_350_000),
    band("17 m", 18_068_000, 18_168_000),
    band("15 m", 21_000_000, 21_450_000),
    band("12 m", 24_890_000, 24_990_000),
    BAND_10M,
    band("6 m", 50_000_000, 52_000_000),
    BAND_2M,
    BAND_70CM
  ]
};

export const LICENCE_CLASSES = Object.keys(BANDS_BY_CLASS);

/** Licence class from the RIG_LICENCE_CLASS value; unknown values fall back to class N. */
export function resolveLicenceClass(value, warn = () => {}) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "") return DEFAULT_LICENCE_CLASS;
  if (LICENCE_CLASSES.includes(normalized)) return normalized;
  warn(`RIG_LICENCE_CLASS must be one of ${LICENCE_CLASSES.join(", ")} – using class ${DEFAULT_LICENCE_CLASS}`);
  return DEFAULT_LICENCE_CLASS;
}

export function bandsForLicenceClass(licenceClass) {
  return BANDS_BY_CLASS[licenceClass] ?? BANDS_BY_CLASS[DEFAULT_LICENCE_CLASS];
}

export function formatMHz(freqHz) {
  return `${Number((freqHz / 1e6).toFixed(6))} MHz`;
}

/**
 * Check a requested frequency against the bands of the licence class.
 * Returns { ok: true, freqHz } or { ok: false, message }.
 */
export function validateFrequency(freqHz, licenceClass) {
  if (typeof freqHz !== "number" || !Number.isSafeInteger(freqHz) || freqHz <= 0) {
    return { ok: false, message: "Frequency must be a positive whole number of Hz. Nothing was sent to the rig." };
  }
  const allowed = bandsForLicenceClass(licenceClass).some((b) => freqHz >= b.lowHz && freqHz <= b.highHz);
  if (!allowed) {
    return {
      ok: false,
      message: `${formatMHz(freqHz)} is outside the bands allowed for licence class ${licenceClass}. Nothing was sent to the rig.`
    };
  }
  return { ok: true, freqHz };
}
