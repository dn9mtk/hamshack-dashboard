// server/index.js
import express from "express";
import cors from "cors";
import net from "net";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";
import * as sat from "satellite.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");

// Load environment variables from .env file (server/.env)
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const [rawKey, ...valueParts] = trimmed.split("=");
      const key = rawKey?.trim();
      if (!key || valueParts.length === 0) continue;

      const value = valueParts
        .join("=")
        .trim()
        .replace(/^[\"']|[\"']$/g, ""); // remove surrounding quotes

      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = value;
      }
    }
    console.log(`✓ Loaded .env from ${envPath}`);
  }
} catch (err) {
  console.warn("Warning: Could not load .env file:", err?.message || err);
}

const app = express();
app.use(cors());
app.use(express.json());

// Store client build path for later use
const clientBuildPath = path.join(__dirname, "..", "client", "dist");

const PORT = process.env.PORT || 8787;

// --------------------
// Cache helper
// --------------------
const cache = new Map();
async function cached(key, ttlMs, fetcher) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await fetcher();
  cache.set(key, { t: now, v });
  return v;
}

// --------------------
// Config (persist local)
// --------------------
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {
      callsign: process.env.CALLSIGN || "DN9MTK",
      locator: process.env.LOCATOR || "JO40FD",
      qthName: process.env.QTH_NAME || "Taunus Mountains * Germany",
      pwsStationId: process.env.PWS_STATION_ID || "IKELKH27"
    };
  }
}
function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}
let CONFIG = readConfig();

app.get("/api/config", (req, res) => {
  res.json({
    ...CONFIG,
    // Show environment status (without exposing sensitive values)
    dxcluster: {
      configured: !!(process.env.DXCLUSTER_HOST && process.env.DXCLUSTER_PORT),
      host: process.env.DXCLUSTER_HOST ? "***" : null,
      port: process.env.DXCLUSTER_PORT || null
    },
    rbn: {
      configured: !!(process.env.RBN_HOST && process.env.RBN_PORT),
      host: process.env.RBN_HOST ? "***" : null,
      port: process.env.RBN_PORT || null
    }
  });
});

const CONFIG_KEYS = ["callsign", "locator", "qthName", "pwsStationId", "heyWhatsThatViewId"];
app.post("/api/config", (req, res) => {
  const body = req.body || {};
  const updates = {};
  for (const k of CONFIG_KEYS) if (body[k] !== undefined) updates[k] = body[k];
  CONFIG = { ...CONFIG, ...updates };
  writeConfig(CONFIG);
  res.json({ ok: true, config: CONFIG });
});

// --------------------
// Maidenhead locator -> lat/lon (center of grid)
// --------------------
function locatorToLatLon(locator) {
  const loc = String(locator || "").trim().toUpperCase();
  if (!/^[A-R]{2}\d{2}([A-X]{2})?([0-9]{2})?$/i.test(loc)) return null;

  const A = "A".charCodeAt(0);
  const a = (c) => c.charCodeAt(0) - A;

  let lon = -180 + a(loc[0]) * 20;
  let lat = -90 + a(loc[1]) * 10;

  lon += parseInt(loc[2], 10) * 2;
  lat += parseInt(loc[3], 10) * 1;

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

  // center of square
  lon += lonSize / 2;
  lat += latSize / 2;

  return { lat, lon };
}

app.get("/api/qth", (req, res) => {
  const p = locatorToLatLon(CONFIG.locator);
  res.json({ ...CONFIG, ...(p || {}) });
});

// --------------------
// Geo helpers (distance/bearing)
// --------------------
function toRad(d) { return (d * Math.PI) / 180; }
function toDeg(r) { return (r * 180) / Math.PI; }

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return brng;
}

// --------------------
// Sunrise / sunset (NOAA-style, UTC)
// --------------------
function sunriseSunset(lat, lon, date) {
  const d = date || new Date();
  const n = (d.getTime() / 86400000) + 2440587.5 - 2451545.0; // Julian day offset
  const M = toRad((357.5291 + 0.98560028 * n) % 360);
  const L = toRad((280.4661 + 0.98564736 * n + 1.915 * Math.sin(M) + 0.020 * Math.sin(2 * M)) % 360);
  const e = toRad(23.44 - 0.0000004 * n);
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const eqTime = (2.466 * Math.sin(2 * L) - 7.352 * Math.cos(L) + 9.707 * Math.sin(L)) / 60; // hours
  const noonUtc = 12 - eqTime - lon / 15;
  const cosH = (Math.sin(toRad(-0.83)) - Math.sin(toRad(lat)) * Math.sin(dec)) / (Math.cos(toRad(lat)) * Math.cos(dec));
  if (cosH <= -1 || cosH >= 1) return { sunriseUtc: null, sunsetUtc: null, noonUtc };
  const H = toDeg(Math.acos(cosH)) / 15;
  const sunrise = noonUtc - H;
  const sunset = noonUtc + H;
  const dayStart = new Date(d);
  dayStart.setUTCHours(0, 0, 0, 0);
  const ms = dayStart.getTime();
  return {
    sunriseUtc: new Date(ms + sunrise * 3600000).toISOString(),
    sunsetUtc: new Date(ms + sunset * 3600000).toISOString(),
    noonUtc: new Date(ms + noonUtc * 3600000).toISOString()
  };
}

app.get("/api/sun", (req, res) => {
  const q = locatorToLatLon(CONFIG.locator);
  if (!q) return res.status(400).json({ error: "Invalid locator" });
  const today = sunriseSunset(q.lat, q.lon, new Date());
  const tomorrow = sunriseSunset(q.lat, q.lon, new Date(Date.now() + 86400000));
  res.json({
    locator: CONFIG.locator,
    lat: q.lat,
    lon: q.lon,
    today: today,
    tomorrow: tomorrow
  });
});

// --------------------
// NCDXF/IARU beacons (frequencies and positions)
// --------------------
const NCDXF_FREQS = [14.1, 18.11, 21.15, 24.93, 28.2];

app.get("/api/beacons", (req, res) => {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "ncdxf-beacons.json"), "utf8");
    const list = JSON.parse(raw);
    const beacons = list
      .map((b) => {
        const p = locatorToLatLon(b.grid);
        if (!p) return null;
        return {
          call: b.call,
          grid: b.grid,
          location: b.location,
          lat: p.lat,
          lon: p.lon,
          frequencies: NCDXF_FREQS
        };
      })
      .filter(Boolean);
    res.json({ beacons, frequencies: NCDXF_FREQS });
  } catch (e) {
    res.status(500).json({ error: "beacons_failed", detail: String(e) });
  }
});

// NCDXF beacon schedule: 18 beacons × 5 freqs, 10 sec each = 900 sec cycle
const NCDXF_CYCLE_SEC = 900;
const NCDXF_BEACON_ORDER = [14.1, 18.11, 21.15, 24.93, 28.2];

app.get("/api/beacons/status", (req, res) => {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "ncdxf-beacons.json"), "utf8");
    const list = JSON.parse(raw);
    const nowSec = (Date.now() / 1000) % NCDXF_CYCLE_SEC;
    const slot = Math.floor(nowSec / 10) % 90;
    const beaconIndex = Math.floor(slot / 5) % 18;
    const freqIndex = slot % 5;
    const beacon = list[beaconIndex] || {};
    const frequency = NCDXF_BEACON_ORDER[freqIndex];
    const nextChangeInSec = 10 - (nowSec % 10);
    const nextChangeInSecRounded = Math.ceil(nextChangeInSec);
    res.json({
      current: { beacon: beacon.call, grid: beacon.grid, location: beacon.location, frequency },
      nextChangeInSec: nextChangeInSecRounded,
      cycleSec: NCDXF_CYCLE_SEC,
      updated: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: "beacons_status_failed", detail: String(e) });
  }
});

// --------------------
// Sun position (dec, subLon) for a given date – for MUF
// --------------------
function sunPosition(date) {
  const d = date || new Date();
  const n = (d.getTime() / 86400000) + 2440587.5 - 2451545.0;
  const g = toRad((357.529 + 0.98560028 * n) % 360);
  const q = toRad((280.459 + 0.98564736 * n) % 360);
  const L = q + toRad(1.915) * Math.sin(g) + toRad(0.020) * Math.sin(2 * g);
  const e = toRad(23.439 - 0.00000036 * n);
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const jd = n + 2451545.0;
  const T = (jd - 2451545.0) / 36525.0;
  let GMST = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
  GMST = ((GMST % 360) + 360) % 360;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  let subLon = toDeg(ra) - GMST;
  subLon = ((subLon + 540) % 360) - 180;
  return { dec, subLon };
}

function solarZenithCos(lat, lon, date) {
  const { dec, subLon } = sunPosition(date);
  const latR = toRad(lat);
  const H = toRad(((lon - subLon + 540) % 360) - 180);
  return Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(H);
}

// --------------------
// Full MUF prediction (ITU-style: foF2 from SFI + solar zenith, M(3000)F2 for path)
// --------------------
const M3000_F2 = 3.0; // M(3000)F2 factor (oblique MUF / foF2 at 3000 km), typical 2.5–3.5

/** Clamp lat/lon for propagation (avoid NaN/Infinity). */
function clampLatLon(lat, lon) {
  const la = Number.isFinite(lat) ? Math.max(-90, Math.min(90, lat)) : 0;
  let lo = Number.isFinite(lon) ? lon : 0;
  while (lo < -180) lo += 360;
  while (lo > 180) lo -= 360;
  return { lat: la, lon: lo };
}

/** foF2 (MHz) at vertical incidence – ITU-style from solar flux and cos(solar zenith). Always finite. */
function foF2MHz(lat, lon, date, sfi) {
  const { lat: la, lon: lo } = clampLatLon(lat, lon);
  const cosChi = solarZenithCos(la, lo, date);
  const cosSafe = Math.max(0.01, cosChi);
  const flux = Number.isFinite(sfi) && sfi > 0 ? sfi : 100;
  const fluxTerm = Math.sqrt(1 + 0.01 * flux);
  return Math.max(0, 9 * fluxTerm * Math.sqrt(cosSafe));
}

/** Path MUF (MHz) for single-hop F2: foF2 * M(d). Always finite; from QTH perspective. */
function mufPathMHz(foF2, distanceKm) {
  const f = Number.isFinite(foF2) && foF2 >= 0 ? foF2 : 0;
  const d = Number.isFinite(distanceKm) && distanceKm >= 0 ? distanceKm : 0;
  const mFactor = 1 + (M3000_F2 - 1) * Math.min(1, d / 3000);
  return f * mFactor;
}

/** Simple LUF estimate (MHz) from D-layer absorption. Always finite. */
function lufEstimateMHz(cosChi) {
  const c = Number.isFinite(cosChi) ? Math.max(-1, Math.min(1, cosChi)) : 0;
  return 2 + 4 * Math.max(0, 1 - c);
}

/** Get QTH from CONFIG; null if invalid. Single source of truth for propagation. */
function getQth() {
  return locatorToLatLon(CONFIG.locator);
}

// --------------------
// D-RAP grid (NOAA LUF / absorption) – parse text product for drawing on our map
// --------------------
app.get("/api/drap-grid", async (req, res) => {
  try {
    const r = await fetch("https://services.swpc.noaa.gov/text/drap_global_frequencies.txt");
    const text = await r.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    let lons = null;
    const lats = [];
    const values = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed) continue;
      if (trimmed.includes("|")) {
        const [latPart, valPart] = trimmed.split("|").map((s) => s.trim());
        const lat = Number(latPart);
        if (!Number.isFinite(lat)) continue;
        const vals = valPart.split(/\s+/).filter(Boolean).map((s) => Number(s));
        if (lons && vals.length === lons.length) {
          lats.push(lat);
          values.push(vals);
        }
      } else {
        const nums = trimmed.split(/\s+/).filter(Boolean).map((s) => Number(s)).filter((n) => Number.isFinite(n));
        if (nums.length >= 24 && nums.every((n) => n >= -180 && n <= 180)) lons = nums;
      }
    }

    if (!lons || lats.length === 0) {
      return res.status(502).json({ error: "drap_parse_failed", detail: "Could not parse D-RAP grid" });
    }
    res.json({ lats, lons, values, updated: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: "drap_failed", detail: String(e) });
  }
});

// --------------------
// MUF grid – always from QTH: path MUF from QTH to each grid cell
// --------------------
app.get("/api/muf-grid", async (req, res) => {
  try {
    const q = getQth();
    if (!q) return res.status(400).json({ error: "Invalid QTH locator", detail: "Set locator in config for MUF grid" });
    const space = await cached("propagation_sfi_kp", 60_000, async () => {
      const out = { solarFlux: null };
      try {
        const r = await fetch("https://services.swpc.noaa.gov/json/f107_cm_flux.json");
        const j = await r.json();
        const last = j[j.length - 1];
        out.solarFlux = last && Number.isFinite(Number(last.flux)) ? Number(last.flux) : null;
      } catch {}
      return out;
    });
    const sfi = Number.isFinite(space.solarFlux) && space.solarFlux > 0 ? space.solarFlux : 100;
    const now = new Date();
    const step = 2;
    const lats = [];
    const lons = [];
    for (let lat = -80; lat <= 80; lat += step) lats.push(lat);
    for (let lon = -180; lon < 180; lon += step) lons.push(lon);
    function normLon(l) {
      let x = l;
      while (x > 180) x -= 360;
      while (x < -180) x += 360;
      return x;
    }
    const values = lats.map((lat) =>
      lons.map((lon) => {
        const midLat = (q.lat + lat) / 2;
        const midLon = normLon((q.lon + lon) / 2);
        const foF2Mid = foF2MHz(midLat, midLon, now, sfi);
        const distKm = distanceKm(q.lat, q.lon, lat, lon);
        return Math.round(mufPathMHz(foF2Mid, distKm) * 10) / 10;
      })
    );
    res.json({
      lats,
      lons,
      values,
      sfi,
      updated: now.toISOString(),
      locator: CONFIG.locator,
      fromQth: true,
      predictionType: "full"
    });
  } catch (e) {
    res.status(500).json({ error: "muf_grid_failed", detail: String(e) });
  }
});

// --------------------
// Band → frequency range (MHz) for spot filtering (DXView-style bands)
// --------------------
function freqRangeForBand(band) {
  const b = String(band).trim();
  const ranges = {
    "1.8": [1.8, 2.0],
    "3.5": [3.5, 4.0],
    "5.3": [5.3, 5.4],
    "7": [7.0, 7.2],
    "10": [28.0, 29.7],
    "14": [14.0, 14.35],
    "18": [18.068, 18.168],
    "21": [21.0, 21.45],
    "24": [24.89, 24.99],
    "28": [28.0, 29.7],
    "50": [50, 54]
  };
  return ranges[b] || null;
}

// --------------------
// Band grid: real-time spots (DXC + RBN, last 15 min) or MUF fallback – DXView-style data
// GET /api/band-grid?band=28 → { lats, lons, values, source: "spots"|"muf", ... }
// --------------------
const SPOT_WINDOW_MS = 15 * 60 * 1000;
const MIN_SPOTS_FOR_MAP = 5;

app.get("/api/band-grid", async (req, res) => {
  try {
    const bandParam = String(req.query.band || "").trim();
    const bandFreq = Number(bandParam);
    if (!Number.isFinite(bandFreq) || bandFreq <= 0) return res.status(400).json({ error: "Provide band (e.g. 28)" });
    const range = freqRangeForBand(bandParam);
    if (!range) return res.status(400).json({ error: "Unknown band" });

    const step = 2;
    const lats = [];
    const lons = [];
    for (let lat = -80; lat <= 80; lat += step) lats.push(lat);
    for (let lon = -180; lon < 180; lon += step) lons.push(lon);

    const now = Date.now();
    const cutoff = now - SPOT_WINDOW_MS;
    const bandSpots = spots.filter((s) => {
      const t = new Date(s.t).getTime();
      if (t < cutoff) return false;
      const f = Number(s.freq);
      if (!Number.isFinite(f)) return false;
      if (f < range[0] || f > range[1]) return false;
      return Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon));
    });

    if (bandSpots.length >= MIN_SPOTS_FOR_MAP) {
      const values = lats.map(() => lons.map(() => 0));
      for (const s of bandSpots) {
        const lat = Number(s.lat);
        const lon = Number(s.lon);
        const i = Math.floor((lat + 80) / step);
        const j = Math.floor((lon + 180) / step);
        if (i >= 0 && i < lats.length && j >= 0 && j < lons.length) {
          values[i][j] = (values[i][j] || 0) + 1;
        }
      }
      return res.json({
        lats,
        lons,
        values,
        source: "spots",
        updated: new Date().toISOString(),
        spotCount: bandSpots.length,
        windowMinutes: 15
      });
    }

    const q = getQth();
    if (!q) return res.status(400).json({ error: "Invalid QTH locator", detail: "Set locator for MUF fallback" });
    const space = await cached("propagation_sfi_kp", 60_000, async () => {
      const out = { solarFlux: null };
      try {
        const r = await fetch("https://services.swpc.noaa.gov/json/f107_cm_flux.json");
        const j = await r.json();
        const last = j[j.length - 1];
        out.solarFlux = last && Number.isFinite(Number(last.flux)) ? Number(last.flux) : null;
      } catch {}
      return out;
    });
    const sfi = Number.isFinite(space.solarFlux) && space.solarFlux > 0 ? space.solarFlux : 100;
    const nowDate = new Date();
    function normLon(l) {
      let x = l;
      while (x > 180) x -= 360;
      while (x < -180) x += 360;
      return x;
    }
    const values = lats.map((lat) =>
      lons.map((lon) => {
        const midLat = (q.lat + lat) / 2;
        const midLon = normLon((q.lon + lon) / 2);
        const foF2Mid = foF2MHz(midLat, midLon, nowDate, sfi);
        const distKm = Math.max(0, distanceKm(q.lat, q.lon, lat, lon));
        return Math.round(mufPathMHz(foF2Mid, distKm) * 10) / 10;
      })
    );
    res.json({
      lats,
      lons,
      values,
      source: "muf",
      updated: nowDate.toISOString(),
      locator: CONFIG.locator,
      bandMHz: bandFreq,
      spotCount: bandSpots.length,
      fromQth: true,
      predictionType: "full"
    });
  } catch (e) {
    res.status(500).json({ error: "band_grid_failed", detail: String(e) });
  }
});

// --------------------
// Band grid from QTH: path-based (MUF at midpoint QTH → each cell)
// GET /api/band-grid-from-qth?band=28 → same grid shape, values = path MUF from QTH to each cell
// --------------------
app.get("/api/band-grid-from-qth", async (req, res) => {
  try {
    const q = getQth();
    if (!q) return res.status(400).json({ error: "Invalid QTH locator", detail: "Set locator in config" });
    const bandFreq = Number(req.query.band);
    if (!Number.isFinite(bandFreq) || bandFreq <= 0) return res.status(400).json({ error: "Provide band (MHz)" });

    const space = await cached("propagation_sfi_kp", 60_000, async () => {
      const out = { solarFlux: null };
      try {
        const r = await fetch("https://services.swpc.noaa.gov/json/f107_cm_flux.json");
        const j = await r.json();
        const last = j[j.length - 1];
        out.solarFlux = last && Number.isFinite(Number(last.flux)) ? Number(last.flux) : null;
      } catch {}
      return out;
    });
    const sfi = Number.isFinite(space.solarFlux) && space.solarFlux > 0 ? space.solarFlux : 100;
    const now = new Date();
    const step = 2;
    const lats = [];
    const lons = [];
    for (let lat = -80; lat <= 80; lat += step) lats.push(lat);
    for (let lon = -180; lon < 180; lon += step) lons.push(lon);

    function normLon(l) {
      let x = l;
      while (x > 180) x -= 360;
      while (x < -180) x += 360;
      return x;
    }

    const values = lats.map((lat) =>
      lons.map((lon) => {
        const midLat = (q.lat + lat) / 2;
        const midLon = normLon((q.lon + lon) / 2);
        const foF2Mid = foF2MHz(midLat, midLon, now, sfi);
        const distKm = Math.max(0, distanceKm(q.lat, q.lon, lat, lon));
        return Math.round(mufPathMHz(foF2Mid, distKm) * 10) / 10;
      })
    );
    res.json({
      lats,
      lons,
      values,
      sfi,
      updated: now.toISOString(),
      fromQth: true,
      locator: CONFIG.locator,
      bandMHz: bandFreq,
      predictionType: "full"
    });
  } catch (e) {
    res.status(500).json({ error: "band_grid_qth_failed", detail: String(e) });
  }
});

// --------------------
// MUF / propagation – full prediction (ITU-style foF2 + M(3000)F2)
// Band status: QTH-dependent (foF2 from SFI + solar zenith at locator)
// --------------------
app.get("/api/propagation", async (req, res) => {
  try {
    const q = getQth();
    if (!q) return res.status(400).json({ error: "Invalid QTH locator", detail: "Set locator in config" });
    const space = await cached("propagation_sfi_kp", 60_000, async () => {
      const out = { solarFlux: null, kp: null };
      try {
        const r = await fetch("https://services.swpc.noaa.gov/json/f107_cm_flux.json");
        const j = await r.json();
        const last = j[j.length - 1];
        out.solarFlux = last && Number.isFinite(Number(last.flux)) ? Number(last.flux) : null;
      } catch {}
      try {
        const r = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json");
        const j = await r.json();
        const row = j[j.length - 1];
        out.kp = row && Number.isFinite(Number(row[1])) ? Number(row[1]) : null;
      } catch {}
      return out;
    });
    const now = new Date();
    const cosChi = solarZenithCos(q.lat, q.lon, now);
    const sfi = Number.isFinite(space.solarFlux) && space.solarFlux > 0 ? space.solarFlux : 100;
    const foF2 = foF2MHz(q.lat, q.lon, now, sfi);
    const mufMHz = foF2; // vertical MUF at QTH = foF2
    const lufMHz = lufEstimateMHz(cosChi);
    const kp = space.kp;

    const bands = [
      { name: "10m", freq: 28, mufMin: 28 },
      { name: "15m", freq: 21, mufMin: 21 },
      { name: "20m", freq: 14, mufMin: 14 },
      { name: "40m", freq: 7, mufMin: 7 }
    ].map((b) => {
      let status = "closed";
      if (mufMHz >= b.mufMin * 1.2) status = "open";
      else if (mufMHz >= b.mufMin) status = "marginal";
      if (typeof kp === "number" && kp >= 5) status = "disturbed";
      return { ...b, status };
    });

    res.json({
      locator: CONFIG.locator,
      lat: q.lat,
      lon: q.lon,
      updated: now.toISOString(),
      sfi,
      kp: space.kp,
      cosChi,
      foF2: Math.round(foF2 * 10) / 10,
      mufMHz: Math.round(mufMHz * 10) / 10,
      lufMHz: Math.round(lufMHz * 10) / 10,
      bands,
      bandStatusSource: "qth",
      predictionType: "full"
    });
  } catch (e) {
    res.status(500).json({ error: "propagation_failed", detail: String(e) });
  }
});

// --------------------
// VOACAP-style path forecast (QTH → DX, 100 W CW assumption)
// --------------------
app.get("/api/propagation/path", async (req, res) => {
  try {
    const fromQ = getQth();
    if (!fromQ) return res.status(400).json({ error: "Invalid QTH locator", detail: "Set locator in config" });
    let toLat = Number(req.query.toLat);
    let toLon = Number(req.query.toLon);
    const toGrid = String(req.query.toGrid || "").trim();
    if (toGrid) {
      const p = locatorToLatLon(toGrid);
      if (p) {
        toLat = p.lat;
        toLon = p.lon;
      }
    }
    if (!Number.isFinite(toLat) || !Number.isFinite(toLon)) {
      return res.status(400).json({ error: "Provide toLat/toLon or toGrid" });
    }
    const freqMHz = Number(req.query.freq) || null;
    const powerW = Number(req.query.powerW);
    const powerWatts = Number.isFinite(powerW) && powerW > 0 ? powerW : 5;
    const space = await cached("propagation_sfi_kp", 60_000, async () => {
      const out = { solarFlux: null, kp: null };
      try {
        const r = await fetch("https://services.swpc.noaa.gov/json/f107_cm_flux.json");
        const j = await r.json();
        const last = j[j.length - 1];
        out.solarFlux = last && Number.isFinite(Number(last.flux)) ? Number(last.flux) : null;
      } catch {}
      try {
        const r = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json");
        const j = await r.json();
        const row = j[j.length - 1];
        out.kp = row && Number.isFinite(Number(row[1])) ? Number(row[1]) : null;
      } catch {}
      return out;
    });
    const midLat = (fromQ.lat + toLat) / 2;
    const midLon = (fromQ.lon + toLon) / 2;
    const nowDate = new Date();
    const sfi = Number.isFinite(space.solarFlux) && space.solarFlux > 0 ? space.solarFlux : 100;
    const kp = Number.isFinite(space.kp) && space.kp >= 0 ? space.kp : 0;
    const foF2Mid = foF2MHz(midLat, midLon, nowDate, sfi);
    const distKm = Math.max(0, distanceKm(fromQ.lat, fromQ.lon, toLat, toLon));
    const mufPath = mufPathMHz(foF2Mid, distKm);
    const cosChiMid = solarZenithCos(midLat, midLon, nowDate);
    const lufPath = lufEstimateMHz(cosChiMid);
    const fotPath = Math.max(0, 0.85 * mufPath); // FOT = 0.85 × MUF (ITU-R)

    const bands = [
      { name: "10m", freq: 28 },
      { name: "15m", freq: 21 },
      { name: "20m", freq: 14 },
      { name: "40m", freq: 7 }
    ].map((b) => {
      const f = b.freq;
      const muf = mufPath;
      const fot = fotPath;
      const luf = lufPath;
      let reliability = 0;
      if (f >= muf || muf <= 0) {
        reliability = 0; // above MUF or no MUF: no F2 support
      } else if (f <= luf) {
        reliability = 0; // below LUF: D-layer absorption
      } else if (fot <= luf) {
        reliability = 0; // no usable window (FOT <= LUF)
      } else if (f <= fot) {
        const denom = fot - luf;
        reliability = denom > 0 ? 100 * (f - luf) / denom : 0;
      } else {
        const denom = muf - fot;
        reliability = denom > 0 ? 100 * (muf - f) / denom : 0;
      }
      reliability = reliability * Math.max(0, 1 - (kp / 12));
      reliability = Math.round(Math.min(100, Math.max(0, reliability)));
      const ratio = f > 0 ? muf / f : 0;
      return { name: b.name, freq: b.freq, reliability, mufRatio: Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : 0 };
    });
    // Elevation profile (HeyWhatsThat-style) using Open-Elevation.
    let elevationProfile = null;
    try {
      const SAMPLES = 48;
      const locs = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const lat = fromQ.lat + (toLat - fromQ.lat) * t;
        const lon = fromQ.lon + (toLon - fromQ.lon) * t;
        locs.push(`${lat},${lon}`);
      }
      const url = `https://api.open-elevation.com/api/v1/lookup?locations=${encodeURIComponent(
        locs.join("|")
      )}`;
      const er = await fetch(url);
      if (er.ok) {
        const ej = await er.json();
        const results = Array.isArray(ej?.results) ? ej.results : [];
        if (results.length) {
          let maxElev = -Infinity;
          let minElev = Infinity;
          const samples = results.map((r, idx) => {
            const lat = r.latitude;
            const lon = r.longitude;
            const elevation = r.elevation;
            const distFromStartKm =
              idx === 0
                ? 0
                : distanceKm(results[0].latitude, results[0].longitude, lat, lon);
            if (Number.isFinite(elevation)) {
              maxElev = Math.max(maxElev, elevation);
              minElev = Math.min(minElev, elevation);
            }
            return { lat, lon, elevation, distKm: distFromStartKm };
          });
          elevationProfile = {
            samples,
            minElevation: Number.isFinite(minElev) ? minElev : null,
            maxElevation: Number.isFinite(maxElev) ? maxElev : null
          };
        }
      }
    } catch {
      elevationProfile = null;
    }

    let lineOfSightClear = true;
    let obstructedAtKm = null;
    if (elevationProfile && elevationProfile.samples && elevationProfile.samples.length >= 2) {
      const samples = elevationProfile.samples;
      const distTotal = samples[samples.length - 1].distKm || 1;
      const elevStart = samples[0].elevation;
      const elevEnd = samples[samples.length - 1].elevation;
      const marginM = 15;
      for (let i = 1; i < samples.length - 1; i++) {
        const s = samples[i];
        const d = s.distKm;
        const terrainH = Number(s.elevation);
        const losH = elevStart + (elevEnd - elevStart) * (d / distTotal) + marginM;
        if (Number.isFinite(terrainH) && terrainH > losH) {
          lineOfSightClear = false;
          if (obstructedAtKm == null) obstructedAtKm = Math.round(d * 10) / 10;
          break;
        }
      }
    }

    // VHF/UHF link budget when freq (MHz) is given: free-space path loss only valid within radio horizon.
    // Beyond ~50 km, Earth curvature blocks direct path; never show "OK" for long distances.
    const LOS_RANGE_KM = 50;
    let linkBudget = null;
    if (Number.isFinite(freqMHz) && freqMHz > 0 && distKm > 0) {
      const fsplDb = 20 * Math.log10(distKm) + 20 * Math.log10(freqMHz) + 32.44;
      const eirpDbm = 10 * Math.log10(powerWatts * 1000);
      const signalAtRepeaterDbm = eirpDbm - fsplDb;
      const sensitivityDbm = -120;
      const marginOkDb = 10;
      const marginMarginalDb = 3;
      let linkEstimate = "unlikely";
      if (distKm > LOS_RANGE_KM) {
        linkEstimate = "out_of_range";
      } else if (signalAtRepeaterDbm >= sensitivityDbm + marginOkDb) {
        linkEstimate = "ok";
      } else if (signalAtRepeaterDbm >= sensitivityDbm + marginMarginalDb) {
        linkEstimate = "marginal";
      }
      linkBudget = {
        freqMHz,
        powerW: powerWatts,
        pathLossDb: Math.round(fsplDb * 10) / 10,
        signalAtRepeaterDbm: Math.round(signalAtRepeaterDbm * 10) / 10,
        linkEstimate,
        sensitivityDbm,
        losRangeKm: LOS_RANGE_KM
      };
    }

    res.json({
      from: { lat: fromQ.lat, lon: fromQ.lon, locator: CONFIG.locator },
      to: { lat: toLat, lon: toLon, grid: toGrid || null },
      distanceKm: Math.round(distKm),
      foF2Mid: Math.round(foF2Mid * 10) / 10,
      mufPath: Math.round(mufPath * 10) / 10,
      sfi,
      kp: space.kp,
      bands,
      elevationProfile,
      lineOfSightClear,
      obstructedAtKm,
      linkBudget,
      predictionType: "full"
    });
  } catch (e) {
    res.status(500).json({ error: "path_forecast_failed", detail: String(e) });
  }
});

// --------------------
// DXCC / Prefix parsing via cty.dat (fallback: dxcc_centroids.json)
// --------------------
const CTY_PATH = path.join(DATA_DIR, "cty.dat");
const DXCC_CENTROIDS_PATH = path.join(DATA_DIR, "dxcc_centroids.json");
let PREFIX_INDEX = []; // [{prefix, name, lat, lon}]
let ENTITY_BY_NAME = new Map(); // normalised entity name -> { lat, lon }

function loadCtyDat() {
  const raw = fs.readFileSync(CTY_PATH, "utf8").split(/\r?\n/);

  const entries = [];
  let current = null;

  for (const line0 of raw) {
    const line = line0.trimEnd();
    if (!line) continue;

    // New country line begins: "Country Name: CQZ: ITUZ: Continent: Lat: Lon: ..."
    if (!line.startsWith(" ") && line.includes(":")) {
      const parts = line.split(":").map(s => s.trim());
      // parts[0]=name, parts[4]=lat, parts[5]=lon (cty.dat: longitude is West-positive, negate for East-positive)
      const name = parts[0];
      const lat = Number(parts[4]);
      const lon = -Number(parts[5]); // cty.dat: positive = West → standard: positive = East
      current = { name, lat, lon, prefixes: [] };
      entries.push(current);
      continue;
    }

    // Prefix lines: start with space(s), end with ";" and comma-separated prefixes
    if (current && line.startsWith(" ")) {
      const cleaned = line.replace(/;/g, "");
      const tokens = cleaned.split(",").map(s => s.trim()).filter(Boolean);
      for (let p of tokens) {
        // remove optional flags like (xxx) or =xxx or <xx> etc. -> keep base prefix part
        p = p.replace(/[()\[\]{}<>]/g, "");
        p = p.replace(/^=/, "");
        p = p.replace(/\/.*/, "");      // chop /P /MM variants
        p = p.replace(/\s+.*/, "");     // chop anything after space
        if (!p) continue;
        current.prefixes.push(p.toUpperCase());
      }
    }
  }

  // Build longest-prefix-first index
  const idx = [];
  const entityMap = new Map();
  function normaliseEntityName(s) {
    if (!s || typeof s !== "string") return "";
    return s
      .toLowerCase()
      .trim()
      .replace(/\s*&\s*/g, " and ")
      .replace(/\./g, "")
      .replace(/\s+/g, " ");
  }
  for (const e of entries) {
    for (const p of e.prefixes) {
      idx.push({ prefix: p, name: e.name, lat: e.lat, lon: e.lon });
    }
    const k = normaliseEntityName(e.name);
    if (k) entityMap.set(k, { lat: e.lat, lon: e.lon });
    const alt = k.replace(/\s+island$/i, " i").replace(/\s+is\.?$/i, " i");
    if (alt && alt !== k) entityMap.set(alt, { lat: e.lat, lon: e.lon });
  }
  idx.sort((a, b) => b.prefix.length - a.prefix.length);
  PREFIX_INDEX = idx;
  ENTITY_BY_NAME = entityMap;
  console.log(`CTY loaded: ${entries.length} entities, ${idx.length} prefixes`);
}

function loadDxccCentroidsFallback() {
  if (!fs.existsSync(DXCC_CENTROIDS_PATH)) return false;
  const data = JSON.parse(fs.readFileSync(DXCC_CENTROIDS_PATH, "utf8"));
  const idx = [];
  const entityMap = new Map();
  function normaliseEntityName(s) {
    if (!s || typeof s !== "string") return "";
    return s.toLowerCase().trim().replace(/\s*&\s*/g, " and ").replace(/\./g, "").replace(/\s+/g, " ");
  }
  for (const [prefix, v] of Object.entries(data)) {
    if (v && typeof v.name === "string" && Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lon))) {
      idx.push({ prefix: String(prefix).toUpperCase(), name: v.name, lat: Number(v.lat), lon: Number(v.lon) });
      const k = normaliseEntityName(v.name);
      if (k) entityMap.set(k, { lat: Number(v.lat), lon: Number(v.lon) });
    }
  }
  idx.sort((a, b) => b.prefix.length - a.prefix.length);
  PREFIX_INDEX = idx;
  ENTITY_BY_NAME = entityMap;
  console.log(`DXCC fallback loaded: ${idx.length} prefixes from dxcc_centroids.json`);
  return idx.length > 0;
}

try {
  if (fs.existsSync(CTY_PATH) && fs.readFileSync(CTY_PATH, "utf8").trim().length > 0) {
    loadCtyDat();
  } else {
    throw new Error("cty.dat missing or empty");
  }
} catch (e) {
  console.log("WARNING: cty.dat not loaded:", e.message);
  if (!loadDxccCentroidsFallback()) {
    PREFIX_INDEX = [];
  }
}

function callsignToDxcc(call) {
  if (!call) return null;
  const cs = String(call).toUpperCase();

  // handle portable: prefer part before / if it looks like a normal callsign
  const parts = cs.split("/");
  const base = parts[0] || cs;

  for (const item of PREFIX_INDEX) {
    if (base.startsWith(item.prefix)) return item;
  }
  return null;
}

function normaliseEntityNameForLookup(s) {
  if (!s || typeof s !== "string") return "";
  return s.toLowerCase().trim().replace(/\s*&\s*/g, " and ").replace(/\./g, "").replace(/\s+/g, " ");
}

function entityNameToCoord(entityName) {
  if (!entityName || !ENTITY_BY_NAME.size) return null;
  const k = normaliseEntityNameForLookup(entityName);
  let c = ENTITY_BY_NAME.get(k) || null;
  if (!c && /^\s*i\s*$/.test(k) === false) {
    const withIsland = k.replace(/\s+i\s*$/, " island").replace(/\s+is\.?\s*$/, " island");
    if (withIsland !== k) c = ENTITY_BY_NAME.get(withIsland) || null;
  }
  return c;
}

// --------------------
// Telnet line cleaning
// --------------------
function cleanLine(line) {
  let s = line.replace(/[^\x20-\x7E]/g, "");
  s = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  return s.trim();
}

// --------------------
// Spots store
// --------------------
const SPOT_MAX = 500;
let spots = []; // merged DXC + RBN
let status = {
  dxcluster: { connected: false, lastLine: null, lastConnect: null, error: null, host: null, port: null },
  rbn:      { connected: false, lastLine: null, lastConnect: null, error: null, host: null, port: null }
};

function enrichSpot(s) {
  // DXCC centroid for spotted station (DX)
  if (!Number.isFinite(Number(s.lat)) || !Number.isFinite(Number(s.lon))) {
    const d = callsignToDxcc(s.dx);
    if (d) {
      s.entity = d.name;
      s.lat = d.lat;
      s.lon = d.lon;
      s.dxccPrefix = d.prefix;
    }
  }

  // DXCC centroid for spotter (reporter) – for drawing connection lines on map
  if (s.spotter && (!Number.isFinite(Number(s.spotterLat)) || !Number.isFinite(Number(s.spotterLon)))) {
    const sp = callsignToDxcc(s.spotter);
    if (sp) {
      s.spotterLat = sp.lat;
      s.spotterLon = sp.lon;
      s.spotterEntity = sp.name;
    }
  }

  // QTH distance/bearing
  const q = locatorToLatLon(CONFIG.locator);
  if (q && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon))) {
    s.distKm = Math.round(distanceKm(q.lat, q.lon, Number(s.lat), Number(s.lon)));
    s.bearing = Math.round(bearingDeg(q.lat, q.lon, Number(s.lat), Number(s.lon)));
  }

  return s;
}

function addSpot(s) {
  s = enrichSpot(s);

  const key = `${s.src}|${s.dx}|${s.freq}|${s.mode}`;
  if (spots.slice(0, 30).some(x => `${x.src}|${x.dx}|${x.freq}|${x.mode}` === key)) return;

  spots.unshift(s);
  if (spots.length > SPOT_MAX) spots = spots.slice(0, SPOT_MAX);
}

// --------------------
// DX Cluster parse
// --------------------
function parseDxClusterLine(line) {
  const m = line.match(/^\s*DX\s+de\s+([A-Z0-9\/-]+)\s*:\s*([0-9.]+)\s+([A-Z0-9\/-]+)\s+(.*)$/i);
  if (!m) return null;

  const spotter = m[1].toUpperCase();
  const freq = m[2];
  const dx = m[3].toUpperCase();
  const rest = m[4].trim();

  let mode = "—";
  const u = rest.toUpperCase();
  if (u.includes("FT8")) mode = "FT8";
  else if (u.includes("FT4")) mode = "FT4";
  else if (u.includes("JT65")) mode = "JT65";
  else if (u.includes("JT9")) mode = "JT9";
  else if (u.includes("JS8")) mode = "JS8";
  else if (u.includes("PSK")) mode = "PSK";
  else if (u.includes("RTTY")) mode = "RTTY";
  else if (u.includes("CW")) mode = "CW";
  else if (u.includes("SSB") || u.includes("USB") || u.includes("LSB")) mode = "SSB";
  else if (u.includes("AM")) mode = "AM";
  else if (u.includes("FM")) mode = "FM";
  else if (u.includes("SSTV")) mode = "SSTV";

  const zMatch = rest.match(/\b(\d{3,4})Z\b/i);
  const ztime = zMatch ? zMatch[1] : null;

  return {
    t: new Date().toISOString(),
    ztime,
    spotter,
    dx,
    freq,
    mode,
    note: rest,
    src: "dxcluster"
  };
}

function startDxCluster({ host, port, loginCallsign }) {
  if (!host || !port || !loginCallsign) {
    status.dxcluster.error = "Not configured (DXCLUSTER_HOST/PORT/CALLSIGN).";
    return;
  }
  status.dxcluster.host = host;
  status.dxcluster.port = port;

  const sock = new net.Socket();
  let buffer = "";

  function connect() {
    status.dxcluster.connected = false;
    status.dxcluster.error = null;
    status.dxcluster.lastConnect = new Date().toISOString();

    sock.connect(port, host, () => {
      status.dxcluster.connected = true;
      sock.write(`${loginCallsign}\n`);
    });
  }

  sock.on("data", (data) => {
    buffer += data.toString("utf8");
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const raw = buffer.slice(0, idx).replace(/\r/g, "");
      buffer = buffer.slice(idx + 1);

      const line = cleanLine(raw);
      if (!line) continue;

      status.dxcluster.lastLine = line;
      const s = parseDxClusterLine(line);
      if (s) addSpot(s);
    }
  });

  sock.on("error", (err) => {
    status.dxcluster.connected = false;
    status.dxcluster.error = String(err);
  });

  sock.on("close", () => {
    status.dxcluster.connected = false;
    setTimeout(() => { try { connect(); } catch {} }, 5000);
  });

  connect();
}

// --------------------
// RBN parse
// --------------------
function parseRbnLine(line) {
  const m = line.match(/^\s*DX\s+de\s+([A-Z0-9\/-]+)\s*:\s*([0-9.]+)\s+([A-Z0-9\/-]+)\s+(.+)$/i);
  if (!m) return null;

  const spotter = m[1].toUpperCase();
  const freq = m[2];
  const dx = m[3].toUpperCase();
  const rest = m[4].trim();

  let mode = "CW";
  if (rest.toUpperCase().includes("RTTY")) mode = "RTTY";

  const zMatch = rest.match(/\b(\d{3,4})Z\b/i);
  const ztime = zMatch ? zMatch[1] : null;

  return {
    t: new Date().toISOString(),
    ztime,
    spotter,
    dx,
    freq,
    mode,
    note: rest,
    src: "rbn"
  };
}

function startRbn({ host, port, loginCallsign }) {
  if (!host || !port || !loginCallsign) {
    status.rbn.error = "Not configured (RBN_HOST/PORT/CALLSIGN).";
    return;
  }
  status.rbn.host = host;
  status.rbn.port = port;

  const sock = new net.Socket();
  let buffer = "";

  function connect() {
    status.rbn.connected = false;
    status.rbn.error = null;
    status.rbn.lastConnect = new Date().toISOString();

    sock.connect(port, host, () => {
      status.rbn.connected = true;
      sock.write(`${loginCallsign}\n`);
    });
  }

  sock.on("data", (data) => {
    buffer += data.toString("utf8");
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const raw = buffer.slice(0, idx).replace(/\r/g, "");
      buffer = buffer.slice(idx + 1);

      const line = cleanLine(raw);
      if (!line) continue;

      status.rbn.lastLine = line;
      const s = parseRbnLine(line);
      if (s) addSpot(s);
    }
  });

  sock.on("error", (err) => {
    status.rbn.connected = false;
    status.rbn.error = String(err);
  });

  sock.on("close", () => {
    status.rbn.connected = false;
    setTimeout(() => { try { connect(); } catch {} }, 5000);
  });

  connect();
}

// Start feeds from ENV
startDxCluster({
  host: process.env.DXCLUSTER_HOST,
  port: Number(process.env.DXCLUSTER_PORT || 0),
  loginCallsign: process.env.DXCLUSTER_CALLSIGN || CONFIG.callsign
});

startRbn({
  host: process.env.RBN_HOST,
  port: Number(process.env.RBN_PORT || 0),
  loginCallsign: process.env.RBN_CALLSIGN || CONFIG.callsign
});

// --------------------
// Spots endpoint (filters)
// /api/spots?band=10&mode=CW&src=rbn&limit=80&spottedMe=1
// --------------------
function baseCallsign(call) {
  if (!call || typeof call !== "string") return "";
  return call.trim().toUpperCase().split("/")[0];
}

app.get("/api/spots", (req, res) => {
  const { band, mode, src, limit, spottedMe } = req.query;

  // Ensure all spots have spotter lat/lon for map connection lines (idempotent)
  spots.forEach((s) => enrichSpot(s));

  let out = spots;

  if (spottedMe === "1" || spottedMe === "true") {
    const myBase = baseCallsign(CONFIG.callsign);
    if (myBase) out = out.filter((x) => baseCallsign(x.dx) === myBase);
  }

  if (src) {
    const s = String(src).toLowerCase();
    out = out.filter(x => (x.src || "").toLowerCase() === s);
  }

  if (mode) {
    const m = String(mode).toUpperCase();
    out = out.filter(x => (x.mode || "").toUpperCase() === m);
  }

  if (band) {
    const b = String(band);
    out = out.filter((x) => {
      const f = Number(x.freq);
      if (!Number.isFinite(f)) return false;
      if (b === "10") return f >= 28.0 && f < 29.7;
      if (b === "12") return f >= 24.89 && f < 24.99;
      if (b === "15") return f >= 21.0 && f < 21.45;
      if (b === "17") return f >= 18.068 && f < 18.168;
      if (b === "20") return f >= 14.0 && f < 14.35;
      if (b === "30") return f >= 10.1 && f < 10.15;
      if (b === "40") return f >= 7.0 && f < 7.2;
      return true;
    });
  }

  const lim = Math.max(1, Math.min(Number(limit || 80), 300));
  out = out.slice(0, lim);

  res.json({
    updated: new Date().toISOString(),
    status,
    qth: locatorToLatLon(CONFIG.locator),
    spots: out
  });
});

// --------------------
// Space Weather (extended)
// --------------------
app.get("/api/space/summary", async (req, res) => {
  try {
    const data = await cached("space_summary_ext", 60_000, async () => {
      const out = {
        updated: new Date().toISOString(),
        kp: null,
        kpRecent: [],
        aIndex: null,
        aRecent: [],
        solarFlux: null,
        xray: null,
        solarWind: null, // speed, density, bz (if available)
        alerts: {},
        bandConditions: {}
      };

      try {
        const kpResp = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json");
        const kpJson = await kpResp.json();
        const recent = kpJson.slice(-8).map(([time, val]) => ({ time, kp: Number(val) }));
        out.kpRecent = recent;
        const last = recent[recent.length - 1];
        out.kp = last;
      } catch {}

      try {
        const aResp = await fetch("https://services.swpc.noaa.gov/products/planetary-a-index.json");
        const aJson = await aResp.json();
        const recent = aJson.slice(-8).map(([time, val]) => ({ time, a: Number(val) }));
        out.aRecent = recent;
        const last = recent[recent.length - 1];
        out.aIndex = last;
      } catch {}

      try {
        const sfResp = await fetch("https://services.swpc.noaa.gov/json/f107_cm_flux.json");
        const sfJson = await sfResp.json();
        const last = sfJson[sfJson.length - 1];
        out.solarFlux = { time: last.time_tag, sfi: Number(last.flux) };
      } catch {}

      try {
        const xrResp = await fetch("https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json");
        const xrJson = await xrResp.json();
        const last = xrJson[xrJson.length - 1];
        out.xray = { time: last.time_tag, short: last.flux, long: last.flux_long };
      } catch {}

      // Solar wind (DSCOVR) – try to assemble a minimal set
      try {
        const plasma = await (await fetch("https://services.swpc.noaa.gov/products/solar-wind/plasma-1-hour.json")).json();
        const mag = await (await fetch("https://services.swpc.noaa.gov/products/solar-wind/mag-1-hour.json")).json();
        const pLast = plasma[plasma.length - 1];
        const mLast = mag[mag.length - 1];
        out.solarWind = {
          time: pLast[0],
          speed: Number(pLast[2]),
          density: Number(pLast[1]),
          bz: Number(mLast[6])
        };
      } catch {}

      // Derive simple alerts
      try {
        const alerts = {};
        const kpVal = out?.kp?.kp;
        const aVal = out?.aIndex?.a;
        const xVal = out?.xray?.short;
        const sw = out?.solarWind;

        if (typeof kpVal === "number" && kpVal >= 5) alerts.geomagnetic = `Geomagnetic storm (Kp ${kpVal})`;
        else if (typeof kpVal === "number" && kpVal >= 4) alerts.geomagnetic = `Active geomagnetic conditions (Kp ${kpVal})`;

        if (typeof aVal === "number" && aVal >= 50) alerts.geomagnetic = alerts.geomagnetic || `Disturbed geomagnetic field (A ${aVal})`;

        if (typeof xVal === "number") {
          if (xVal >= 1e-4) alerts.radioBlackout = "Severe radio blackout risk (X class)";
          else if (xVal >= 1e-5) alerts.radioBlackout = "Moderate radio blackout risk (M class)";
        }

        if (sw) {
          if (typeof sw.bz === "number" && sw.bz <= -10) alerts.solarWind = `Strong southward Bz (${sw.bz} nT)`;
          else if (typeof sw.speed === "number" && sw.speed >= 700) alerts.solarWind = `High solar wind speed (${sw.speed} km/s)`;
        }

        out.alerts = alerts;
      } catch {}

      // Simple band readiness heuristic (HF focus)
      try {
        const bands = ["10", "15", "20", "40"];
        const kpVal = out?.kp?.kp;
        const sfiVal = out?.solarFlux?.sfi;

        function statusForBand(band) {
          // Defaults
          let status = "fair";
          let reason = "Normal conditions";

          if (typeof kpVal === "number") {
            if (kpVal >= 6) {
              status = "poor";
              reason = "Geomagnetic storm (Kp high)";
            } else if (kpVal >= 4 && status !== "poor") {
              status = "fair";
              reason = "Geomagnetic active";
            }
          }

          if (typeof sfiVal === "number") {
            if (sfiVal >= 150 && kpVal < 5) {
              if (band === "10" || band === "15") {
                status = "good";
                reason = "High SFI favors upper HF";
              }
            } else if (sfiVal < 90) {
              if (band === "10" || band === "15") {
                status = "poor";
                reason = "Low SFI hurts upper HF";
              }
            }
          }

          if (band === "40" && typeof kpVal === "number" && kpVal <= 3) {
            status = status === "poor" ? "poor" : "good";
            reason = status === "poor" ? reason : "Lower HF resilient; Kp quiet";
          }

          return { status, reason };
        }

        out.bandConditions = Object.fromEntries(bands.map((b) => [b, statusForBand(b)]));
      } catch {}

      return out;
    });

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "space_summary_failed", detail: String(e) });
  }
});

// --------------------
// Alerts (space weather) – light endpoint for banner
// --------------------
app.get("/api/alerts", async (req, res) => {
  try {
    const data = await cached("alerts_only", 60_000, async () => {
      const out = { alerts: {} };
      try {
        const kpResp = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json");
        const kpJson = await kpResp.json();
        const last = kpJson.slice(-1)[0];
        const kpVal = last && Number(last[1]);
        if (typeof kpVal === "number" && kpVal >= 5) out.alerts.geomagnetic = `Geomagnetic storm (Kp ${kpVal})`;
        else if (typeof kpVal === "number" && kpVal >= 4) out.alerts.geomagnetic = `Active geomagnetic (Kp ${kpVal})`;
      } catch {}
      try {
        const aResp = await fetch("https://services.swpc.noaa.gov/products/planetary-a-index.json");
        const aJson = await aResp.json();
        const last = aJson.slice(-1)[0];
        const aVal = last && Number(last[1]);
        if (typeof aVal === "number" && aVal >= 50) out.alerts.geomagnetic = out.alerts.geomagnetic || `Disturbed (A ${aVal})`;
      } catch {}
      try {
        const xrResp = await fetch("https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json");
        const xrJson = await xrResp.json();
        const last = xrJson[xrJson.length - 1];
        const xVal = last && last.flux;
        if (typeof xVal === "number" && xVal >= 1e-4) out.alerts.radioBlackout = "Severe radio blackout risk (X class)";
        else if (typeof xVal === "number" && xVal >= 1e-5) out.alerts.radioBlackout = "Moderate radio blackout risk (M class)";
      } catch {}
      try {
        const mag = await (await fetch("https://services.swpc.noaa.gov/products/solar-wind/mag-1-hour.json")).json();
        const mLast = mag[mag.length - 1];
        const bz = mLast && Number(mLast[6]);
        if (typeof bz === "number" && bz <= -10) out.alerts.solarWind = `Strong southward Bz (${bz} nT)`;
      } catch {}
      return out;
    });
    const list = Object.entries(data.alerts || {}).map(([type, message]) => ({ type, message }));
    res.json({ alerts: list, updated: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: "alerts_failed", detail: String(e) });
  }
});

// --------------------
// News banner (RSS) – Ham Clock style, from accessible feed (ARRL)
// --------------------
const NEWS_RSS_URL = process.env.NEWS_RSS_URL || "https://www.darc.de/rss.xml";
app.get("/api/news", async (req, res) => {
  try {
    const items = await cached("news_rss", 15 * 60_000, async () => {
      const r = await fetch(NEWS_RSS_URL, { headers: { "User-Agent": "HamshackDashboard/1.0" } });
      const xml = await r.text();
      const parsed = xmlParser.parse(xml);
      const out = [];
      try {
        const channel = parsed?.rss?.channel || parsed?.feed;
        let list = channel?.item ?? channel?.items?.item ?? channel?.entry;
        if (!Array.isArray(list)) list = list != null ? [list] : [];
        for (const it of list) {
          const title = (it?.title && (typeof it.title === "string" ? it.title : it.title["#text"])) || "";
          let link = (it?.link && (typeof it.link === "string" ? it.link : it.link["#text"] || it.link["@_href"])) || "";
          if (!link && it?.link?.["@_href"]) link = it.link["@_href"];
          const pubDate = (it?.pubDate && (typeof it.pubDate === "string" ? it.pubDate : it.pubDate["#text"])) || (it?.updated && (typeof it.updated === "string" ? it.updated : it.updated["#text"])) || "";
          if (title) out.push({ title: title.trim(), link: String(link).trim() || null, pubDate: String(pubDate).trim() || null });
        }
      } catch {}
      return out.slice(0, 25);
    });
    res.json({ items, updated: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: "news_failed", detail: String(e) });
  }
});

// --------------------
// DXpeditions – NG3K ADXO (OpenHamClock-style) or configurable JSON URL
// --------------------
const DXPEDITION_URL = process.env.DXPEDITION_URL || "";
const NG3K_ADXO_URL = "https://www.ng3k.com/Misc/adxoplain.html";
const DXPEDITION_CACHE_MS = 30 * 60_000;

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function defaultDxpeditionList() {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  return [
    { callsign: "J38WG", entity: "Grenada", startDate: iso, endDate: iso, status: "active", url: null },
    { callsign: "TY5GG", entity: "Benin", startDate: iso, endDate: iso, status: "active", url: null }
  ];
}

/** Parse "Jan 1-Feb 16, 2026" or "Feb 1-27, 2026" -> { startDate, endDate } */
function parseAdxoDateRange(line) {
  const match = line.match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})|-(\d{1,2}))?,?\s*(\d{4})/i
  );
  if (!match) return { startDate: null, endDate: null };
  const [, m1, d1, m2, d2, d2Same, year] = match;
  const monthIndex = (m) => MONTH_NAMES.indexOf(String(m).toLowerCase().slice(0, 3));
  const pad = (n) => String(Number(n)).padStart(2, "0");
  const y = year;
  const startDate = `${y}-${pad(monthIndex(m1) + 1)}-${pad(d1)}`;
  let endDate = startDate;
  if (m2 && d2) {
    endDate = `${y}-${pad(monthIndex(m2) + 1)}-${pad(d2)}`;
  } else if (d2Same) {
    endDate = `${y}-${pad(monthIndex(m1) + 1)}-${pad(d2Same)}`;
  }
  return { startDate, endDate };
}

/** Parse NG3K adxoplain.html text: extract DXCC, Callsign (bold = active), dates, optional URL from [text](url). */
function parseNg3kAdxoHtml(html) {
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text
    .replace(/<b\b[^>]*>([^<]*)<\/b>/gi, "**$1**")
    .replace(/<strong\b[^>]*>([^<]*)<\/strong>/gi, "**$1**");
  // Preserve line structure: block tags -> newline (raw HTML often has no \n)
  text = text.replace(/<\/?(?:p|div|tr|br|li|td|th|h[1-6])[^>]*>/gi, "\n");
  text = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")  // collapse spaces/tabs only, keep newlines
    .trim();
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  let current = null;
  const flush = () => {
    if (current && current.callsign) out.push(current);
    current = null;
  };
  const dateRangeRe = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (dateRangeRe.test(line)) {
      flush();
      const { startDate, endDate } = parseAdxoDateRange(line);
      current = { startDate, endDate, entity: null, callsign: null, status: "upcoming", url: null };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("DXCC:")) {
      current.entity = line.replace(/^DXCC:\s*/i, "").trim();
      continue;
    }
    if (line.toLowerCase().startsWith("callsign:")) {
      const rest = line.replace(/^Callsign:\s*/i, "").trim();
      const active = rest.includes("**");
      let call = rest.replace(/\*\*/g, "").trim();
      const linkMatch = call.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        call = linkMatch[1].trim();
        current.url = linkMatch[2].trim();
      }
      call = call.replace(/\!\[[^\]]*\]/g, "").trim();
      if (call) {
        current.callsign = call;
        current.status = active ? "active" : "upcoming";
      }
      continue;
    }
  }
  flush();
  // Fallback: if no lines matched (e.g. raw HTML one long line), split by date pattern
  if (out.length === 0 && text.length > 200) {
    const parts = text.split(/(?=(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}|\d{1,2})?,?\s*\d{4})/i);
    for (let i = 1; i < parts.length; i += 2) {
      const dateLine = parts[i] || "";
      const block = (parts[i + 1] || "").slice(0, 800);
      const { startDate, endDate } = parseAdxoDateRange(dateLine.trim());
      const dxccMatch = block.match(/DXCC:\s*([^CallsignQSL\n]+?)(?=\s*Callsign:|\s*QSL:|\s*Source:|$)/i);
      const entity = dxccMatch ? dxccMatch[1].trim() : null;
      const callMatch = block.match(/Callsign:\s*\*\*\[([^\]]+)\]\(([^)]+)\)\*\*|Callsign:\s*\*\*([^*\n\!]+)|Callsign:\s*\[([^\]]+)\]\(([^)]+)\)|Callsign:\s*([^*\n\!]+)/i);
      let callsign = null;
      let url = null;
      let active = false;
      if (callMatch) {
        if (callMatch[1]) {
          callsign = callMatch[1].trim();
          url = (callMatch[2] || "").trim();
          active = true;
        } else if (callMatch[3]) {
          callsign = callMatch[3].replace(/\!\[[^\]]*\]/g, "").trim();
          active = true;
        } else if (callMatch[4]) {
          callsign = callMatch[4].trim();
          url = (callMatch[5] || "").trim();
        } else {
          callsign = (callMatch[6] || "").replace(/\!\[[^\]]*\]/g, "").trim();
        }
      }
      if (callsign && entity) {
        out.push({ startDate, endDate, entity, callsign, status: active ? "active" : "upcoming", url: url || null });
      }
    }
  }
  return out.slice(0, 80);
}

async function fetchNg3kDxpeditions() {
  const r = await fetch(NG3K_ADXO_URL, { headers: { "User-Agent": "HamshackDashboard/1.0" } });
  if (!r.ok) throw new Error(`NG3K HTTP ${r.status}`);
  const html = await r.text();
  return parseNg3kAdxoHtml(html);
}

app.get("/api/dxpeditions", async (req, res) => {
  try {
    const items = await cached("dxpeditions", DXPEDITION_CACHE_MS, async () => {
      if (DXPEDITION_URL) {
        const r = await fetch(DXPEDITION_URL, { headers: { "User-Agent": "HamshackDashboard/1.0" } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        const trimmed = text.trim();
        if (trimmed.charAt(0) === "<" || trimmed.toLowerCase().startsWith("<!doctype")) {
          // Parse this HTML as NG3K ADXO (e.g. DXPEDITION_URL set to adxoplain.html)
          try {
            return parseNg3kAdxoHtml(text);
          } catch (parseErr) {
            console.warn("DXpeditions: HTML parse failed, trying NG3K fetch.", parseErr?.message);
            return fetchNg3kDxpeditions().catch(() => defaultDxpeditionList());
          }
        }
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          console.warn("DXpeditions: Invalid JSON from URL, falling back to NG3K ADXO.");
          return fetchNg3kDxpeditions().catch(() => defaultDxpeditionList());
        }
        const list = Array.isArray(data) ? data : (data?.items ?? data?.dxpeditions ?? []);
        return list.slice(0, 50).map((x) => ({
          callsign: x.callsign || x.call || "",
          entity: x.entity || x.country || x.dxcc || "",
          startDate: x.startDate || x.start || x.from || null,
          endDate: x.endDate || x.end || x.to || null,
          status: (x.status || "").toLowerCase() === "active" ? "active" : "upcoming",
          url: x.url || x.link || null
        })).filter((x) => x.callsign);
      }
      return fetchNg3kDxpeditions().catch((err) => {
        console.warn("DXpeditions: NG3K fetch failed:", err?.message || err);
        return defaultDxpeditionList();
      });
    });
    const enriched = items.map((x) => {
      const c = entityNameToCoord(x.entity);
      return { ...x, lat: c?.lat ?? null, lon: c?.lon ?? null };
    });
    res.json({ items: enriched, updated: new Date().toISOString() });
  } catch (e) {
    try {
      const fallback = defaultDxpeditionList().map((x) => {
        const c = entityNameToCoord(x.entity);
        return { ...x, lat: c?.lat ?? null, lon: c?.lon ?? null };
      });
      res.json({ items: fallback, updated: new Date().toISOString() });
    } catch {
      res.status(500).json({ error: "dxpeditions_failed", detail: String(e) });
    }
  }
});

// --------------------
// Satellites: CelesTrak amateur group TLE, list + positions (OpenHamClock-style)
// --------------------
const AMATEUR_TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle";
const DEFAULT_SAT_IDS = "ISS,AO-7,AO-27,SO-50,AO-73,FO-29,AO-85,AO-91,AO-92,AO-95,JO-97,IO-117,ES'HAIL 2";

function parseSatId(name) {
  const m = name.match(/\s*\(([^)]+)\)\s*$/);
  const inParen = m ? m[1].trim() : null;
  if (inParen && inParen === "ZARYA") return "ISS";
  if (inParen) return inParen;
  return name.trim().replace(/\s+/g, " ");
}

async function getAmateurTleList() {
  return cached("amateur_tle_list", 6 * 60_000, async () => {
    const txt = await (await fetch(AMATEUR_TLE_URL)).text();
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const out = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const name = lines[i].trim();
      const line1 = lines[i + 1].trim();
      const line2 = lines[i + 2].trim();
      if (line1.startsWith("1 ") && line2.startsWith("2 ")) {
        out.push({ id: parseSatId(name), name, line1, line2 });
      }
    }
    return out;
  });
}

app.get("/api/sat/list", async (req, res) => {
  try {
    const list = await getAmateurTleList();
    res.json({
      items: list.map(({ id, name }) => ({ id, name })),
      updated: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: "sat_list_failed", detail: String(e) });
  }
});

function propagateOne(entry, when) {
  try {
    const satrec = sat.twoline2satrec(entry.line1, entry.line2);
    const pv = sat.propagate(satrec, when);
    if (!pv.position) return null;
    const gmst = sat.gstime(when);
    const geo = sat.eciToGeodetic(pv.position, gmst);
    return {
      lat: sat.degreesLat(geo.latitude),
      lon: sat.degreesLong(geo.longitude),
      altKm: geo.height
    };
  } catch {
    return null;
  }
}

app.get("/api/sat/positions", async (req, res) => {
  try {
    const list = await getAmateurTleList();
    const rawIds = (req.query.ids || DEFAULT_SAT_IDS).toString().split(",").map(s => s.trim()).filter(Boolean);
    const wantSet = new Set(rawIds);
    const now = new Date();
    const positions = [];
    for (const entry of list) {
      if (!wantSet.has(entry.id)) continue;
      const pos = propagateOne(entry, now);
      if (pos) positions.push({ id: entry.id, name: entry.name, ...pos });
    }
    res.json({ updated: now.toISOString(), positions });
  } catch (e) {
    res.status(500).json({ error: "sat_positions_failed", detail: String(e) });
  }
});

const EARTH_RADIUS_KM = 6371;
function footprintRadiusKm(altKm) {
  if (!Number.isFinite(altKm) || altKm < 0) return 2000;
  const theta = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm));
  return EARTH_RADIUS_KM * theta;
}

function elevationDegrees(obsLat, obsLon, satLat, satLon, altKm) {
  const R = EARTH_RADIUS_KM;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const latO = toRad(obsLat);
  const lonO = toRad(obsLon);
  const latS = toRad(satLat);
  const lonS = toRad(satLon);
  const cosTheta = Math.sin(latO) * Math.sin(latS) + Math.cos(latO) * Math.cos(latS) * Math.cos(lonO - lonS);
  const theta = Math.acos(Math.max(-1, Math.min(1, cosTheta)));
  const r = Math.sqrt(R * R + (R + altKm) * (R + altKm) - 2 * R * (R + altKm) * Math.cos(theta));
  if (r < 1e-6) return 90;
  const sinEl = ((R + altKm) * Math.cos(theta) - R) / r;
  const elRad = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  return (elRad * 180) / Math.PI;
}

app.get("/api/sat/passes", async (req, res) => {
  try {
    const ids = (req.query.ids || req.query.id || "ISS").toString().trim().split(",").map(s => s.trim()).filter(Boolean);
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const obsLat = Number.isFinite(lat) ? lat : (() => { const q = getQth(); return q ? q.lat : 50; })();
    const obsLon = Number.isFinite(lon) ? lon : (() => { const q = getQth(); return q ? q.lon : 8; })();
    const hours = Math.min(72, Math.max(1, parseInt(req.query.hours, 10) || 24));
    const stepMin = 1;
    const list = await getAmateurTleList();
    const wantSet = new Set(ids);
    const passesBySat = [];
    for (const entry of list) {
      if (!wantSet.has(entry.id)) continue;
      const passes = [];
      const start = new Date();
      let prevEl = null;
      let inPass = false;
      let passStart = null;
      let maxEl = -90;
      let maxElTime = null;
      for (let i = 0; i <= hours * 60; i += stepMin) {
        const when = new Date(start.getTime() + i * 60 * 1000);
        const pos = propagateOne(entry, when);
        if (!pos) continue;
        const el = elevationDegrees(obsLat, obsLon, pos.lat, pos.lon, pos.altKm);
        if (prevEl !== null) {
          if (prevEl < 0 && el >= 0) {
            inPass = true;
            passStart = new Date(when.getTime() - (stepMin * 60 * 1000 * (el / (el - prevEl))));
            maxEl = el;
            maxElTime = when;
          } else if (prevEl >= 0 && el < 0 && inPass) {
            inPass = false;
            const losTime = new Date(when.getTime() - (stepMin * 60 * 1000 * (el / (el - prevEl))));
            passes.push({
              aos: passStart.toISOString(),
              los: losTime.toISOString(),
              maxEl: Math.round(maxEl * 10) / 10,
              maxElAt: maxElTime.toISOString(),
              durationMin: Math.round((losTime - passStart) / 60000)
            });
            passStart = null;
            maxEl = -90;
            maxElTime = null;
          } else if (inPass && el > maxEl) {
            maxEl = el;
            maxElTime = when;
          }
        }
        prevEl = el;
      }
      if (passes.length) passesBySat.push({ id: entry.id, name: entry.name, passes });
    }
    res.json({ observer: { lat: obsLat, lon: obsLon }, hours, passes: passesBySat, updated: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: "sat_passes_failed", detail: String(e) });
  }
});

app.get("/api/sat/track", async (req, res) => {
  try {
    const id = (req.query.id || req.query.ids || "ISS").toString().trim().split(",")[0];
    const minutes = Math.min(120, Math.max(5, parseInt(req.query.minutes, 10) || 90));
    const list = await getAmateurTleList();
    const entry = list.find(e => e.id === id);
    if (!entry) return res.status(404).json({ error: "sat_not_found", id });

    const now = new Date();
    const positions = [];
    for (let i = 0; i <= minutes; i++) {
      const when = new Date(now.getTime() + i * 60 * 1000);
      const pos = propagateOne(entry, when);
      if (pos) positions.push({ lat: pos.lat, lon: pos.lon, altKm: pos.altKm, t: when.toISOString() });
    }
    const first = positions[0];
    const footprintRadiusKmVal = first ? footprintRadiusKm(first.altKm) : 2000;

    res.json({
      id: entry.id,
      name: entry.name,
      footprintRadiusKm: Math.round(footprintRadiusKmVal * 10) / 10,
      positions
    });
  } catch (e) {
    res.status(500).json({ error: "sat_track_failed", detail: String(e) });
  }
});

// ISS current position (kept for backward compatibility; same data via /api/sat/positions?ids=ISS)
async function getIssTle() {
  return cached("iss_tle", 6 * 60_000, async () => {
    const list = await getAmateurTleList();
    const iss = list.find(e => e.id === "ISS");
    if (!iss) throw new Error("ISS TLE not found");
    return { name: iss.name, line1: iss.line1, line2: iss.line2 };
  });
}

app.get("/api/sat/iss", async (req, res) => {
  try {
    const tle = await getIssTle();
    const satrec = sat.twoline2satrec(tle.line1, tle.line2);
    const now = new Date();
    const pv = sat.propagate(satrec, now);
    if (!pv.position) return res.status(500).json({ error: "propagate_failed" });

    const gmst = sat.gstime(now);
    const geo = sat.eciToGeodetic(pv.position, gmst);
    const lat = sat.degreesLat(geo.latitude);
    const lon = sat.degreesLong(geo.longitude);
    const altKm = geo.height;

    res.json({ updated: now.toISOString(), name: tle.name, lat, lon, altKm });
  } catch (e) {
    res.status(500).json({ error: "iss_failed", detail: String(e) });
  }
});

// --------------------
// Weather at PWS location (Open-Meteo for station coordinates)
// WU API was discontinued; we use lat/lon for your PWS (e.g. IKELKH27 Rossertblick)
// --------------------
const PWS_STATIONS = {
  IKELKH27: { lat: 50.15, lon: 8.43, name: "Rossertblick", location: "Kelkheim, DE" }
};

app.get("/api/weather/current", async (req, res) => {
  try {
    const stationId = (req.query.station || CONFIG.pwsStationId || process.env.PWS_STATION_ID || "IKELKH27").toUpperCase();
    let lat = Number(req.query.lat) || Number(process.env.PWS_LAT);
    let lon = Number(req.query.lon) || Number(process.env.PWS_LON);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const known = PWS_STATIONS[stationId];
      if (known) {
        lat = known.lat;
        lon = known.lon;
      } else {
        const q = locatorToLatLon(CONFIG.locator);
        if (!q) return res.status(400).json({ error: "No station coords and invalid locator" });
        lat = q.lat;
        lon = q.lon;
      }
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m&timezone=auto`;
    const data = await cached(`weather_${stationId}_${lat}_${lon}`, 60_000, async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
      return r.json();
    });
    const cur = data.current || {};
    const meta = PWS_STATIONS[stationId] || { name: stationId, location: "" };
    res.json({
      stationId,
      name: meta.name,
      location: meta.location,
      lat,
      lon,
      updated: new Date().toISOString(),
      temperature: cur.temperature_2m,
      feelsLike: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      pressure: cur.surface_pressure,
      precipitation: cur.precipitation,
      windSpeed: cur.wind_speed_10m,
      windDirection: cur.wind_direction_10m,
      weatherCode: cur.weather_code,
      source: "Open-Meteo",
      dashboardUrl: `https://www.wunderground.com/dashboard/pws/${stationId}`
    });
  } catch (e) {
    res.status(500).json({ error: "weather_failed", detail: String(e) });
  }
});

// --------------------
// PSK Reporter (reception reports for your callsign)
// https://pskreporter.info/pskdev - query: senderCallsign = where your signal was heard
// --------------------
const xmlParser = new XMLParser({ ignoreAttributes: false });

function parsePskReceptionReports(parsed) {
  const getVal = (v) => {
    if (v == null) return null;
    if (typeof v === "string" || typeof v === "number") return v;
    if (typeof v === "object" && v["#text"] != null) return v["#text"];
    try { return String(v); } catch { return null; }
  };
  const out = [];
  try {
    const root = parsed?.receptionReports || parsed?.receptionReport || parsed || {};
    let list = root?.receptionReport ?? root?.receptionReports?.receptionReport;
    if (!Array.isArray(list)) list = list != null ? [list] : [];
    for (const rec of list) {
      if (!rec || typeof rec !== "object") continue;
      try {
        out.push({
          senderCallsign: getVal(rec.senderCallsign) || null,
          receiverCallsign: getVal(rec.receiverCallsign) || null,
          receiverLocator: getVal(rec.receiverLocator) || null,
          senderLocator: getVal(rec.senderLocator) || null,
          frequency: rec.frequency != null ? Number(rec.frequency) : null,
          flowStartSeconds: rec.flowStartSeconds != null ? Number(rec.flowStartSeconds) : null,
          mode: getVal(rec.mode) || null,
          sNR: rec.sNR != null ? Number(rec.sNR) : null,
          band: getVal(rec.band) || null
        });
      } catch { /* skip malformed record */ }
    }
  } catch { /* return empty on structure error */ }
  return out;
}

app.get("/api/pskreporter", async (req, res) => {
  let callsign;
  try {
    callsign = (req.query.callsign || CONFIG?.callsign || "").trim().toUpperCase();
  } catch (e) {
    return res.status(500).json({ error: "pskreporter_failed", detail: "Config not available" });
  }
  if (!callsign) return res.status(400).json({ error: "callsign required" });

  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const flowStartSeconds = Math.max(-86400, Number(req.query.hours) ? -Math.abs(Number(req.query.hours)) * 3600 : -7200);
  const filter = (req.query.filter || "both").toLowerCase();
  const wantSent = filter === "sent" || filter === "both";
  const wantReceived = filter === "received" || filter === "both";

  async function fetchQuery(param, value) {
    const url = `https://retrieve.pskreporter.info/query?${param}=${encodeURIComponent(value)}&rptlimit=${limit}&flowStartSeconds=${flowStartSeconds}`;
    const r = await fetch(url, { headers: { "Accept": "application/xml" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Upstream returned ${r.status}`);
    const text = await r.text();
    if (!text || !text.trim()) throw new Error("Empty response from PSK Reporter");
    const contentType = (r.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("xml") && text.trimStart().startsWith("<")) {
      // likely XML anyway
    } else if (!contentType.includes("xml") && !text.trimStart().startsWith("<")) {
      throw new Error("PSK Reporter returned non-XML response");
    }
    try {
      return xmlParser.parse(text);
    } catch (parseErr) {
      throw new Error("Invalid XML from PSK Reporter");
    }
  }

  try {
    const cacheKey = `pskreporter_${callsign}_${filter}_${flowStartSeconds}`;
    const merged = await cached(cacheKey, 120_000, async () => {
      const receptionReports = [];
      let upstreamFailed = false;
      if (wantSent) {
        try {
          const data = await fetchQuery("senderCallsign", callsign);
          const list = parsePskReceptionReports(data);
          list.forEach((r) => { r.direction = "heard_you"; receptionReports.push(r); });
        } catch (e) {
          console.warn("PSK Reporter senderCallsign query failed:", e?.message || e);
          upstreamFailed = true;
        }
      }
      if (wantReceived) {
        try {
          const data = await fetchQuery("receiverCallsign", callsign);
          const list = parsePskReceptionReports(data);
          list.forEach((r) => { r.direction = "you_heard"; receptionReports.push(r); });
        } catch (e) {
          console.warn("PSK Reporter receiverCallsign query failed:", e?.message || e);
          upstreamFailed = true;
        }
      }
      receptionReports.sort((a, b) => (b.flowStartSeconds || 0) - (a.flowStartSeconds || 0));
      const reports = receptionReports.slice(0, limit * (wantSent && wantReceived ? 2 : 1));
      return { reports, upstreamFailed };
    });

    const list = Array.isArray(merged) ? merged : (merged?.reports ?? []);
    if (merged?.upstreamFailed && list.length === 0) {
      return res.status(503).json({
        error: "pskreporter_unavailable",
        detail: "PSK Reporter service (retrieve.pskreporter.info) is temporarily unavailable. Try again in a few minutes.",
        callsign,
        filter,
        reports: []
      });
    }

    const withLatLon = list.map((r) => {
      const loc = r.receiverLocator || r.senderLocator;
      const p = loc ? locatorToLatLon(loc) : null;
      return { ...r, lat: p?.lat, lon: p?.lon };
    });

    res.json({
      callsign,
      filter,
      updated: new Date().toISOString(),
      flowStartSeconds,
      reports: withLatLon,
      source: "https://retrieve.pskreporter.info/query",
      note: filter === "both" ? "Where you were heard + what you heard. Cached 2 min." : (filter === "sent" ? "Where your signal was received." : "What your station received.")
    });
  } catch (e) {
    const msg = String(e?.message || e);
    console.error("PSK Reporter endpoint error:", msg);
    // 503 when upstream/timeout/parse failed so client can show "service unavailable" + Retry
    if (msg.includes("Upstream") || msg.includes("timeout") || msg.includes("Invalid XML") || msg.includes("Empty response") || msg.includes("non-XML")) {
      return res.status(503).json({ error: "pskreporter_unavailable", detail: msg });
    }
    return res.status(500).json({ error: "pskreporter_failed", detail: msg });
  }
});

// --------------------
// Contests (WA7BNM-style calendar; optional RSS, else sample)
// --------------------
const CONTEST_CALENDAR_RSS = process.env.CONTEST_CALENDAR_RSS || "https://www.contestcalendar.com/calendar.rss";
const CONTEST_CACHE_MS = 30 * 60 * 1000; // 30 min

function defaultContestList() {
  const now = new Date();
  const in9h = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(12, 0, 0, 0);
  const nextWeek = new Date(now);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  nextWeek.setUTCHours(14, 0, 0, 0);
  return [
    { name: "NRAU 18m Activity Contest", type: "Mixed", startTime: in9h.toISOString(), endTime: null, url: "https://www.contestcalendar.com/", status: "upcoming" },
    { name: "CQ WW WPX Contest (SSB)", type: "SSB", startTime: tomorrow.toISOString(), endTime: null, url: "https://www.contestcalendar.com/", status: "upcoming" },
    { name: "ARRL DX Contest (CW)", type: "CW", startTime: nextWeek.toISOString(), endTime: null, url: "https://www.contestcalendar.com/", status: "upcoming" }
  ];
}

function parseRssDate(val) {
  if (val == null) return null;
  let s = typeof val === "string" ? val : (val["#text"] || val.value || val._ || "");
  if (typeof s !== "string") s = String(s);
  s = s.trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** WA7BNM description format: "0300Z-0400Z, Feb 5" or "1200Z, Feb 7 to 2400Z, Feb 8". Returns first (earliest) start as Date UTC, or null. */
function parseWa7bnmDescriptionStart(desc) {
  if (!desc || typeof desc !== "string") return null;
  const monthNames = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
  // Match HHMMZ or HHMMZ-HHMMZ followed by ", Mon DD" or " Mon DD" (and optional year later)
  const re = new RegExp(`(\\d{4})Z(?:-\\d{4}Z)?[, ]+(${monthNames})\\s+(\\d{1,2})(?:\\s+|,|$| to )`, "gi");
  const monthNum = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  let match;
  const candidates = [];
  while ((match = re.exec(desc)) !== null) {
    const hh = parseInt(match[1].slice(0, 2), 10);
    const mm = parseInt(match[1].slice(2, 4), 10);
    if (hh > 23 || mm > 59) continue;
    const mon = monthNum[match[2].toLowerCase().slice(0, 3)];
    if (mon === undefined) continue;
    const day = parseInt(match[3], 10);
    if (day < 1 || day > 31) continue;
    const year = new Date().getUTCFullYear();
    let d = new Date(Date.UTC(year, mon, day, hh, mm, 0, 0));
    if (Number.isFinite(d.getTime())) {
      if (d.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000) d = new Date(Date.UTC(year + 1, mon, day, hh, mm, 0, 0));
      candidates.push(d.getTime());
    }
  }
  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates));
}

/** Datum aus beliebigem Text ziehen (Titel/Beschreibung), z. B. "2024-02-04", "4.2.2024", "Feb 4 2024". */
function parseDateFromText(text) {
  if (!text || typeof text !== "string") return null;
  const s = text.trim();
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(iso[1], Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
    if (Number.isFinite(d.getTime())) return d;
  }
  const dmy = s.match(/\b(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\b/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 12, 0, 0, 0);
    if (Number.isFinite(d.getTime())) return d;
  }
  const monthNames = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Mär|Mai|Okt";
  const monRe = new RegExp(`\\b(${monthNames})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "i");
  const dayRe = new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})[a-z]*\\.?\\s+(\\d{4})\\b`, "i");
  const m1 = s.match(monRe);
  if (m1) {
    const mon = m1[1].replace(/Mär/i, "Mar").replace(/Mai/i, "May").replace(/Okt/i, "Oct");
    const d = new Date(`${mon} ${m1[2]}, ${m1[3]}`);
    if (Number.isFinite(d.getTime())) return d;
  }
  const m2 = s.match(dayRe);
  if (m2) {
    const mon = m2[2].replace(/Mär/i, "Mar").replace(/Mai/i, "May").replace(/Okt/i, "Oct");
    const d = new Date(`${mon} ${m2[1]}, ${m2[3]}`);
    if (Number.isFinite(d.getTime())) return d;
  }
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return new Date(parsed);
  return null;
}

/** Durchsucht ein Objekt nach allen Werten, die wie ein Datum aussehen. */
function findDateInItem(it) {
  if (!it || typeof it !== "object") return null;
  const keys = Object.keys(it);
  for (const k of keys) {
    if (!/date|time|pub|updated|published|start|end/i.test(k)) continue;
    const val = it[k];
    const d = parseRssDate(val);
    if (d) return d;
    if (typeof val === "object" && val !== null) {
      const d2 = parseRssDate(val["#text"] ?? val._ ?? val.value);
      if (d2) return d2;
    }
  }
  for (const k of keys) {
    const val = it[k];
    if (typeof val === "string" && val.length >= 6) {
      const d = parseDateFromText(val);
      if (d) return d;
    }
  }
  return null;
}

function parseContestsFromRss(xml) {
  if (!xml || typeof xml !== "string" || !xml.includes("<")) return null;
  const parser = new XMLParser({ ignoreAttributes: false });
  let doc;
  try {
    doc = parser.parse(xml.trim());
  } catch {
    return null;
  }
  const channel = doc?.rss?.channel || doc?.rss?.Channel || doc?.channel || doc?.feed;
  const rawItems = channel?.item ?? channel?.Item ?? channel?.items ?? channel?.entry ?? [];
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const out = [];
  const maxItems = 200;
  for (const it of items.slice(0, maxItems)) {
    const rawTitle = it.title ?? it.Title;
    const title = (typeof rawTitle === "string" ? rawTitle : rawTitle?.["#text"] ?? rawTitle?._ ?? "").trim();
    if (!title) continue;
    const rawLink = it.link ?? it.Link;
    let link = null;
    if (typeof rawLink === "string") link = rawLink;
    else if (rawLink && typeof rawLink === "object") link = rawLink["#text"] ?? rawLink["@_href"] ?? rawLink.href ?? (Array.isArray(rawLink) ? (rawLink[0]?.["@_href"] ?? rawLink[0]?.href) : null);
    const rawPub = it.pubDate ?? it.PubDate ?? it.pubdate ?? it["dc:date"] ?? it.dcDate ?? it.date ?? it.published ?? it.updated;
    let pubDate = parseRssDate(rawPub);
    if (!pubDate && typeof rawPub === "object" && rawPub !== null) {
      pubDate = parseRssDate(rawPub["#text"] ?? rawPub._ ?? rawPub.value);
    }
    if (!pubDate) pubDate = findDateInItem(it);
    const rawDesc = it.description ?? it.Description ?? it.summary ?? it.content ?? "";
    let desc = (typeof rawDesc === "string" ? rawDesc : rawDesc?.["#text"] ?? rawDesc?._ ?? "").trim();
    if (desc) desc = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    // WA7BNM feed: no pubDate; start time is in description e.g. "0300Z-0400Z, Feb 5" or "1200Z, Feb 7 to 2400Z, Feb 8"
    if (!pubDate && desc) pubDate = parseWa7bnmDescriptionStart(desc);
    if (!pubDate && title) pubDate = parseDateFromText(title);
    if (!pubDate && desc) pubDate = parseDateFromText(desc);
    const type = /SSB|CW|Mixed|Digital|FM/i.test(desc) ? (desc.match(/(SSB|CW|Mixed|Digital|FM)/i)?.[1] || "Mixed") : "Mixed";
    out.push({
      name: title,
      type,
      startTime: pubDate ? pubDate.toISOString() : null,
      endTime: null,
      url: link,
      status: "upcoming"
    });
  }
  return out.length ? out : null;
}

app.get("/api/contests", async (req, res) => {
  try {
    const cacheKey = "contests";
    const now = Date.now();
    const hit = cache.get(cacheKey);
    let items = hit && now - hit.t < CONTEST_CACHE_MS ? hit.v : null;
    if (!items || items.length === 0) {
      try {
        const r = await fetch(CONTEST_CALENDAR_RSS, {
          headers: { "User-Agent": "HamshackDashboard/1.0", Accept: "application/rss+xml, application/xml, text/xml, */*" },
          redirect: "follow"
        });
        if (r.ok) {
          const text = await r.text();
          const parsed = parseContestsFromRss(text);
          if (parsed && parsed.length > 0) {
            items = parsed;
            cache.set(cacheKey, { t: now, v: items });
          }
        }
      } catch (err) {
        console.warn("Contests RSS fetch failed:", err?.message || err);
      }
      if (!items || items.length === 0) {
        items = defaultContestList();
      }
    }
    res.json({ items, updated: new Date().toISOString() });
  } catch (e) {
    res.json({ items: defaultContestList(), updated: new Date().toISOString() });
  }
});

// --------------------
// Repeaters: local model (server/data/repeaters.json), filled by sync script
// --------------------
const REPEATERS_FILE = path.join(DATA_DIR, "repeaters.json");

function readRepeatersFromFile() {
  try {
    const raw = fs.readFileSync(REPEATERS_FILE, "utf8");
    const data = JSON.parse(raw);
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, updated: data?.updated ?? null, source: "local" };
  } catch (e) {
    if (e?.code !== "ENOENT") console.warn("Repeaters file read failed:", e?.message || e);
    return { items: [], updated: null, source: "local" };
  }
}

app.get("/api/repeaters", (req, res) => {
  try {
    const { items, updated, source } = readRepeatersFromFile();
    res.json({ items, updated: updated ?? new Date().toISOString(), source });
  } catch (e) {
    console.warn("Repeaters read failed:", e?.message || e);
    res.status(500).json({ error: "repeaters_failed", detail: String(e), items: [] });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Serve static files from client build in production (after all API routes)
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  // Serve index.html for all non-API routes (SPA routing)
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
}

export { app, PORT };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (fs.existsSync(clientBuildPath)) {
      console.log(`Serving static files from ${clientBuildPath}`);
    } else {
      console.log("Static files not found - run 'npm run build' in client directory for production");
    }
  });
}
