export function buildSpotQuery(filters) {
  const { band, mode, spottedMe, reachable, src } = filters || {};
  const p = new URLSearchParams();
  if (band && band !== "ALL") p.set("band", band);
  if (mode && mode !== "ALL") p.set("mode", mode);
  if (spottedMe) p.set("spottedMe", "1");
  if (reachable) p.set("reachable", "1");
  if (src && src !== "all") p.set("src", src);
  p.set("limit", "120");
  return `/api/spots?${p.toString()}`;
}

