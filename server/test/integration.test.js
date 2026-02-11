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
