/**
 * Skeleton placeholder while panel data is loading.
 */
export default function PanelLoading({ lines = 5 }) {
  return (
    <div
      className="panel-loading"
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          style={{
            height: 14,
            borderRadius: 6,
            background: "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 100%)",
            backgroundSize: "200% 100%",
            animation: "panel-loading-shine 1.2s ease-in-out infinite",
            maxWidth: i === lines - 1 && lines > 2 ? "60%" : "100%"
          }}
        />
      ))}
    </div>
  );
}
