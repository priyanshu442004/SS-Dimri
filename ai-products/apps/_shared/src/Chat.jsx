// "Chat with your processed documents" — shared by the product apps.
// Talks to the routes in apps/_shared/server/chat.js (or the GST backend's equivalent).
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API, api, useApi } from "./api";
import { Icon, EASE, PageHeader, Empty, Btn, Loading, ErrorNote } from "./ui";
import { ago } from "./format";

/** Streaming chat bound to one processed job (`id`). */
export function DocChat({ id, scope, icon = "chat", placeholder = "Ask about this job…", height = "h-[calc(100dvh-260px)] min-h-[520px]" }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const abort = useRef(null);
  const end = useRef(null);
  const box = useRef(null);

  useEffect(() => { api("/chat/suggestions").then((d) => setSuggestions(d.suggestions)).catch(() => {}); }, []);
  useEffect(() => {
    setMessages([]); setError("");
    api(`/runs/${id}/chat`).then((d) => setMessages(d.messages || [])).catch(() => {});
    return () => abort.current?.abort();
  }, [id]);
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
    <div className={`flex ${height} flex-col overflow-hidden rounded-2xl border border-ink/8 bg-white/70`}>
      <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm"><span className="size-2 shrink-0 rounded-full bg-teal" /><span className="truncate">Answers from {scope}</span></span>
        <div className="flex shrink-0 gap-1">
          <a href={`${API}/runs/${id}/transcript`} className="rounded-lg px-2.5 py-1.5 text-[13px] text-muted hover:bg-ink/5 hover:text-ink">Export</a>
          <button onClick={reset} disabled={!messages.length || streaming} className="rounded-lg px-2.5 py-1.5 text-[13px] text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-40">New chat</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
        {!messages.length && (
          <div className="mx-auto max-w-xl py-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink text-lime"><Icon name={icon} className="size-6" /></span>
            <h3 className="mt-4 text-xl font-medium">Chat with your processed documents</h3>
            <p className="mt-1.5 text-sm text-muted">Ask anything about {scope}. Answers come from the processed output and the files you uploaded.</p>
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
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name={icon} className="size-4" /></span>
                    <div className={`prose-cfo min-w-0 flex-1 overflow-x-auto ${m.pending ? "caret" : ""}`}>
                      {m.content ? <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown> : <span className="text-muted">Reading the documents…</span>}
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
            placeholder={placeholder} aria-label="Message"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none" style={{ fieldSizing: "content" }} />
          {streaming
            ? <button type="button" onClick={() => abort.current?.abort()} className="grid size-10 place-items-center rounded-xl bg-ink/10 text-ink" aria-label="Stop"><span className="size-3 rounded-sm bg-ink" /></button>
            : <button type="submit" disabled={!input.trim()} className="grid size-10 place-items-center rounded-xl bg-ink text-paper disabled:opacity-30" aria-label="Send"><Icon name="arrow" className="size-4" /></button>}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted">Enter to send · Shift + Enter for a new line · AI answers can be wrong — check key figures against the source.</p>
      </form>
    </div>
  );
}

/**
 * "Ask AI" page: pick a processed job on the left, chat with it on the right.
 * Routes: /chat (latest job) and /chat/:id.
 *   runs = (data from runsPath) => [{ id, title, sub, at }]
 */
export function ChatPage({ runsPath = "/runs", runs: toRuns, noun = "job", icon = "chat", newTo = "/new", newLabel = "Process documents", placeholder }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading } = useApi(runsPath);
  const list = data ? toRuns(data) : [];
  const current = list.find((r) => r.id === id) || list[0];

  return (
    <>
      <PageHeader eyebrow="Ask AI" title="Chat with your documents">
        Pick a processed {noun} and ask questions about it — totals, exceptions, individual entries, what to do next. Powered by DeepSeek, grounded in your files.
      </PageHeader>
      {loading && <Loading />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && !list.length && (
        <Empty icon={icon} title={`No processed ${noun}s yet`} action={<Btn to={newTo} variant="lime" icon="plus">{newLabel}</Btn>}>
          Process your documents first — then you can chat with the results here.
        </Empty>
      )}
      {current && (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-1.5 lg:max-h-[calc(100dvh-260px)] lg:overflow-y-auto">
            <p className="label px-1 pb-1">{list.length} processed {noun}{list.length > 1 ? "s" : ""}</p>
            {list.map((r) => {
              const active = r.id === current.id;
              return (
                <button key={r.id} onClick={() => navigate(`/chat/${r.id}`)}
                  className={`block w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${active ? "border-ink bg-ink text-paper" : "border-ink/8 bg-white/60 hover:border-ink/25"}`}>
                  <span className="block truncate text-[14px] font-medium">{r.title}</span>
                  <span className={`mt-0.5 block truncate text-[12px] ${active ? "text-mist" : "text-muted"}`}>{r.sub}{r.at ? ` · ${ago(r.at)}` : ""}</span>
                </button>
              );
            })}
          </aside>
          <DocChat key={current.id} id={current.id} scope={current.title} icon={icon} placeholder={placeholder} />
        </div>
      )}
    </>
  );
}
