import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { terminatorSegments, nightPolygons } from "../lib/terminator.js";
import { buildSpotQuery } from "../lib/spotsQuery.js";
import { gridCenter } from "../lib/grid.js";
import { formatDateRange } from "../lib/time.js";

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const FILTER_KEY = "hamshack_spot_filters_v2";
const MUF_LAYER_KEY = "hamshack_muf_layer";
const MAP_VIEW_KEY = "hamshack_map_view";
const SPOTS_LAYER_KEY = "hamshack_spots_layer";
const DXPEDITIONS_LAYER_KEY = "hamshack_dxpeditions_layer";
const BEACONS_LAYER_KEY = "hamshack_beacons_layer";
const SATELLITES_LAYER_KEY = "hamshack_satellites_layer";
const REPEATERS_LAYER_KEY = "hamshack_repeaters_layer";
const HORIZON_LAYER_KEY = "hamshack_horizon_layer";
const HORIZON_COLORS = {
  ground: { color: "rgba(230,119,0,0.9)", fill: "rgba(230,119,0,0.2)" },
  mobile: { color: "rgba(77,171,247,0.9)", fill: "rgba(77,171,247,0.15)" },
  base: { color: "rgba(55,178,77,0.9)", fill: "rgba(55,178,77,0.15)" }
};

// DXView-style view options: all | MUF | LUF | band frequencies (MHz)
const VIEW_OPTIONS = ["none", "MUF", "LUF", "1.8", "3.5", "5.3", "7", "10", "14", "18", "21", "24", "28", "50"];
const BAND_STATUS_COLOR = { open: "#37b24d", marginal: "#f59f00", closed: "#868e96" };

// Color scale: value 0–35 MHz → red (low) to green (high)
function mufColor(mhz) {
  const t = Math.max(0, Math.min(1, (mhz || 0) / 35));
  const r = Math.round(255 * (1 - t));
  const g = Math.round(255 * t);
  return `rgb(${r},${g},80)`;
}
// D-RAP: highest freq (MHz) affected by 1 dB absorption. Low = good, high = bad (more absorption)
function lufColor(mhz) {
  const t = Math.max(0, Math.min(1, (mhz || 0) / 10));
  const r = Math.round(200 * t + 55);
  const g = Math.round(200 * (1 - t));
  return `rgb(${r},${g},80)`;
}

// Band from frequency – accepts MHz (e.g. 14.195) or kHz (e.g. 14195); same ranges as server
function freqToBand(freq) {
  let f = Number(freq);
  if (!Number.isFinite(f)) return null;
  // DX cluster / RBN often send frequency in kHz
  if (f >= 1000) f = f / 1000;
  if (f >= 1.8 && f < 2) return "160m";
  if (f >= 3.5 && f < 4) return "80m";
  if (f >= 5.3 && f < 5.4) return "60m";
  if (f >= 7 && f < 7.2) return "40m";
  if (f >= 10.1 && f < 10.15) return "30m";
  if (f >= 14 && f < 14.35) return "20m";
  if (f >= 18.068 && f < 18.168) return "17m";
  if (f >= 21 && f < 21.45) return "15m";
  if (f >= 24.89 && f < 24.99) return "12m";
  if (f >= 28 && f < 29.7) return "10m";
  if (f >= 50 && f < 54) return "6m";
  return null;
}

// Band colors for DX Cluster / RBN spots (HamClock-style)
const BAND_COLORS_LIST = [
  { band: "160m", color: "#c92a2a" },
  { band: "80m", color: "#e67700" },
  { band: "60m", color: "#f0ad4e" },
  { band: "40m", color: "#fab005" },
  { band: "30m", color: "#82c91e" },
  { band: "20m", color: "#37b24d" },
  { band: "17m", color: "#20c997" },
  { band: "15m", color: "#15aabf" },
  { band: "12m", color: "#339af0" },
  { band: "10m", color: "#cc5de8" },
  { band: "6m", color: "#7950f2" }
];
const BAND_COLOR_MAP = Object.fromEntries(BAND_COLORS_LIST.map(({ band, color }) => [band, color]));
const DEFAULT_SPOT_COLOR = "#868e96"; // grey for unknown band

function spotColorByBand(freq) {
  const band = freqToBand(freq);
  const color = band ? (BAND_COLOR_MAP[band] || DEFAULT_SPOT_COLOR) : DEFAULT_SPOT_COLOR;
  return { color, fillColor: color };
}

// Mode (modulation) colors – used as left-border accent on labels (common modes)
const MODE_COLORS_LIST = [
  { mode: "FT8", color: "#22b8cf", title: "FT8 (digital)" },
  { mode: "FT4", color: "#f59f00", title: "FT4 (digital)" },
  { mode: "JT65", color: "#15aabf", title: "JT65 (digital)" },
  { mode: "JT9", color: "#0ca678", title: "JT9 (digital)" },
  { mode: "JS8", color: "#20c997", title: "JS8 (digital)" },
  { mode: "PSK", color: "#339af0", title: "PSK = Phase Shift Keying (z.B. PSK31, digital)" },
  { mode: "RTTY", color: "#cc5de8", title: "RTTY (digital)" },
  { mode: "CW", color: "#e9ecef", title: "CW (Morse)" },
  { mode: "SSB", color: "#51cf66", title: "SSB (Einseitenband)" },
  { mode: "AM", color: "#fab005", title: "AM (Amplitudenmodulation)" },
  { mode: "FM", color: "#fd7e14", title: "FM (Frequenzmodulation)" },
  { mode: "SSTV", color: "#be4bdb", title: "SSTV (Slow Scan TV)" }
];
const MODE_COLOR_MAP = Object.fromEntries(MODE_COLORS_LIST.map(({ mode, color }) => [mode, color]));
const DEFAULT_MODE_COLOR = "#868e96";

function modeColor(mode) {
  const m = (mode || "").toUpperCase();
  return MODE_COLOR_MAP[m] || DEFAULT_MODE_COLOR;
}

function escapeHtml(str) {
  if (str == null) return "";
  const s = String(str);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return { band: "ALL", mode: "ALL" };
    const j = JSON.parse(raw);
    return { band: j.band || "ALL", mode: j.mode || "ALL" };
  } catch {
    return { band: "ALL", mode: "ALL" };
  }
}

function loadSpotsLayerPref() {
  try {
    return localStorage.getItem(SPOTS_LAYER_KEY) !== "false";
  } catch {
    return true;
  }
}

function loadDxpeditionsLayerPref() {
  try {
    return localStorage.getItem(DXPEDITIONS_LAYER_KEY) !== "false";
  } catch {
    return true;
  }
}

function loadBeaconsLayerPref() {
  try {
    return localStorage.getItem(BEACONS_LAYER_KEY) !== "false";
  } catch {
    return true;
  }
}

function loadSatellitesLayerPref() {
  try {
    const v = localStorage.getItem(SATELLITES_LAYER_KEY);
    if (v !== null) return v !== "false";
    const legacy = localStorage.getItem("hamshack_iss_layer");
    if (legacy !== null) return legacy !== "false";
    return true;
  } catch {
    return true;
  }
}

function loadRepeatersLayerPref() {
  try {
    return localStorage.getItem(REPEATERS_LAYER_KEY) !== "false";
  } catch {
    return false;
  }
}

function loadHorizonLayerPref() {
  try {
    return localStorage.getItem(HORIZON_LAYER_KEY) === "true";
  } catch {
    return false;
  }
}

function pathForecastPopupHtml(data) {
  const toStr = data.to?.grid || (data.to?.lat != null && data.to?.lon != null
    ? `${Number(data.to.lat).toFixed(1)}°, ${Number(data.to.lon).toFixed(1)}°`
    : "—");
  const bands = (data.bands || [])
    .map(
      (b) =>
        `<tr><td style="padding:4px 8px 4px 0;">${escapeHtml(b.name)}</td><td style="padding:4px 0;text-align:right;font-weight:700;">${escapeHtml(String(b.reliability))}%</td></tr>`
    )
    .join("");
  const elev = data.elevationProfile;
  let elevHtml = "";
  if (elev && Array.isArray(elev.samples) && elev.samples.length >= 2) {
    const minEl = typeof elev.minElevation === "number" ? elev.minElevation : 0;
    const maxEl = typeof elev.maxElevation === "number" ? elev.maxElevation : minEl + 1;
    const span = Math.max(1, maxEl - minEl);
    const lastDist = elev.samples[elev.samples.length - 1].distKm || 1;
    const pts = elev.samples.map((s) => {
      const x = lastDist > 0 ? (s.distKm / lastDist) * 100 : 0;
      const y = 100 - ((s.elevation - minEl) / span) * 100;
      return { x, y };
    });
    const linePoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    elevHtml = `
      <div class="path-forecast-elev">
        <div class="path-forecast-elev-title">Elevation profile (QTH → DX)</div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="path-forecast-elev-svg">
          <polyline points="${linePoints}" class="path-forecast-elev-line" />
        </svg>
        <div class="path-forecast-elev-meta">
          <span>min ${Math.round(minEl)} m</span>
          <span>max ${Math.round(maxEl)} m</span>
        </div>
      </div>`;
  }

  return `
    <div class="path-forecast-popup">
      <div class="path-forecast-popup-title">Path Forecast</div>
      <div class="path-forecast-popup-route">${escapeHtml(data.from?.locator || "—")} → ${escapeHtml(String(toStr))}</div>
      <div class="path-forecast-popup-meta">${escapeHtml(String(data.distanceKm ?? "—"))} km · MUF ${escapeHtml(String(data.mufPath ?? "—"))} MHz</div>
      <table class="path-forecast-popup-bands"><tbody>${bands}</tbody></table>
      ${elevHtml}
    </div>
  `;
}

const REPEATER_BANDS = [
  { key: "2m", label: "2 m" },
  { key: "70cm", label: "70 cm" },
  { key: "10m", label: "10 m" }
];

// Repeater marker colors per band (2m = green, 70cm = blue, 10m = purple)
const REPEATER_BAND_COLORS = {
  "2m": "#37b24d",
  "70cm": "#339af0",
  "10m": "#cc5de8"
};
const REPEATER_DEFAULT_COLOR = "#868e96";

export default function MapPanel({
  dxpeditionsFilter = "all",
  repeatersBandFilter = "2m",
  onRepeatersBandChange,
  onSelectRepeater,
  focusedRepeater,
  radioHorizon = null
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const pathTargetMarkerRef = useRef(null);
  const setPathTargetActiveRef = useRef(null);

  const [pathTargetMarkerActive, setPathTargetMarkerActive] = useState(false);

  const nightRef = useRef(null);
  const greyRef = useRef(null);
  const spotLayerRef = useRef(null);
  const beaconLayerRef = useRef(null);
  const gridLayerRef = useRef(null);
  const pskLayerRef = useRef(null);
  const dxpeditionLayerRef = useRef(null);
  const repeaterLayerRef = useRef(null);
  const mufOverlayRef = useRef(null);
  const bandOverlayRef = useRef(null);
  const lufOverlayRef = useRef(null);
  const satellitesLayerRef = useRef(null);
  const satelliteRangeLayerRef = useRef(null);
  const horizonLayerRef = useRef(null);
  const currentFiltersRef = useRef(loadSavedFilters());

  const [mapReady, setMapReady] = useState(false);
  const [selectedSatId, setSelectedSatId] = useState(null);
  function loadMapViewPref() {
    try {
      const v = localStorage.getItem(MAP_VIEW_KEY);
      return VIEW_OPTIONS.includes(v) ? v : "none";
    } catch {
      return "none";
    }
  }
  const [mapView, setMapView] = useState(() => loadMapViewPref());
  const [spotsLayerOn, setSpotsLayerOn] = useState(() => loadSpotsLayerPref());
  const [dxpeditionsLayerOn, setDxpeditionsLayerOn] = useState(() => loadDxpeditionsLayerPref());
  const [beaconsLayerOn, setBeaconsLayerOn] = useState(() => loadBeaconsLayerPref());
  const [satellitesLayerOn, setSatellitesLayerOn] = useState(() => loadSatellitesLayerPref());
  const [repeatersLayerOn, setRepeatersLayerOn] = useState(() => loadRepeatersLayerPref());
  const [horizonLayerOn, setHorizonLayerOn] = useState(() => loadHorizonLayerPref());
  const [spaceSummary, setSpaceSummary] = useState(null);
  const [perspectiveGrid, setPerspectiveGrid] = useState("");
  const [bandGridSource, setBandGridSource] = useState(null);
  const [beaconStatus, setBeaconStatus] = useState(null);
  const mapWrapperRef = useRef(null);

  useEffect(() => {
    setPathTargetActiveRef.current = setPathTargetMarkerActive;
  }, []);

  function removePathTargetMarker() {
    if (pathTargetMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(pathTargetMarkerRef.current);
      pathTargetMarkerRef.current = null;
      setPathTargetMarkerActive(false);
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(MAP_VIEW_KEY, mapView);
    } catch {}
  }, [mapView]);

  useEffect(() => {
    try {
      localStorage.setItem(SPOTS_LAYER_KEY, spotsLayerOn ? "true" : "false");
    } catch {}
  }, [spotsLayerOn]);

  useEffect(() => {
    try {
      localStorage.setItem(DXPEDITIONS_LAYER_KEY, dxpeditionsLayerOn ? "true" : "false");
    } catch {}
  }, [dxpeditionsLayerOn]);

  useEffect(() => {
    try {
      localStorage.setItem(BEACONS_LAYER_KEY, beaconsLayerOn ? "true" : "false");
    } catch {}
  }, [beaconsLayerOn]);

  useEffect(() => {
    if (!beaconsLayerOn) return;
    let cancelled = false;
    async function fetchBeaconStatus() {
      try {
        const r = await fetch("/api/beacons/status");
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (!cancelled) setBeaconStatus(data);
      } catch {
        if (!cancelled) setBeaconStatus(null);
      }
    }
    fetchBeaconStatus();
    const id = setInterval(fetchBeaconStatus, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [beaconsLayerOn]);

  useEffect(() => {
    try {
      localStorage.setItem(SATELLITES_LAYER_KEY, satellitesLayerOn ? "true" : "false");
    } catch {}
  }, [satellitesLayerOn]);

  useEffect(() => {
    try {
      localStorage.setItem(REPEATERS_LAYER_KEY, repeatersLayerOn ? "true" : "false");
    } catch {}
  }, [repeatersLayerOn]);

  useEffect(() => {
    try {
      localStorage.setItem(HORIZON_LAYER_KEY, horizonLayerOn ? "true" : "false");
    } catch {}
  }, [horizonLayerOn]);



  // Sync DX/RBN spots layer visibility with map
  useEffect(() => {
    const map = mapRef.current;
    const layer = spotLayerRef.current;
    if (!map || !layer) return;
    if (spotsLayerOn) {
      if (!map.hasLayer(layer)) map.addLayer(layer);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [spotsLayerOn, mapReady]);

  // Sync DXpeditions layer visibility with map
  useEffect(() => {
    const map = mapRef.current;
    const layer = dxpeditionLayerRef.current;
    if (!map || !layer) return;
    if (dxpeditionsLayerOn) {
      if (!map.hasLayer(layer)) map.addLayer(layer);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [dxpeditionsLayerOn, mapReady]);

  // Sync beacons layer visibility with map
  useEffect(() => {
    const map = mapRef.current;
    const layer = beaconLayerRef.current;
    if (!map || !layer) return;
    if (beaconsLayerOn) {
      if (!map.hasLayer(layer)) map.addLayer(layer);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [beaconsLayerOn, mapReady]);

  // Sync satellites layer visibility with map
  useEffect(() => {
    const map = mapRef.current;
    const layer = satellitesLayerRef.current;
    if (!map || !layer) return;
    if (satellitesLayerOn) {
      if (!map.hasLayer(layer)) map.addLayer(layer);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [satellitesLayerOn, mapReady]);

  // Sync Repeaters layer visibility with map
  useEffect(() => {
    const map = mapRef.current;
    const layer = repeaterLayerRef.current;
    if (!map || !layer) return;
    if (repeatersLayerOn) {
      if (!map.hasLayer(layer)) map.addLayer(layer);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [repeatersLayerOn, mapReady]);

  // DXpeditions layer: fetch and draw markers by filter (all / active / upcoming)
  useEffect(() => {
    let alive = true;
    const layer = dxpeditionLayerRef.current;
    if (!layer || !mapRef.current) return;

    async function refreshDxpeditions() {
      try {
        const r = await fetch("/api/dxpeditions");
        if (!r.ok || !alive) return;
        const j = await r.json();
        const list = (j.items || []).filter(
          (x) => Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lon))
        );
        const filtered =
          dxpeditionsFilter === "active"
            ? list.filter((x) => x.status === "active")
            : dxpeditionsFilter === "upcoming"
              ? list.filter((x) => x.status === "upcoming")
              : list;

        layer.clearLayers();
        filtered.forEach((x) => {
          const lat = Number(x.lat);
          const lon = Number(x.lon);
          const isActive = x.status === "active";
          const color = isActive ? "#51cf66" : "#4dabf7";
          const marker = L.circleMarker([lat, lon], {
            radius: 6,
            weight: 2,
            fillOpacity: 0.9,
            color,
            fillColor: color
          }).addTo(layer);
          const dateStr = formatDateRange(x.startDate, x.endDate);
          const popupContent =
            `<div class="dxped-popup">` +
            `<div class="dxped-popup-line1">${escapeHtml(x.callsign)}${isActive ? ' <span class="dxped-popup-now">• NOW</span>' : ""}</div>` +
            (x.entity ? `<div class="dxped-popup-entity">${escapeHtml(x.entity)}</div>` : "") +
            (dateStr ? `<div class="dxped-popup-dates">${escapeHtml(dateStr)}</div>` : "") +
            (x.url ? `<div class="dxped-popup-link"><a href="${escapeHtml(x.url)}" target="_blank" rel="noopener noreferrer">More info ↗</a></div>` : "") +
            `</div>`;
          marker.bindPopup(popupContent);
        });
      } catch (err) {
        console.warn("DXpeditions layer:", err);
      }
    }

    if (dxpeditionsLayerOn) {
      refreshDxpeditions();
      const id = setInterval(refreshDxpeditions, 30 * 60 * 1000);
      return () => {
        alive = false;
        clearInterval(id);
      };
    }
    return () => { alive = false; };
  }, [dxpeditionsFilter, dxpeditionsLayerOn, mapReady]);

  // Repeaters layer: fetch Germany 2m/70cm/10m and draw markers (only those with lat/lon)
  useEffect(() => {
    let alive = true;
    const layer = repeaterLayerRef.current;
    if (!layer || !mapRef.current) return;

    async function refreshRepeaters() {
      try {
        const r = await fetch("/api/repeaters");
        if (!r.ok || !alive) return;
        const j = await r.json();
        let list = (j.items || []).filter(
          (x) => Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lon))
        );
        if (repeatersBandFilter) {
          list = list.filter((x) => x.band === repeatersBandFilter);
        }
        layer.clearLayers();
        list.forEach((x) => {
          const lat = Number(x.lat);
          const lon = Number(x.lon);
          const color = REPEATER_BAND_COLORS[x.band] || REPEATER_DEFAULT_COLOR;
          const marker = L.circleMarker([lat, lon], {
            radius: 5,
            weight: 2,
            fillOpacity: 0.9,
            color,
            fillColor: color
          }).addTo(layer);
          const freqStr = x.freq != null ? `${Number(x.freq).toFixed(2)} MHz` : "—";
          const offsetStr = x.offset != null && x.offset !== "" ? ` · ${x.offset} MHz` : "";
          const popupContent =
            `<div class="dxped-popup">` +
            `<div class="dxped-popup-line1">${escapeHtml(x.callsign || "—")}</div>` +
            `<div class="dxped-popup-entity">${escapeHtml(freqStr)}${escapeHtml(offsetStr)}</div>` +
            (x.city ? `<div class="dxped-popup-dates">${escapeHtml(x.city)}</div>` : "") +
            `<div class="dxped-popup-dates">${escapeHtml(x.band || "")}</div>` +
            `</div>`;
          marker.bindPopup(popupContent);

          // When clicking a repeater marker, notify the app so the sidebar
          // \"Repeater\" panel can select the corresponding entry.
          if (onSelectRepeater) {
            marker.on("click", () => onSelectRepeater(x));
          }
        });
      } catch (err) {
        console.warn("Repeaters layer:", err);
      }
    }

    if (repeatersLayerOn) {
      refreshRepeaters();
      const id = setInterval(refreshRepeaters, 60 * 60 * 1000);
      return () => {
        alive = false;
        clearInterval(id);
      };
    }
    return () => { alive = false; };
  }, [repeatersLayerOn, repeatersBandFilter, mapReady]);

  // Center and highlight a focused repeater (from sidebar focus button)
  useEffect(() => {
    if (!focusedRepeater || !mapRef.current) return;
    if (!repeatersLayerOn) return; // respect user toggle; don't force layer ON

    const { lat, lon } = focusedRepeater;
    const latNum = Number(lat);
    const lonNum = Number(lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return;

    const map = mapRef.current;
    const target = L.latLng(latNum, lonNum);

    // Zoom näher ran (stärkerer Zoom als normale Ansicht).
    const zoom = Math.max(map.getZoom(), 8);
    map.setView(target, zoom, { animate: true });

    // Wegen Header + Toolbar liegt die „visuelle“ Mitte höher.
    // Verschiebe die Karte daher ein Stück nach oben, sodass
    // der Repeater näher an der geometrischen Mitte sichtbar ist.
    map.panBy([0, -80], { animate: true });

    const layer = repeaterLayerRef.current;
    if (!layer || typeof layer.eachLayer !== "function") return;

    // Alle Repeater-Marker in Default-Style zurücksetzen und den gewählten hervorheben.
    layer.eachLayer((marker) => {
      if (!marker || !marker.getLatLng || !marker.setStyle) return;
      const p = marker.getLatLng();
      const isMatch =
        Math.abs(p.lat - latNum) < 0.0001 &&
        Math.abs(p.lng - lonNum) < 0.0001;

      // Default-Style
      const baseStyle = { radius: 5, weight: 2 };

      if (isMatch) {
        marker.setStyle({ ...baseStyle, radius: 8, weight: 3 });
        if (marker.openPopup) marker.openPopup();
        if (marker.bringToFront) marker.bringToFront();
      } else {
        marker.setStyle(baseStyle);
      }
    });
  }, [focusedRepeater, repeatersLayerOn, mapReady]);

  useEffect(() => {
    if (mapRef.current) return;
    const el = elRef.current;
    if (!el) return;

    const initMap = () => {
      if (mapRef.current) return;
      const map = L.map(el, {
        worldCopyJump: false,
        zoomControl: true,
        attributionControl: true,
        minZoom: 2,
        maxZoom: 10,
        maxBounds: [[-85, -179], [85, 179]],
        maxBoundsViscosity: 1
      }).setView([25, 0], 2);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors © CARTO",
        noWrap: true,
        maxZoom: 19,
        maxNativeZoom: 19
      }).addTo(map);

    // Pane for satellites (above shading)
    const satPane = map.createPane("satellitesPane");
    satPane.style.zIndex = 650;

    // Layers (DX/RBN spots layer: add to map only if user has it enabled)
    let spotsLayerVisible = true;
    try {
      spotsLayerVisible = localStorage.getItem(SPOTS_LAYER_KEY) !== "false";
    } catch {}
    spotLayerRef.current = L.layerGroup();
    if (spotsLayerVisible) map.addLayer(spotLayerRef.current);
    let dxpeditionsLayerVisible = true;
    try {
      dxpeditionsLayerVisible = localStorage.getItem(DXPEDITIONS_LAYER_KEY) !== "false";
    } catch {}
    dxpeditionLayerRef.current = L.layerGroup();
    if (dxpeditionsLayerVisible) map.addLayer(dxpeditionLayerRef.current);
    let satellitesLayerVisible = true;
    try {
      const v = localStorage.getItem(SATELLITES_LAYER_KEY);
      if (v !== null) satellitesLayerVisible = v !== "false";
      else {
        const leg = localStorage.getItem("hamshack_iss_layer");
        if (leg !== null) satellitesLayerVisible = leg !== "false";
      }
    } catch {}
    satellitesLayerRef.current = L.layerGroup();
    if (satellitesLayerVisible) map.addLayer(satellitesLayerRef.current);
    let beaconsLayerVisible = true;
    try {
      beaconsLayerVisible = localStorage.getItem(BEACONS_LAYER_KEY) !== "false";
    } catch {}
    beaconLayerRef.current = L.layerGroup();
    if (beaconsLayerVisible) map.addLayer(beaconLayerRef.current);
    let repeatersLayerVisible = false;
    try {
      repeatersLayerVisible = localStorage.getItem(REPEATERS_LAYER_KEY) !== "false";
    } catch {}
    repeaterLayerRef.current = L.layerGroup();
    if (repeatersLayerVisible) map.addLayer(repeaterLayerRef.current);
    gridLayerRef.current = L.layerGroup().addTo(map);
    pskLayerRef.current = L.layerGroup().addTo(map);

    // Maidenhead grid (field boundaries: 10° lat, 20° lon)
    const gridLines = [];
    for (let lat = -90; lat <= 90; lat += 10) {
      gridLines.push([[lat, -180], [lat, 180]]);
    }
    for (let lon = -180; lon <= 180; lon += 20) {
      gridLines.push([[-90, lon], [90, lon]]);
    }
    gridLines.forEach((seg) => {
      L.polyline(seg, {
        color: "rgba(255,255,255,0.35)",
        weight: 1,
        opacity: 0.8
      }).addTo(gridLayerRef.current);
    });

    // NCDXF beacons
    fetch("/api/beacons")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        (data.beacons || []).forEach((b) => {
          if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return;
          const marker = L.circleMarker([b.lat, b.lon], {
            radius: 5,
            weight: 1,
            fillOpacity: 0.9,
            color: "#0ca678",
            fillColor: "#0ca678"
          }).addTo(beaconLayerRef.current);
          const freqs = (b.frequencies || []).join(", ");
          marker.bindPopup(
            `<div class="map-popup-content"><b>${escapeHtml(b.call)}</b> · ${escapeHtml(b.grid || "")}<br/>${escapeHtml(b.location || "")}<br/>${escapeHtml(freqs)} MHz</div>`
          );
        });
      })
      .catch((err) => console.warn("Failed to load beacons:", err));

    // Night shading
    const night = L.polygon(nightPolygons(new Date(), 1), {
      stroke: false,
      fill: true,
      fillOpacity: 0.22
    }).addTo(map);
    nightRef.current = night;

    // Greyline (Tag/Nacht-Grenze)
    const grey = L.polyline(terminatorSegments(new Date(), 1), {
      weight: 2,
      opacity: 0.95,
      color: "#6b7b8c",
      dashArray: "4,4"
    }).addTo(map);
    greyRef.current = grey;

    // Map click → Path forecast (QTH → clicked point): marker "DX" + popup with forecast
    map.on("click", (e) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      if (pathTargetMarkerRef.current) map.removeLayer(pathTargetMarkerRef.current);
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: "path-forecast-dx-marker",
          html:
            '<div style="width:36px;height:36px;border-radius:50%;background:#4dabf7;border:2px solid #339af0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,0.3);">DX</div>',
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        })
      }).addTo(map);
      marker.bindPopup(
        '<div class="path-forecast-popup path-forecast-popup-loading">Lade Path Forecast …</div>',
        { minWidth: 220, maxWidth: 320 }
      );
      marker.openPopup();
      pathTargetMarkerRef.current = marker;
      if (setPathTargetActiveRef.current) setPathTargetActiveRef.current(true);
      fetch(`/api/propagation/path?toLat=${encodeURIComponent(lat)}&toLon=${encodeURIComponent(lon)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then((data) => {
          marker.setPopupContent(pathForecastPopupHtml(data));
        })
        .catch((err) => {
          marker.setPopupContent(
            `<div class="path-forecast-popup path-forecast-popup-error">Error: ${escapeHtml(err.message)}</div>`
          );
        });
    });

    // QTH marker from server (house icon)
    const qthHouseHtml = `
      <div class="qth-house-marker" style="width:28px;height:28px;display:flex;align-items:flex-end;justify-content:center;">
        <svg viewBox="0 0 24 24" width="24" height="24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));">
          <path d="M12 2L2 10v12h7v-7h6v7h7V10L12 2z" fill="#ff6b6b" stroke="#c92a2a" stroke-width="1.2"/>
        </svg>
      </div>
    `;
    fetch("/api/qth")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(q => {
        if (!Number.isFinite(q.lat) || !Number.isFinite(q.lon)) return;
        const qth = L.marker([q.lat, q.lon], {
          icon: L.divIcon({
            className: "qth-house-marker",
            html: qthHouseHtml,
            iconSize: [28, 28],
            iconAnchor: [14, 28]
          })
        }).addTo(map);
        qth.bindTooltip(`${q.callsign} · ${q.locator}`, { direction: "top" });
      })
      .catch(err => {
        console.warn("Failed to load QTH:", err);
      });

      // Fix layout sizing: invalidate and re-center when container gets size
      const scheduleInvalidate = () => {
        setTimeout(() => {
          const m = mapRef.current;
          if (!m) return;
          m.invalidateSize();
          m.setView(m.getCenter(), m.getZoom(), { animate: false });
        }, 80);
      };
      scheduleInvalidate();
      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleInvalidate) : null;
      if (ro) ro.observe(el);
      const onResize = () => { if (mapRef.current) { mapRef.current.invalidateSize(); mapRef.current.setView(mapRef.current.getCenter(), mapRef.current.getZoom(), { animate: false }); } };
      window.addEventListener("resize", onResize);

      const tid = setInterval(() => {
        if (nightRef.current && greyRef.current) {
          nightRef.current.setLatLngs(nightPolygons(new Date(), 1));
          greyRef.current.setLatLngs(terminatorSegments(new Date(), 1));
        }
      }, 60_000);

      map.on("click", () => setSelectedSatId(null));

      mapRef.current = map;
      setMapReady(true);
      return () => {
        setMapReady(false);
        clearInterval(tid);
        if (ro) ro.disconnect();
        window.removeEventListener("resize", onResize);
        if (pathTargetMarkerRef.current && mapRef.current) {
          mapRef.current.removeLayer(pathTargetMarkerRef.current);
          pathTargetMarkerRef.current = null;
        }
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    };

    let cleanup = null;
    const t = setTimeout(() => { cleanup = initMap(); }, 120);
    return () => {
      clearTimeout(t);
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  // MUF data layer – when View is "MUF" (dxview-style)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (mapView === "MUF") {
      try {
        localStorage.setItem(MAP_VIEW_KEY, "MUF");
      } catch {}
      const layer = L.layerGroup().addTo(map);
      mufOverlayRef.current = layer;

      function drawMufGrid() {
        fetch("/api/muf-grid")
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
          .then((data) => {
            const lg = mufOverlayRef.current;
            if (!lg || !mapRef.current) return;
            lg.clearLayers();
            const { lats, lons, values } = data;
            const dLat = lats.length > 1 ? lats[1] - lats[0] : 2;
            const dLon = lons.length > 1 ? lons[1] - lons[0] : 2;
            const w = lons.length;
            const h = lats.length;
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            for (let i = 0; i < h; i++) {
              for (let j = 0; j < w; j++) {
                const v = values[i]?.[j];
                ctx.fillStyle = v != null && !Number.isNaN(v) ? mufColor(v) : "rgba(0,0,0,0)";
                ctx.fillRect(j, i, 1, 1);
              }
            }
            const scale = 2;
            const blurCanvas = document.createElement("canvas");
            blurCanvas.width = w * scale;
            blurCanvas.height = h * scale;
            const bctx = blurCanvas.getContext("2d");
            if (!bctx) { lg.clearLayers(); return; }
            bctx.imageSmoothingEnabled = true;
            bctx.imageSmoothingQuality = "high";
            bctx.filter = "blur(2px)";
            bctx.drawImage(canvas, 0, 0, w, h, 0, 0, w * scale, h * scale);
            const south = lats[0];
            const north = lats[lats.length - 1] + dLat;
            const west = lons[0];
            const east = lons[lons.length - 1] + dLon;
            const bounds = [[south, west], [north, east]];
            const url = blurCanvas.toDataURL("image/png");
            L.imageOverlay(url, bounds, { opacity: 0.55, interactive: false }).addTo(lg);
          })
          .catch((err) => console.warn("MUF grid:", err));
      }

      drawMufGrid();
      const refreshId = setInterval(drawMufGrid, 15 * 60 * 1000);
      return () => {
        clearInterval(refreshId);
        if (mufOverlayRef.current) {
          map.removeLayer(mufOverlayRef.current);
          mufOverlayRef.current = null;
        }
      };
    } else {
      if (mufOverlayRef.current) {
        map.removeLayer(mufOverlayRef.current);
        mufOverlayRef.current = null;
      }
    }
  }, [mapView, mapReady]);

  // Band overlay – when View is a band (e.g. 14 = 20 m), show open/marginal/closed from MUF
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const bandFreq = mapView !== "none" && mapView !== "MUF" && mapView !== "LUF" ? parseFloat(mapView, 10) : null;
    if (!Number.isFinite(bandFreq)) {
      setBandGridSource(null);
      if (bandOverlayRef.current) {
        map.removeLayer(bandOverlayRef.current);
        bandOverlayRef.current = null;
      }
      return;
    }

    try {
      localStorage.setItem(MAP_VIEW_KEY, String(mapView));
    } catch {}
    const layer = L.layerGroup().addTo(map);
    bandOverlayRef.current = layer;

    function drawBandGrid() {
      const bandParam = mapView;
      fetch(`/api/band-grid?band=${encodeURIComponent(bandParam)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then((data) => {
          const lg = bandOverlayRef.current;
          if (!lg || !mapRef.current) return;
          lg.clearLayers();
          const { lats, lons, values, source } = data;
          const dLat = lats.length > 1 ? lats[1] - lats[0] : 2;
          const dLon = lons.length > 1 ? lons[1] - lons[0] : 2;
          const w = lons.length;
          const h = lats.length;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const useSpots = source === "spots";
          for (let i = 0; i < h; i++) {
            for (let j = 0; j < w; j++) {
              const v = values[i]?.[j];
              let status = "closed";
              if (useSpots) {
                const count = typeof v === "number" ? v : 0;
                if (count >= 1) status = "open";
              } else {
                const muf = v;
                if (muf != null && !Number.isNaN(muf)) {
                  if (muf >= bandFreq * 1.2) status = "open";
                  else if (muf >= bandFreq) status = "marginal";
                }
              }
              const col = BAND_STATUS_COLOR[status] || BAND_STATUS_COLOR.closed;
              ctx.fillStyle = col;
              ctx.fillRect(j, i, 1, 1);
            }
          }
          const scale = 2;
          const blurCanvas = document.createElement("canvas");
          blurCanvas.width = w * scale;
          blurCanvas.height = h * scale;
          const bctx = blurCanvas.getContext("2d");
          if (!bctx) { lg.clearLayers(); return; }
          bctx.imageSmoothingEnabled = true;
          bctx.imageSmoothingQuality = "high";
          bctx.filter = "blur(2px)";
          bctx.drawImage(canvas, 0, 0, w, h, 0, 0, w * scale, h * scale);
          const south = lats[0];
          const north = lats[lats.length - 1] + dLat;
          const west = lons[0];
          const east = lons[lons.length - 1] + dLon;
          const bounds = [[south, west], [north, east]];
          const url = blurCanvas.toDataURL("image/png");
          L.imageOverlay(url, bounds, { opacity: 0.55, interactive: false }).addTo(lg);
          setBandGridSource(source || null);
        })
        .catch((err) => console.warn("Band grid:", err));
    }

    drawBandGrid();
    const refreshId = setInterval(drawBandGrid, 15 * 60 * 1000);
    return () => {
      clearInterval(refreshId);
      if (bandOverlayRef.current) {
        map.removeLayer(bandOverlayRef.current);
        bandOverlayRef.current = null;
      }
    };
  }, [mapView, mapReady]);

  // LUF / D-RAP data layer – project D-RAP grid onto our map (when View is "LUF")
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (mapView === "LUF") {
      const layer = L.layerGroup().addTo(map);
      lufOverlayRef.current = layer;

      function drawLufGrid() {
        fetch("/api/drap-grid")
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
          .then((data) => {
            const lg = lufOverlayRef.current;
            if (!lg || !mapRef.current) return;
            lg.clearLayers();
            const { lats, lons, values } = data;
            const dLat = lats.length > 1 ? Math.abs(lats[1] - lats[0]) : 2;
            const dLon = lons.length > 1 ? Math.abs(lons[1] - lons[0]) : 4;
            for (let i = 0; i < lats.length; i++) {
              for (let j = 0; j < lons.length; j++) {
                const v = values[i]?.[j];
                if (v == null || Number.isNaN(v)) continue;
                const bounds = [
                  [lats[i] - dLat / 2, lons[j] - dLon / 2],
                  [lats[i] + dLat / 2, lons[j] + dLon / 2]
                ];
                L.rectangle(bounds, {
                  fillColor: lufColor(v),
                  fillOpacity: 0.55,
                  weight: 0,
                  interactive: false
                }).addTo(lg);
              }
            }
          })
          .catch((err) => console.warn("D-RAP grid:", err));
      }

      drawLufGrid();
      const refreshId = setInterval(drawLufGrid, 15 * 60 * 1000);
      return () => {
        clearInterval(refreshId);
        if (lufOverlayRef.current) {
          map.removeLayer(lufOverlayRef.current);
          lufOverlayRef.current = null;
        }
      };
    } else {
      if (lufOverlayRef.current) {
        map.removeLayer(lufOverlayRef.current);
        lufOverlayRef.current = null;
      }
    }
  }, [mapView, mapReady]);

  // Draw spots that match the SAME filters as list
  useEffect(() => {
    let alive = true;

    async function refreshSpots() {
      try {
        const url = buildSpotQuery(currentFiltersRef.current);
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!alive) return;

        const layer = spotLayerRef.current;
        if (!layer) return;
        layer.clearLayers();

        const list = (j.spots || []).filter(s => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon)));
        const popupHtml = (s) =>
          `<div class="map-popup-content">` +
          `<b>${escapeHtml(s.dx)}</b><br/>` +
          `${escapeHtml(String(s.freq))} MHz · ${escapeHtml(s.mode || "—")} · ${escapeHtml(s.src || "")}<br/>` +
          `via ${escapeHtml(s.spotter || "—")}<br/>` +
          (typeof s.bearing === "number" ? `Bearing: ${s.bearing}°<br/>` : "") +
          (typeof s.distKm === "number" ? `Distance: ${s.distKm} km<br/>` : "") +
          (s.entity ? `${escapeHtml(s.entity)}${s.dxccPrefix ? ` (${escapeHtml(s.dxccPrefix)})` : ""}<br/>` : "") +
          (s.note ? escapeHtml(s.note) : "") +
          `</div>`;

        const slice = list.slice(0, 100);
        // 1) Connection lines first (behind labels), colored by band
        slice.forEach((s) => {
          const { color } = spotColorByBand(s.freq);
          const lat = Number(s.lat);
          const lon = Number(s.lon);
          const spotterLat = Number(s.spotterLat);
          const spotterLon = Number(s.spotterLon);
          if (Number.isFinite(spotterLat) && Number.isFinite(spotterLon)) {
            L.polyline(
              [[spotterLat, spotterLon], [lat, lon]],
              { color, weight: 1.5, opacity: 0.85 }
            ).addTo(layer);
          }
        });
        // 2) Callsign labels: band = fill, mode = small text behind callsign
        slice.forEach((s) => {
          const { color, fillColor } = spotColorByBand(s.freq);
          const modeStr = (s.mode && s.mode !== "—") ? s.mode : "";
          const lat = Number(s.lat);
          const lon = Number(s.lon);
          const icon = L.divIcon({
            className: "spot-label",
            html: `<span class="spot-label-text" style="background:${fillColor};border-color:${color}">` +
              `<span class="spot-label-call">${escapeHtml(s.dx)}</span>` +
              (modeStr ? `<span class="spot-label-mode">${escapeHtml(modeStr)}</span>` : "") +
              `</span>`,
            iconSize: [90, 26],
            iconAnchor: [45, 13]
          });
          const marker = L.marker([lat, lon], { icon }).addTo(layer);
          marker.bindPopup(popupHtml(s));
        });
      } catch (err) {
        console.warn("Failed to refresh spots:", err);
      }
    }

    // Listen filter changes from Spots.jsx
    const onFilter = (ev) => {
      currentFiltersRef.current = ev.detail || loadSavedFilters();
      refreshSpots();
    };
    window.addEventListener("spotsFilterChanged", onFilter);

    refreshSpots();
    const id = setInterval(refreshSpots, 15_000);

    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("spotsFilterChanged", onFilter);
    };
  }, []);

  // Satellites layer: fetch positions and draw markers (ISS + amateur sats)
  useEffect(() => {
    const map = mapRef.current;
    const layer = satellitesLayerRef.current;
    if (!map || !layer || !mapReady) return;
    if (!satellitesLayerOn) return;

    let alive = true;
    const markerMap = new Map();

    async function refreshSatellites() {
      try {
        const r = await fetch("/api/sat/positions");
        if (!r.ok) return;
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) return;
        const j = await r.json();
        if (!alive || !mapRef.current || !satellitesLayerRef.current) return;
        const positions = j.positions || [];

        layer.clearLayers();
        markerMap.clear();
        for (const p of positions) {
          if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
          const isISS = (p.id || "").toUpperCase() === "ISS";
          const color = isISS ? "#ffd43b" : "#4dabf7";
          const size = isISS ? 36 : 28;
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
            <rect x="9" y="8" width="6" height="8" rx="1" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
            <rect x="3" y="10" width="6" height="4" rx="0.5" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.6" opacity="0.95"/>
            <rect x="15" y="10" width="6" height="4" rx="0.5" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.6" opacity="0.95"/>
            <circle cx="12" cy="5" r="1.2" fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="0.5"/>
          </svg>`;
          const icon = L.divIcon({
            className: "satellite-marker-icon",
            html: `<span style="display:inline-block;line-height:0;">${svg}</span>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            pane: "satellitesPane"
          });
          const marker = L.marker([p.lat, p.lon], { icon, pane: "satellitesPane" }).addTo(layer);
          marker.on("click", (ev) => {
            L.DomEvent.stopPropagation(ev);
            setSelectedSatId(p.id);
          });
          marker.bindTooltip(p.id || p.name || "?", {
            permanent: false,
            direction: "top",
            offset: [0, -size / 2],
            opacity: 0.9
          });
          const altStr = p.altKm != null ? `${Number(p.altKm).toFixed(0)} km` : "—";
          const latLon = `${Number(p.lat).toFixed(2)}° ${Number(p.lon).toFixed(2)}°`;
          const nameLine = p.name && p.name !== (p.id || "") ? escapeHtml(p.name) : "";
          const popupHtml = `<div class="satellite-popup">
            <div class="satellite-popup-header">
              <strong class="satellite-popup-id">${escapeHtml(p.id || p.name || "?")}</strong>
              <span class="satellite-popup-alt">${altStr}</span>
            </div>
            ${nameLine ? `<div class="satellite-popup-name">${nameLine}</div>` : ""}
            <div class="satellite-popup-position">Position: ${latLon}</div>
          </div>`;
          marker.bindPopup(popupHtml, { closeButton: false });
          markerMap.set(p.id, marker);
        }
      } catch (err) {
        console.warn("Failed to refresh satellites:", err);
      }
    }

    refreshSatellites();
    const id = setInterval(refreshSatellites, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
      layer.clearLayers();
      markerMap.clear();
    };
  }, [satellitesLayerOn, mapReady]);

  // Satellite range + ground track when one is selected
  const selectedSatIdRef = useRef(null);
  selectedSatIdRef.current = selectedSatId;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const rangeLayer = satelliteRangeLayerRef.current;
    if (rangeLayer && map.hasLayer(rangeLayer)) {
      map.removeLayer(rangeLayer);
    }
    satelliteRangeLayerRef.current = null;

    if (!selectedSatId) return;

    const idToFetch = selectedSatId;
    let alive = true;

    fetch(`/api/sat/track?id=${encodeURIComponent(idToFetch)}&minutes=90`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        if (!alive || !mapRef.current || selectedSatIdRef.current !== idToFetch) return;
        const positions = data.positions || [];
        const radiusM = (data.footprintRadiusKm || 2000) * 1000;
        const center = positions[0];
        if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) return;

        const group = L.layerGroup();
        const circle = L.circle([center.lat, center.lon], {
          radius: radiusM,
          color: "rgba(0, 199, 199, 0.9)",
          fillColor: "rgba(0, 199, 199, 0.2)",
          fillOpacity: 1,
          weight: 2
        }).addTo(group);
        group.addTo(map);
        satelliteRangeLayerRef.current = group;
      })
      .catch((err) => console.warn("Sat track failed:", err));

    return () => {
      alive = false;
      const layer = satelliteRangeLayerRef.current;
      if (layer && mapRef.current && mapRef.current.hasLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
      satelliteRangeLayerRef.current = null;
    };
  }, [selectedSatId, mapReady]);

  // Radio horizon circles (from Range panel) – ground, mobile, base, each different color
  useEffect(() => {
    const map = mapRef.current;
    const layer = horizonLayerRef.current;
    if (layer && map && map.hasLayer(layer)) {
      map.removeLayer(layer);
      horizonLayerRef.current = null;
    }
    if (!horizonLayerOn || !radioHorizon || !map) return;
    const { center, ground, mobile, base } = radioHorizon;
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) return;
    const group = L.layerGroup();
    [
      { km: ground, key: "ground" },
      { km: mobile, key: "mobile" },
      { km: base, key: "base" }
    ].forEach(({ km, key }) => {
      if (!Number.isFinite(km) || km <= 0) return;
      const c = HORIZON_COLORS[key];
      const circle = L.circle([center.lat, center.lon], {
        radius: km * 1000,
        color: c.color,
        fillColor: c.fill,
        fillOpacity: 1,
        weight: 2
      });
      group.addLayer(circle);
    });
    if (group.getLayers().length > 0) {
      group.addTo(map);
      horizonLayerRef.current = group;
    }
    return () => {
      if (map && horizonLayerRef.current && map.hasLayer(horizonLayerRef.current)) {
        map.removeLayer(horizonLayerRef.current);
      }
      horizonLayerRef.current = null;
    };
  }, [horizonLayerOn, radioHorizon, mapReady]);

  // Space summary for propagation bar
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/space/summary");
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setSpaceSummary(j);
      } catch {}
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // PSK Reporter layer on map
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const r = await fetch("/api/pskreporter?filter=both&limit=80");
        if (!r.ok || !alive) return;
        const j = await r.json();
        const layer = pskLayerRef.current;
        if (!layer || !mapRef.current) return;
        layer.clearLayers();
        (j.reports || []).forEach((rep) => {
          if (!Number.isFinite(rep.lat) || !Number.isFinite(rep.lon)) return;
          const isHeardYou = rep.direction === "heard_you";
          const marker = L.circleMarker([rep.lat, rep.lon], {
            radius: 5,
            weight: 1,
            fillOpacity: 0.9,
            color: isHeardYou ? "#ae3ec9" : "#20c997",
            fillColor: isHeardYou ? "#ae3ec9" : "#20c997"
          }).addTo(layer);
          const label = rep.receiverCallsign && rep.senderCallsign
            ? (isHeardYou ? `${rep.receiverCallsign} heard you` : `You heard ${rep.senderCallsign}`)
            : (rep.receiverCallsign || rep.senderCallsign || "PSK");
          marker.bindPopup(
            `<div class="map-popup-content"><b>${escapeHtml(label)}</b><br/>${escapeHtml(rep.mode || "")} · ${escapeHtml(rep.band || "")}</div>`
          );
        });
      } catch (err) {
        console.warn("PSK layer:", err);
      }
    }
    refresh();
    const id = setInterval(refresh, 120_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  function goToGrid(grid) {
    const g = (grid || perspectiveGrid || "").trim().toUpperCase();
    if (!g) return;
    const center = gridCenter(g);
    if (center && mapRef.current) {
      mapRef.current.setView([center.lat, center.lon], 5);
    }
  }

  async function findMyGrid() {
    try {
      const r = await fetch("/api/qth");
      if (!r.ok) return;
      const q = await r.json();
      if (q.locator) {
        setPerspectiveGrid(q.locator);
        goToGrid(q.locator);
      }
    } catch {}
  }

  const sfi = spaceSummary?.solarFlux?.sfi;
  const aVal = spaceSummary?.aIndex;
  const aNum = typeof aVal === "object" && aVal != null ? aVal.a : aVal;
  const kVal = spaceSummary?.kp;
  const kNum = typeof kVal === "object" && kVal != null ? kVal.kp : kVal;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", gap: 0 }}>
      {/* HF Propagation bar (dxlook-style) */}
      <div
        className="hf-prop-bar"
        role="toolbar"
        aria-label="HF propagation and map perspective"
      >
        <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>HF PROPAGATION</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.7)" }}>View:</span>
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setMapView(opt)}
                aria-label={opt === "LUF" ? "View LUF / D-RAP layer" : `View ${opt}`}
                style={{
                  padding: "4px 8px",
                  minWidth: opt === "none" ? 36 : 32,
                  borderRadius: 6,
                  border: "1px solid " + (mapView === opt ? "rgba(77,171,247,0.8)" : "rgba(255,255,255,0.2)"),
                  background: mapView === opt ? "rgba(77,171,247,0.35)" : "rgba(255,255,255,0.08)",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: mapView === opt ? 700 : 400
                }}
              >
                {opt}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label htmlFor="map-perspective" style={{ color: "rgba(255,255,255,0.7)" }}>Perspective:</label>
            <input
              id="map-perspective"
              type="text"
              value={perspectiveGrid}
              onChange={(e) => setPerspectiveGrid(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goToGrid(perspectiveGrid)}
              placeholder="e.g. JO40"
              aria-label="Maidenhead grid to center map"
              style={{
                width: 72,
                padding: "4px 8px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 6,
                color: "white",
                fontSize: 12
              }}
            />
            <button
              type="button"
              onClick={() => goToGrid(perspectiveGrid)}
              aria-label="Center map on grid"
              style={{
                padding: "4px 10px",
                background: "rgba(77,171,247,0.4)",
                border: "1px solid rgba(77,171,247,0.6)",
                borderRadius: 6,
                color: "white",
                cursor: "pointer",
                fontSize: 12
              }}
            >
              Go
            </button>
            <button
              type="button"
              onClick={findMyGrid}
              aria-label="Center map on my QTH grid"
              style={{
                padding: "4px 10px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 6,
                color: "white",
                cursor: "pointer",
                fontSize: 12
              }}
            >
              Find My Grid
            </button>
            <button
              type="button"
              onClick={() => setSpotsLayerOn((on) => !on)}
              aria-label={spotsLayerOn ? "Hide DX Cluster / RBN layer" : "Show DX Cluster / RBN layer"}
              title={spotsLayerOn ? "Calls on – click to hide" : "Calls off – click to show"}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid " + (spotsLayerOn ? "rgba(77,171,247,0.8)" : "rgba(255,255,255,0.2)"),
                background: spotsLayerOn ? "rgba(77,171,247,0.35)" : "rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: spotsLayerOn ? 700 : 400
              }}
            >
              {spotsLayerOn ? "Calls ON" : "Calls OFF"}
            </button>
            <button
              type="button"
              onClick={() => setDxpeditionsLayerOn((on) => !on)}
              aria-label={dxpeditionsLayerOn ? "Hide DXpeditions layer" : "Show DXpeditions layer"}
              title={dxpeditionsLayerOn ? "DXpeditions on – click to hide" : "DXpeditions off – click to show"}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid " + (dxpeditionsLayerOn ? "rgba(81,207,102,0.8)" : "rgba(255,255,255,0.2)"),
                background: dxpeditionsLayerOn ? "rgba(81,207,102,0.35)" : "rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: dxpeditionsLayerOn ? 700 : 400
              }}
            >
              {dxpeditionsLayerOn ? "DXped ON" : "DXped OFF"}
            </button>
            <button
              type="button"
              onClick={() => setBeaconsLayerOn((on) => !on)}
              aria-label={beaconsLayerOn ? "Hide beacons" : "Show beacons"}
              title={beaconsLayerOn ? "Beacons ON – click to hide" : "Beacons OFF – click to show"}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid " + (beaconsLayerOn ? "rgba(12,166,120,0.8)" : "rgba(255,255,255,0.2)"),
                background: beaconsLayerOn ? "rgba(12,166,120,0.35)" : "rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: beaconsLayerOn ? 700 : 400
              }}
            >
              {beaconsLayerOn ? "Beacons ON" : "Beacons OFF"}
            </button>
            <button
              type="button"
              onClick={() => setSatellitesLayerOn((on) => !on)}
              aria-label={satellitesLayerOn ? "Hide satellites" : "Show satellites"}
              title={satellitesLayerOn ? "Satellites on – click to hide" : "Satellites off – click to show"}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid " + (satellitesLayerOn ? "rgba(255,212,59,0.8)" : "rgba(255,255,255,0.2)"),
                background: satellitesLayerOn ? "rgba(255,212,59,0.35)" : "rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: satellitesLayerOn ? 700 : 400
              }}
            >
              {satellitesLayerOn ? "Sats ON" : "Sats OFF"}
            </button>
            <button
              type="button"
              onClick={() => setRepeatersLayerOn((on) => !on)}
              aria-label={repeatersLayerOn ? "Repeater-Layer ausblenden" : "Repeater-Layer einblenden"}
              title={repeatersLayerOn ? "Repeater ON – Klick zum Ausblenden" : "Repeater OFF – Klick zum Einblenden"}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid " + (repeatersLayerOn ? "rgba(230,119,0,0.8)" : "rgba(255,255,255,0.2)"),
                background: repeatersLayerOn ? "rgba(230,119,0,0.35)" : "rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: repeatersLayerOn ? 700 : 400
              }}
            >
              {repeatersLayerOn ? "Repeater ON" : "Repeater OFF"}
            </button>
            <button
              type="button"
              onClick={() => setHorizonLayerOn((on) => !on)}
              aria-label={horizonLayerOn ? "Hide Range layer" : "Show Range layer"}
              title={horizonLayerOn ? "Range ON – click to hide" : "Range OFF – click to show"}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid " + (horizonLayerOn ? "rgba(77,171,247,0.8)" : "rgba(255,255,255,0.2)"),
                background: horizonLayerOn ? "rgba(77,171,247,0.35)" : "rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: horizonLayerOn ? 700 : 400
              }}
            >
              {horizonLayerOn ? "Range ON" : "Range OFF"}
            </button>
            {repeatersLayerOn && onRepeatersBandChange && (
              <>
                {REPEATER_BANDS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onRepeatersBandChange(key)}
                    aria-label={`Repeater-Band ${label}`}
                    title={`Nur ${label} Repeater anzeigen`}
                    aria-pressed={repeatersBandFilter === key}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid " + (repeatersBandFilter === key ? "rgba(230,119,0,0.9)" : "rgba(255,255,255,0.25)"),
                      background: repeatersBandFilter === key ? "rgba(230,119,0,0.4)" : "rgba(255,255,255,0.06)",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: repeatersBandFilter === key ? 700 : 400
                    }}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
            {pathTargetMarkerActive && (
            <button
              type="button"
              onClick={removePathTargetMarker}
              aria-label="Remove DX marker from map"
              title="Remove DX circle"
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(77,171,247,0.6)",
                background: "rgba(77,171,247,0.25)",
                color: "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600
              }}
            >
              Remove DX
            </button>
          )}
        </div>
      </div>
      </div>

      <div ref={mapWrapperRef} className="map-wrapper" style={{ flex: 1, minHeight: 0 }}>
        <div
          ref={elRef}
          className="map-container"
          style={{ borderRadius: "0 0 14px 14px" }}
          aria-label="Map"
        >
      {(spotsLayerOn || dxpeditionsLayerOn || satellitesLayerOn || repeatersLayerOn || horizonLayerOn) && (
        <>
          <div className="map-legend">
            {spotsLayerOn && (
              <div className="map-legend-box" style={{ border: "2px solid rgba(255,255,255,0.5)" }}>
                <div className="map-legend-title">Band (area)</div>
                <div className="map-legend-row">
                  {BAND_COLORS_LIST.map(({ band, color }) => (
                    <span key={band} className="map-legend-item">
                      <span className="map-legend-dot" style={{ background: color }} />
                      <span className="map-legend-label">{band}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {dxpeditionsLayerOn && (
              <div className="map-legend-box" style={{ border: "2px solid rgba(81,207,102,0.5)" }}>
                <div className="map-legend-title">DXpeditions</div>
                <div className="map-legend-row">
                  <span className="map-legend-item">
                    <span className="map-legend-dot map-legend-dot--circle" style={{ background: "#51cf66", borderColor: "#51cf66" }} />
                    <span className="map-legend-label">Active</span>
                  </span>
                  <span className="map-legend-item">
                    <span className="map-legend-dot map-legend-dot--circle" style={{ background: "#4dabf7", borderColor: "#4dabf7" }} />
                    <span className="map-legend-label">Upcoming</span>
                  </span>
                </div>
              </div>
            )}
            {repeatersLayerOn && (
              <div className="map-legend-box" style={{ border: "2px solid rgba(255,255,255,0.35)" }}>
                <div className="map-legend-title">Repeater (DE)</div>
                <div className="map-legend-row">
                  {REPEATER_BANDS.map(({ key, label }) => (
                    <span key={key} className="map-legend-item">
                      <span
                        className="map-legend-dot map-legend-dot--circle"
                        style={{
                          background: REPEATER_BAND_COLORS[key] || REPEATER_DEFAULT_COLOR,
                          borderColor: REPEATER_BAND_COLORS[key] || REPEATER_DEFAULT_COLOR
                        }}
                      />
                      <span className="map-legend-label">{label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {satellitesLayerOn && (
              <div className="map-legend-box" style={{ border: "2px solid rgba(255,212,59,0.5)" }}>
                <div className="map-legend-title">Satellites</div>
                <div className="map-legend-row">
                  <span className="map-legend-item">
                    <span className="map-legend-dot map-legend-dot--circle" style={{ background: "#ffd43b", borderColor: "#ffd43b" }} />
                    <span className="map-legend-label">ISS</span>
                  </span>
                  <span className="map-legend-item">
                    <span className="map-legend-dot map-legend-dot--circle" style={{ background: "#4dabf7", borderColor: "#4dabf7" }} />
                    <span className="map-legend-label">Amateur</span>
                  </span>
                </div>
              </div>
            )}
            {horizonLayerOn && radioHorizon && (
              <div className="map-legend-box" style={{ border: "2px solid rgba(77,171,247,0.6)" }}>
                <div className="map-legend-title">Range</div>
                <div className="map-legend-row">
                  {radioHorizon.ground != null && (
                    <span className="map-legend-item">
                      <span className="map-legend-dot map-legend-dot--circle" style={{ background: "rgba(230,119,0,0.6)", borderColor: "rgba(230,119,0,0.9)" }} />
                      <span className="map-legend-label">Ground {radioHorizon.ground.toFixed(1)} km</span>
                    </span>
                  )}
                  {radioHorizon.mobile != null && (
                    <span className="map-legend-item">
                      <span className="map-legend-dot map-legend-dot--circle" style={{ background: "rgba(77,171,247,0.6)", borderColor: "rgba(77,171,247,0.9)" }} />
                      <span className="map-legend-label">Mobile {radioHorizon.mobile.toFixed(1)} km</span>
                    </span>
                  )}
                  {radioHorizon.base != null && (
                    <span className="map-legend-item">
                      <span className="map-legend-dot map-legend-dot--circle" style={{ background: "rgba(55,178,77,0.6)", borderColor: "rgba(55,178,77,0.9)" }} />
                      <span className="map-legend-label">Base {radioHorizon.base.toFixed(1)} km</span>
                    </span>
                  )}
                </div>
              </div>
            )}
            {beaconsLayerOn && (
              <div className="map-legend-box" style={{ border: "2px solid rgba(12,166,120,0.5)" }}>
                <div className="map-legend-title">Beacon (now)</div>
                <div className="map-legend-row">
                  {beaconStatus?.current ? (
                    <>
                      <span className="map-legend-item">
                        <span className="map-legend-label" style={{ fontWeight: 700 }}>{beaconStatus.current.beacon}</span>
                      </span>
                      <span className="map-legend-item">
                        <span className="map-legend-label">{beaconStatus.current.frequency} MHz</span>
                      </span>
                      {typeof beaconStatus.nextChangeInSec === "number" && (
                        <span className="map-legend-item">
                          <span className="map-legend-label">next in {beaconStatus.nextChangeInSec} s</span>
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="map-legend-label">—</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Legend when View is MUF, LUF, or a band */}
      {(mapView === "MUF" || mapView === "LUF" || (mapView !== "none" && mapView !== "MUF" && mapView !== "LUF" && VIEW_OPTIONS.includes(mapView))) && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.7)",
            color: "white",
            fontSize: 11,
            pointerEvents: "none",
            zIndex: 700,
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}
        >
          {mapView === "MUF" && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4, color: "rgba(255,255,255,0.95)" }}>MUF (est.)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 80,
                    height: 10,
                    borderRadius: 4,
                    background: `linear-gradient(to right, ${mufColor(0)}, ${mufColor(17.5)}, ${mufColor(35)})`
                  }}
                />
                <span style={{ color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>0 – 35 MHz</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, color: "rgba(255,255,255,0.6)", fontSize: 10 }}>
                <span>low</span>
                <span>high (open)</span>
              </div>
            </div>
          )}
          {mapView !== "none" && mapView !== "MUF" && mapView !== "LUF" && VIEW_OPTIONS.includes(mapView) && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 2, color: "rgba(255,255,255,0.95)" }}>Band {mapView} MHz</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>
                {bandGridSource === "spots"
                  ? "DXC/RBN spots (last 15 min) – real activity"
                  : "MUF from QTH (path midpoint) – no recent spots"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: BAND_STATUS_COLOR.open }} />
                  <span>Open</span>
                </span>
                {bandGridSource !== "spots" && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: BAND_STATUS_COLOR.marginal }} />
                    <span>Marginal</span>
                  </span>
                )}
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: BAND_STATUS_COLOR.closed }} />
                  <span>Closed</span>
                </span>
              </div>
            </div>
          )}
          {mapView === "LUF" && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4, color: "rgba(255,255,255,0.95)" }}>LUF / D-RAP</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 80,
                    height: 10,
                    borderRadius: 4,
                    background: `linear-gradient(to right, ${lufColor(0)}, ${lufColor(5)}, ${lufColor(10)})`
                  }}
                />
                <span style={{ color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>0 – 10 MHz</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, color: "rgba(255,255,255,0.6)", fontSize: 10 }}>
                <span>low absorption</span>
                <span>high absorption</span>
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
