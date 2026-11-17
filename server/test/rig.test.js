/**
 * Rig control tests against a fake rigctld on a random loopback port.
 * No test opens a serial device or talks to a real rigctld.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { startFakeRigctld } from "./support/fakeRigctld.js";
import { resolveLicenceClass, validateFrequency } from "../rig/bands.js";
import { MODE_LABELS, hamlibModeForLabel, labelForHamlibMode } from "../rig/modes.js";
import * as rigctld from "../rig/rigctld.js";
import { createRigService, registerRigRoutes } from "../rig/service.js";
import { LAUNCH_AGENT_DEFAULTS, buildRigctldLaunchAgent } from "../rig/launchAgent.js";

const { RigctldClient, isAllowedCommand, writeAllowedCommand } = rigctld;
const RIG_DIR = fileURLToPath(new URL("../rig/", import.meta.url));
const SERVER_DIR = fileURLToPath(new URL("../", import.meta.url));
const LAUNCH_AGENT_SCRIPT = fileURLToPath(new URL("../scripts/rigctldLaunchAgent.js", import.meta.url));
const READ_COMMANDS = ["+\\get_freq", "+\\get_mode", "+\\get_ptt", "+\\get_level STRENGTH"];
const SYNTHETIC_DEVICE = "/dev/cu.usbserial-ABCD12340";
const RIG_VERBS = ["get_freq", "get_mode", "get_ptt", "get_level", "set_freq", "set_mode"];
// FT-991A quirks: set_freq into another band recalls that band's mode, set_mode shifts the frequency
const BAND_STACK_MODES = [
  { lowHz: 144_000_000, highHz: 146_000_000, mode: "CW" },
  { lowHz: 430_000_000, highHz: 440_000_000, mode: "USB" }
];
const FT991A_QUIRKS = { bandStackModes: BAND_STACK_MODES, modeChangeOffsetHz: 700 };

const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function captureLog() {
  const lines = [];
  return { lines, log: (m) => lines.push(String(m)), warn: (m) => lines.push(String(m)) };
}

async function waitFor(condition, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fake rigctld + rig service + Express app with the rig routes. */
async function startRig({ env = {}, state = {}, interestWindowMs, fakeRunning = true } = {}) {
  const fake = await startFakeRigctld({ state });
  cleanups.push(() => fake.stop());
  if (!fakeRunning) await fake.stop();
  const logger = captureLog();
  const service = createRigService({
    env: { RIGCTLD_ENABLED: "true", RIGCTLD_PORT: String(fake.port), RIG_POLL_MS: "500", ...env },
    log: logger,
    interestWindowMs
  });
  cleanups.push(() => service.close());
  const app = express();
  app.use(express.json());
  registerRigRoutes(app, service);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  cleanups.push(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function getRig() {
    return (await fetch(`${baseUrl}/api/rig`)).json();
  }
  async function post(route, body, headers = { "Content-Type": "application/json" }) {
    const r = await fetch(`${baseUrl}${route}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  async function waitLive(timeoutMs = 2000) {
    return waitFor(async () => {
      const status = await getRig();
      return status.connected ? status : null;
    }, timeoutMs, "rig did not report connected");
  }
  const isWrite = (line) => /^\+\\set_/.test(line);
  const writes = () => fake.received.filter(isWrite);
  /** Run `action` and return its result with the writes the fake received meanwhile. */
  async function writesDuring(action) {
    const start = fake.received.length;
    const result = await action();
    return { result, writes: fake.received.slice(start).filter(isWrite) };
  }
  return { fake, service, logger, baseUrl, getRig, post, waitLive, writes, writesDuring };
}

describe("Licence class band table", () => {
  it("defaults to class N", () => {
    assert.equal(resolveLicenceClass(undefined), "N");
    assert.equal(resolveLicenceClass(""), "N");
  });

  it("class N allows 10 m, 2 m and 70 cm only", () => {
    for (const hz of [28_000_000, 28_074_000, 29_700_000, 144_000_000, 145_500_000, 146_000_000, 430_000_000, 439_975_000, 440_000_000]) {
      assert.ok(validateFrequency(hz, "N").ok, `${hz} should be allowed`);
    }
    for (const hz of [1_840_000, 3_573_000, 7_074_000, 14_074_000, 21_074_000, 27_999_999, 29_700_001, 50_313_000, 70_200_000, 146_000_001, 440_000_001]) {
      assert.equal(validateFrequency(hz, "N").ok, false, `${hz} should be refused`);
    }
  });

  it("explains an out-of-band frequency", () => {
    assert.equal(
      validateFrequency(14_074_000, "N").message,
      "14.074 MHz is outside the bands allowed for licence class N. Nothing was sent to the rig."
    );
  });

  it("class E adds 160 m, 80 m and 15 m", () => {
    for (const hz of [1_840_000, 3_573_000, 21_074_000, 28_074_000, 145_500_000, 433_500_000]) assert.ok(validateFrequency(hz, "E").ok, String(hz));
    for (const hz of [7_074_000, 14_074_000, 50_313_000]) assert.equal(validateFrequency(hz, "E").ok, false, String(hz));
  });

  it("class A allows the HF bands, 6 m, 2 m and 70 cm but not 4 m", () => {
    for (const hz of [136_000, 475_000, 5_357_000, 7_074_000, 10_136_000, 14_074_000, 18_100_000, 24_915_000, 50_313_000]) {
      assert.ok(validateFrequency(hz, "A").ok, String(hz));
    }
    for (const hz of [70_200_000, 52_000_001, 3_900_000]) assert.equal(validateFrequency(hz, "A").ok, false, String(hz));
  });

  it("falls back to class N with one warning for an unknown class", () => {
    const warnings = [];
    assert.equal(resolveLicenceClass("x", (m) => warnings.push(m)), "N");
    assert.equal(warnings.length, 1);
    assert.equal(resolveLicenceClass("a"), "A");
  });

  it("refuses frequencies that are not whole positive numbers", () => {
    for (const value of ["28074000", 28_074_000.5, -28_074_000, 0, null, undefined, Number.NaN, {}]) {
      assert.equal(validateFrequency(value, "N").ok, false, String(value));
    }
  });
});

describe("Mode mapping", () => {
  it("maps every dashboard label to a hamlib token and back", () => {
    for (const label of MODE_LABELS) {
      const token = hamlibModeForLabel(label);
      assert.ok(token, label);
      assert.equal(labelForHamlibMode(token), label);
    }
    assert.equal(hamlibModeForLabel("CW-L"), "CWR");
    assert.equal(hamlibModeForLabel("DATA-U"), "PKTUSB");
  });

  it("reads FM-D back as DATA-FM and rejects unknown labels", () => {
    assert.equal(labelForHamlibMode("FM-D"), "DATA-FM");
    assert.equal(hamlibModeForLabel("usb"), null);
    assert.equal(hamlibModeForLabel("PKTUSB"), null);
  });
});

describe("Command allowlist: the dashboard cannot transmit", () => {
  const allowed = [...READ_COMMANDS, "+\\set_freq 28074000", "+\\set_freq 430000000", "+\\set_mode PKTUSB -1", "+\\set_mode C4FM -1"];
  const refused = [
    "+\\set_ptt 1",
    "\\set_ptt 1",
    "T 1",
    "+T 1",
    "+\\set_powerstat 1",
    "+\\send_morse CQ",
    "+\\send_cmd TX1;",
    "w TX1;",
    "W TX1; 0",
    "+\\set_func TUNER 1",
    "+\\vfo_op TUNE",
    "+\\set_level RFPOWER 1",
    "+\\set_conf ptt_type RIG",
    "+\\get_level RFPOWER",
    "+\\set_freq 28074000\n+\\set_ptt 1",
    "+\\set_freq 28074000\r",
    "+\\set_mode USB -1\u0000",
    "+\\set_mode BOGUS -1",
    "+\\set_mode USB 2400",
    "+\\set_freq 0",
    "+\\set_freq -1",
    "+\\set_freq 28.074",
    "+\\get_freq ",
    " +\\get_freq",
    "",
    null
  ];

  it("accepts exactly the read commands, set_freq and set_mode", () => {
    for (const line of allowed) assert.ok(isAllowedCommand(line), line);
  });

  it("refuses everything else before anything is written to the socket", () => {
    const written = [];
    const socket = { write: (data) => written.push(data) };
    for (const line of refused) {
      assert.throws(() => writeAllowedCommand(socket, line), { code: "rig_refused" }, JSON.stringify(line));
    }
    assert.deepEqual(written, []);
    writeAllowedCommand(socket, "+\\get_ptt");
    assert.deepEqual(written, ["+\\get_ptt\n"]);
  });

  it("offers no export that could build a transmit, power or raw command", () => {
    assert.deepEqual(Object.keys(rigctld).sort(), ["RigError", "RigctldClient", "isAllowedCommand", "writeAllowedCommand"]);
    const forbidden = ["set_ptt", "set_powerstat", "send_morse", "send_cmd", "set_func", "vfo_op", "set_level", "set_conf", "set_vfo", "\\T", "\\w", "\\W"];
    for (const file of fs.readdirSync(RIG_DIR)) {
      const source = fs.readFileSync(path.join(RIG_DIR, file), "utf8");
      for (const word of forbidden) assert.ok(!source.includes(word), `${file} mentions ${word}`);
    }
  });
});

describe("Rig control off by default", () => {
  it("is disabled without RIGCTLD_ENABLED and never connects", async () => {
    const fake = await startFakeRigctld();
    cleanups.push(() => fake.stop());
    const service = createRigService({ env: { RIGCTLD_PORT: String(fake.port) }, log: captureLog() });
    cleanups.push(() => service.close());
    service.noteInterest();
    assert.equal(service.enabled, false);
    assert.equal(service.getStatus().enabled, false);
    await assert.rejects(service.setFrequency(28_074_000), { code: "rig_disabled" });
    await assert.rejects(service.tune({ freqHz: 28_074_000, mode: "USB" }), { code: "rig_disabled" });
    await sleep(600);
    assert.equal(fake.connections, 0);
  });

  it("refuses a non-loopback RIGCTLD_HOST with one log line", async () => {
    const logger = captureLog();
    const service = createRigService({ env: { RIGCTLD_ENABLED: "true", RIGCTLD_HOST: "192.0.2.10" }, log: logger });
    assert.equal(service.enabled, false);
    assert.equal(logger.lines.length, 1);
    assert.match(logger.lines[0], /loopback/);
  });

  it("accepts loopback hosts", () => {
    for (const host of ["127.0.0.1", "::1", "localhost"]) {
      const service = createRigService({ env: { RIGCTLD_ENABLED: "true", RIGCTLD_HOST: host, RIGCTLD_PORT: "14532" }, log: captureLog() });
      assert.equal(service.enabled, true, host);
      service.close();
    }
  });
});

describe("Live rig state", () => {
  it("reports frequency, mode, PTT and S-meter within 2 s", async () => {
    const rig = await startRig({ state: { freqHz: 145_500_000, mode: "FM", strength: -6 } });
    const status = await rig.waitLive(2000);
    assert.equal(status.freqHz, 145_500_000);
    assert.equal(status.mode, "FM");
    assert.equal(status.tx, false);
    assert.equal(status.sMeterDb, -6);
    assert.equal(status.licenceClass, "N");
    assert.deepEqual(status.bands.map((b) => b.name), ["10 m", "2 m", "70 cm"]);
    assert.deepEqual(status.modes, MODE_LABELS);

    rig.fake.state.freqHz = 28_074_000;
    rig.fake.state.mode = "PKTUSB";
    await waitFor(async () => {
      const s = await rig.getRig();
      return s.freqHz === 28_074_000 && s.mode === "DATA-U";
    }, 2000, "change on the rig not reported");
  });

  it("uses one connection and only read commands while polling", async () => {
    const rig = await startRig();
    await rig.waitLive();
    await sleep(1200);
    await rig.getRig();
    assert.equal(rig.fake.connections, 1);
    assert.ok(rig.fake.received.length >= 8, "expected several polls");
    for (const line of rig.fake.received) assert.ok(READ_COMMANDS.includes(line), line);
  });

  it("stops polling when nobody asked for the state within the interest window", async () => {
    const rig = await startRig({ interestWindowMs: 300 });
    await rig.waitLive();
    await sleep(1200);
    const count = rig.fake.received.length;
    await sleep(1200);
    assert.equal(rig.fake.received.length, count);
    await rig.getRig();
    await waitFor(() => rig.fake.received.length > count, 1000, "polling did not resume");
  });

  it("never polls before the first GET /api/rig", async () => {
    const rig = await startRig();
    await sleep(700);
    assert.equal(rig.fake.connections, 0);
  });
});

describe("Set frequency", () => {
  it("tunes after a fresh PTT check", async () => {
    const rig = await startRig();
    await rig.waitLive();
    const { status, body } = await rig.post("/api/rig/freq", { freqHz: 28_074_000 });
    assert.equal(status, 200);
    assert.equal(body.freqHz, 28_074_000);
    assert.equal(rig.fake.state.freqHz, 28_074_000);
    const i = rig.fake.received.indexOf("+\\set_freq 28074000");
    assert.ok(i > 0);
    assert.equal(rig.fake.received[i - 1], "+\\get_ptt");
  });

  it("answers 400 and sends nothing for out-of-band or malformed values", async () => {
    const rig = await startRig();
    await rig.waitLive();
    const outOfBand = await rig.post("/api/rig/freq", { freqHz: 14_074_000 });
    assert.equal(outOfBand.status, 400);
    assert.equal(outOfBand.body.error, "invalid_frequency");
    assert.equal(outOfBand.body.message, "14.074 MHz is outside the bands allowed for licence class N. Nothing was sent to the rig.");
    for (const freqHz of ["28074000", 28_074_000.5, null]) {
      assert.equal((await rig.post("/api/rig/freq", { freqHz })).status, 400, String(freqHz));
    }
    assert.equal((await rig.post("/api/rig/freq", {})).status, 400);
    assert.deepEqual(rig.writes(), []);
  });

  it("follows RIG_LICENCE_CLASS", async () => {
    const rig = await startRig({ env: { RIG_LICENCE_CLASS: "A" } });
    await rig.waitLive();
    assert.equal((await rig.post("/api/rig/freq", { freqHz: 14_074_000 })).status, 200);
    assert.equal(rig.fake.state.freqHz, 14_074_000);
  });

  it("answers 409 while the rig transmits and sends nothing", async () => {
    const rig = await startRig();
    await rig.waitLive();
    rig.fake.state.ptt = 1;
    const { status, body } = await rig.post("/api/rig/freq", { freqHz: 28_074_000 });
    assert.equal(status, 409);
    assert.equal(body.error, "rig_transmitting");
    assert.equal((await rig.post("/api/rig/mode", { mode: "USB" })).status, 409);
    assert.equal((await rig.post("/api/rig/tune", { freqHz: 28_074_000, mode: "USB" })).status, 409);
    assert.deepEqual(rig.writes(), []);
    assert.equal((await rig.getRig()).tx, true);
  });

  it("answers 503 while the rig is offline", async () => {
    const rig = await startRig();
    await rig.waitLive();
    await rig.fake.stop();
    await waitFor(async () => !(await rig.getRig()).connected, 2000, "offline not detected");
    for (const [route, body] of [["/api/rig/freq", { freqHz: 28_074_000 }], ["/api/rig/tune", { freqHz: 28_074_000, mode: "USB" }]]) {
      const r = await rig.post(route, body);
      assert.equal(r.status, 503, route);
      assert.equal(r.body.error, "rig_offline");
    }
  });
});

describe("Set mode", () => {
  const expected = [
    ["LSB", "LSB"], ["USB", "USB"], ["CW-U", "CW"], ["CW-L", "CWR"], ["AM", "AM"], ["AM-N", "AMN"], ["FM", "FM"],
    ["FM-N", "FMN"], ["RTTY-L", "RTTY"], ["RTTY-U", "RTTYR"], ["DATA-L", "PKTLSB"], ["DATA-U", "PKTUSB"],
    ["DATA-FM", "PKTFM"], ["C4FM", "C4FM"]
  ];

  it("sends the hamlib token with an unchanged passband and reads the label back", async () => {
    const rig = await startRig();
    await rig.waitLive();
    for (const [label, token] of expected) {
      const { status, body } = await rig.post("/api/rig/mode", { mode: label });
      assert.equal(status, 200, label);
      assert.equal(body.mode, label);
      assert.ok(rig.fake.received.includes(`+\\set_mode ${token} -1`), token);
    }
  });

  it("answers 400 and sends nothing for unknown modes", async () => {
    const rig = await startRig();
    await rig.waitLive();
    for (const mode of ["FOO", "usb", "PKTUSB", "USB -1\n+\\set_ptt 1", 7, null]) {
      const { status, body } = await rig.post("/api/rig/mode", { mode });
      assert.equal(status, 400, String(mode));
      assert.equal(body.error, "invalid_mode");
    }
    assert.deepEqual(rig.writes(), []);
  });

  it("puts the frequency back when the mode change shifted it", async () => {
    const rig = await startRig({ state: { freqHz: 145_500_000, mode: "FM", modeChangeOffsetHz: 700 } });
    await rig.waitLive();
    const { result, writes } = await rig.writesDuring(() => rig.post("/api/rig/mode", { mode: "USB" }));
    assert.equal(result.status, 200);
    assert.equal(result.body.freqHz, 145_500_000);
    assert.equal(result.body.mode, "USB");
    assert.deepEqual(writes, ["+\\set_mode USB -1", "+\\set_freq 145500000"]);
    const i = rig.fake.received.indexOf("+\\set_mode USB -1");
    assert.deepEqual(rig.fake.received.slice(i - 2, i), ["+\\get_ptt", "+\\get_freq"]);
    assert.equal(rig.fake.state.freqHz, 145_500_000);
  });

  it("sends only set_mode when the frequency stays", async () => {
    const rig = await startRig({ state: { freqHz: 145_500_000, mode: "FM" } });
    await rig.waitLive();
    const { result, writes } = await rig.writesDuring(() => rig.post("/api/rig/mode", { mode: "USB" }));
    assert.equal(result.status, 200);
    assert.equal(result.body.freqHz, 145_500_000);
    assert.deepEqual(writes, ["+\\set_mode USB -1"]);
  });

  it("does not put back a frequency outside the licence bands", async () => {
    const rig = await startRig({ state: { freqHz: 7_074_000, mode: "PKTUSB", modeChangeOffsetHz: 700 } });
    await rig.waitLive();
    const { result, writes } = await rig.writesDuring(() => rig.post("/api/rig/mode", { mode: "USB" }));
    assert.equal(result.status, 200);
    assert.equal(result.body.freqHz, 7_074_700);
    assert.equal(result.body.mode, "USB");
    assert.deepEqual(writes, ["+\\set_mode USB -1"]);
  });
});

describe("Combined tune", () => {
  const ft991a = (state = {}, env = {}) => startRig({ env, state: { freqHz: 438_625_000, mode: "FM", ...FT991A_QUIRKS, ...state } });
  // One poll for waitLive, the next one only after the test: the status shows what the tune job read
  const NO_REPOLL = { RIG_POLL_MS: "60000" };

  it("ends on the requested frequency and mode across band changes", async () => {
    const rig = await ft991a();
    await rig.waitLive();

    const to2m = await rig.writesDuring(() => rig.post("/api/rig/tune", { freqHz: 145_500_000, mode: "FM" }));
    assert.equal(to2m.result.status, 200);
    assert.equal(to2m.result.body.freqHz, 145_500_000);
    assert.equal(to2m.result.body.mode, "FM");
    assert.deepEqual(to2m.writes, ["+\\set_freq 145500000", "+\\set_mode FM -1", "+\\set_freq 145500000"]);
    const i = rig.fake.received.indexOf("+\\set_freq 145500000");
    assert.equal(rig.fake.received[i - 1], "+\\get_ptt");
    assert.deepEqual([rig.fake.state.freqHz, rig.fake.state.mode], [145_500_000, "FM"]);

    const back = await rig.writesDuring(() => rig.post("/api/rig/tune", { freqHz: 438_625_000, mode: "FM" }));
    assert.equal(back.result.status, 200);
    assert.equal(back.result.body.freqHz, 438_625_000);
    assert.equal(back.result.body.mode, "FM");
    assert.deepEqual(back.writes, ["+\\set_freq 438625000", "+\\set_mode FM -1", "+\\set_freq 438625000"]);
    const j = rig.fake.received.indexOf("+\\set_freq 438625000");
    assert.equal(rig.fake.received[j - 1], "+\\get_ptt");
    assert.deepEqual([rig.fake.state.freqHz, rig.fake.state.mode], [438_625_000, "FM"]);
  });

  it("sends only set_freq within the band when the mode already matches", async () => {
    const rig = await ft991a();
    await rig.waitLive();
    const { result, writes } = await rig.writesDuring(() => rig.post("/api/rig/tune", { freqHz: 438_500_000, mode: "FM" }));
    assert.equal(result.status, 200);
    assert.equal(result.body.freqHz, 438_500_000);
    assert.equal(result.body.mode, "FM");
    assert.deepEqual(writes, ["+\\set_freq 438500000"]);
  });

  it("answers 400 and sends nothing for a bad frequency or mode", async () => {
    const rig = await ft991a();
    await rig.waitLive();
    const bad = [
      [{ freqHz: 14_074_000, mode: "USB" }, "invalid_frequency"],
      [{ freqHz: "145500000", mode: "FM" }, "invalid_frequency"],
      [{ mode: "FM" }, "invalid_frequency"],
      [{ freqHz: 145_500_000, mode: "fm" }, "invalid_mode"],
      [{ freqHz: 145_500_000, mode: "PKTUSB" }, "invalid_mode"],
      [{ freqHz: 145_500_000, mode: null }, "invalid_mode"],
      [{ freqHz: 145_500_000, mode: 7 }, "invalid_mode"]
    ];
    for (const [body, error] of bad) {
      const r = await rig.post("/api/rig/tune", body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.error, error, JSON.stringify(body));
    }
    assert.deepEqual(rig.writes(), []);
  });

  it("answers 502 rig_mismatch after one correction and shows where the rig is", async () => {
    const rig = await ft991a({ setFreqErrorHz: 25 }, NO_REPOLL);
    await rig.waitLive();
    const { result, writes } = await rig.writesDuring(() => rig.post("/api/rig/tune", { freqHz: 145_500_000, mode: "FM" }));
    assert.equal(result.status, 502);
    assert.equal(result.body.error, "rig_mismatch");
    assert.equal(result.body.message, "The rig is on 145.500025 MHz FM instead of the requested 145.5 MHz FM.");
    assert.deepEqual(writes, ["+\\set_freq 145500000", "+\\set_mode FM -1", "+\\set_freq 145500000"]);
    const status = await rig.getRig();
    assert.equal(status.freqHz, 145_500_025);
    assert.equal(status.mode, "FM");
  });

  it("stops at a command the rig rejects in the middle of a tune", async () => {
    const rig = await ft991a({ failCommandOnce: "set_mode" }, NO_REPOLL);
    await rig.waitLive();
    const { result, writes } = await rig.writesDuring(() => rig.post("/api/rig/tune", { freqHz: 145_500_000, mode: "FM" }));
    assert.equal(result.status, 502);
    assert.equal(result.body.error, "rig_error");
    assert.deepEqual(writes, ["+\\set_freq 145500000", "+\\set_mode FM -1"]);
    assert.equal(rig.fake.received.at(-1), "+\\set_mode FM -1");
    assert.deepEqual([rig.fake.state.freqHz, rig.fake.state.mode], [145_500_000, "CW"]);
  });

  it("POST /api/rig/freq reads the recalled mode back after a band change", async () => {
    const rig = await ft991a();
    await rig.waitLive();
    const { result, writes } = await rig.writesDuring(() => rig.post("/api/rig/freq", { freqHz: 145_500_000 }));
    assert.equal(result.status, 200);
    assert.equal(result.body.freqHz, 145_500_000);
    assert.equal(result.body.mode, "CW-U");
    assert.deepEqual(writes, ["+\\set_freq 145500000"]);
  });

  it("sends only allowlisted commands during tune and mode restore", async () => {
    const rig = await ft991a({ setFreqErrorHz: 25 });
    await rig.waitLive();
    assert.equal((await rig.post("/api/rig/tune", { freqHz: 145_500_000, mode: "FM" })).status, 502);
    rig.fake.state.setFreqErrorHz = 0;
    assert.equal((await rig.post("/api/rig/tune", { freqHz: 438_625_000, mode: "FM" })).status, 200);
    assert.equal((await rig.post("/api/rig/mode", { mode: "USB" })).status, 200);
    assert.equal(rig.writes().length, 8);
    for (const line of rig.fake.received) {
      assert.ok(isAllowedCommand(line), line);
      assert.ok(RIG_VERBS.includes(line.replace(/^\+\\/, "").split(" ")[0]), line);
    }
  });
});

describe("Resilience", () => {
  it("reports rigctld down, logs one line per state change and reconnects with backoff", async () => {
    const rig = await startRig({ fakeRunning: false });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const status = await rig.getRig();
      assert.equal(status.connected, false);
      await sleep(200);
    }
    const status = await rig.getRig();
    assert.match(status.error, /not running/);
    assert.equal(rig.logger.lines.length, 1, rig.logger.lines.join("\n"));
    await rig.fake.start();
    await rig.waitLive(10_000);
    assert.equal(rig.logger.lines.length, 2);
    assert.match(rig.logger.lines[1], /connected/);
  });

  it("marks the rig offline when rigctld stops answering and recovers", async () => {
    const rig = await startRig({ env: { RIGCTLD_TIMEOUT_MS: "300" } });
    await rig.waitLive();
    rig.fake.state.silent = true;
    const offline = await waitFor(async () => {
      const s = await rig.getRig();
      return s.connected ? null : s;
    }, 3000, "timeout not detected");
    assert.equal(offline.freqHz, null);
    rig.fake.state.silent = false;
    await rig.waitLive(5000);
  });

  it("does not glue a partial reply from a timed-out connection to the next reply", async () => {
    const fake = await startFakeRigctld({ state: { freqHz: 28_074_000, partialReplyOnce: "get_freq:\nFrequency: 1234" } });
    cleanups.push(() => fake.stop());
    let clockOffsetMs = 0;
    const client = new RigctldClient({ host: "127.0.0.1", port: fake.port, timeoutMs: 200, now: () => Date.now() + clockOffsetMs });
    cleanups.push(() => client.close());
    await assert.rejects(client.enqueue((rig) => rig.getFreq()), { code: "rig_timeout" });
    clockOffsetMs += 2000; // skip the reconnect backoff
    assert.equal(await client.enqueue((rig) => rig.getFreq()), 28_074_000);
    assert.equal(fake.connections, 2);
  });

  it("backs off when rigctld accepts and closes connections at once", async () => {
    const rig = await startRig({ state: { closeOnConnect: true } });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      await rig.getRig();
      await sleep(200);
    }
    assert.ok(rig.fake.connections >= 1 && rig.fake.connections <= 3, `${rig.fake.connections} connections in 3 s`);
    assert.equal((await rig.getRig()).connected, false);
    assert.equal(rig.logger.lines.length, 1, rig.logger.lines.join("\n"));
  });

  it("caps the queue at 8 waiting jobs", async () => {
    const fake = await startFakeRigctld({ state: { silent: true } });
    cleanups.push(() => fake.stop());
    const client = new RigctldClient({ host: "127.0.0.1", port: fake.port, timeoutMs: 5000 });
    const inFlight = client.enqueue((rig) => rig.getFreq()).catch((err) => err.code);
    await waitFor(() => fake.received.length === 1, 2000, "first command not sent");
    const waiting = Array.from({ length: 8 }, () => client.enqueue((rig) => rig.getFreq()).catch((err) => err.code));
    await assert.rejects(client.enqueue((rig) => rig.getFreq()), { code: "rig_busy" });
    client.close();
    assert.deepEqual(await Promise.all([inFlight, ...waiting]), Array(9).fill("rig_offline"));
    assert.equal(fake.received.length, 1);
  });
});

describe("Write request hardening", () => {
  it("answers 415 for non-JSON bodies and sends nothing", async () => {
    const rig = await startRig();
    await rig.waitLive();
    const plain = await rig.post("/api/rig/freq", JSON.stringify({ freqHz: 28_074_000 }), { "Content-Type": "text/plain" });
    assert.equal(plain.status, 415);
    const form = await rig.post("/api/rig/mode", "mode=USB", { "Content-Type": "application/x-www-form-urlencoded" });
    assert.equal(form.status, 415);
    const tune = await rig.post("/api/rig/tune", JSON.stringify({ freqHz: 28_074_000, mode: "USB" }), { "Content-Type": "text/plain" });
    assert.equal(tune.status, 415);
    assert.deepEqual(rig.writes(), []);
  });

  it("answers 403 for a foreign Origin and accepts the same origin", async () => {
    const rig = await startRig();
    await rig.waitLive();
    for (const origin of ["http://evil.example", "null", `http://127.0.0.1:1`]) {
      const r = await rig.post("/api/rig/freq", { freqHz: 28_074_000 }, { "Content-Type": "application/json", Origin: origin });
      assert.equal(r.status, 403, origin);
      const tune = await rig.post("/api/rig/tune", { freqHz: 28_074_000, mode: "USB" }, { "Content-Type": "application/json", Origin: origin });
      assert.equal(tune.status, 403, origin);
    }
    assert.deepEqual(rig.writes(), []);
    const same = await rig.post("/api/rig/freq", { freqHz: 28_074_000 }, { "Content-Type": "application/json", Origin: rig.baseUrl });
    assert.equal(same.status, 200);
  });
});

describe("rigctld LaunchAgent generator", () => {
  const options = {
    bin: "/opt/homebrew/bin/rigctld",
    model: 1035,
    device: SYNTHETIC_DEVICE,
    baud: 9600,
    port: 14532,
    label: "de.example.rigctld",
    logPath: "/Users/example/Library/Logs/rigctld.log"
  };

  function programArguments(plist) {
    const array = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)[1];
    return [...array.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
  }

  const serialSettings = (stopBits) =>
    `serial_handshake=None,stop_bits=${stopBits},data_bits=8,serial_parity=None,rts_state=OFF,dtr_state=OFF,auto_power_on=0,auto_power_off=0,multicast_data_addr=0.0.0.0,multicast_cmd_addr=0.0.0.0`;

  it("binds rigctld to 127.0.0.1 with 9600 8N2, no handshake, RTS/DTR off and no power control", () => {
    const plist = buildRigctldLaunchAgent(options);
    assert.deepEqual(programArguments(plist), [
      "/opt/homebrew/bin/rigctld", "-m", "1035", "-r", SYNTHETIC_DEVICE, "-s", "9600", "-T", "127.0.0.1", "-t", "14532", "-C",
      serialSettings(2)
    ]);
    assert.equal(LAUNCH_AGENT_DEFAULTS.stopBits, 2);
    assert.match(plist, /<key>Label<\/key>\s*<string>de\.example\.rigctld<\/string>/);
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
    assert.match(plist, /<key>PathState<\/key>\s*<dict>\s*<key>\/dev\/cu\.usbserial-ABCD12340<\/key>\s*<true\/>/);
    assert.match(plist, /<key>ThrottleInterval<\/key>\s*<integer>30<\/integer>/);
    assert.match(plist, /<key>StandardErrorPath<\/key>\s*<string>\/Users\/example\/Library\/Logs\/rigctld\.log<\/string>/);
  });

  it("takes 1 stop bit only when asked and leaves the other serial settings alone", () => {
    for (const stopBits of [1, "1"]) {
      assert.equal(programArguments(buildRigctldLaunchAgent({ ...options, stopBits })).at(-1), serialSettings(1), String(stopBits));
    }
    assert.equal(programArguments(buildRigctldLaunchAgent({ ...options, stopBits: "2" })).at(-1), serialSettings(2));
  });

  it("refuses unsafe devices, ports and settings", () => {
    const bad = [
      { device: "/dev/tty.usbserial-ABCD12340" },
      { device: "/dev/cu.usbserial-ABCD12341" },
      { device: "/dev/cu.usbserial-ABCD 12340" },
      { device: "/dev/cu.usbserial-ABCD12340;x" },
      { device: "/tmp/cu.usbserial-ABCD12340" },
      { device: "" },
      { port: 80 },
      { port: 70000 },
      { port: "abc" },
      { baud: 115200 },
      { stopBits: 0 },
      { stopBits: 3 },
      { stopBits: 1.5 },
      { stopBits: "abc" },
      { model: 0 },
      { bin: "rigctld" },
      { label: "rigctld" },
      { logPath: "rigctld.log" }
    ];
    for (const override of bad) {
      assert.throws(() => buildRigctldLaunchAgent({ ...options, ...override }), Error, JSON.stringify(override));
    }
  });

  it("the script prints by default, writes only with --write and never runs launchctl", () => {
    const source = fs.readFileSync(LAUNCH_AGENT_SCRIPT, "utf8");
    assert.ok(!/child_process|execSync|spawn/.test(source), "script must not start processes");
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "hamshack-rig-home-"));
    cleanups.push(() => fs.rmSync(home, { recursive: true, force: true }));
    const env = {
      ...process.env,
      HOME: home,
      RIGCTLD_BIN: options.bin,
      RIGCTLD_MODEL: "1035",
      RIGCTLD_DEVICE: SYNTHETIC_DEVICE,
      RIGCTLD_BAUD: "9600",
      RIGCTLD_PORT: "14532",
      RIGCTLD_STOP_BITS: "2",
      RIGCTLD_LAUNCHAGENT_LABEL: "de.example.rigctld"
    };
    const run = (...args) => spawnSync(process.execPath, [LAUNCH_AGENT_SCRIPT, ...args], { env, encoding: "utf8" });
    const target = path.join(home, "Library", "LaunchAgents", "de.example.rigctld.plist");

    const printed = run();
    assert.equal(printed.status, 0);
    assert.ok(printed.stdout.includes("<string>127.0.0.1</string>"));
    assert.ok(printed.stdout.includes(`<string>${serialSettings(2)}</string>`));
    assert.ok(!fs.existsSync(target));

    assert.equal(run("--write").status, 0);
    assert.equal(fs.readFileSync(target, "utf8"), printed.stdout);
    assert.equal(run("--write").status, 1, "overwrote without --force");
    assert.equal(run("--write", "--force").status, 0);
    assert.equal(run("--bogus").status, 2);

    env.RIGCTLD_STOP_BITS = "1";
    assert.ok(run().stdout.includes(`<string>${serialSettings(1)}</string>`));
    env.RIGCTLD_STOP_BITS = "3";
    const refused = run();
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /RIGCTLD_STOP_BITS/);
  });

  it("the preview prints only the plist, so it can be redirected into a file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hamshack-rig-preview-"));
    cleanups.push(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const server = path.join(tmp, "server");
    for (const file of ["package.json", "loadEnv.js", "rig/launchAgent.js", "scripts/rigctldLaunchAgent.js"]) {
      fs.mkdirSync(path.dirname(path.join(server, file)), { recursive: true });
      fs.copyFileSync(path.join(SERVER_DIR, file), path.join(server, file));
    }
    fs.writeFileSync(path.join(server, ".env"), `RIGCTLD_DEVICE=${SYNTHETIC_DEVICE}\nRIGCTLD_PORT=14532\n`);
    const result = spawnSync(process.execPath, [path.join(server, "scripts", "rigctldLaunchAgent.js")], {
      env: { PATH: process.env.PATH, HOME: tmp },
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    const expected = buildRigctldLaunchAgent({
      ...LAUNCH_AGENT_DEFAULTS,
      device: SYNTHETIC_DEVICE,
      port: 14532,
      logPath: path.join(tmp, "Library", "Logs", "rigctld.log")
    });
    assert.equal(result.stdout, expected);
    assert.ok(result.stdout.startsWith("<?xml") && result.stdout.endsWith("</plist>\n"));
    assert.ok(!/Loaded \.env/.test(result.stderr), result.stderr);
  });

  it("the script refuses the Standard port", () => {
    const result = spawnSync(process.execPath, [LAUNCH_AGENT_SCRIPT], {
      env: { ...process.env, HOME: os.tmpdir(), RIGCTLD_DEVICE: "/dev/cu.usbserial-ABCD12341", RIGCTLD_PORT: "14532" },
      encoding: "utf8"
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Standard port/);
  });
});
