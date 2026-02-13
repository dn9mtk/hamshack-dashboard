/**
 * Wraps content with an optional info icon and tooltip from glossary.
 * Use for MUF, LUF, SFI, etc.
 */
import { GLOSSARY } from "../lib/glossary.js";

export default function InfoTooltip({ term, children, inline = true }) {
  const entry = GLOSSARY[term];
  if (!entry) return children ?? null;
  const title = `${entry.full}: ${entry.def}`;
  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper
      className="info-tooltip"
      style={{ display: inline ? "inline-flex" : "flex", alignItems: "center", gap: 4 }}
      title={title}
      tabIndex={0}
      aria-label={`${entry.term} – ${entry.full}. ${entry.def}`}
    >
      {children}
      <span className="info-tooltip-icon" aria-hidden>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </span>
    </Wrapper>
  );
}
