export function buildSpotQuery(filters) {
  const { band, mode } = filters || {};
  const p = new URLSearchParams();
  if (band && band !== "ALL") p.set("band", band);
  if (mode && mode !== "ALL") p.set("mode", mode);
  p.set("limit", "120");
  return `/api/spots?${p.toString()}`;
}

