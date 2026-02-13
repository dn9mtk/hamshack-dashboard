import { useState, useRef, useEffect } from "react";

const PANEL_LABELS = {
  news: "Local Ham News",
  contests: "Contests",
  dxpeditions: "DXpeditions",
  repeaters: "Repeaters",
  band: "Band Plan",
  log: "Logbook",
  ref: "Reference",
  range: "Range",
  space: "Space Weather",
  weather: "Weather",
  muf: "MUF / Propagation",
  spots: "Spots",
  psk: "PSK Reporter",
  sat: "Satellites"
};

export default function ChatAssistant({ open, onClose, context }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setError(null);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = (input || "").trim();
    if (!text || loading) return;

    setInput("");
    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setError(null);

    const ctx = {
      panel: context?.panel,
      panelLabel: context?.panel ? PANEL_LABELS[context.panel] : null,
      locator: context?.locator,
      callsign: context?.callsign,
      qthName: context?.qthName,
      utc: new Date().toISOString()
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })), context: ctx })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.message || data?.error || `HTTP ${res.status}`;
        if (res.status === 503) throw new Error("Ollama not running. Start: ollama serve (and ollama pull llama3.2)");
        throw new Error(msg);
      }

      const content = data?.content?.trim() || "(No response)";
      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="chat-assistant-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-assistant-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="chat-assistant-panel" onClick={(e) => e.stopPropagation()}>
        <div className="chat-assistant-header">
          <h3 id="chat-assistant-title">AI Assistant</h3>
          <button
            type="button"
            className="chat-assistant-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {(!context?.callsign || context.callsign === "—" || !context?.locator || context.locator === "—") && (
          <div className="chat-assistant-config-tip">
            Rufzeichen und QTH in den Einstellungen eintragen – dann kann ich z.B. sagen, welches Relais am nächsten ist, ob du gespottet wurdest oder ob DX lohnt.
          </div>
        )}
        <div className="chat-assistant-hint">
          Frag z.B.: Nächstes Contest? Relais? Spots? Grayline? Wo CW-Betrieb? Bandplan? Bei fehlenden Details wird automatisch im Web gesucht.
        </div>
        <div ref={listRef} className="chat-assistant-messages">
          {messages.length === 0 && (
            <div className="chat-assistant-empty">
              Beispiele: &quot;Welches Contest als nächstes?&quot; · &quot;Wo ist CW-Betrieb möglich?&quot; · &quot;Welches Relais am nächsten?&quot; · &quot;Bandplan 20m?&quot; · &quot;Wurde ich gespottet?&quot;
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-message chat-message-${m.role}`}>
              <span className="chat-message-role">{m.role === "user" ? "You" : "Assistant"}</span>
              <div className="chat-message-content">{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="chat-message chat-message-assistant">
              <span className="chat-message-role">Assistant</span>
              <div className="chat-message-content chat-message-loading">Thinking…</div>
            </div>
          )}
        </div>
        {error && (
          <div className="chat-assistant-error">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="chat-assistant-form">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={loading}
            className="chat-assistant-input"
            aria-label="Message"
          />
          <button type="submit" disabled={loading || !input.trim()} className="chat-assistant-send">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
