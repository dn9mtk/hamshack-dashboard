// E2E tests: Playwright against a dedicated test server (not the production instance).
// - own port (E2E_PORT, default 8799)
// - copy of server/data/config.json in the temp dir, so Settings tests never touch real station data
// - DX cluster / RBN pointed at a closed local port, so the test server does not open a second
//   cluster login with the real callsign
import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.E2E_PORT || 8799);
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
  webServer: {
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
      RBN_PORT: "9"
    }
  }
});
