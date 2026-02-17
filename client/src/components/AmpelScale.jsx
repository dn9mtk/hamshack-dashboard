/** Reusable traffic-light (Ampel) scale for UV index, air quality, etc. */
export const UV_SEGMENTS = [
  { max: 2, color: "#51cf66", label: "Low" },
  { max: 5, color: "#ffd43b", label: "Moderate" },
  { max: 7, color: "#f59f00", label: "High" },
  { max: 10, color: "#e67700", label: "Very high" },
  { max: 15, color: "#c92a2a", label: "Extreme" }
];

export const AQI_SEGMENTS = [
  { max: 50, color: "#51cf66", label: "Good" },
  { max: 100, color: "#ffd43b", label: "Moderate" },
  { max: 150, color: "#f59f00", label: "Unhealthy (sensitive)" },
  { max: 200, color: "#e67700", label: "Unhealthy" },
  { max: 500, color: "#c92a2a", label: "Very unhealthy" }
];

export function getUvLevel(uv) {
  if (uv == null || !Number.isFinite(uv)) return { label: "—", color: "var(--muted)" };
  const v = Number(uv);
  const seg = UV_SEGMENTS.find((s) => v <= s.max) ?? UV_SEGMENTS[UV_SEGMENTS.length - 1];
  return seg;
}

export default function AmpelScale({ segments, value, valueLabel, valueMax }) {
  const level = value != null && Number.isFinite(value)
    ? segments.find((s) => value <= s.max) ?? segments[segments.length - 1]
    : null;
  const activeIdx = level ? segments.indexOf(level) : -1;

  return (
    <div className="ampel-scale-wrap">
      <div className="ampel-scale" role="img" aria-label={level ? `${valueLabel}: ${value} – ${level.label}` : valueLabel}>
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`ampel-segment ${i === activeIdx ? "ampel-segment--active" : ""}`}
            style={{ backgroundColor: seg.color }}
            title={seg.label}
          />
        ))}
      </div>
      <div className="ampel-label">
        <span className="ampel-value-badge" style={{ color: level?.color ?? "var(--muted)" }}>
          {value != null && Number.isFinite(value) ? (valueMax ? Math.round(value) : Number(value).toFixed(1)) : "—"}
        </span>
        <span className="ampel-status" style={{ color: level?.color ?? "var(--muted)" }}>
          {level?.label ?? "—"}
        </span>
      </div>
    </div>
  );
}
