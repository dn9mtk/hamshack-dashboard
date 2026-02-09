// client/src/lib/terminator.js
function toRad(d) { return (d * Math.PI) / 180; }
function toDeg(r) { return (r * 180) / Math.PI; }

function sunApprox(date) {
  const ms = date.getTime();
  const days = ms / 86400000.0 + 2440587.5 - 2451545.0;

  const g = toRad((357.529 + 0.98560028 * days) % 360);
  const q = toRad((280.459 + 0.98564736 * days) % 360);
  const L = q + toRad(1.915) * Math.sin(g) + toRad(0.020) * Math.sin(2 * g);

  const e = toRad(23.439 - 0.00000036 * days);
  const dec = Math.asin(Math.sin(e) * Math.sin(L));

  const jd = days + 2451545.0;
  const T = (jd - 2451545.0) / 36525.0;
  let GMST =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000.0;

  GMST = ((GMST % 360) + 360) % 360;

  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  let subLon = toDeg(ra) - GMST;
  subLon = ((subLon + 540) % 360) - 180;

  return { dec, subLon };
}

function wrapLon(lon) {
  let x = ((lon + 180) % 360 + 360) % 360 - 180;
  if (x === 180) x = -180;
  return x;
}

function splitAtWrap(points) {
  const segs = [];
  let seg = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (seg.length) {
      const prev = seg[seg.length - 1];
      if (Math.abs(p[1] - prev[1]) > 30) {
        segs.push(seg);
        seg = [];
      }
    }
    seg.push(p);
  }
  if (seg.length) segs.push(seg);
  return segs;
}

function isNightAt(latDeg, lonDeg, date) {
  const { dec, subLon } = sunApprox(date);
  const lat = toRad(latDeg);
  const H = toRad(wrapLon(lonDeg - subLon));
  const cosZ = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  return cosZ < 0;
}

export function terminatorSegments(date = new Date(), stepDeg = 1) {
  const { dec, subLon } = sunApprox(date);
  const tanDec = Math.tan(dec);
  const eps = 1e-6;

  const pts = [];
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    const H = toRad(lon - subLon);
    let latRad;
    if (Math.abs(tanDec) < eps) latRad = 0;
    else latRad = Math.atan(-Math.cos(H) / tanDec);
    pts.push([toDeg(latRad), wrapLon(lon)]);
  }
  return splitAtWrap(pts);
}

export function nightPolygons(date = new Date(), stepDeg = 1) {
  const { dec, subLon } = sunApprox(date);
  const tanDec = Math.tan(dec);
  const eps = 1e-6;

  const line = [];
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    const H = toRad(lon - subLon);
    let latRad;
    if (Math.abs(tanDec) < eps) latRad = 0;
    else latRad = Math.atan(-Math.cos(H) / tanDec);
    line.push([toDeg(latRad), wrapLon(lon)]);
  }

  const northIsNight = isNightAt(80, 0, date);
  const poleLat = northIsNight ? 90 : -90;

  // Split at dateline wrap so Leaflet doesn't draw a diagonal "triangle" across the map.
  const segs = splitAtWrap(line);
  return segs.map((seg) => {
    const startLon = seg[0][1];
    const endLon = seg[seg.length - 1][1];
    return [...seg, [poleLat, endLon], [poleLat, startLon]];
  });
}

// Back-compat: previously returned a single ring. Keep export but prefer nightPolygons().
export function nightPolygon(date = new Date(), stepDeg = 1) {
  const polys = nightPolygons(date, stepDeg);
  // Return the first ring to preserve historical behavior (not ideal for wrap cases).
  return polys[0] || [];
}
