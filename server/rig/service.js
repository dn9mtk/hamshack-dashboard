// Rig control service: polls rigctld while the dashboard is watching and offers
// guarded frequency and mode changes. Off unless RIGCTLD_ENABLED=true.
import { bandsForLicenceClass, formatMHz, resolveLicenceClass, validateFrequency } from "./bands.js";
import { MODE_LABELS, hamlibModeForLabel, labelForHamlibMode } from "./modes.js";
import { RigError, RigctldClient } from "./rigctld.js";

const DEFAULT_PORT = 4532;
const DEFAULT_POLL_MS = 1000;
const MIN_POLL_MS = 500;
const DEFAULT_TIMEOUT_MS = 5000;
const MIN_TIMEOUT_MS = 100;
const INTEREST_WINDOW_MS = 15_000;
const MIN_STALE_MS = 3000;

const HTTP_STATUS_BY_CODE = {
  invalid_frequency: 400,
  invalid_mode: 400,
  rig_transmitting: 409,
  rig_disabled: 503,
  rig_offline: 503,
  rig_busy: 503,
  rig_timeout: 504,
  rig_error: 502,
  rig_protocol: 502,
  rig_mismatch: 502
};

function isLoopbackHost(host) {
  return host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);
}

function positiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Rig settings from the environment; enabled is false when a setting is unsafe or invalid. */
export function readRigConfig(env, warn) {
  if (!/^(true|1|yes|on)$/i.test(String(env.RIGCTLD_ENABLED ?? "").trim())) return { enabled: false };
  const host = String(env.RIGCTLD_HOST || "127.0.0.1").trim();
  if (!isLoopbackHost(host)) {
    warn("Rig: RIGCTLD_HOST must be a loopback address (127.0.0.1, ::1 or localhost) – rig control disabled");
    return { enabled: false };
  }
  const port = Number(env.RIGCTLD_PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    warn("Rig: RIGCTLD_PORT must be a TCP port number – rig control disabled");
    return { enabled: false };
  }
  return {
    enabled: true,
    host,
    port,
    pollMs: Math.max(MIN_POLL_MS, positiveInt(env.RIG_POLL_MS, DEFAULT_POLL_MS)),
    timeoutMs: Math.max(MIN_TIMEOUT_MS, positiveInt(env.RIGCTLD_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)),
    licenceClass: resolveLicenceClass(env.RIG_LICENCE_CLASS, warn)
  };
}

async function refuseDisabled() {
  throw new RigError("rig_disabled", "Rig control is disabled on this server.");
}

function hamlibModeOrThrow(label) {
  const hamlibMode = typeof label === "string" ? hamlibModeForLabel(label) : null;
  if (!hamlibMode) {
    throw new RigError("invalid_mode", `Unknown mode. Allowed: ${MODE_LABELS.join(", ")}. Nothing was sent to the rig.`);
  }
  return hamlibMode;
}

async function readModeLabel(rig) {
  return labelForHamlibMode((await rig.getMode()).mode);
}

function disabledService() {
  return {
    enabled: false,
    noteInterest() {},
    getStatus: () => ({
      enabled: false,
      connected: false,
      freqHz: null,
      mode: null,
      tx: null,
      sMeterDb: null,
      updatedAt: null,
      error: null
    }),
    setFrequency: refuseDisabled,
    setMode: refuseDisabled,
    tune: refuseDisabled,
    close() {}
  };
}

export function createRigService({ env = process.env, log = console, now = Date.now, interestWindowMs = INTEREST_WINDOW_MS } = {}) {
  const config = readRigConfig(env, (message) => log.warn(message));
  if (!config.enabled) return disabledService();

  const { pollMs, licenceClass } = config;
  const staleMs = Math.max(3 * pollMs, MIN_STALE_MS);
  const bands = bandsForLicenceClass(licenceClass);
  const client = new RigctldClient({ host: config.host, port: config.port, timeoutMs: config.timeoutMs, now });
  const snapshot = { freqHz: null, mode: null, tx: null, sMeterDb: null, updatedAt: null };
  let lastError = null;
  let loggedProblem;
  let lastInterestAt = 0;
  let polling = false;
  let pollTimer = null;
  let stopped = false;

  async function readStrength(rig) {
    try {
      return await rig.getStrength();
    } catch (err) {
      if (err.code === "rig_error") return null;
      throw err;
    }
  }

  async function readState(rig) {
    const freqHz = await rig.getFreq();
    const { mode } = await rig.getMode();
    const ptt = await rig.getPtt();
    const sMeterDb = await readStrength(rig);
    Object.assign(snapshot, { freqHz, mode: labelForHamlibMode(mode), tx: ptt !== 0, sMeterDb, updatedAt: now() });
  }

  function logStateChange(problem) {
    if (problem === loggedProblem) return;
    loggedProblem = problem;
    if (problem) log.warn(`Rig: ${problem}`);
    else log.log(`✓ Rig: connected through rigctld at ${config.host}:${config.port}`);
  }

  async function poll() {
    if (stopped) return;
    if (now() - lastInterestAt > interestWindowMs) {
      polling = false;
      return;
    }
    try {
      await client.enqueue(readState);
      lastError = null;
    } catch (err) {
      lastError = err.message;
    }
    logStateChange(lastError);
    if (!stopped) pollTimer = setTimeout(poll, pollMs);
  }

  function isLive() {
    return client.connected && snapshot.updatedAt != null && now() - snapshot.updatedAt <= staleMs;
  }

  function getStatus() {
    const live = isLive();
    return {
      enabled: true,
      connected: live,
      freqHz: live ? snapshot.freqHz : null,
      mode: live ? snapshot.mode : null,
      tx: live ? snapshot.tx : null,
      sMeterDb: live ? snapshot.sMeterDb : null,
      updatedAt: snapshot.updatedAt != null ? new Date(snapshot.updatedAt).toISOString() : null,
      error: live ? null : lastError || "Waiting for rigctld",
      licenceClass,
      bands: bands.map(({ name, lowHz, highHz }) => ({ name, lowHz, highHz })),
      modes: MODE_LABELS
    };
  }

  /** Run a write job after a fresh PTT check in the same queue slot, so it never changes a transmitting rig. */
  async function guardedWrite(write) {
    if (!isLive()) throw new RigError("rig_offline", `Rig is offline (${lastError || "no recent reading"}). Nothing was sent to the rig.`);
    await client.enqueue(async (rig) => {
      if ((await rig.getPtt()) !== 0) {
        snapshot.tx = true;
        throw new RigError("rig_transmitting", "The rig is transmitting. Nothing was sent to the rig.");
      }
      await write(rig);
      snapshot.updatedAt = now();
    });
    return getStatus();
  }

  function checkedFrequency(value) {
    const check = validateFrequency(value, licenceClass);
    if (!check.ok) throw new RigError("invalid_frequency", check.message);
    return check.freqHz;
  }

  // The FT-991A recalls the band-stack mode when set_freq changes the band, and set_mode may shift
  // the frequency. So the frequency goes first, then the mode, then at most one corrective set_freq.
  async function tune({ freqHz, mode } = {}) {
    const targetHz = checkedFrequency(freqHz);
    const hamlibMode = mode === undefined ? null : hamlibModeOrThrow(mode);
    let reached;
    const status = await guardedWrite(async (rig) => {
      await rig.setFreq(targetHz);
      if (hamlibMode && (await readModeLabel(rig)) !== mode) {
        await rig.setMode(hamlibMode);
        if ((await rig.getFreq()) !== targetHz) await rig.setFreq(targetHz);
      }
      reached = { freqHz: await rig.getFreq(), mode: await readModeLabel(rig) };
      Object.assign(snapshot, reached);
    });
    if (hamlibMode && (reached.freqHz !== targetHz || reached.mode !== mode)) {
      throw new RigError(
        "rig_mismatch",
        `The rig is on ${formatMHz(reached.freqHz)} ${reached.mode} instead of the requested ${formatMHz(targetHz)} ${mode}.`
      );
    }
    return status;
  }

  /** Change the mode and put the frequency back if the rig shifted it (only within the licence bands). */
  async function setMode(label) {
    const hamlibMode = hamlibModeOrThrow(label);
    return guardedWrite(async (rig) => {
      const previousHz = await rig.getFreq();
      await rig.setMode(hamlibMode);
      snapshot.mode = await readModeLabel(rig);
      let freqHz = await rig.getFreq();
      if (freqHz !== previousHz && validateFrequency(previousHz, licenceClass).ok) {
        await rig.setFreq(previousHz);
        freqHz = await rig.getFreq();
      }
      snapshot.freqHz = freqHz;
    });
  }

  return {
    enabled: true,
    noteInterest() {
      lastInterestAt = now();
      if (polling || stopped) return;
      polling = true;
      poll();
    },
    getStatus,
    setFrequency: (freqHz) => tune({ freqHz }),
    setMode,
    tune,
    close() {
      stopped = true;
      clearTimeout(pollTimer);
      client.close();
    }
  };
}

function sameOrigin(origin, host) {
  try {
    return new URL(origin).host.toLowerCase() === String(host || "").toLowerCase();
  } catch {
    return false;
  }
}

/** Write requests must be JSON (no simple cross-site form posts) and, if the browser sends an Origin, same-origin. */
export function rigWriteGuard(req, res, next) {
  if (!req.is("application/json")) {
    res.status(415).json({ error: "unsupported_media_type", message: "Rig control requests must be sent as application/json." });
    return;
  }
  const origin = req.get("origin");
  if (origin != null && !sameOrigin(origin, req.get("host"))) {
    res.status(403).json({ error: "cross_origin", message: "Rig control requests from other sites are not allowed." });
    return;
  }
  next();
}

function sendRigError(res, err) {
  const status = HTTP_STATUS_BY_CODE[err?.code];
  if (status) {
    res.status(status).json({ error: err.code, message: err.message });
    return;
  }
  console.warn("Rig: unexpected error:", err?.message || err);
  res.status(500).json({ error: "rig_internal", message: "Unexpected rig control error." });
}

export function registerRigRoutes(app, service) {
  app.get("/api/rig", (req, res) => {
    service.noteInterest();
    res.set("Cache-Control", "no-store").json(service.getStatus());
  });
  app.post("/api/rig/freq", rigWriteGuard, async (req, res) => {
    try {
      res.json(await service.setFrequency(req.body?.freqHz));
    } catch (err) {
      sendRigError(res, err);
    }
  });
  app.post("/api/rig/mode", rigWriteGuard, async (req, res) => {
    try {
      res.json(await service.setMode(req.body?.mode));
    } catch (err) {
      sendRigError(res, err);
    }
  });
  app.post("/api/rig/tune", rigWriteGuard, async (req, res) => {
    try {
      res.json(await service.tune({ freqHz: req.body?.freqHz, mode: req.body?.mode }));
    } catch (err) {
      sendRigError(res, err);
    }
  });
}
