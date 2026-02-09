/**
 * Maidenhead locator to center lat/lon (same logic as server).
 * Supports 4-char (e.g. JO40) and 6-char (e.g. JO40fd).
 */
export function gridCenter(locator) {
  const loc = String(locator || "").trim().toUpperCase();
  if (loc.length < 4) return null;
  const A = "A".charCodeAt(0);
  const a = (c) => c.charCodeAt(0) - A;
  let lon = -180 + a(loc[0]) * 20 + parseInt(loc[2], 10) * 2;
  let lat = -90 + a(loc[1]) * 10 + parseInt(loc[3], 10) * 1;
  let lonSize = 2;
  let latSize = 1;
  if (loc.length >= 6) {
    lon += (loc[4].charCodeAt(0) - A) * (5 / 60);
    lat += (loc[5].charCodeAt(0) - A) * (2.5 / 60);
    lonSize = 5 / 60;
    latSize = 2.5 / 60;
  }
  if (loc.length >= 8) {
    lon += parseInt(loc[6], 10) * (0.5 / 60);
    lat += parseInt(loc[7], 10) * (0.25 / 60);
    lonSize = 0.5 / 60;
    latSize = 0.25 / 60;
  }
  lon += lonSize / 2;
  lat += latSize / 2;
  return { lat, lon };
}
