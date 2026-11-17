// Rig control in the header display, against the fake rigctld started by playwright.config.js.
// The offline test stops the fake and must stay last: the server then backs off reconnecting.
import { test, expect } from "@playwright/test";
import { E2E_RIG_CONTROL_URL } from "../playwright.config.js";

const RIG_FREQ_KEY = "hamshack_rig_freq_mhz";

let pageErrors;
test.beforeEach(async ({ page, request }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await control(request, "/reset");
});
test.afterEach(async () => {
  expect(pageErrors, `Uncaught page errors:\n${pageErrors.join("\n")}`).toEqual([]);
});
test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  await control(request, "/reset");
  await request.dispose();
});

async function control(request, path, data) {
  const r = await request.post(`${E2E_RIG_CONTROL_URL}${path}`, data ? { data } : undefined);
  expect(r.ok()).toBeTruthy();
  return r.json();
}

async function rigState(request) {
  return (await request.get(`${E2E_RIG_CONTROL_URL}/state`)).json();
}

function rigDisplay(page) {
  const wrap = page.locator(".rig-display-wrap");
  return {
    wrap,
    freq: wrap.locator(".rig-display-show"),
    input: wrap.getByLabel("Frequency (MHz)"),
    band: wrap.locator(".rig-display-band"),
    mode: wrap.getByLabel("Rig mode"),
    sMeter: wrap.locator(".rig-display-smeter"),
    tx: wrap.locator(".rig-display-tx"),
    status: wrap.getByRole("status"),
    alert: wrap.getByRole("alert")
  };
}

test("rig control disabled: manual frequency as before, polling stops", async ({ page }) => {
  let rigRequests = 0;
  await page.route("**/api/rig", (route) => {
    rigRequests += 1;
    return route.fulfill({
      json: { enabled: false, connected: false, freqHz: null, mode: null, tx: null, sMeterDb: null, updatedAt: null, error: null }
    });
  });
  await page.goto("/");
  const rig = rigDisplay(page);
  await expect(rig.freq).toBeVisible();
  await page.waitForTimeout(1000);
  // one request per mount (a development build of React mounts twice in StrictMode)
  const requestsAfterLoad = rigRequests;
  expect(requestsAfterLoad).toBeGreaterThanOrEqual(1);
  expect(requestsAfterLoad).toBeLessThanOrEqual(2);
  await expect(rig.status).toHaveCount(0);
  await expect(rig.mode).toHaveCount(0);
  await rig.freq.click();
  await rig.input.fill("14.195");
  await rig.input.press("Enter");
  await expect(rig.freq).toHaveText("14.195");
  await expect(rig.band).toHaveText("20 m");
  expect(await page.evaluate((key) => localStorage.getItem(key), RIG_FREQ_KEY)).toBe("14.195");
  await page.waitForTimeout(2500);
  expect(rigRequests).toBe(requestsAfterLoad);
});

test("live rig: frequency, mode, S-meter and Live status", async ({ page }) => {
  await page.goto("/");
  const rig = rigDisplay(page);
  await expect(rig.status).toHaveText("Live");
  await expect(rig.freq).toHaveText("28.07400");
  await expect(rig.band).toHaveText("10 m");
  await expect(rig.mode).toHaveValue("DATA-U");
  await expect(rig.sMeter).toHaveText("S-meter S7");
  await expect(rig.tx).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), RIG_FREQ_KEY)).toBeNull();
});

test("tune frequency and mode from the dashboard, out-of-band input is refused", async ({ page, request }) => {
  await page.goto("/");
  const rig = rigDisplay(page);
  await expect(rig.status).toHaveText("Live");

  await rig.freq.click();
  await rig.input.fill("28.5");
  await rig.input.press("Enter");
  await expect.poll(async () => (await rigState(request)).freqHz).toBe(28_500_000);
  await expect(rig.freq).toHaveText("28.50000");
  await expect(rig.freq).toBeFocused();

  await rig.mode.selectOption("USB");
  await expect.poll(async () => (await rigState(request)).mode).toBe("USB");
  await expect(rig.mode).toHaveValue("USB");

  await rig.freq.click();
  await rig.input.fill("14.074");
  await rig.input.press("Enter");
  await expect(rig.alert).toHaveText("14.074 MHz is outside the bands allowed for licence class N. Nothing was sent to the rig.");
  const state = await rigState(request);
  expect(state.freqHz).toBe(28_500_000);
  expect(state.writes).toEqual(["+\\set_freq 28500000", "+\\set_mode USB -1"]);
  expect(await page.evaluate((key) => localStorage.getItem(key), RIG_FREQ_KEY)).toBeNull();
});

test("frequency entry keeps the shown mode across a band change", async ({ page, request }) => {
  // FT-991A behaviour: a new band recalls its band-stack mode, a mode change shifts the frequency
  await control(request, "/state", {
    freqHz: 438_625_000,
    mode: "FM",
    bandStackModes: [
      { lowHz: 144_000_000, highHz: 146_000_000, mode: "CW" },
      { lowHz: 430_000_000, highHz: 440_000_000, mode: "USB" }
    ],
    modeChangeOffsetHz: 700
  });
  await page.goto("/");
  const rig = rigDisplay(page);
  await expect(rig.status).toHaveText("Live");
  await expect(rig.mode).toHaveValue("FM");

  await rig.freq.click();
  await rig.input.fill("145.5");
  await rig.input.press("Enter");
  await expect.poll(async () => (await rigState(request)).writes).toHaveLength(3);
  const state = await rigState(request);
  expect([state.freqHz, state.mode]).toEqual([145_500_000, "FM"]);
  expect(state.writes).toEqual(["+\\set_freq 145500000", "+\\set_mode FM -1", "+\\set_freq 145500000"]);
  await expect(rig.freq).toHaveText("145.5000");
  await expect(rig.mode).toHaveValue("FM");
  await expect(rig.alert).toHaveCount(0);
});

test("TX badge locks the controls while the rig transmits", async ({ page, request }) => {
  await page.goto("/");
  const rig = rigDisplay(page);
  await expect(rig.status).toHaveText("Live");
  await control(request, "/state", { ptt: 1 });
  await expect(rig.tx).toHaveText("TX");
  await expect(rig.status).toHaveText("Live – transmitting, controls locked");
  await expect(rig.freq).toBeDisabled();
  await expect(rig.mode).toBeDisabled();
  await control(request, "/state", { ptt: 0 });
  await expect(rig.tx).toHaveCount(0);
  await expect(rig.status).toHaveText("Live");
  await expect(rig.freq).toBeEnabled();
  await expect(rig.mode).toBeEnabled();
  expect((await rigState(request)).writes).toEqual([]);
});

test("band label and Range panel follow the live frequency", async ({ page, request }) => {
  await control(request, "/state", { freqHz: 144_300_000, mode: "USB" });
  await page.goto("/");
  const rig = rigDisplay(page);
  await expect(rig.band).toHaveText("2 m");
  await page.locator("#tab-range").click();
  const panel = page.locator("#sidebar-panel");
  await panel.getByRole("button", { name: "Next section" }).click();
  const freq = panel.locator(".range-input-block--readonly .range-value");
  await expect(freq).toHaveText("144.300 MHz");
  await control(request, "/state", { freqHz: 432_200_000, mode: "FM" });
  await expect(freq).toHaveText("432.200 MHz");
  await expect(rig.band).toHaveText("70 cm");
});

test("rig offline falls back to the manual frequency", async ({ page, request }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "7.074"), RIG_FREQ_KEY);
  await page.goto("/");
  const rig = rigDisplay(page);
  await expect(rig.status).toHaveText("Live");
  await expect(rig.freq).toHaveText("28.07400");
  await control(request, "/offline");
  await expect(rig.status).toHaveText("Rig offline");
  await expect(rig.freq).toHaveText("7.074");
  await expect(rig.band).toHaveText("40 m");
  await expect(rig.mode).toHaveCount(0);
});
