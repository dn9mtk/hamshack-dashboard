// Client for hamlib rigctld (extended protocol, "+\command"): one TCP connection,
// a FIFO queue of jobs with one command in flight, per-command timeout and reconnect backoff.
// The dashboard can only read the rig and set frequency and mode: every line passes the
// allowlist in writeAllowedCommand, the only function that writes to the socket.
import net from "net";
import { HAMLIB_MODE_TOKENS } from "./modes.js";

const ALLOWED_COMMANDS = [
  /^\+\\get_freq$/,
  /^\+\\get_mode$/,
  /^\+\\get_ptt$/,
  /^\+\\get_level STRENGTH$/,
  /^\+\\set_freq [1-9][0-9]{0,9}$/,
  new RegExp(`^\\+\\\\set_mode (${HAMLIB_MODE_TOKENS.join("|")}) -1$`)
];
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_QUEUE_CAP = 8;
const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

// hamlib error codes (RPRT -n) that are worth a readable message
const RPRT_MESSAGES = {
  "-1": "invalid parameter",
  "-5": "the rig did not answer (switched off or CAT cable unplugged?)",
  "-6": "I/O error on the CAT port",
  "-9": "command rejected by the rig",
  "-11": "function not available",
  "-13": "CAT port error",
  "-20": "the rig is switched off",
  "-22": "access denied"
};

export class RigError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function isAllowedCommand(line) {
  return typeof line === "string" && !CONTROL_CHARACTERS.test(line) && ALLOWED_COMMANDS.some((re) => re.test(line));
}

export function writeAllowedCommand(socket, line) {
  if (!isAllowedCommand(line)) throw new RigError("rig_refused", "Refused a rig command outside the allowlist");
  socket.write(`${line}\n`);
}

function field(lines, key) {
  const prefix = `${key}: `;
  const line = lines.find((l) => l.startsWith(prefix));
  if (line == null) throw new RigError("rig_protocol", `rigctld reply without ${key}`);
  return line.slice(prefix.length).trim();
}

function numberField(lines, key) {
  const value = Number(field(lines, key));
  if (!Number.isFinite(value)) throw new RigError("rig_protocol", `rigctld reply with invalid ${key}`);
  return value;
}

function bareNumber(lines) {
  // lines[0] echoes the command, the value follows on its own line
  const value = Number(lines[1]);
  if (lines.length < 2 || !Number.isFinite(value)) throw new RigError("rig_protocol", "rigctld reply without a value");
  return value;
}

function connectionErrorMessage(err) {
  if (err?.code === "ECONNREFUSED") return "rigctld is not running (connection refused)";
  return `rigctld connection failed (${err?.code || err?.message || "unknown error"})`;
}

export class RigctldClient {
  #host;
  #port;
  #timeoutMs;
  #queueCap;
  #now;
  #socket = null;
  #buffer = "";
  #pending = null;
  #queue = [];
  #draining = false;
  #closed = false;
  #backoffMs = 0;
  #nextAttemptAt = 0;
  #lastError = null;

  constructor({ host, port, timeoutMs = DEFAULT_TIMEOUT_MS, queueCap = DEFAULT_QUEUE_CAP, now = Date.now }) {
    this.#host = host;
    this.#port = port;
    this.#timeoutMs = timeoutMs;
    this.#queueCap = queueCap;
    this.#now = now;
  }

  get connected() {
    return this.#socket != null;
  }

  /** Run job(rig) when the connection is free; rig offers the allowed commands only. */
  enqueue(job) {
    if (this.#closed) return Promise.reject(new RigError("rig_offline", "Rig service stopped"));
    if (this.#queue.length >= this.#queueCap) {
      return Promise.reject(new RigError("rig_busy", "Too many rig requests waiting – try again"));
    }
    return new Promise((resolve, reject) => {
      this.#queue.push({ job, resolve, reject });
      this.#drain();
    });
  }

  close() {
    this.#closed = true;
    for (const item of this.#queue.splice(0)) item.reject(new RigError("rig_offline", "Rig service stopped"));
    this.#socket?.destroy();
  }

  async #drain() {
    if (this.#draining) return;
    this.#draining = true;
    while (this.#queue.length > 0) {
      const item = this.#queue.shift();
      try {
        await this.#ensureConnected();
        item.resolve(await item.job(this.#commands));
      } catch (err) {
        item.reject(err);
      }
    }
    this.#draining = false;
  }

  #commands = Object.freeze({
    getFreq: async () => numberField(await this.#send("+\\get_freq"), "Frequency"),
    getMode: async () => {
      const lines = await this.#send("+\\get_mode");
      return { mode: field(lines, "Mode"), passbandHz: numberField(lines, "Passband") };
    },
    getPtt: async () => numberField(await this.#send("+\\get_ptt"), "PTT"),
    getStrength: async () => bareNumber(await this.#send("+\\get_level STRENGTH")),
    setFreq: async (freqHz) => {
      await this.#send(`+\\set_freq ${freqHz}`);
    },
    setMode: async (hamlibMode) => {
      await this.#send(`+\\set_mode ${hamlibMode} -1`);
    }
  });

  /** Wait before the next connection attempt: 1 s, doubling up to 30 s, reset by the next reply. */
  #backOff(message) {
    this.#lastError = message;
    this.#backoffMs = Math.min(MAX_BACKOFF_MS, this.#backoffMs ? this.#backoffMs * 2 : MIN_BACKOFF_MS);
    this.#nextAttemptAt = this.#now() + this.#backoffMs;
  }

  async #ensureConnected() {
    if (this.#socket) return;
    if (this.#now() < this.#nextAttemptAt) throw new RigError("rig_offline", this.#lastError || "rigctld not connected");
    let socket;
    try {
      socket = await this.#connect();
    } catch (err) {
      const message = connectionErrorMessage(err);
      this.#backOff(message);
      throw new RigError("rig_offline", message);
    }
    if (this.#closed) {
      socket.destroy();
      throw new RigError("rig_offline", "Rig service stopped");
    }
    // Bytes left over from a previous connection must not be glued to the first new reply
    this.#buffer = "";
    this.#socket = socket;
  }

  #connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.#host, port: this.#port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT" }));
      }, this.#timeoutMs);
      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.once("connect", () => {
        clearTimeout(timer);
        socket.removeAllListeners("error");
        socket.setEncoding("utf8");
        socket.setNoDelay(true);
        socket.on("data", (chunk) => this.#onData(chunk));
        socket.on("error", () => {});
        socket.on("close", () => this.#onClose(socket));
        resolve(socket);
      });
    });
  }

  #onClose(socket) {
    if (this.#socket !== socket) return;
    this.#socket = null;
    this.#buffer = "";
    this.#backOff("rigctld closed the connection");
    this.#failPending(new RigError("rig_offline", this.#lastError));
  }

  #failPending(err) {
    if (!this.#pending) return;
    clearTimeout(this.#pending.timer);
    this.#pending.reject(err);
    this.#pending = null;
  }

  #onData(chunk) {
    this.#buffer += chunk;
    let newline;
    while ((newline = this.#buffer.indexOf("\n")) >= 0) {
      const line = this.#buffer.slice(0, newline).replace(/\r$/, "");
      this.#buffer = this.#buffer.slice(newline + 1);
      if (this.#pending) this.#onLine(line);
    }
  }

  #onLine(line) {
    const pending = this.#pending;
    const rprt = /^RPRT (-?\d+)$/.exec(line);
    if (!rprt) {
      pending.lines.push(line);
      return;
    }
    clearTimeout(pending.timer);
    this.#pending = null;
    this.#backoffMs = 0;
    const code = rprt[1];
    if (code === "0") pending.resolve(pending.lines);
    else pending.reject(new RigError("rig_error", `rigctld error ${code}: ${RPRT_MESSAGES[code] || "command failed"}`));
  }

  #send(line) {
    if (!this.#socket) return Promise.reject(new RigError("rig_offline", "rigctld not connected"));
    if (this.#pending) return Promise.reject(new RigError("rig_busy", "A rig command is already in flight"));
    writeAllowedCommand(this.#socket, line);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending = null;
        const message = `rigctld did not answer within ${this.#timeoutMs} ms`;
        reject(new RigError("rig_timeout", message));
        // The reply may still arrive later and would be taken for the next command's reply
        this.#socket?.destroy();
        this.#socket = null;
        this.#buffer = "";
        this.#backOff(message);
      }, this.#timeoutMs);
      this.#pending = { lines: [], resolve, reject, timer };
    });
  }
}
