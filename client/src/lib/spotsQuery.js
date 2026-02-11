export function buildSpotQuery(filters) {
  const { band, mode, spottedMe } = filters || {};
  const p = new URLSearchParams();
  if (band && band !== "ALL") p.set("band", band);
  if (mode && mode !== "ALL") p.set("mode", mode);
  if (spottedMe) p.set("spottedMe", "1");
  p.set("limit", "120");
  return `/api/spots?${p.toString()}`;
}

