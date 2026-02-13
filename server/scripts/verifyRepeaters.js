/**
 * Verify repeater locations: use RepeaterBook raw Lat/Long when available,
 * disambiguate cities via landmark, and optionally web-search for corrections.
 * Run: npm run verify-repeaters [-- --search] [-- --limit N] [-- --search-all]
 *   --search: web search for ambiguous city names (Bad Soden, Neustadt, etc.)
 *   --search-all: search for every repeater (~50 min for 1500)
 *   --limit N: process only first N repeaters
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { search as ddgSearch } from "duck-duck-scrape";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const REPEATERS_FILE = path.join(DATA_DIR, "repeaters.json");

const DE_MINLAT = 47;
const DE_MAXLAT = 55.5;
const DE_MINLON = 5.8;
const DE_MAXLON = 15.1;
const SEARCH_DELAY_MS = 2000;

function inGermanyBbox(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= DE_MINLAT && lat <= DE_MAXLAT && lon >= DE_MINLON && lon <= DE_MAXLON;
}

function disambiguateCity(cityRaw, landmark) {
  if (!cityRaw) return cityRaw;
  const lm = (landmark || "").toLowerCase();
  const city = cityRaw.toLowerCase();
  if ((lm.includes("salmünster") || lm.includes("salmuenster")) && city.includes("bad soden")) return "Bad Soden-Salmünster";
  if (lm.includes("taunus") && city.includes("bad soden")) return "Bad Soden am Taunus";
  if (lm.includes("salmünster") || lm.includes("salmuenster")) return "Bad Soden-Salmünster";
  return cityRaw;
}

function extractLocationFromSearchResults(results) {
  const text = (results || [])
    .slice(0, 5)
    .map((r) => `${r.title || ""} ${r.description || ""}`)
    .join(" ");
  const lower = text.toLowerCase();
  // Look for common patterns: "in X", "Standort: X", "Ort: X", "bei X"
  const inMatch = text.match(/\b(?:in|bei|Standort[: ]|Ort[: ])\s*([A-Za-zÄÖÜäöüß\-]+(?:\s+[A-Za-zÄÖÜäöüß\-]+)*)/g);
  const cities = new Set();
  if (inMatch) {
    for (const m of inMatch) {
      const part = m.replace(/^(?:in|bei|Standort[: ]|Ort[: ])\s*/i, "").trim();
      if (part.length > 2 && part.length < 50 && !/^\d/.test(part)) cities.add(part);
    }
  }
  // Known corrections from search
  if (lower.includes("bad soden-salmünster") || lower.includes("bad soden-salmünster")) return "Bad Soden-Salmünster";
  if (lower.includes("bad soden am taunus") || lower.includes("soden taunus")) return "Bad Soden am Taunus";
  if (lower.includes("salmünster") && lower.includes("bad soden")) return "Bad Soden-Salmünster";
  return Array.from(cities)[0] || null;
}

async function run() {
  const args = process.argv.slice(2);
  const doSearch = args.includes("--search");
  const searchAll = args.includes("--search-all");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : null;

  console.log("Loading repeaters...");
  const raw = fs.readFileSync(REPEATERS_FILE, "utf8");
  const data = JSON.parse(raw);
  const items = data.items || [];
  const maxIdx = limit ? Math.min(limit, items.length) : items.length;
  if (limit) console.log(`Processing first ${maxIdx} repeaters only`);

  let fixedFromRaw = 0;
  let fixedFromLandmark = 0;
  let fixedFromSearch = 0;

  for (let i = 0; i < maxIdx; i++) {
    const item = items[i];
    const rawData = item.raw || {};
    const landmark = rawData.Landmark || rawData.landmark || "";
    const cityRaw = rawData["Nearest City"] || rawData.Nearest_City || rawData.city || item.city || "";
    const rbLat = Number(rawData.Lat);
    const rbLon = Number(rawData.Long);

    // 1. Use RepeaterBook coordinates when available and valid
    if (Number.isFinite(rbLat) && Number.isFinite(rbLon) && inGermanyBbox(rbLat, rbLon)) {
      const prevLat = item.lat;
      const prevLon = item.lon;
      const dist = prevLat != null && prevLon != null
        ? Math.hypot(item.lat - rbLat, item.lon - rbLon)
        : 1;
      if (dist > 0.01) {
        item.lat = rbLat;
        item.lon = rbLon;
        fixedFromRaw++;
      }
    }

    // 2. Disambiguate city using landmark
    const newCity = disambiguateCity(cityRaw.trim(), landmark);
    if (newCity && newCity !== (item.city || "")) {
      item.city = newCity;
      fixedFromLandmark++;
    }

    // 3. Optional: web search for locations
    if ((doSearch || searchAll) && item.callsign) {
      const isAmbiguous = searchAll || (cityRaw && (
        /bad\s*soden/i.test(cityRaw) ||
        /neustadt/i.test(cityRaw) ||
        /frankfurt/i.test(cityRaw) ||
        /mühl/i.test(cityRaw) ||
        /berlin/i.test(cityRaw) ||
        /hannover/i.test(cityRaw)
      ));
      if (isAmbiguous) {
        await new Promise((r) => setTimeout(r, SEARCH_DELAY_MS));
        try {
          const ddg = await ddgSearch(`${item.callsign} Relais Standort Deutschland`);
          const hits = ddg?.results || [];
          const extracted = extractLocationFromSearchResults(hits);
          if (extracted && extracted !== item.city) {
            item.city = extracted;
            fixedFromSearch++;
            console.log(`  ${item.callsign}: ${item.city} (from search)`);
          }
        } catch (e) {
          console.warn(`  Search failed for ${item.callsign}:`, e?.message);
        }
      }
    }

    if ((i + 1) % 200 === 0) console.log(`  Processed ${i + 1}/${maxIdx}...`);
  }

  data.updated = new Date().toISOString();
  data.verification = { fixedFromRaw, fixedFromLandmark, fixedFromSearch };

  fs.writeFileSync(REPEATERS_FILE, JSON.stringify(data, null, 2), "utf8");
  console.log(`Done. Fixed: ${fixedFromRaw} from raw coords, ${fixedFromLandmark} from landmark, ${fixedFromSearch} from web search`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
