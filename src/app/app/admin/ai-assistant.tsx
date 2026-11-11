"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Bot, Copy, MessageSquareText, RefreshCw, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { toast } from "@/components/toaster";
import { Markdown } from "@/components/markdown";
import { aiChatAction, aiSummaryAction } from "./ai-actions";

const dialogCls =
  "m-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-[0_30px_80px_-20px_rgb(15_29_51/.55)] backdrop:bg-night/50 backdrop:backdrop-blur-[2px]";

function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open) ref.current?.close();
  }, [open]);
  return ref;
}

function Thinking({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />)}
      </span>
      {label}
    </span>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied.", "success");
  } catch {
    toast("Could not copy.", "error");
  }
}

// ------------------------------------------------------------------ summary

type SummaryState = { report: string | null; error: string | null; pending: boolean; generate: () => void };

function useSummary(): SummaryState {
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function generate() {
    setError(null);
    start(async () => {
      const r = await aiSummaryAction();
      if (r.ok) setReport(r.text);
      else setError(r.message);
    });
  }
  return { report, error, pending, generate };
}

function SummaryDialog({ open, onClose, state }: { open: boolean; onClose: () => void; state: SummaryState }) {
  const ref = useModal(open);
  const { report, error, pending, generate } = state;

  if (!open) return null;
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="ai-summary-title" className={`${dialogCls} flex h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col sm:h-[min(85dvh,900px)]`}>
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-marigold-soft text-ink"><Sparkles className="size-4.5" /></span>
        <h2 id="ai-summary-title" className="min-w-0 flex-1 font-semibold">AI summary report</h2>
        <button type="button" onClick={onClose} className={buttonClass("ghost", "sm", "px-2")} aria-label="Close"><X className="size-4" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {pending ? (
          <div className="grid h-full place-items-center"><Thinking label="Generating the report… this can take a minute." /></div>
        ) : error ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-sm text-danger">{error}</p>
              <button type="button" onClick={generate} className={buttonClass("secondary", "sm", "mt-3")}><RotateCcw className="size-3.5" aria-hidden /> Try again</button>
            </div>
          </div>
        ) : report ? (
          <Markdown text={report} />
        ) : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">
        {report && !pending && <button type="button" onClick={() => copyText(report)} className={buttonClass("secondary", "sm")}><Copy className="size-3.5" aria-hidden /> Copy</button>}
        <button type="button" onClick={generate} disabled={pending} className={buttonClass("primary", "sm")}><RefreshCw className="size-3.5" aria-hidden /> {report ? "Regenerate" : "Generate"}</button>
      </footer>
    </dialog>
  );
}

// --------------------------------------------------------------------- chat

type Msg = { id: string; role: "user" | "assistant" | "error"; text: string; retryOf?: string };

const SUGGESTIONS = ["Which tasks are overdue?", "Summarise today's attendance", "Which clients have pending compliances?"];

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function ChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useModal(open);
  // One session id per conversation; "New chat" starts a fresh one.
  const [sessionId, setSessionId] = useState(newId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, pending]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setMessages((m) => [...m.filter((x) => x.role !== "error"), { id: newId(), role: "user", text: q }]);
    setDraft("");
    start(async () => {
      const r = await aiChatAction(sessionId, q);
      setMessages((m) => [...m, r.ok ? { id: newId(), role: "assistant", text: r.text } : { id: newId(), role: "error", text: r.message, retryOf: q }]);
      inputRef.current?.focus();
    });
  }

  function retry(q: string) {
    if (pending) return;
    // Drop the failed question too; ask() adds it back.
    setMessages((m) => {
      const lastUser = m.findLastIndex((x) => x.role === "user" && x.text === q);
      return m.filter((x, idx) => x.role !== "error" && idx !== lastUser);
    });
    ask(q);
  }

  function newChat() {
    if (pending) return;
    setMessages([]);
    setSessionId(newId());
    setDraft("");
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(draft);
    }
  }

  if (!open) return null;
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="ai-chat-title" className={`${dialogCls} flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-5xl flex-col sm:h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)]`}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-ink text-paper"><Bot className="size-4.5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="ai-chat-title" className="font-semibold leading-tight">AI chat</h2>
          <p className="text-xs text-muted">Ask anything about your firm&apos;s data</p>
        </div>
        <button type="button" onClick={newChat} disabled={pending || messages.length === 0} className={buttonClass("secondary", "sm")}><RotateCcw className="size-3.5" aria-hidden /> New chat</button>
        <button type="button" onClick={onClose} className={buttonClass("ghost", "sm", "px-2")} aria-label="Close"><X className="size-4" /></button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-paper/50 px-3 py-4 sm:px-6" aria-live="polite">
        {messages.length === 0 && !pending ? (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-md">
              <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-2xl bg-marigold-soft text-ink"><MessageSquareText className="size-6" /></span>
              <p className="mt-3 font-semibold">How can I help?</p>
              <p className="mt-1 text-sm text-muted">Type a question below, or start with one of these.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:border-ink/30">{s}</button>)}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-paper">{m.text}</div>
              ) : m.role === "assistant" ? (
                <div key={m.id} className="group flex max-w-[92%] gap-2.5">
                  <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-ink text-paper"><Bot className="size-3.5" /></span>
                  <div className="min-w-0">
                    <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3"><Markdown text={m.text} /></div>
                    <button type="button" onClick={() => copyText(m.text)} className="mt-1 inline-flex items-center gap-1 text-xs text-muted opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"><Copy className="size-3" aria-hidden /> Copy</button>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex max-w-[92%] flex-wrap items-center gap-2 rounded-xl bg-danger-bg px-4 py-2.5 text-sm text-danger">
                  <span>{m.text}</span>
                  {m.retryOf && <button type="button" onClick={() => retry(m.retryOf!)} className="font-medium underline underline-offset-2">Retry</button>}
                </div>
              ),
            )}
            {pending && (
              <div className="flex gap-2.5">
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg bg-ink text-paper"><Bot className="size-3.5" /></span>
                <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3"><Thinking label="Thinking…" /></div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(draft); }}
        className="border-t border-line px-3 py-3 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-line bg-surface p-1.5 focus-within:border-ink/40">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={4000}
            placeholder="Ask a question…"
            aria-label="Your question"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none [field-sizing:content] placeholder:text-muted"
          />
          <button type="submit" disabled={pending || !draft.trim()} className={buttonClass("primary", "sm", "h-9 px-3")} aria-label="Send"><SendHorizontal className="size-4" /></button>
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-[11px] text-muted">Enter to send · Shift+Enter for a new line · AI answers can be wrong, so check important figures.</p>
      </form>
    </dialog>
  );
}

// ------------------------------------------------------------------ buttons

export function AiAssistant() {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const summary = useSummary();
  // The first click generates the report; reopening shows the last one until "Regenerate".
  function openSummary() {
    setSummaryOpen(true);
    if (summary.report === null && !summary.pending) summary.generate();
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={openSummary} className={buttonClass("primary", "md")}><Sparkles className="size-4" aria-hidden /> AI Summary</button>
        <button type="button" onClick={() => setChatOpen(true)} className={buttonClass("secondary", "md")}><MessageSquareText className="size-4" aria-hidden /> Chat</button>
      </div>
      <SummaryDialog open={summaryOpen} onClose={() => setSummaryOpen(false)} state={summary} />
      <ChatDialog open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
