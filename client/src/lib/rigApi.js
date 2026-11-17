/**
 * Rig control API (server: /api/rig, backed by hamlib rigctld).
 */
const STATUS_TIMEOUT_MS = 3000;

async function errorMessage(r) {
  try {
    const body = await r.json();
    if (body?.message) return body.message;
  } catch {}
  return `Rig request failed (HTTP ${r.status})`;
}

/** Current rig status; aborted after 3 s or when `signal` aborts. */
export async function fetchRigStatus(signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, STATUS_TIMEOUT_MS);
  signal?.addEventListener("abort", abort);
  try {
    const r = await fetch("/api/rig", { cache: "no-store", signal: controller.signal });
    if (!r.ok) throw new Error(await errorMessage(r));
    return await r.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function postRig(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(await errorMessage(r));
  return r.json();
}

/** Tune the rig; with a mode, the rig keeps that mode even when the band-stack recall would change it. */
export function tuneRig(freqHz, mode) {
  return postRig("/api/rig/tune", { freqHz, ...(mode ? { mode } : {}) });
}

export function setRigMode(mode) {
  return postRig("/api/rig/mode", { mode });
}
