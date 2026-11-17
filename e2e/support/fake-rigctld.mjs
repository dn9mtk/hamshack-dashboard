// Fake rigctld for the E2E dashboard server, plus a loopback HTTP control port for the tests:
// GET /health, GET /state, POST /state (JSON merged into the rig state), POST /reset,
// POST /offline (stop listening, drop clients), POST /online.
import http from "node:http";
import { startFakeRigctld } from "../../server/test/support/fakeRigctld.js";

const RIG_PORT = Number(process.env.E2E_RIG_PORT);
const CONTROL_PORT = Number(process.env.E2E_RIG_CONTROL_PORT);
const INITIAL_STATE = {
  freqHz: 28_074_000,
  mode: "PKTUSB",
  passbandHz: 3000,
  ptt: 0,
  strength: -12,
  silent: false,
  failCommandOnce: null,
  bandStackModes: null,
  modeChangeOffsetHz: 0,
  setFreqErrorHz: 0
};

const fake = await startFakeRigctld({ port: RIG_PORT, state: { ...INITIAL_STATE } });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function snapshot() {
  return { ...fake.state, running: fake.running, writes: fake.received.filter((line) => /^\+\\set_/.test(line)) };
}

const routes = {
  "GET /health": async () => ({ ok: true }),
  "GET /state": async () => snapshot(),
  "POST /state": async (req) => {
    Object.assign(fake.state, await readJson(req));
    return snapshot();
  },
  "POST /reset": async () => {
    Object.assign(fake.state, INITIAL_STATE);
    fake.received.length = 0;
    await fake.start();
    return snapshot();
  },
  "POST /offline": async () => {
    await fake.stop();
    return snapshot();
  },
  "POST /online": async () => {
    await fake.start();
    return snapshot();
  }
};

http
  .createServer(async (req, res) => {
    const route = routes[`${req.method} ${req.url}`];
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = JSON.stringify(await route(req));
      res.writeHead(200, { "Content-Type": "application/json" }).end(body);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" }).end(String(err?.message || err));
    }
  })
  .listen(CONTROL_PORT, "127.0.0.1");
