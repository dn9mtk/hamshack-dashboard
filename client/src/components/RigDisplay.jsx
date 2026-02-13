/**
 * Rig frequency: formatted display like a radio LCD; click to edit inline.
 */
import { useState, useRef, useEffect } from "react";
import { freqToBand } from "../lib/freqToBand.js";

function formatFreqDisplay(value) {
  if (value == null || value === "") return "———.———";
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "———.———";
  if (n >= 1000) return (n / 1000).toFixed(3);
  if (n >= 100) return n.toFixed(2);
  if (n >= 10) return n.toFixed(3);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

export default function RigDisplay({ freqValue, onFreqChange }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef(null);

  const raw = (freqValue || "").trim();
  const num = raw === "" ? null : Number(raw.replace(",", "."));
  const displayStr = formatFreqDisplay(raw === "" ? null : num);
  const band = num != null && Number.isFinite(num) ? freqToBand(num) : null;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setEditValue(raw);
    setEditing(true);
  }

  function commitEdit() {
    setEditing(false);
    const v = editValue.trim();
    if (v !== raw && onFreqChange) onFreqChange(v);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      setEditValue(raw);
      setEditing(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="rig-display-wrap" role="presentation">
      <div className="rig-display">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            className="rig-display-freq rig-display-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            placeholder="———.———"
            aria-label="Frequency (MHz)"
            title="Enter frequency in MHz, e.g. 14.195"
          />
        ) : (
          <button
            type="button"
            className="rig-display-freq rig-display-show"
            onClick={startEdit}
            aria-label="Edit frequency (click)"
            title="Click to edit – your operating frequency for propagation and band lookups"
          >
            {displayStr}
          </button>
        )}
        <span className="rig-display-unit">MHz</span>
      </div>
      {band && <span className="rig-display-band">{band}</span>}
    </div>
  );
}
