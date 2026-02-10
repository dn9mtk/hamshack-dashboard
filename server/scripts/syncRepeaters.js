/**
 * Sync script: fetch all Germany repeaters (2m/70cm/10m) from RepeaterBook,
 * geocode missing locations via Nominatim (City, Germany), persist to server/data/repeaters.json.
 * Run: node server/scripts/syncRepeaters.js (from project root) or npm run sync-repeaters
 * Nominatim: max 1 request/second, results cached per city.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const REPEATERS_FILE = path.join(DATA_DIR, "repeaters.json");

const DE_MINLAT = 47;
const DE_MAXLAT = 55.5;
const DE_MINLON = 5.8;
const DE_MAXLON = 15.1;
const NOMINATIM_DELAY_MS = 1100;

function freqToRepeaterBand(freqMhz) {
  const f = Number(freqMhz);
  if (!Number.isFinite(f)) return null;
  if (f >= 28 && f < 30) return "10m";
  if (f >= 144 && f < 146) return "2m";
  if (f >= 430 && f < 440) return "70cm";
  return null;
}

function inGermanyBbox(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= DE_MINLAT && lat <= DE_MAXLAT && lon >= DE_MINLON && lon <= DE_MAXLON;
}

const cityCache = new Map();
let lastGeocodeTime = 0;

async function geocodeCity(city) {
  const key = (city || "").trim().toLowerCase();
  if (!key) return null;
  if (cityCache.has(key)) return cityCache.get(key);
  const now = Date.now();
  const wait = Math.max(0, NOMINATIM_DELAY_MS - (now - lastGeocodeTime));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocodeTime = Date.now();
  try {
    const q = encodeURIComponent(`${key}, Germany`);
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { "User-Agent": "HamshackDashboard/1.0 (https://github.com/hamshack-dashboard)" } }
    );
    if (!r.ok) return null;
    const arr = await r.json();
    const first = Array.isArray(arr) && arr[0];
    if (!first || first.lat == null || first.lon == null) return null;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!inGermanyBbox(lat, lon)) return null;
    const result = { lat, lon };
    cityCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

async function run() {
  console.log("Fetching repeaters from RepeaterBook (Germany)...");
  const url = "https://www.repeaterbook.com/api/exportROW.php?country=Germany";
  const r = await fetch(url, {
    headers: { "User-Agent": "HamshackDashboard/1.0 (https://github.com/hamshack-dashboard)" }
  });
  if (!r.ok) {
    console.error("RepeaterBook HTTP", r.status);
    process.exit(1);
  }
  const data = await r.json();
  const rows = Array.isArray(data) ? data : (data?.results ?? data?.repeaters ?? []);
  const items = [];
  const citiesToGeocode = new Set();
  for (const row of rows) {
    const freq = Number(row.rpt_freq ?? row.frequency ?? row.Frequency ?? row.freq);
    if (!Number.isFinite(freq)) continue;
    const band = freqToRepeaterBand(freq >= 1000 ? freq / 1000 : freq);
    if (!band) continue;
    let lat = Number(row.rpt_lat ?? row.latitude ?? row.Latitude ?? row.lat);
    let lon = Number(row.rpt_lon ?? row.longitude ?? row.Longitude ?? row.lon);
    const city = String(row.rpt_city ?? row.city ?? row.Location ?? row["Nearest City"] ?? "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inGermanyBbox(lat, lon)) {
      lat = null;
      lon = null;
      if (city) citiesToGeocode.add(city);
    }
    // Keep a compact normalized view *and* attach the full original row for extra metadata
    // (tone, mode, access, notes, etc.) so the frontend can surface more details later.
    items.push({
      id: String(row.rpt_id ?? row.id ?? `${row.rpt_callsign || row.callsign || ""}-${freq}`).trim() || `r-${items.length}`,
      callsign: String(row.rpt_callsign ?? row.callsign ?? row.Callsign ?? "").trim(),
      freq: freq >= 1000 ? freq / 1000 : freq,
      offset: row.rpt_offset ?? row.offset ?? row.input_freq ?? null,
      city: city || null,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      band,
      raw: row
    });
  }
  console.log(`Loaded ${items.length} repeaters. Unique cities to geocode: ${citiesToGeocode.size}`);

  const cityToCoords = new Map();
  const cities = Array.from(citiesToGeocode);
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const coords = await geocodeCity(city);
    if (coords) cityToCoords.set(city.trim().toLowerCase(), coords);
    if ((i + 1) % 10 === 0) console.log(`  Geocoded ${i + 1}/${cities.length} cities...`);
  }

  let filled = 0;
  for (const item of items) {
    if (item.lat != null && item.lon != null) continue;
    if (!item.city) continue;
    const coords = cityToCoords.get(item.city.trim().toLowerCase());
    if (coords) {
      item.lat = coords.lat;
      item.lon = coords.lon;
      filled++;
    }
  }
  console.log(`Filled coordinates for ${filled} repeaters from geocoding.`);

  const payload = {
    updated: new Date().toISOString(),
    source: "RepeaterBook",
    geocoding: "Nominatim (OpenStreetMap)",
    items
  };
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPEATERS_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${items.length} repeaters to ${REPEATERS_FILE}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
