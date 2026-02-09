/** English month abbreviations for date display (e.g. 3 Feb 2026) */
export const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dtfLocal = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

const dtfUtc = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC"
});

function parseLooseTimestamp(input) {
  if (!input) return null;
  if (input instanceof Date) return Number.isFinite(input.getTime()) ? input : null;

  const s0 = String(input).trim();
  if (!s0) return null;

  // Try native parse first (handles ISO, RFC, etc.)
  const t1 = Date.parse(s0);
  if (Number.isFinite(t1)) return new Date(t1);

  // NOAA products sometimes use "YYYY-MM-DD HH:mm:ss.SSS" (UTC-ish). Convert to ISO.
  // Example: "2026-02-03 03:00:00.000"
  const m = s0.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)$/);
  if (m) {
    const iso = `${m[1]}T${m[2]}Z`;
    const t2 = Date.parse(iso);
    if (Number.isFinite(t2)) return new Date(t2);
  }

  return null;
}

/** Format date as "day month year" (e.g. 3 Feb 2026). Plain ISO date (YYYY-MM-DD) is parsed as noon UTC for timezone-independent day. */
export function formatDate(input) {
  if (!input) return "";
  let d = parseLooseTimestamp(input);
  if (!d && typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    d = new Date(input.trim() + "T12:00:00Z");
    if (!Number.isFinite(d.getTime())) d = null;
  }
  if (!d) return "";
  const day = d.getUTCDate();
  const month = MONTHS_EN[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day}. ${month} ${year}`;
}

/** Date range: "day month year – day month year" or a single date. */
export function formatDateRange(start, end) {
  if (!start && !end) return "";
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e && s !== e) return `${s} – ${e}`;
  return s || e || "";
}

export function formatDateTimeLocal(input) {
  const d = parseLooseTimestamp(input);
  return d ? dtfLocal.format(d) : "—";
}

/** Format: "day month year, HH:mm UTC" (e.g. 3 Feb 2026, 14:30 UTC). */
export function formatDateTimeUtc(input) {
  const d = parseLooseTimestamp(input);
  if (!d) return "—";
  const datePart = formatDate(d);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const timePart = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return `${datePart}, ${timePart} UTC`;
}

export function formatTimeLocal(input) {
  const d = parseLooseTimestamp(input);
  if (!d) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Time only UTC: "HH:mm UTC". */
export function formatTimeUtc(input) {
  const d = parseLooseTimestamp(input);
  if (!d) return "—";
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`;
}

