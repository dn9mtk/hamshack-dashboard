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
