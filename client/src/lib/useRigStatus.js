/**
 * Live rig state: polls /api/rig every second while the tab is visible (chained timeouts,
 * one request at a time). Polling stops for good when the server reports rig control as disabled.
 */
import { useEffect, useState } from "react";
import { fetchRigStatus } from "./rigApi.js";

const POLL_MS = 1000;

function offlineReason(e) {
  return e?.name === "AbortError" ? "Dashboard server did not answer" : e?.message || "Rig status unavailable";
}

export function useRigStatus() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let timer = null;
    let inFlight = false;
    let stopped = false;
    const unmount = new AbortController();

    async function poll() {
      if (inFlight || stopped) return;
      inFlight = true;
      clearTimeout(timer);
      try {
        const next = await fetchRigStatus(unmount.signal);
        if (stopped) return;
        setStatus(next);
        if (!next.enabled) {
          stopped = true;
          return;
        }
      } catch (e) {
        if (stopped) return;
        setStatus((prev) => (prev?.enabled ? { ...prev, connected: false, error: offlineReason(e) } : prev));
      } finally {
        inFlight = false;
      }
      if (document.visibilityState === "visible") timer = setTimeout(poll, POLL_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") poll();
      else clearTimeout(timer);
    }

    poll();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      unmount.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return { status, setStatus };
}

/** Live rig frequency in MHz (string, like the manual value), or null when the rig is not live. */
export function liveRigFreqMHz(status) {
  if (!status?.enabled || !status.connected || !Number.isFinite(status.freqHz)) return null;
  return String(status.freqHz / 1e6);
}
