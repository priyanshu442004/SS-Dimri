import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API, api } from "@shared/api";
import { Icon, EASE } from "@shared/ui";

/** Streaming CFO chat bound to one analysis. */
export default function Chat({ id, initial, company }) {
  const [messages, setMessages] = useState(initial || []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const abort = useRef(null);
  const end = useRef(null);
  const box = useRef(null);

  useEffect(() => { api("/suggestions").then((d) => setSuggestions(d.suggestions)).catch(() => {}); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || streaming) return;
    setInput(""); setError(""); setStreaming(true);
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", pending: true }]);
    const ctrl = new AbortController(); abort.current = ctrl;
    try {
      const res = await fetch(`${API}/runs/${id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q }), signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i).replace(/^data:\s*/, ""); buf = buf.slice(i + 2);
          if (!line) continue;
          const evt = JSON.parse(line);
          if (evt.error) throw new Error(evt.error);
          if (evt.delta) setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c.at(-1), content: c.at(-1).content + evt.delta }; return c; });
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") { setError(e.message); setMessages((m) => (m.at(-1)?.content ? m : m.slice(0, -2))); }
    } finally {
      setMessages((m) => m.map((x) => ({ ...x, pending: false })));
      setStreaming(false); abort.current = null;
      box.current?.focus();
    }
  };

  const reset = async () => { if (streaming) return; await api(`/runs/${id}/chat/reset`, { method: "POST" }); setMessages([]); };

  return (
    <div className="flex h-[calc(100dvh-230px)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-ink/8 bg-white/70">
      <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm"><span className="size-2 rounded-full bg-teal" /> CFO Intelligence · answers from {company}'s statements</span>
        <div className="flex gap-1">
          <a href={`${API}/runs/${id}/transcript`} className="rounded-lg px-2.5 py-1.5 text-[13px] text-muted hover:bg-ink/5 hover:text-ink">Export</a>
          <button onClick={reset} disabled={!messages.length || streaming} className="rounded-lg px-2.5 py-1.5 text-[13px] text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-40">New chat</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
        {!messages.length && (
          <div className="mx-auto max-w-xl py-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink text-lime"><Icon name="cfo" className="size-6" /></span>
            <h3 className="mt-4 text-xl font-medium">Ask your CFO anything about these numbers</h3>
            <p className="mt-1.5 text-sm text-muted">Answers come from the four statements you uploaded — with the source named.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-xl border border-ink/10 bg-white px-3.5 py-3 text-left text-[13.5px] transition-colors hover:border-teal/50 hover:bg-teal/5">{s}</button>
              ))}
            </div>
          </div>
        )}
        <div className="mx-auto max-w-3xl space-y-5">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ y: 8 }} animate={{ y: 0 }} transition={{ duration: 0.35, ease: EASE }}
                className={m.role === "user" ? "flex justify-end" : "flex gap-3"}>
                {m.role === "user" ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-paper">{m.content}</p>
                ) : (
                  <>
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="cfo" className="size-4" /></span>
                    <div className={`prose-cfo min-w-0 flex-1 ${m.pending ? "caret" : ""}`}>
                      {m.content ? <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown> : <span className="text-muted">Thinking…</span>}
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={end} />
        </div>
      </div>

      {error && <p role="alert" className="mx-4 mb-2 rounded-lg bg-rose-soft px-3 py-2 text-sm text-rose">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-ink/8 p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-ink/12 bg-white p-2 focus-within:border-teal">
          <textarea ref={box} rows={1} value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about margins, debt, cash flow, ratios…" aria-label="Message"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none" style={{ fieldSizing: "content" }} />
          {streaming
            ? <button type="button" onClick={() => abort.current?.abort()} className="grid size-10 place-items-center rounded-xl bg-ink/10 text-ink" aria-label="Stop"><span className="size-3 rounded-sm bg-ink" /></button>
            : <button type="submit" disabled={!input.trim()} className="grid size-10 place-items-center rounded-xl bg-ink text-paper disabled:opacity-30" aria-label="Send"><Icon name="arrow" className="size-4" /></button>}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted">Enter to send · Shift + Enter for a new line · AI answers can be wrong — check key figures against the statements.</p>
      </form>
    </div>
  );
}
