/**
 * Rig frequency: formatted display like a radio LCD; click to edit inline.
 * With rig control enabled on the server, shows the live state of the rig (frequency, mode,
 * S-meter, TX) and tunes it; while the rig is offline it falls back to the manual value.
 */
import { useState, useRef, useEffect } from "react";
import { freqToBand } from "../lib/freqToBand.js";
import { setRigFrequency, setRigMode } from "../lib/rigApi.js";
import { liveRigFreqMHz } from "../lib/useRigStatus.js";

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

function formatLiveFreq(freqHz) {
  return (freqHz / 1e6).toFixed(freqHz >= 1e8 ? 4 : 5);
}

/** hamlib STRENGTH is dB relative to S9; one S unit is 6 dB. */
function formatSMeter(db) {
  if (!Number.isFinite(db)) return null;
  if (db > 0) return `S9+${Math.round(db)}`;
  return `S${Math.max(0, Math.round(9 + db / 6))}`;
}

/** MHz as typed (kHz from 1000 upwards, like the manual value) to Hz, or null. */
function parseFreqToHz(text) {
  const n = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n >= 1000 ? n * 1e3 : n * 1e6);
}

export default function RigDisplay({ freqValue, onFreqChange, rig, onRigUpdate }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [pending, setPending] = useState(false);
  const [rigError, setRigError] = useState(null);
  const inputRef = useRef(null);
  const freqButtonRef = useRef(null);
  const modeSelectRef = useRef(null);
  // Control that gets keyboard focus back once a rig request has finished
  const focusAfterRequestRef = useRef(null);

  const rigEnabled = Boolean(rig?.enabled);
  const liveFreq = liveRigFreqMHz(rig);
  const live = liveFreq != null;
  const tx = live && rig.tx === true;
  const locked = tx || pending;

  const raw = live ? liveFreq : (freqValue || "").trim();
  const num = raw === "" ? null : Number(raw.replace(",", "."));
  const displayStr = live ? formatLiveFreq(rig.freqHz) : formatFreqDisplay(raw === "" ? null : num);
  const band = num != null && Number.isFinite(num) ? freqToBand(num) : null;
  const sMeter = live ? formatSMeter(rig.sMeterDb) : null;
  const modes = live ? rig.modes || [] : [];
  const modeOptions = live && rig.mode && !modes.includes(rig.mode) ? [rig.mode, ...modes] : modes;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!live) setRigError(null);
  }, [live]);

  useEffect(() => {
    if (tx) setEditing(false);
  }, [tx]);

  useEffect(() => {
    if (pending || !focusAfterRequestRef.current) return;
    focusAfterRequestRef.current.current?.focus();
    focusAfterRequestRef.current = null;
  }, [pending]);

  async function sendToRig(request) {
    setPending(true);
    setRigError(null);
    try {
      onRigUpdate?.(await request());
    } catch (e) {
      setRigError(e?.message || "The rig did not accept the change.");
    } finally {
      setPending(false);
    }
  }

  function startEdit() {
    setEditValue(raw);
    setRigError(null);
    setEditing(true);
  }

  function commitEdit() {
    setEditing(false);
    const v = editValue.trim();
    if (v === raw) return;
    if (!live) {
      if (onFreqChange) onFreqChange(v);
      return;
    }
    const freqHz = parseFreqToHz(v);
    if (freqHz == null) {
      setRigError("Enter the frequency in MHz, e.g. 28.074. Nothing was sent to the rig.");
      return;
    }
    focusAfterRequestRef.current = freqButtonRef;
    sendToRig(() => setRigFrequency(freqHz));
  }

  function cancelEdit() {
    setEditValue(raw);
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      cancelEdit();
      inputRef.current?.blur();
    }
  }

  // Tuning the live rig needs Enter; leaving the field must not tune it by accident
  function handleBlur() {
    if (live) cancelEdit();
    else commitEdit();
  }

  function handleModeChange(e) {
    const mode = e.target.value;
    if (mode === rig.mode) return;
    focusAfterRequestRef.current = modeSelectRef;
    sendToRig(() => setRigMode(mode));
  }

  const editTitle = live
    ? "Type a frequency in MHz and press Enter to tune the rig"
    : "Enter frequency in MHz, e.g. 14.195";
  const showTitle = live
    ? tx
      ? "The rig is transmitting – controls are locked"
      : "Click to tune the rig"
    : "Click to edit – your operating frequency for propagation and band lookups";
  const statusTitle = live ? "Live from the rig (rigctld)" : `Rig offline – showing your manual frequency. ${rig?.error || ""}`.trim();

  return (
    <div className="rig-display-wrap" role="presentation">
      <div className={`rig-display${live ? " rig-display--live" : ""}${tx ? " rig-display--tx" : ""}`}>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            className="rig-display-freq rig-display-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="———.———"
            aria-label="Frequency (MHz)"
            title={editTitle}
          />
        ) : (
          <button
            ref={freqButtonRef}
            type="button"
            className="rig-display-freq rig-display-show"
            onClick={startEdit}
            disabled={live && locked}
            aria-label={live ? "Tune rig frequency (click)" : "Edit frequency (click)"}
            title={showTitle}
          >
            {displayStr}
          </button>
        )}
        <span className="rig-display-unit">MHz</span>
      </div>
      {(band || rigEnabled) && (
        <div className="rig-display-meta">
          {band && <span className="rig-display-band">{band}</span>}
          {live && (
            <select
              ref={modeSelectRef}
              className="ui-select rig-display-mode"
              aria-label="Rig mode"
              value={rig.mode || ""}
              onChange={handleModeChange}
              disabled={locked}
            >
              {modeOptions.map((m) => (
                <option key={m} value={m} disabled={!modes.includes(m)}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {sMeter && (
            <span className="rig-display-smeter" title="S-meter">
              <span className="sr-only">S-meter </span>
              {sMeter}
            </span>
          )}
          {tx && (
            <span className="rig-display-tx" title="The rig is transmitting – controls are locked">
              TX
            </span>
          )}
          {rigEnabled && (
            <span className={`rig-display-status${live ? " rig-display-status--live" : ""}`} role="status" title={statusTitle}>
              <span className="rig-display-dot" aria-hidden />
              {live ? "Live" : "Rig offline"}
              {tx && <span className="sr-only"> – transmitting, controls locked</span>}
            </span>
          )}
        </div>
      )}
      {rigError && (
        <div className="rig-display-error" role="alert">
          {rigError}
        </div>
      )}
    </div>
  );
}
