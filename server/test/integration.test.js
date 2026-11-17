/**
 * Integration / regression tests for Hamshack Dashboard API.
 * Run from repo root: node --test server/test/integration.test.js
 * Or: npm run test (in server or root)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { app } from "../index.js";

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve, reject) => {
    const s = app.listen(0, (err) => (err ? reject(err) : resolve(s)));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (server) server.close();
  // Allow process to exit despite server timers (beacons, spots, etc.)
  setTimeout(() => process.exit(0), 100);
});

async function fetchJson(path, options = {}) {
  const r = await fetch(`${baseUrl}${path}`, options);
  const text = await r.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: r.status, ok: r.ok, body };
}

describe("API regression and integration", () => {
  it("GET /api/health returns 200 and { ok: true }", async () => {
    const { status, body } = await fetchJson("/api/health");
    assert.strictEqual(status, 200);
    assert.strictEqual(body?.ok, true);
  });

  it("GET /api/config returns config with callsign and locator", async () => {
    const { status, body } = await fetchJson("/api/config");
    assert.strictEqual(status, 200);
    assert(typeof body?.callsign === "string");
    assert(typeof body?.locator === "string");
  });

  it("GET /api/beacons returns beacons array and frequencies", async () => {
    const { status, body } = await fetchJson("/api/beacons");
    assert.strictEqual(status, 200);
    assert(Array.isArray(body?.beacons));
    assert(Array.isArray(body?.frequencies));
  });

  it("GET /api/beacons/status returns current beacon and nextChangeInSec", async () => {
    const { status, body } = await fetchJson("/api/beacons/status");
    assert.strictEqual(status, 200);
    assert(body?.current && typeof body.current.beacon === "string");
    assert(typeof body?.nextChangeInSec === "number");
  });

  it("GET /api/spots returns spots array and updated", async () => {
    const { status, body } = await fetchJson("/api/spots?limit=5");
    assert.strictEqual(status, 200);
    assert(Array.isArray(body?.spots));
    assert(body?.updated != null);
  });

  it("GET /api/spots with spottedMe=1 returns array", async () => {
    const { status, body } = await fetchJson("/api/spots?spottedMe=1&limit=5");
    assert.strictEqual(status, 200);
    assert(Array.isArray(body?.spots));
  });

  it("GET /api/repeaters returns items array", async () => {
    const { status, body } = await fetchJson("/api/repeaters");
    assert.strictEqual(status, 200);
    assert(Array.isArray(body?.items));
  });

  it("GET /api/sun returns locator and today/tomorrow", async () => {
    const { status, body } = await fetchJson("/api/sun");
    assert.strictEqual(status, 200);
    assert(body?.locator != null);
    assert(body?.today != null);
  });

  it("GET /api/propagation returns mufMHz and bands", async () => {
    const { status, body } = await fetchJson("/api/propagation");
    if (status === 400 && body?.error === "Invalid QTH locator") {
      assert.ok(true, "propagation requires valid locator in config");
      return;
    }
    assert.strictEqual(status, 200);
    assert(body?.bands == null || Array.isArray(body.bands));
  });

  it("GET /api/propagation/path with toLat/toLon returns path data", async () => {
    const { status, body } = await fetchJson("/api/propagation/path?toLat=50&toLon=8");
    if (status === 400 && body?.error === "Invalid QTH locator") {
      assert.ok(true, "path requires valid locator");
      return;
    }
    assert.strictEqual(status, 200);
    assert(typeof body?.distanceKm === "number");
    assert(typeof body?.lineOfSightClear === "boolean");
  });

  it("GET /api/sat/list returns items array", async () => {
    const { status, body } = await fetchJson("/api/sat/list");
    assert.strictEqual(status, 200);
    assert(Array.isArray(body?.items));
  });

  it("GET /api/sat/positions returns positions array", async () => {
    const { status, body } = await fetchJson("/api/sat/positions?ids=ISS");
    assert.strictEqual(status, 200);
    assert(Array.isArray(body?.positions));
  });

  it("GET /api/sat/passes returns passes for observer", async () => {
    const { status, body } = await fetchJson("/api/sat/passes?ids=ISS&hours=24");
    if (status === 400 && body?.error) return;
    assert.strictEqual(status, 200);
    assert(body?.passes != null);
  });

  it("GET /api/contests returns items array", async () => {
    const { status, body } = await fetchJson("/api/contests");
    assert.strictEqual(status, 200);
    assert(Array.isArray(body?.items));
  });

  it("GET /api/dxpeditions returns items array", async () => {
    const { status, body } = await fetchJson("/api/dxpeditions");
    assert.strictEqual(status, 200);
    assert(Array.isArray(body?.items));
  });
});

describe("Contest calendar (WA7BNM) description parser", async () => {
  const { parseWa7bnmSessions, pickContestSession } = await import("../index.js");
  const now = Date.UTC(2026, 10, 17, 8, 0); // 17 Nov 2026 08:00Z

  it("parses a same-day session", () => {
    const s = parseWa7bnmSessions("0200Z-0330Z, Nov 18", now);
    assert.equal(s.length, 1);
    assert.equal(s[0].start.toISOString(), "2026-11-18T02:00:00.000Z");
    assert.equal(s[0].end.toISOString(), "2026-11-18T03:30:00.000Z");
  });

  it("parses a multi-day session and 2400Z", () => {
    const [a] = parseWa7bnmSessions("1200Z, Nov 21 to 2400Z, Nov 22", now);
    assert.equal(a.start.toISOString(), "2026-11-21T12:00:00.000Z");
    assert.equal(a.end.toISOString(), "2026-11-23T00:00:00.000Z");
  });

  it("picks the running or next session of a multi-session contest", () => {
    const desc = "2300Z, Nov 14 to 0300Z, Nov 16 and 2300Z, Nov 21 to 0300Z, Nov 23";
    const sessions = parseWa7bnmSessions(desc, now);
    assert.equal(sessions.length, 2);
    assert.equal(pickContestSession(sessions, now).start.toISOString(), "2026-11-21T23:00:00.000Z");
    const running = pickContestSession(parseWa7bnmSessions("1400Z, Nov 15 to 0800Z, Nov 16 and 1400Z, Nov 17 to 0800Z, Nov 18", now), Date.UTC(2026, 10, 17, 20, 0));
    assert.equal(running.start.toISOString(), "2026-11-17T14:00:00.000Z");
  });

  it("handles the year rollover (December view of January contests)", () => {
    const [s] = parseWa7bnmSessions("1800Z-2000Z, Jan 3", Date.UTC(2026, 11, 28));
    assert.equal(s.start.getUTCFullYear(), 2027);
  });

  it("returns no sessions for unknown text", () => {
    assert.deepEqual(parseWa7bnmSessions("see website", now), []);
  });

  it("GET /api/contests uses description times, not the feed pubDate", async () => {
    const { status, body } = await fetchJson("/api/contests");
    assert.equal(status, 200);
    const starts = new Set((body.items || []).map((c) => c.startTime));
    if ((body.items || []).length > 3) assert.ok(starts.size > 1, "all contests share one start time");
  });
});

describe("Map tiles", async () => {
  const { resolveMapTiles } = await import("../index.js");
  const SYNTHETIC_KEY = "SYNTHETIC123";

  it("falls back to OpenStreetMap without tile variables", () => {
    const tiles = resolveMapTiles({});
    assert.equal(tiles.provider, "osm");
    assert.equal(tiles.upstream, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    assert.match(tiles.attribution, /OpenStreetMap<\/a> contributors/);
    assert.match(tiles.attribution, /openstreetmap\.org\/copyright/);
  });

  it("ignores empty or blank values", () => {
    assert.equal(resolveMapTiles({ CARTO_API_KEY: "", MAP_TILE_URL: "  " }).provider, "osm");
  });

  it("uses CARTO with the key in the upstream URL and CARTO attribution", () => {
    const tiles = resolveMapTiles({ CARTO_API_KEY: SYNTHETIC_KEY });
    assert.equal(tiles.provider, "carto");
    assert.equal(tiles.upstream, `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${SYNTHETIC_KEY}`);
    assert.match(tiles.attribution, /OpenStreetMap<\/a> contributors/);
    assert.match(tiles.attribution, /CARTO/);
    assert.ok(!tiles.attribution.includes(SYNTHETIC_KEY));
  });

  it("prefers MAP_TILE_URL over CARTO_API_KEY", () => {
    const url = "https://tiles.example.com/{z}/{x}/{y}.png?key=abc";
    const tiles = resolveMapTiles({ MAP_TILE_URL: url, CARTO_API_KEY: SYNTHETIC_KEY, MAP_TILE_ATTRIBUTION: "&copy; Example" });
    assert.equal(tiles.provider, "custom");
    assert.equal(tiles.upstream, url);
    assert.equal(tiles.attribution, "&copy; Example");
  });

  it("uses OpenStreetMap attribution for MAP_TILE_URL without MAP_TILE_ATTRIBUTION", () => {
    const tiles = resolveMapTiles({ MAP_TILE_URL: "https://tiles.example.com/{z}/{x}/{y}.png" });
    assert.equal(tiles.provider, "custom");
    assert.match(tiles.attribution, /OpenStreetMap<\/a> contributors/);
  });

  it("ignores MAP_TILE_ATTRIBUTION without MAP_TILE_URL", () => {
    assert.match(resolveMapTiles({ MAP_TILE_ATTRIBUTION: "&copy; Example" }).attribution, /OpenStreetMap/);
  });

  it("falls back when MAP_TILE_URL lacks placeholders", () => {
    assert.equal(resolveMapTiles({ MAP_TILE_URL: "https://tiles.example.com/tile.png" }).provider, "osm");
    assert.equal(resolveMapTiles({ MAP_TILE_URL: "https://tiles.example.com/{z}/{x}.png", CARTO_API_KEY: SYNTHETIC_KEY }).provider, "carto");
  });

  it("GET /api/config exposes provider and attribution but no tile URL or key", async () => {
    const r = await fetch(`${baseUrl}/api/config`);
    const text = await r.text();
    const { mapTiles } = JSON.parse(text);
    assert.ok(["osm", "carto", "custom"].includes(mapTiles?.provider), "mapTiles.provider missing or unknown");
    assert.ok(typeof mapTiles?.attribution === "string" && mapTiles.attribution.length > 0, "mapTiles.attribution missing");
    assert.ok(!("upstream" in mapTiles), "mapTiles exposes the upstream URL");
    // assert.ok only: a failing match must not print the response (it could contain a key)
    assert.ok(!text.includes("key="), "config response contains a key parameter");
    assert.ok(!text.includes("cartocdn"), "config response contains the CARTO tile host");
    assert.ok(!text.includes("tile.openstreetmap"), "config response contains the OSM tile host");
  });

  it("GET /api/tiles rejects invalid tile coordinates", async () => {
    for (const path of ["/api/tiles/2/4/0.png", "/api/tiles/2/0/4.png", "/api/tiles/20/0/0.png", "/api/tiles/a/0/0.png", "/api/tiles/1/-1/0.png"]) {
      const { status, body } = await fetchJson(path);
      assert.equal(status, 400, path);
      assert.equal(body?.error, "invalid_tile", path);
    }
  });
});

describe("Map tile proxy errors", async () => {
  const { spawn } = await import("node:child_process");
  const net = await import("node:net");
  const os = await import("node:os");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const SYNTHETIC_KEY = "SYNTHETIC123";

  async function freePort() {
    const probe = net.createServer();
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const { port } = probe.address();
    await new Promise((resolve) => probe.close(resolve));
    return port;
  }

  async function waitFor(condition, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // MAP_TILES is resolved at module load, so the failing upstream needs its own server process
  it("answers 502 without the upstream URL or key in body or log", async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [fileURLToPath(new URL("../index.js", import.meta.url))], {
      env: {
        ...process.env,
        PORT: String(port),
        MAP_TILE_URL: `http://127.0.0.1:9/{z}/{x}/{y}.png?key=${SYNTHETIC_KEY}`,
        HAMSHACK_CONFIG_PATH: path.join(os.tmpdir(), "hamshack-tile-test-missing-config.json"),
        DXCLUSTER_HOST: "127.0.0.1",
        DXCLUSTER_PORT: "9",
        RBN_HOST: "127.0.0.1",
        RBN_PORT: "9"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let log = "";
    child.stdout.on("data", (chunk) => (log += chunk));
    child.stderr.on("data", (chunk) => (log += chunk));
    try {
      await waitFor(() => log.includes("Server running"), 15_000);
      assert.ok(log.includes("Map tiles: custom"), "test server did not pick up MAP_TILE_URL");
      const r = await fetch(`http://127.0.0.1:${port}/api/tiles/2/2/1.png`);
      const body = await r.text();
      assert.equal(r.status, 502);
      assert.equal(JSON.parse(body).error, "tile_fetch_failed");
      await new Promise((resolve) => setTimeout(resolve, 200));
      // assert.ok only: a failing match must not print the log or body
      assert.ok(!body.includes(SYNTHETIC_KEY), "tile error response contains the key");
      assert.ok(!log.includes(SYNTHETIC_KEY), "server log contains the key");
      assert.ok(!log.includes("127.0.0.1:9/"), "server log contains the upstream tile URL");
    } finally {
      child.kill();
    }
  });
});
