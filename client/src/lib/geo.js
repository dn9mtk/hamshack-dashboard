/**
 * Geo utilities: distance, bearing, lat/lon ↔ Maidenhead, DMS.
 */
import { gridCenter } from "./grid.js";

/** Haversine distance in km */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Initial bearing from point 1 to point 2 (degrees 0–360) */
export function bearing(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let b = toDeg(Math.atan2(y, x));
  return (b + 360) % 360;
}

/** Lat/lon (WGS84) → Maidenhead locator (6-char) */
export function latLonToLocator(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const A = "A".charCodeAt(0);
  let lon2 = lon + 180;
  let lat2 = lat + 90;
  const f1 = Math.floor(lon2 / 20);
  const f2 = Math.floor(lat2 / 10);
  lon2 %= 20;
  lat2 %= 10;
  const s1 = Math.floor(lon2 / 2);
  const s2 = Math.floor(lat2 / 1);
  lon2 %= 2;
  lat2 %= 1;
  const sub1 = Math.floor(lon2 / (2 / 24));
  const sub2 = Math.floor(lat2 / (1 / 24));
  const c = (n) => String.fromCharCode(A + Math.min(23, Math.max(0, n)));
  return c(f1) + c(f2) + String(s1) + String(s2) + c(sub1) + c(sub2);
}

/** Lat/lon → DMS string (e.g. "50°08'12\"N 008°25'48\"E") */
export function latLonToDms(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const latD = Math.abs(lat);
  const latDeg = Math.floor(latD);
  const latMin = Math.floor((latD - latDeg) * 60);
  const latSec = ((latD - latDeg - latMin / 60) * 3600).toFixed(1);
  const latDir = lat >= 0 ? "N" : "S";
  const lonD = Math.abs(lon);
  const lonDeg = Math.floor(lonD);
  const lonMin = Math.floor((lonD - lonDeg) * 60);
  const lonSec = ((lonD - lonDeg - lonMin / 60) * 3600).toFixed(1);
  const lonDir = lon >= 0 ? "E" : "W";
  return `${latDeg}°${latMin}'${latSec}"${latDir}  ${lonDeg}°${lonMin}'${lonSec}"${lonDir}`;
}

/** Get QTH from locator or config */
export function getQth(locator, lat, lon) {
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
    return { lat, lon };
  }
  return locator && locator !== "—" ? gridCenter(locator) : null;
}
