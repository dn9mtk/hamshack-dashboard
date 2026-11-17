// End-to-end tests for the Hamshack Dashboard (UI + real backend).
// Many panels depend on external APIs. Those tests therefore check that every panel settles into a
// defined state (content, empty state or PanelError) without JS errors — not specific data.
import { test, expect } from "@playwright/test";

const TABS = [
  ["news", "News"], ["contests", "Contests"], ["dxpeditions", "DXped"], ["xota", "xOTA"],
  ["repeaters", "Repeater"], ["aprs", "APRS"], ["nets", "Nets"], ["band", "Band"], ["log", "Log"],
  ["ref", "Ref"], ["range", "Range"], ["space", "Space"], ["weather", "Weather"], ["muf", "MUF"],
  ["spots", "Spots"], ["psk", "PSK"], ["wspr", "WSPR"], ["digital", "Digital"], ["lightning", "Blitz"],
  ["tropo", "Tropo"], ["sat", "Sat"], ["aircraft", "Aircraft"], ["earthquakes", "Quakes"], ["warnings", "Warn"]
];

// Collect uncaught JS errors per test; every test fails if one occurs
let pageErrors;
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
});
test.afterEach(async () => {
  expect(pageErrors, `Uncaught page errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

async function openTab(page, id) {
  const tab = page.locator(`#tab-${id}`);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return page.locator("#sidebar-panel");
}

test("API health", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.ok()).toBeTruthy();
  expect(await r.json()).toEqual({ ok: true });
});

test("start page shows station from config and the map", async ({ page, request }) => {
  const cfg = await (await request.get("/api/config")).json();
  await page.goto("/");
  await expect(page.locator(".topbar .callsign")).toHaveText(cfg.callsign);
  await expect(page.locator(".topbar .sub")).toContainText(cfg.locator);
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[role="tab"]')).toHaveCount(TABS.length);
});

test("every sidebar tab renders a panel that settles", async ({ page }) => {
  test.setTimeout(TABS.length * 30_000);
  await page.goto("/");
  for (const [id, label] of TABS) {
    await test.step(`${label} (${id})`, async () => {
      const panel = await openTab(page, id);
      await expect(page.locator(`#tab-${id}`)).toHaveText(label);
      await expect(panel.locator(".panel h2").first()).toBeVisible();
      // Loading skeletons must disappear (data loaded, empty or error)
      await expect(panel.locator(".panel-loading")).toHaveCount(0, { timeout: 25_000 });
      // The panel still has content (did not collapse into an empty node)
      expect((await panel.innerText()).trim().length).toBeGreaterThan(0);
      // Record the state in the report (external sources can fail, which is not a test failure)
      // PanelError = role="alert" with a Retry button (other alerts, e.g. the rain warning in Weather, are content)
      const errors = await panel.getByRole("alert").filter({ has: page.getByRole("button", { name: "Retry loading" }) }).count();
      const empty = await panel.locator(".panel-empty, .panel-empty-inline").count();
      const state = errors ? "error" : empty ? "empty" : "content";
      test.info().annotations.push({ type: `panel:${id}`, description: state });
    });
  }
});

test("sidebar tabs support keyboard navigation", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "news");
  await page.locator("#tab-news").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tab-contests")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(page.locator(`#tab-${TABS.at(-1)[0]}`)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(page.locator("#tab-news")).toHaveAttribute("aria-selected", "true");
});

test("selected tab survives a reload", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "band");
  await page.reload();
  await expect(page.locator("#tab-band")).toHaveAttribute("aria-selected", "true");
});

test("repeaters: band filter and map markers", async ({ page }) => {
  await page.goto("/");
  const panel = await openTab(page, "repeaters");
  const group = panel.getByRole("group", { name: "Band wählen" });
  await expect(group).toBeVisible();
  const btn70 = group.getByRole("button", { name: /70\s*cm/i });
  await btn70.click();
  await expect(btn70).toHaveAttribute("aria-pressed", "true");
  // local repeater data → markers on the map
  await expect(page.locator(".leaflet-interactive, .repeater-rated-wrap").first()).toBeAttached({ timeout: 20_000 });
});

test("contests: upcoming or running contests are listed", async ({ page, request }) => {
  const { items = [] } = await (await request.get("/api/contests")).json();
  const now = Date.now();
  const relevant = items.filter((c) =>
    (c.startTime && new Date(c.startTime).getTime() > now) || (c.endTime && new Date(c.endTime).getTime() > now)
  );
  test.skip(relevant.length === 0, "contest calendar currently delivers no upcoming contests");
  await page.goto("/");
  const panel = await openTab(page, "contests");
  await expect(panel.locator(".news-slider-title").first()).toBeVisible();
  await expect(panel.locator(".panel-empty")).toHaveCount(0);
});

test("settings: open, cancel, save round-trip on the E2E config copy", async ({ page, request }) => {
  const original = await (await request.get("/api/config")).json();
  await page.goto("/");

  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#settings-callsign")).toHaveValue(original.callsign);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  const newName = `E2E QTH ${Date.now()}`;
  // The dialog reloads /api/config on every open and briefly shows the old values.
  // Wait for that response, otherwise it overwrites the input that was just typed.
  const configLoaded = page.waitForResponse((r) => r.url().endsWith("/api/config") && r.request().method() === "GET");
  await page.getByRole("button", { name: "Open settings" }).click();
  await configLoaded;
  await expect(dialog.locator("#settings-qthname")).toHaveValue(original.qthName);
  await dialog.locator("#settings-qthname").fill(newName);
  await dialog.getByRole("button", { name: "Save settings" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".topbar .sub")).toContainText(newName);
  expect((await (await request.get("/api/config")).json()).qthName).toBe(newName);

  // restore
  const r = await request.post("/api/config", { data: { qthName: original.qthName } });
  expect(r.ok()).toBeTruthy();
});

test("quick reference overlay opens, pages and closes with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quick reference (?)" }).click();
  const dialog = page.getByRole("dialog", { name: "Quick Reference" });
  await expect(dialog).toBeVisible();
  const counter = dialog.locator(".news-slider-counter");
  const before = await counter.innerText();
  await dialog.getByRole("button", { name: "Next entry" }).click();
  await expect(counter).not.toHaveText(before);
  await dialog.press("Escape");
  await expect(dialog).toBeHidden();
});

test("AI assistant opens and answers or shows a clean error", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open AI assistant" }).click();
  const dialog = page.getByRole("dialog", { name: "AI Assistant" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Message" }).fill("What is 73?");
  await dialog.locator(".chat-assistant-send").click();
  // Without Ollama an error must be shown, with Ollama an answer – never a crash
  await expect(
    dialog.locator(".chat-assistant-error").or(dialog.locator("[class*='chat-assistant-msg'], [class*='message']").last())
  ).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});
