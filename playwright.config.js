// E2E tests: Playwright against a dedicated test server (not the production instance).
// - own port (E2E_PORT, default 8799)
// - copy of server/data/config.json in the temp dir, so Settings tests never touch real station data
// - DX cluster / RBN pointed at a closed local port, so the test server does not open a second
//   cluster login with the real callsign
// - rig control enabled against a fake rigctld on its own loopback port (never a real rig)
import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.E2E_PORT || 8799);
const RIG_PORT = Number(process.env.E2E_RIG_PORT || 8797);
const RIG_CONTROL_PORT = Number(process.env.E2E_RIG_CONTROL_PORT || 8798);
export const E2E_RIG_CONTROL_URL = `http://127.0.0.1:${RIG_CONTROL_PORT}`;
const realConfig = path.resolve("server/data/config.json");
export const E2E_CONFIG_PATH = path.join(os.tmpdir(), "hamshack-e2e-config.json");

// Only the main runner process prepares the config copy (workers re-import this file)
if (!process.env.TEST_WORKER_INDEX) {
  if (fs.existsSync(realConfig)) fs.copyFileSync(realConfig, E2E_CONFIG_PATH);
  else fs.rmSync(E2E_CONFIG_PATH, { force: true });
}

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // one shared server with external API caches – keep upstream load low
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "e2e-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1600, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } }],
  webServer: [
    {
      command: "node e2e/support/fake-rigctld.mjs",
      url: `${E2E_RIG_CONTROL_URL}/health`,
      reuseExistingServer: false,
      timeout: 15_000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        E2E_RIG_PORT: String(RIG_PORT),
        E2E_RIG_CONTROL_PORT: String(RIG_CONTROL_PORT)
      }
    },
    {
      command: "node server/index.js",
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        PORT: String(PORT),
        HAMSHACK_CONFIG_PATH: E2E_CONFIG_PATH,
        DXCLUSTER_HOST: "127.0.0.1",
        DXCLUSTER_PORT: "9",
        RBN_HOST: "127.0.0.1",
        RBN_PORT: "9",
        RIGCTLD_ENABLED: "true",
        RIGCTLD_HOST: "127.0.0.1",
        RIGCTLD_PORT: String(RIG_PORT),
        RIGCTLD_TIMEOUT_MS: "1000",
        RIG_POLL_MS: "500",
        RIG_LICENCE_CLASS: "N"
      }
    }
  ]
});
