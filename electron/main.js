const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const PORT = process.env.PORT || 8787;
let serverProcess = null;

function getServerPath() {
  // Gepackte App: Server liegt in extraResources (process.resourcesPath)
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "server");
  }
  return path.join(app.getAppPath(), "server");
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverDir = getServerPath();
    const isWindows = process.platform === "win32";
    const nodeCmd = isWindows ? "node" : "node";
    const args = ["index.js"];

    serverProcess = spawn(nodeCmd, args, {
      cwd: serverDir,
      env: { ...process.env, PORT: String(PORT) },
      stdio: "pipe"
    });

    serverProcess.stderr?.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) console.error("[Server]", msg);
    });

    serverProcess.on("error", (err) => {
      reject(err);
    });

    serverProcess.on("exit", (code, signal) => {
      if (code !== null && code !== 0) {
        console.error("[Server] exited with code", code);
      }
    });

    // Wait for server to be ready
    const url = `http://127.0.0.1:${PORT}/api/health`;
    let attempts = 0;
    const maxAttempts = 50;

    function check() {
      attempts++;
      const http = require("http");
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        if (attempts < maxAttempts) setTimeout(check, 200);
        else reject(new Error("Server did not become ready"));
      });
      req.on("error", () => {
        if (attempts < maxAttempts) setTimeout(check, 200);
        else reject(new Error("Server did not become ready"));
      });
      req.setTimeout(1000, () => {
        req.destroy();
        if (attempts < maxAttempts) setTimeout(check, 200);
        else reject(new Error("Server timeout"));
      });
    }

    setTimeout(check, 500);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    title: "Hamshack Dashboard",
    show: false
  });

  win.loadURL(`http://127.0.0.1:${PORT}`);

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("closed", () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}

app.whenReady().then(() => {
  startServer()
    .then(() => {
      createWindow();
    })
    .catch((err) => {
      console.error("Failed to start server:", err);
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});
