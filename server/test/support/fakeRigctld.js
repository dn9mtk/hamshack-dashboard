// Fake hamlib rigctld for tests: speaks the extended protocol for the commands the
// dashboard uses and records every line it receives. Listens on 127.0.0.1 only.
import net from "node:net";

const MODE_READBACK = { PKTFM: "FM-D" };

export async function startFakeRigctld({ port = 0, state: initialState = {} } = {}) {
  // partialReplyOnce: answer the next command of a connection with this text (no newline), then
  // leave that connection silent. closeOnConnect: accept connections and close them at once.
  const state = {
    freqHz: 145_500_000,
    mode: "FM",
    passbandHz: 15000,
    ptt: 0,
    strength: -54,
    silent: false,
    partialReplyOnce: null,
    closeOnConnect: false,
    ...initialState
  };
  const received = [];
  const sockets = new Set();
  let connections = 0;
  let server = null;
  let boundPort = port;

  const silentSockets = new WeakSet();

  function reply(socket, line) {
    received.push(line);
    if (state.silent || silentSockets.has(socket)) return;
    if (state.partialReplyOnce != null) {
      socket.write(state.partialReplyOnce);
      state.partialReplyOnce = null;
      silentSockets.add(socket);
      return;
    }
    const [command, ...args] = line.replace(/^\+\\/, "").split(" ");
    const echo = `${command}:${args.length ? ` ${args.join(" ")}` : ""}`;
    let body;
    switch (command) {
      case "get_freq":
        body = [`Frequency: ${state.freqHz}`];
        break;
      case "get_mode":
        body = [`Mode: ${state.mode}`, `Passband: ${state.passbandHz}`];
        break;
      case "get_ptt":
        body = [`PTT: ${state.ptt}`];
        break;
      case "get_level":
        body = args[0] === "STRENGTH" ? [String(state.strength)] : null;
        break;
      case "set_freq":
        if (/^\d+$/.test(args[0] || "")) {
          state.freqHz = Number(args[0]);
          body = [];
        }
        break;
      case "set_mode":
        state.mode = MODE_READBACK[args[0]] || args[0];
        body = [];
        break;
      default:
        body = null;
    }
    socket.write([echo, ...(body ?? []), `RPRT ${body ? 0 : -1}`].join("\n") + "\n");
  }

  function listen() {
    return new Promise((resolve, reject) => {
      server = net.createServer((socket) => {
        connections += 1;
        if (state.closeOnConnect) {
          socket.destroy();
          return;
        }
        sockets.add(socket);
        socket.setEncoding("utf8");
        let buffer = "";
        socket.on("data", (chunk) => {
          buffer += chunk;
          let newline;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            reply(socket, line);
          }
        });
        socket.on("error", () => {});
        socket.on("close", () => sockets.delete(socket));
      });
      server.once("error", reject);
      server.listen(boundPort, "127.0.0.1", () => {
        boundPort = server.address().port;
        resolve();
      });
    });
  }

  /** Stop listening and drop clients, like rigctld being stopped. */
  async function stop() {
    if (!server) return;
    const closing = server;
    server = null;
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => closing.close(resolve));
  }

  await listen();

  return {
    get port() {
      return boundPort;
    },
    get connections() {
      return connections;
    },
    get running() {
      return server != null;
    },
    state,
    received,
    stop,
    async start() {
      if (!server) await listen();
    }
  };
}
