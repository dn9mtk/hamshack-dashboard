/**
 * Unified error display with Retry for data panels.
 */
export default function PanelError({ message, onRetry, label = "Error" }) {
  return (
    <div
      role="alert"
      style={{
        padding: "12px 14px",
        border: "1px solid rgba(255,180,180,0.4)",
        borderRadius: 10,
        background: "rgba(255,180,180,0.08)",
        color: "#ffb4b4",
        fontSize: 13,
        display: "flex",
        flexDirection: "column",
        gap: 10
      }}
    >
      <span>{label}: {message}</span>
      {typeof onRetry === "function" && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            alignSelf: "flex-start",
            padding: "6px 12px",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 8,
            color: "white",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600
          }}
          aria-label="Retry loading"
        >
          Retry
        </button>
      )}
    </div>
  );
}
