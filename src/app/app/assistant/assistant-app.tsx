"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { clsx } from "clsx";
import {
  ArrowDown, ArrowUp, Check, ChevronDown, CircleAlert, Copy, Database, FileSpreadsheet, History, Loader2, MessageSquarePlus, MoreHorizontal, PanelLeftClose,
  PanelLeftOpen, Pencil, Pin, PinOff, Quote, RefreshCw, Search, Sparkles, Square, ThumbsDown, ThumbsUp, Trash2, X,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { toast } from "@/components/toaster";
import type { Block, StreamEvent } from "@/lib/ai/blocks";
import { KpiBlocks, VisualBlocks, formatValue } from "./assistant-blocks";
import { deleteAllConversations, deleteConversation, listConversations, loadConversation, renameConversation, setFeedback, setPinned } from "./actions";
import type { ChatMessageView, ConversationSummary } from "./view";

// ============================================================================ types

type ToolStep = { id: string; name: string; label: string; state: "running" | "done" | "error" };
type UiMessage = ChatMessageView & { streaming?: boolean; tools?: ToolStep[]; reasoning?: string; local?: boolean };
type Suggestion = { title: string; hint: string };

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const tempId = () => `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

// ============================================================================ copy

function blocksToMarkdown(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "kpis") out.push(b.items.map((i) => `- **${i.label}:** ${formatValue(i.value, i.format)}${i.hint ? ` (${i.hint})` : ""}`).join("\n"));
    else if (b.type === "table") out.push(`${b.title ? `**${b.title}**\n\n` : ""}| ${b.columns.join(" | ")} |\n| ${b.columns.map(() => "---").join(" | ")} |\n${b.rows.map((r) => `| ${b.columns.map((_, j) => String(r[j] ?? "")).join(" | ")} |`).join("\n")}`);
    else out.push(`**${b.title}**\n\n| ${["", ...b.series.map((s) => s.name)].join(" | ")} |\n| ${["---", ...b.series.map(() => "---")].join(" | ")} |\n${b.labels.map((l, i) => `| ${[l, ...b.series.map((s) => formatValue(s.values[i] as number, b.format))].join(" | ")} |`).join("\n")}`);
  }
  return out.join("\n\n");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const htmlTable = (head: string[], rows: (string | number | null)[][]) =>
  `<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr>${head.map((h) => `<th style="background:#f5f1e8;text-align:left">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, j) => `<td>${esc(String(r[j] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

function blocksToHtml(blocks: Block[]): string {
  return blocks.map((b) => {
    if (b.type === "kpis") return `<ul>${b.items.map((i) => `<li><b>${esc(i.label)}:</b> ${esc(formatValue(i.value, i.format))}${i.hint ? ` (${esc(i.hint)})` : ""}</li>`).join("")}</ul>`;
    if (b.type === "table") return `${b.title ? `<p><b>${esc(b.title)}</b></p>` : ""}${htmlTable(b.columns, b.rows)}`;
    return `<p><b>${esc(b.title)}</b></p>${htmlTable(["", ...b.series.map((s) => s.name)], b.labels.map((l, i) => [l, ...b.series.map((s) => formatValue(s.values[i] as number, b.format))]))}`;
  }).join("<br>");
}

/** Copies an answer as rich HTML (pastes formatted into Word / Gmail / Docs) plus clean Markdown. */
async function copyAnswer(m: UiMessage, proseHtml: string | null) {
  const kpis = m.blocks.filter((b) => b.type === "kpis");
  const rest = m.blocks.filter((b) => b.type !== "kpis");
  const markdown = [blocksToMarkdown(kpis), m.content.trim(), blocksToMarkdown(rest)].filter(Boolean).join("\n\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px">${blocksToHtml(kpis)}${proseHtml ?? `<p>${esc(m.content)}</p>`}${rest.length ? `<br>${blocksToHtml(rest)}` : ""}</div>`;
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([markdown], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
    } else await navigator.clipboard.writeText(markdown);
    toast("Answer copied.", "success");
  } catch {
    try {
      await navigator.clipboard.writeText(markdown);
      toast("Answer copied.", "success");
    } catch {
      toast("Could not copy.", "error");
    }
  }
}

async function copyPlain(text: string, what = "Copied.") {
  try {
    await navigator.clipboard.writeText(text);
    toast(what, "success");
  } catch {
    toast("Could not copy.", "error");
  }
}

// ============================================================================ history grouping

function groupConversations(list: ConversationSummary[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const t = startOfToday.getTime();
  const day = 86_400_000;
  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: "Pinned", items: [] }, { label: "Today", items: [] }, { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] }, { label: "Previous 30 days", items: [] }, { label: "Older", items: [] },
  ];
  for (const c of list) {
    const u = new Date(c.updatedAt).getTime();
    const g = c.pinned ? 0 : u >= t ? 1 : u >= t - day ? 2 : u >= t - 7 * day ? 3 : u >= t - 30 * day ? 4 : 5;
    groups[g].items.push(c);
  }
  for (const g of groups) g.items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return groups.filter((g) => g.items.length);
}

// ============================================================================ app

export function AssistantApp({ initialConversations, initialConversation, suggestions, userFirstName, firmName, modelName, configured }: {
  initialConversations: ConversationSummary[];
  initialConversation: { id: string; title: string; messages: ChatMessageView[] } | null;
  suggestions: Suggestion[];
  userFirstName: string;
  firmName: string;
  modelName: string;
  configured: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialConversation?.id ?? null);
  const [title, setTitle] = useState(initialConversation?.title ?? "New chat");
  const [messages, setMessages] = useState<UiMessage[]>(initialConversation?.messages ?? []);
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileHistory, setMobileHistory] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [animateIds] = useState(() => new Set<string>());

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const textBuf = useRef("");
  const rafRef = useRef(0);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  // ------------------------------------------------------------------ scrolling

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickRef.current = near;
    setAtBottom(near);
  }, []);

  useLayoutEffect(() => {
    if (stickRef.current) scrollToBottom(false);
  }, [messages, scrollToBottom]);

  useEffect(() => {
    scrollToBottom(false);
    if (configured) inputRef.current?.focus();
  }, [scrollToBottom, configured]);

  // ------------------------------------------------------------------ url

  const setUrl = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("c", id);
    else url.searchParams.delete("c");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  // ------------------------------------------------------------------ streaming

  const patchLast = useCallback((fn: (m: UiMessage) => UiMessage) => {
    setMessages((ms) => {
      const i = ms.findLastIndex((m) => m.role === "assistant");
      if (i < 0) return ms;
      const copy = ms.slice();
      copy[i] = fn(copy[i]);
      return copy;
    });
  }, []);

  const flushText = useCallback(() => {
    rafRef.current = 0;
    const t = textBuf.current;
    if (!t) return;
    textBuf.current = "";
    patchLast((m) => ({ ...m, content: m.content + t }));
  }, [patchLast]);

  const send = useCallback(async (text: string, opts: { quote?: string | null; replaceFrom?: { messageId: string; index: number } } = {}) => {
    const q = text.trim();
    if (!q || busy) return;
    if (!configured) { toast("AI reporting is not configured yet.", "error"); return; }
    const userMsg: UiMessage = { id: tempId(), role: "user", content: q, quote: opts.quote ?? null, blocks: [], followUp: null, status: "done", feedback: null, durationMs: null, createdAt: nowIso(), local: true };
    const draftId = tempId();
    const assistant: UiMessage = { id: draftId, role: "assistant", content: "", quote: null, blocks: [], followUp: null, status: "streaming", feedback: null, durationMs: null, createdAt: nowIso(), streaming: true, tools: [], reasoning: "", local: true };
    animateIds.add(draftId);
    setMessages((ms) => [...(opts.replaceFrom ? ms.slice(0, opts.replaceFrom.index) : ms), userMsg, assistant]);
    setDraft("");
    setQuote(null);
    setBusy(true);
    stickRef.current = true;
    setAtBottom(true);

    const ac = new AbortController();
    abortRef.current = ac;
    let conversationId = activeRef.current;
    let gotDone = false;
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text: q, quote: opts.quote || null, replaceFromMessageId: opts.replaceFrom?.messageId ?? null }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `The assistant could not answer (error ${res.status}).`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line) as StreamEvent;
          switch (e.type) {
            case "meta":
              if (!conversationId) {
                conversationId = e.conversationId;
                setActiveId(e.conversationId);
                setUrl(e.conversationId);
                setConversations((cs) => [{ id: e.conversationId, title: e.title ?? "New chat", pinned: false, updatedAt: nowIso() }, ...cs.filter((c) => c.id !== e.conversationId)]);
              } else setConversations((cs) => cs.map((c) => (c.id === e.conversationId ? { ...c, updatedAt: nowIso() } : c)));
              setMessages((ms) => ms.map((m) => (m.id === userMsg.id ? { ...m, id: e.userMessageId, local: false } : m)));
              break;
            case "title":
              setTitle(e.title);
              setConversations((cs) => cs.map((c) => (c.id === conversationId ? { ...c, title: e.title } : c)));
              break;
            case "tool":
              patchLast((m) => {
                const tools = m.tools ?? [];
                const i = tools.findIndex((t) => t.id === e.id);
                const step = { id: e.id, name: e.name, label: e.label, state: e.state };
                return { ...m, tools: i < 0 ? [...tools, step] : tools.map((t, j) => (j === i ? step : t)) };
              });
              break;
            case "reasoning":
              patchLast((m) => ({ ...m, reasoning: (m.reasoning ?? "") + e.text }));
              break;
            case "text":
              textBuf.current += e.text;
              if (!rafRef.current) rafRef.current = requestAnimationFrame(flushText);
              break;
            case "block":
              flushText();
              patchLast((m) => ({ ...m, blocks: [...m.blocks, e.block] }));
              break;
            case "followup":
              patchLast((m) => ({ ...m, followUp: e.text }));
              break;
            case "done":
              gotDone = true;
              flushText();
              patchLast((m) => ({ ...m, id: e.messageId, streaming: false, status: "done", durationMs: e.durationMs, local: false }));
              animateIds.add(e.messageId);
              break;
            case "error":
              gotDone = true;
              flushText();
              patchLast((m) => ({ ...m, id: e.messageId ?? m.id, streaming: false, status: "error", content: e.message, blocks: [], followUp: null, local: !e.messageId }));
              break;
          }
        }
      }
      if (!gotDone) throw new Error("The connection was interrupted. Please try again.");
    } catch (err) {
      flushText();
      if (ac.signal.aborted) {
        patchLast((m) => ({ ...m, streaming: false, status: "stopped", tools: (m.tools ?? []).map((t) => (t.state === "running" ? { ...t, state: "error" } : t)) }));
        // The server keeps what was written; pick up its ids for edit / feedback.
        const id = conversationId;
        if (id) setTimeout(async () => {
          const r = await loadConversation(id);
          if (r.ok && activeRef.current === id) setMessages(r.data.messages);
        }, 900);
      } else {
        patchLast((m) => ({ ...m, streaming: false, status: "error", content: err instanceof Error ? err.message : "Something went wrong.", blocks: [], followUp: null }));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [busy, configured, animateIds, patchLast, flushText, setUrl]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // ------------------------------------------------------------------ conversation switching

  const [, startLoad] = useTransition();
  const openConversation = useCallback((id: string) => {
    if (busy) stop();
    setMobileHistory(false);
    if (id === activeRef.current) return;
    setLoading(true);
    setActiveId(id);
    setUrl(id);
    setQuote(null);
    startLoad(async () => {
      const r = await loadConversation(id);
      if (activeRef.current !== id) return;
      setLoading(false);
      if (!r.ok) {
        toast(r.message, "error");
        setConversations((cs) => cs.filter((c) => c.id !== id));
        setActiveId(null);
        setMessages([]);
        setUrl(null);
        return;
      }
      setTitle(r.data.title);
      setMessages(r.data.messages);
      stickRef.current = true;
      requestAnimationFrame(() => scrollToBottom(false));
    });
  }, [busy, stop, setUrl, scrollToBottom]);

  const newChat = useCallback(() => {
    if (busy) stop();
    setActiveId(null);
    setMessages([]);
    setTitle("New chat");
    setDraft("");
    setQuote(null);
    setUrl(null);
    setMobileHistory(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [busy, stop, setUrl]);

  // ------------------------------------------------------------------ message actions

  const regenerate = useCallback((assistantIndex: number) => {
    const userIndex = messages.slice(0, assistantIndex).findLastIndex((m) => m.role === "user");
    const u = messages[userIndex];
    if (!u || u.local) return;
    void send(u.content, { quote: u.quote, replaceFrom: { messageId: u.id, index: userIndex } });
  }, [messages, send]);

  const editAndResend = useCallback((index: number, text: string) => {
    const u = messages[index];
    if (!u || u.local) return;
    void send(text, { quote: u.quote, replaceFrom: { messageId: u.id, index } });
  }, [messages, send]);

  const feedback = useCallback(async (id: string, value: 1 | -1) => {
    const cur = messages.find((m) => m.id === id)?.feedback ?? null;
    const next = cur === value ? null : value;
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, feedback: next } : m)));
    const r = await setFeedback(id, next);
    if (!r.ok) {
      toast(r.message, "error");
      setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, feedback: cur } : m)));
    } else if (next) toast(next === 1 ? "Thanks for the feedback." : "Thanks — we'll use this to improve answers.", "success");
  }, [messages]);

  const askAbout = useCallback((text: string) => {
    setQuote(text.trim().slice(0, 2000));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // ------------------------------------------------------------------ keyboard

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "o" || e.key === "O")) { e.preventDefault(); newChat(); }
      else if (e.key === "Escape" && abortRef.current) { e.preventDefault(); stop(); }
      else if (e.key === "/" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); inputRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat, stop]);

  const lastAssistantIndex = messages.findLastIndex((m) => m.role === "assistant");
  const empty = messages.length === 0 && !loading;

  return (
    <div className="-mx-4 -mb-28 -mt-6 flex h-[calc(100dvh-11rem)] overflow-hidden border-line bg-canvas sm:-mx-6 lg:-mx-8 lg:-mb-10 lg:h-[calc(100dvh-4rem)]">
      {/* ---------------------------------------------------------------- history */}
      <HistorySidebar
        open={sidebarOpen}
        mobileOpen={mobileHistory}
        onCloseMobile={() => setMobileHistory(false)}
        conversations={conversations}
        setConversations={setConversations}
        activeId={activeId}
        onOpen={openConversation}
        onNew={newChat}
        onDeleted={(id) => { if (id === activeRef.current || id === "*") newChat(); }}
        onRenamed={(id, t) => { if (id === activeRef.current) setTitle(t); }}
        onCollapse={() => setSidebarOpen(false)}
      />

      {/* ---------------------------------------------------------------- chat */}
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface/80 px-3 backdrop-blur sm:px-4">
          <button type="button" onClick={() => setMobileHistory(true)} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink md:hidden" aria-label="Chat history"><History className="size-4.5" /></button>
          {!sidebarOpen && (
            <button type="button" onClick={() => setSidebarOpen(true)} className="hidden rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink md:block" aria-label="Show chat history" title="Show chat history"><PanelLeftOpen className="size-4.5" /></button>
          )}
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{activeId ? title : "Aanya · AI analyst"}</h1>
          <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted sm:inline-flex" title="Model">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden /> {modelName}
          </span>
          <button type="button" onClick={newChat} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-ink" title={`New chat (${isMac() ? "⌘" : "Ctrl"}+Shift+O)`}>
            <MessageSquarePlus className="size-4" aria-hidden /><span className="hidden sm:inline">New chat</span>
          </button>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-live="polite" aria-busy={busy}>
          {loading ? (
            <ConversationSkeleton />
          ) : empty ? (
            <EmptyState name={userFirstName} firm={firmName} suggestions={suggestions} onPick={(s) => void send(s)} configured={configured} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-3 py-6 sm:px-6">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} m={m} disabled={busy} onEdit={(t) => editAndResend(i, t)} />
                ) : (
                  <AssistantMessage
                    key={m.id}
                    m={m}
                    animate={animateIds.has(m.id)}
                    isLast={i === lastAssistantIndex}
                    busy={busy}
                    onRegenerate={() => regenerate(i)}
                    onFeedback={(v) => void feedback(m.id, v)}
                    onFollowUp={(q) => void send(q)}
                    onAsk={askAbout}
                  />
                ),
              )}
            </div>
          )}
          <SelectionAsk containerRef={scrollRef} onAsk={askAbout} />
        </div>

        {!atBottom && !empty && (
          <button type="button" onClick={() => { stickRef.current = true; scrollToBottom(); }} className="ai-pop absolute bottom-32 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line bg-surface p-2 text-muted shadow-lg transition-colors hover:text-ink" aria-label="Scroll to the latest message">
            <ArrowDown className="size-4" />
          </button>
        )}

        <Composer
          inputRef={inputRef}
          draft={draft}
          setDraft={setDraft}
          quote={quote}
          clearQuote={() => setQuote(null)}
          busy={busy}
          disabled={!configured}
          onSend={() => void send(draft, { quote })}
          onStop={stop}
        />
      </section>
    </div>
  );
}

// ============================================================================ sidebar

function HistorySidebar({ open, mobileOpen, onCloseMobile, conversations, setConversations, activeId, onOpen, onNew, onDeleted, onRenamed, onCollapse }: {
  open: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  conversations: ConversationSummary[];
  setConversations: (fn: (c: ConversationSummary[]) => ConversationSummary[]) => void;
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
  onRenamed: (id: string, title: string) => void;
  onCollapse: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ConversationSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await listConversations(q);
      if (!live) return;
      setSearching(false);
      setResults(r.ok ? r.data : []);
    }, 280);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  const searchQuery = (q: string) => {
    setQuery(q);
    setSearching(!!q.trim());
    if (!q.trim()) setResults(null);
  };
  const list = query.trim() && results ? results : conversations;
  const groups = useMemo(() => groupConversations(list), [list]);

  async function clearAll() {
    const r = await deleteAllConversations();
    setConfirmClear(false);
    if (!r.ok) return toast(r.message, "error");
    setConversations(() => []);
    onDeleted("*");
    toast("All chats deleted.", "success");
  }

  const body = (
    <div className="flex h-full w-72 flex-col bg-surface">
      <div className="flex items-center gap-1 px-3 pb-2 pt-3">
        <button type="button" onClick={onNew} className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium shadow-[0_1px_2px_rgb(15_29_51/.05)] transition-all hover:border-ink/25 hover:shadow-sm active:scale-[.98]">
          <MessageSquarePlus className="size-4" aria-hidden /> New chat
        </button>
        <button type="button" onClick={onCollapse} className="hidden rounded-md p-2 text-muted hover:bg-subtle hover:text-ink md:block" aria-label="Hide chat history" title="Hide chat history"><PanelLeftClose className="size-4" /></button>
        <button type="button" onClick={onCloseMobile} className="rounded-md p-2 text-muted hover:bg-subtle hover:text-ink md:hidden" aria-label="Close"><X className="size-4" /></button>
      </div>
      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 rounded-lg bg-subtle px-2.5 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ink/15">
          {searching ? <Loader2 className="size-3.5 animate-spin text-muted" aria-hidden /> : <Search className="size-3.5 text-muted" aria-hidden />}
          <input value={query} onChange={(e) => searchQuery(e.target.value)} placeholder="Search chats" aria-label="Search chats" style={{ outline: "none" }} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
          {query && <button type="button" onClick={() => searchQuery("")} aria-label="Clear search" className="text-muted hover:text-ink"><X className="size-3.5" /></button>}
        </label>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Chat history">
        {groups.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted">{query ? "No chats match your search." : "Your chats will appear here."}</p>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mt-3 first:mt-1">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</p>
              <ul className="space-y-0.5">
                {g.items.map((c) => (
                  <HistoryItem key={c.id} c={c} active={c.id === activeId} onOpen={() => onOpen(c.id)}
                    onRenamed={(t) => { setConversations((cs) => cs.map((x) => (x.id === c.id ? { ...x, title: t } : x))); setResults((rs) => rs?.map((x) => (x.id === c.id ? { ...x, title: t } : x)) ?? null); onRenamed(c.id, t); }}
                    onPinned={(p) => { setConversations((cs) => cs.map((x) => (x.id === c.id ? { ...x, pinned: p } : x))); setResults((rs) => rs?.map((x) => (x.id === c.id ? { ...x, pinned: p } : x)) ?? null); }}
                    onDeleted={() => { setConversations((cs) => cs.filter((x) => x.id !== c.id)); setResults((rs) => rs?.filter((x) => x.id !== c.id) ?? null); onDeleted(c.id); }}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </nav>
      {conversations.length > 0 && (
        <div className="border-t border-line px-3 py-2 text-xs">
          {confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-danger">Delete all {conversations.length} chats?</span>
              <button type="button" onClick={() => void clearAll()} className="rounded-md bg-danger px-2 py-1 font-medium text-white hover:opacity-90">Delete</button>
              <button type="button" onClick={() => setConfirmClear(false)} className="rounded-md px-2 py-1 text-muted hover:bg-subtle">Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-muted transition-colors hover:bg-danger-bg hover:text-danger"><Trash2 className="size-3.5" aria-hidden /> Clear all chats</button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className={clsx("hidden shrink-0 overflow-hidden border-r border-line transition-[width] duration-300 ease-[var(--ease-out-expo)] md:block", open ? "w-72" : "w-0 border-r-0")} aria-hidden={!open}>{body}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Chat history">
          <button type="button" className="app-palette-backdrop absolute inset-0 bg-night/40" onClick={onCloseMobile} aria-label="Close history" />
          <div className="app-drawer relative h-full w-72 shadow-2xl">{body}</div>
        </div>
      )}
    </>
  );
}

function HistoryItem({ c, active, onOpen, onRenamed, onPinned, onDeleted }: {
  c: ConversationSummary; active: boolean; onOpen: () => void; onRenamed: (t: string) => void; onPinned: (p: boolean) => void; onDeleted: () => void;
}) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [value, setValue] = useState(c.title);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = !!menu;
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!(e.target instanceof Node) || !menuRef.current?.contains(e.target)) { setMenu(null); setConfirm(false); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(null); setConfirm(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", close); };
  }, [open]);

  // The menu floats above the list (fixed position), so it is never clipped by the scrolling history.
  function toggleMenu(e: React.MouseEvent<HTMLButtonElement>) {
    if (menu) { setMenu(null); setConfirm(false); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const height = 120;
    setMenu({ top: r.bottom + 4 + height > window.innerHeight ? Math.max(8, r.top - height - 4) : r.bottom + 4, left: Math.max(8, r.right - 176) });
  }

  async function saveTitle() {
    const t = value.trim();
    setEditing(false);
    if (!t || t === c.title) { setValue(c.title); return; }
    onRenamed(t);
    const r = await renameConversation(c.id, t);
    if (!r.ok) { toast(r.message, "error"); onRenamed(c.title); setValue(c.title); } else toast("Chat renamed.", "success");
  }
  async function togglePin() {
    setMenu(null);
    onPinned(!c.pinned);
    const r = await setPinned(c.id, !c.pinned);
    if (!r.ok) { toast(r.message, "error"); onPinned(c.pinned); }
  }
  async function remove() {
    setMenu(null);
    const r = await deleteConversation(c.id);
    if (!r.ok) return toast(r.message, "error");
    onDeleted();
    toast("Chat deleted.", "success");
  }

  if (editing) {
    return (
      <li>
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => void saveTitle()} maxLength={80}
          onKeyDown={(e) => { if (e.key === "Enter") void saveTitle(); if (e.key === "Escape") { setValue(c.title); setEditing(false); } }}
          className="w-full rounded-lg border border-ink/30 bg-surface px-2.5 py-1.5 text-sm outline-none" aria-label="Chat title" />
      </li>
    );
  }
  return (
    <li className="group relative">
      <button type="button" onClick={onOpen} className={clsx("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 pr-8 text-left text-sm transition-colors", active ? "bg-subtle font-medium text-ink" : "text-ink/85 hover:bg-subtle/70")} aria-current={active ? "page" : undefined}>
        {c.pinned && <Pin className="size-3 shrink-0 text-marigold" aria-label="Pinned" />}
        <span className="truncate">{c.title}</span>
      </button>
      <div ref={menuRef} className="absolute right-1 top-1/2 -translate-y-1/2">
        <button type="button" onClick={toggleMenu} className={clsx("rounded-md p-1 text-muted transition-opacity hover:bg-surface hover:text-ink", open || active ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100")} aria-label={`Options for ${c.title}`} aria-expanded={open} aria-haspopup="menu">
          <MoreHorizontal className="size-4" />
        </button>
        {menu && (
          <div className="ai-pop fixed z-50 w-44 rounded-xl border border-line bg-surface p-1 text-sm shadow-xl" style={{ top: menu.top, left: menu.left }} role="menu">
            {confirm ? (
              <div className="p-2">
                <p className="text-xs text-muted">Delete this chat for good?</p>
                <div className="mt-2 flex gap-1.5">
                  <button type="button" onClick={() => void remove()} className="flex-1 rounded-md bg-danger px-2 py-1 text-xs font-medium text-white hover:opacity-90">Delete</button>
                  <button type="button" onClick={() => setConfirm(false)} className="flex-1 rounded-md px-2 py-1 text-xs hover:bg-subtle">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <MenuItem icon={<Pencil className="size-3.5" />} onClick={() => { setMenu(null); setValue(c.title); setEditing(true); }}>Rename</MenuItem>
                <MenuItem icon={c.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />} onClick={() => void togglePin()}>{c.pinned ? "Unpin" : "Pin"}</MenuItem>
                <MenuItem icon={<Trash2 className="size-3.5" />} danger onClick={() => setConfirm(true)}>Delete</MenuItem>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={clsx("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors", danger ? "text-danger hover:bg-danger-bg" : "hover:bg-subtle")}>
      <span aria-hidden>{icon}</span>{children}
    </button>
  );
}

// ============================================================================ empty state

function EmptyState({ name, firm, suggestions, onPick, configured }: { name: string; firm: string; suggestions: Suggestion[]; onPick: (q: string) => void; configured: boolean }) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-10">
      <div className="ai-in flex items-center gap-3">
        <span className="relative grid size-11 place-items-center rounded-2xl" aria-hidden>
          <span className="ai-orb absolute inset-0 rounded-2xl opacity-90 blur-[1px]" />
          <span className="relative grid size-9 place-items-center rounded-xl bg-surface"><Sparkles className="size-5 text-stamp" /></span>
        </span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{greet}, {name}</h2>
          <p className="text-sm text-muted">I&apos;m Aanya, your data analyst. Ask anything about {firm}: attendance, people, clients, work, payroll and the live finance sheet.</p>
        </div>
      </div>
      {!configured && (
        <p className="ai-in mt-6 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />AI reporting is not configured yet. An administrator needs to add the DeepSeek API key on the server.</p>
      )}
      {suggestions.length > 0 && (
        <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
          {suggestions.map((s, i) => (
            <button key={s.title} type="button" disabled={!configured} onClick={() => onPick(s.title)} style={{ "--d": `${80 + i * 50}ms` } as CSSProperties}
              className="ai-in group rounded-xl border border-line bg-surface px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-[0_10px_30px_-18px_rgb(15_29_51/.5)] disabled:pointer-events-none disabled:opacity-60">
              <span className="flex items-center justify-between gap-2 text-sm font-medium">{s.title}<ArrowUp className="size-3.5 rotate-45 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /></span>
              <span className="mt-0.5 block text-xs text-muted">{s.hint}</span>
            </button>
          ))}
        </div>
      )}
      <p className="ai-in mt-8 text-center text-xs text-muted" style={{ "--d": "400ms" } as CSSProperties}>Tip: select any part of an answer, or use <strong>Ask AI</strong> on a card, chart or table, to ask about just that part.</p>
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-3 py-6 sm:px-6" aria-label="Loading chat">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <div className="app-skeleton ml-auto h-10 w-2/5 rounded-2xl" />
          <div className="flex gap-3"><div className="app-skeleton size-7 rounded-lg" /><div className="flex-1 space-y-2"><div className="app-skeleton h-4 w-4/5 rounded" /><div className="app-skeleton h-4 w-3/5 rounded" /><div className="app-skeleton h-20 w-full rounded-xl" /></div></div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================ messages

function UserMessage({ m, disabled, onEdit }: { m: UiMessage; disabled: boolean; onEdit: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(m.content);
  if (editing) {
    return (
      <div className="ai-in ml-auto w-full max-w-[85%] rounded-2xl border border-ink/20 bg-surface p-2 shadow-sm">
        <textarea autoFocus value={value} onChange={(e) => setValue(e.target.value)} rows={2} maxLength={4000}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (value.trim()) { setEditing(false); onEdit(value); } } if (e.key === "Escape") setEditing(false); }}
          style={{ outline: "none" }} className="max-h-60 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none [field-sizing:content]" aria-label="Edit your question" />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => { setValue(m.content); setEditing(false); }} className="rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-subtle">Cancel</button>
          <button type="button" disabled={!value.trim() || disabled} onClick={() => { setEditing(false); onEdit(value); }} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50">Send</button>
        </div>
      </div>
    );
  }
  return (
    <div className="ai-in group ml-auto flex max-w-[85%] flex-col items-end gap-1">
      {m.quote && (
        <div className="flex max-w-full items-start gap-1.5 rounded-xl border-l-2 border-marigold bg-marigold-soft/50 px-3 py-1.5 text-xs text-ink/80">
          <Quote className="mt-0.5 size-3 shrink-0 text-marigold" aria-hidden /><span className="line-clamp-3">{m.quote}</span>
        </div>
      )}
      <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-paper">{m.content}</div>
      <div className="flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <IconButton label="Copy question" onClick={() => void copyPlain(m.content)}><Copy className="size-3.5" /></IconButton>
        {!m.local && <IconButton label="Edit and resend" disabled={disabled} onClick={() => { setValue(m.content); setEditing(true); }}><Pencil className="size-3.5" /></IconButton>}
      </div>
    </div>
  );
}

const TOOL_ICON: Record<string, typeof Database> = { sheet_overview: FileSpreadsheet, read_sheet: FileSpreadsheet };

function ToolSteps({ steps, streaming }: { steps: ToolStep[]; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const running = steps.some((s) => s.state === "running");
  const expanded = open || (streaming && running);
  const sources = new Set(steps.map((s) => (s.name.includes("sheet") ? "Google Sheet" : "ERP database")));
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-muted transition-colors hover:text-ink" aria-expanded={expanded}>
        {running ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3 text-ok" aria-hidden />}
        <span className={clsx(running && "ai-shimmer")}>{running ? steps.findLast((s) => s.state === "running")?.label : `Checked ${steps.length} ${steps.length === 1 ? "source" : "sources"} · ${[...sources].join(" + ")}`}</span>
        <ChevronDown className={clsx("size-3 transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>
      {expanded && (
        <ol className="ai-in mt-2 space-y-1 border-l border-line pl-3">
          {steps.map((s) => {
            const Icon = TOOL_ICON[s.name] ?? Database;
            return (
              <li key={s.id} className="flex items-center gap-2 text-muted">
                <Icon className="size-3 shrink-0" aria-hidden />
                <span className={clsx("flex-1", s.state === "running" && "ai-shimmer", s.state === "error" && "text-danger")}>{s.label}</span>
                {s.state === "running" ? <Loader2 className="size-3 animate-spin" aria-label="Running" /> : s.state === "error" ? <X className="size-3 text-danger" aria-label="Failed" /> : <Check className="size-3 text-ok" aria-label="Done" />}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function AssistantMessage({ m, animate, isLast, busy, onRegenerate, onFeedback, onFollowUp, onAsk }: {
  m: UiMessage; animate: boolean; isLast: boolean; busy: boolean; onRegenerate: () => void; onFeedback: (v: 1 | -1) => void; onFollowUp: (q: string) => void; onAsk: (text: string) => void;
}) {
  const proseRef = useRef<HTMLDivElement>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const streaming = !!m.streaming;
  const thinking = streaming && !m.content && !m.blocks.length && !(m.tools ?? []).length;
  const error = m.status === "error";
  return (
    <article className="ai-in group flex gap-3" data-ai-answer aria-label="Assistant answer">
      <span aria-hidden className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg">
        {streaming && <span className="ai-orb absolute inset-0 rounded-lg" />}
        <span className={clsx("relative grid place-items-center rounded-[7px] bg-night text-paper", streaming ? "size-[24px]" : "size-7")}><Sparkles className="size-3.5" /></span>
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {thinking && <p className="ai-shimmer pt-1 text-sm font-medium">Thinking…</p>}
        {!!m.reasoning && (
          <div className="text-xs">
            <button type="button" onClick={() => setShowReasoning((v) => !v)} className="inline-flex items-center gap-1 text-muted hover:text-ink">
              <span className={clsx(streaming && !m.content && "ai-shimmer")}>{streaming && !m.content ? "Reasoning…" : "Show reasoning"}</span><ChevronDown className={clsx("size-3 transition-transform", showReasoning && "rotate-180")} aria-hidden />
            </button>
            {showReasoning && <p className="mt-1 whitespace-pre-wrap border-l border-line pl-3 text-muted">{m.reasoning}</p>}
          </div>
        )}
        <ToolSteps steps={m.tools ?? []} streaming={streaming} />
        <KpiBlocks blocks={m.blocks} animate={animate} onAsk={streaming ? undefined : onAsk} />
        {error ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/25 bg-danger-bg px-4 py-3 text-sm text-danger">
            <CircleAlert className="size-4 shrink-0" aria-hidden /><span className="flex-1">{m.content}</span>
            {isLast && <button type="button" disabled={busy} onClick={onRegenerate} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline disabled:opacity-50"><RefreshCw className="size-3.5" aria-hidden /> Try again</button>}
          </div>
        ) : (
          (m.content || streaming) && !thinking && (
            <div ref={proseRef} className={clsx("text-[15px] leading-relaxed", streaming && "ai-caret")}>
              {m.content ? <Markdown text={m.content} /> : null}
            </div>
          )
        )}
        <VisualBlocks blocks={m.blocks} onAsk={streaming ? undefined : onAsk} />
        {m.status === "stopped" && <p className="text-xs italic text-muted">Stopped.</p>}
        {!streaming && !error && m.followUp && (
          <button type="button" disabled={busy} onClick={() => onFollowUp(m.followUp!)} className="ai-in group/f inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-left text-sm text-ink/90 transition-all hover:border-ink/30 hover:shadow-sm disabled:opacity-50" style={{ "--d": "200ms" } as CSSProperties}>
            <ArrowUp className="size-3.5 shrink-0 rotate-45 text-stamp transition-transform group-hover/f:rotate-0" aria-hidden /><span className="truncate">{m.followUp}</span>
          </button>
        )}
        {!streaming && !error && (m.content || m.blocks.length > 0) && (
          <div className={clsx("flex items-center gap-0.5 transition-opacity", isLast ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100")}>
            <IconButton label="Copy answer" onClick={() => void copyAnswer(m, proseRef.current?.innerHTML ?? null)}><Copy className="size-3.5" /></IconButton>
            {!m.local && <IconButton label="Helpful" pressed={m.feedback === 1} onClick={() => onFeedback(1)}><ThumbsUp className={clsx("size-3.5", m.feedback === 1 && "fill-current")} /></IconButton>}
            {!m.local && <IconButton label="Not helpful" pressed={m.feedback === -1} onClick={() => onFeedback(-1)}><ThumbsDown className={clsx("size-3.5", m.feedback === -1 && "fill-current")} /></IconButton>}
            {isLast && <IconButton label="Regenerate answer" disabled={busy} onClick={onRegenerate}><RefreshCw className="size-3.5" /></IconButton>}
            {m.durationMs != null && <span className="ml-2 text-[11px] text-muted">{(m.durationMs / 1000).toFixed(1)}s</span>}
          </div>
        )}
      </div>
    </article>
  );
}

function IconButton({ label, onClick, children, disabled, pressed }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={pressed}
      className={clsx("rounded-md p-1.5 text-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40", pressed && "text-ink")}>
      {children}
    </button>
  );
}

// ============================================================================ select → ask

/** Floating "Ask AI" button over text selected inside an answer (mouse, keyboard or touch). */
function SelectionAsk({ containerRef, onAsk }: { containerRef: React.RefObject<HTMLDivElement | null>; onAsk: (text: string) => void }) {
  const [pos, setPos] = useState<{ x: number; y: number; text: string } | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    function update() {
      clearTimeout(t);
      t = setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";
        if (!sel || sel.isCollapsed || text.length < 2 || !sel.rangeCount) return setPos(null);
        const range = sel.getRangeAt(0);
        const node = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
        if (!node || !containerRef.current?.contains(node) || !node.closest("[data-ai-answer]")) return setPos(null);
        const r = range.getBoundingClientRect();
        if (!r.width && !r.height) return setPos(null);
        setPos({ x: Math.min(window.innerWidth - 90, Math.max(90, r.left + r.width / 2)), y: r.top < 70 ? r.bottom + 8 : r.top - 44, text });
      }, 120);
    }
    const hide = () => setPos(null);
    document.addEventListener("selectionchange", update);
    const scroller = containerRef.current;
    scroller?.addEventListener("scroll", hide, { passive: true });
    return () => { clearTimeout(t); document.removeEventListener("selectionchange", update); scroller?.removeEventListener("scroll", hide); };
  }, [containerRef]);
  if (!pos) return null;
  return (
    <div className="ai-pop fixed z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-white/10 bg-night p-1 text-xs text-paper shadow-xl" style={{ left: pos.x, top: pos.y }} onMouseDown={(e) => e.preventDefault()}>
      <button type="button" onClick={() => { onAsk(pos.text); window.getSelection()?.removeAllRanges(); setPos(null); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium hover:bg-white/10">
        <Sparkles className="size-3.5 text-marigold" aria-hidden /> Ask AI
      </button>
      <span className="h-4 w-px bg-white/15" aria-hidden />
      <button type="button" onClick={() => { void copyPlain(pos.text); setPos(null); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-white/10"><Copy className="size-3.5" aria-hidden /> Copy</button>
    </div>
  );
}

// ============================================================================ composer

function Composer({ inputRef, draft, setDraft, quote, clearQuote, busy, disabled, onSend, onStop }: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>; draft: string; setDraft: (v: string) => void; quote: string | null; clearQuote: () => void;
  busy: boolean; disabled: boolean; onSend: () => void; onStop: () => void;
}) {
  function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!busy) onSend();
    } else if (e.key === "Escape" && quote && !busy) clearQuote();
  }
  const canSend = !!draft.trim() && !disabled;
  return (
    <div className="shrink-0 bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-3 pb-3 pt-2 sm:px-6">
      <form onSubmit={(e) => { e.preventDefault(); if (!busy) onSend(); }} className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-line bg-surface shadow-[0_8px_30px_-18px_rgb(15_29_51/.45)] transition-[border-color,box-shadow] focus-within:border-brand-600/60 focus-within:shadow-[0_0_0_3px_rgb(40_77_122/.12),0_10px_34px_-16px_rgb(15_29_51/.5)]">
          {quote && (
            <div className="ai-pop mx-2 mt-2 flex items-start gap-2 rounded-xl border-l-2 border-marigold bg-marigold-soft/50 px-3 py-2 text-xs">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-marigold" aria-hidden />
              <span className="line-clamp-3 flex-1 text-ink/85"><span className="font-medium">Asking about: </span>{quote}</span>
              <button type="button" onClick={clearQuote} className="rounded p-0.5 text-muted hover:bg-surface hover:text-ink" aria-label="Remove selected text"><X className="size-3.5" /></button>
            </div>
          )}
          <div className="flex items-end gap-2 p-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={4000}
              disabled={disabled}
              placeholder={quote ? "Ask about the selected part…" : "Ask Aanya about attendance, people, clients, work, revenue…"}
              aria-label="Your question"
              style={{ outline: "none" }}
              className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none [field-sizing:content] placeholder:text-muted disabled:cursor-not-allowed"
            />
            {busy ? (
              <button type="button" onClick={onStop} className="ai-pop grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-paper transition-transform hover:opacity-90 active:scale-95" aria-label="Stop generating" title="Stop generating (Esc)">
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button type="submit" disabled={!canSend} className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-paper transition-all hover:opacity-90 active:scale-95 disabled:bg-subtle disabled:text-muted" aria-label="Send" title="Send (Enter)">
                <ArrowUp className="size-4.5" />
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 hidden text-center text-[11px] text-muted sm:block">Enter to send · Shift+Enter new line · Select text in an answer to ask about it · AI can make mistakes, so check important figures.</p>
      </form>
    </div>
  );
}
