import "server-only";
import type { AppContext } from "@/lib/session";
import type { Block, StreamEvent } from "./blocks";
import { aiConfig } from "./config";
import { streamStep, type ChatMessage, type ToolCall } from "./deepseek";
import { buildSystemPrompt } from "./prompt";
import { runTool, toolSpecs, toolLabel } from "./tools";

// One answer: model ↔ tools loop, streamed to the browser as events.

const PRESENTATION = new Set(["show_kpis", "show_chart", "show_table", "suggest_follow_up"]);

export type HistoryMessage = { role: "user" | "assistant"; content: string; quote?: string | null; context?: string | null; reasoning?: string | null; blocks?: unknown; followUp?: string | null };
export type AgentResult = { content: string; blocks: Block[]; followUp: string | null; context: string; reasoning: string; stopped: boolean };

export function userTurnText(text: string, quote?: string | null): string {
  if (!quote) return text;
  return `SELECTED EXCERPT (the user highlighted this part of an earlier answer; the question is about it only):\n"""\n${quote}\n"""\n\nQuestion: ${text}`;
}

/** One stored data note "name(args) → result" back into a tool call and its result. */
function noteToCall(note: string, id: string): { call: ToolCall; result: string } | null {
  const m = note.match(/^([a-z_]+)\((.*?)\) → ([\s\S]*)$/);
  if (!m) return null;
  let args = m[2];
  try { JSON.parse(args); } catch { args = JSON.stringify({ summary: args }); }
  return { call: { id, type: "function", function: { name: m[1], arguments: args } }, result: m[3] };
}

/**
 * Past turns → model messages. The latest few answers are replayed as real tool calls and results
 * (the data looked up, then the cards / charts shown), never as text notes inside the answer: text
 * notes taught the model to write fake "[Data used]" lines and invent figures instead of looking.
 */
export function historyMessages(history: HistoryMessage[], thinking: boolean): ChatMessage[] {
  const recent = history.slice(-16);
  const assistantIdx = recent.map((m, i) => (m.role === "assistant" ? i : -1)).filter((i) => i >= 0);
  const keepContextFrom = assistantIdx.at(-4) ?? 0;
  const out: ChatMessage[] = [];
  recent.forEach((m, i) => {
    if (m.role === "user") { out.push({ role: "user", content: userTurnText(m.content, m.quote) }); return; }
    const reasoning = thinking ? { reasoning_content: m.reasoning ?? "" } : {};
    if (i >= keepContextFrom) {
      const replay: { call: ToolCall; result: string }[] = [];
      (m.context ?? "").split("\n").filter(Boolean).forEach((note, j) => { const r = noteToCall(note, `h${i}_${j}`); if (r) replay.push(r); });
      if (Array.isArray(m.blocks)) (m.blocks as Block[]).forEach((b, j) => {
        const { type, ...args } = b;
        const name = type === "kpis" ? "show_kpis" : type === "chart" ? "show_chart" : "show_table";
        replay.push({ call: { id: `h${i}_b${j}`, type: "function", function: { name, arguments: JSON.stringify(args).slice(0, 4000) } }, result: "Shown to the user." });
      });
      if (replay.length) {
        out.push({ role: "assistant", content: null, tool_calls: replay.map((r) => r.call), ...reasoning });
        for (const r of replay) out.push({ role: "tool", tool_call_id: r.call.id, content: r.result });
      }
    }
    out.push({ role: "assistant", content: stripNotes(m.content) || "(answer shown as visuals)", ...reasoning });
  });
  return out;
}

/** Removes any "[Data used]" / "[Shown with this answer]" note text from an answer (and everything after it). */
export function stripNotes(text: string): string {
  const i = text.search(/\n?\s*\[(?:Data used|Shown with this answer)\]/);
  return (i < 0 ? text : text.slice(0, i)).trim();
}

function compactForContext(name: string, args: Record<string, unknown>, result: unknown): string {
  const a = JSON.stringify(args);
  const r = JSON.stringify(result);
  return `${name}(${a.length > 300 ? `${a.slice(0, 300)}…` : a}) → ${r.length > 1800 ? `${r.slice(0, 1800)}…` : r}`;
}

export async function runAgent(
  ctx: AppContext,
  history: HistoryMessage[],
  question: { text: string; quote?: string | null },
  emit: (e: StreamEvent) => void,
  signal: AbortSignal,
): Promise<AgentResult> {
  const cfg = aiConfig();
  const tools = toolSpecs(ctx);
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(ctx) },
    ...historyMessages(history, cfg.thinking),
    { role: "user", content: userTurnText(question.text, question.quote) },
  ];
  const blocks: Block[] = [];
  let followUp: string | null = null;
  const contextNotes: string[] = [];
  let answer = "";
  let reasoning = "";

  for (let round = 0; round < cfg.maxToolRounds; round++) {
    const last = round === cfg.maxToolRounds - 1;
    let stepText = "";
    const step = await streamStep(messages, {
      tools: last ? undefined : tools,
      signal,
      maxTokens: question.text.startsWith("REPORT REQUEST") ? 16000 : undefined, // the full AI Reporting report is long
      onText: (t) => { stepText += t; emit({ type: "text", text: t }); },
      onReasoning: (t) => emit({ type: "reasoning", text: t }),
    });
    reasoning = step.reasoning;
    if (!step.toolCalls.length) { answer += step.content; break; }
    // Text written in a step that still looks data up is narration ("Let me check…"), not the answer: drop it.
    const looksUp = step.toolCalls.some((c) => !PRESENTATION.has(c.function.name));
    if (!looksUp) answer += step.content;
    else if (stepText.trim()) emit({ type: "text_set", text: answer });

    messages.push({ role: "assistant", content: step.content || null, tool_calls: step.toolCalls, ...(cfg.thinking ? { reasoning_content: step.reasoning } : {}) });
    const onlyPresentation = step.toolCalls.every((c) => PRESENTATION.has(c.function.name));

    // Run every call of this step in parallel.
    const outcomes = await Promise.all(
      step.toolCalls.map(async (call) => {
        let args: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(call.function.arguments || "{}");
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
        } catch {
          return { call, args, outcome: { label: toolLabel(call.function.name, {}), failed: true, result: { error: "Arguments were not valid JSON. Send valid JSON." } } };
        }
        const quiet = PRESENTATION.has(call.function.name);
        if (!quiet) emit({ type: "tool", id: call.id, name: call.function.name, label: toolLabel(call.function.name, args), state: "running" });
        const outcome = await runTool(ctx, call.function.name, args);
        if (!quiet) emit({ type: "tool", id: call.id, name: call.function.name, label: outcome.label, state: outcome.failed ? "error" : "done" });
        return { call, args, outcome };
      }),
    );

    let presentationFailed = false;
    for (const { call, args, outcome } of outcomes) {
      if (outcome.block) { blocks.push(outcome.block); emit({ type: "block", block: outcome.block }); }
      if (outcome.followUp) { followUp = outcome.followUp; emit({ type: "followup", text: outcome.followUp }); }
      if (outcome.failed && PRESENTATION.has(call.function.name)) presentationFailed = true;
      if (!PRESENTATION.has(call.function.name) && !outcome.failed) contextNotes.push(compactForContext(call.function.name, args, outcome.result));
      const content = JSON.stringify(outcome.result);
      messages.push({ role: "tool", tool_call_id: call.id, content: content.length > 60_000 ? `${content.slice(0, 60_000)}…(cut)` : content });
    }

    // Answer text already written alongside the visuals: done, no extra round trip.
    if (onlyPresentation && stepText.trim() && !presentationFailed) break;
    if (signal.aborted) break;
    if (stepText.trim() && !looksUp) { emit({ type: "text", text: "\n\n" }); answer += "\n\n"; }
  }

  // The AI Reporting report: if the model left notes instead of the write-up, ask once more for the text only.
  if (question.text.startsWith("REPORT REQUEST") && !signal.aborted && !/##\s*360/.test(answer)) {
    emit({ type: "text_set", text: "" });
    messages.push({ role: "user", content: "Now write ONLY the final report text in markdown, starting with \"## 360° health check\" (6 one-line bullets: Financial, Client mix, Delivery, Client data flow, People, Team economics), then \"## People insights\" (3–5 bullets) and \"## Key risks & recommended actions\" (4–6 bullets: risk with its number + concrete action). Use the figures already shown. No notes, no working, no preamble." });
    const step = await streamStep(messages, { signal, maxTokens: 6000, onText: (t) => emit({ type: "text", text: t }) });
    answer = step.content;
  }

  const cleaned = stripNarration(stripNotes(answer));
  if (cleaned !== answer.trim()) emit({ type: "text_set", text: cleaned });
  return {
    content: cleaned,
    blocks,
    followUp,
    context: contextNotes.join("\n").slice(0, 6000),
    reasoning: cfg.thinking ? reasoning : "",
    stopped: signal.aborted,
  };
}

/** A 3–6 word title for a new chat, made from the first question (runs alongside the answer). */
export function titleMessages(question: string): ChatMessage[] {
  return [
    { role: "system", content: "Write a 2–6 word title for a chat that starts with the user's question. Title case, no quotes, no trailing punctuation. Reply with the title only. If the message is only a greeting, thanks or small talk with no real question, reply exactly: New chat" },
    { role: "user", content: question.slice(0, 500) },
  ];
}

/** Drops opening process lines the model sometimes writes ("I have what I need. Let me compare…"). */
export function stripNarration(text: string): string {
  let t = text.trim();
  // A short opening sentence about the process: "I have all October rows.", "Let me aggregate…", "Now I'll compare…".
  const opener = /^(?:(?:ok(?:ay)?|alright|great|now|so),?\s+)?(?:i(?:'ve| have) (?:got |now )?(?:what i need|all |the |everything)[^.\n]{0,60}|[^.\n]{0,40}\blet me (?!know)[^.\n]*|i(?:'ll| will) (?:now )?(?:check|look|compare|verify|calculate|pull|fetch|aggregate|sum|add)[^.\n]*|now i(?:'ll| will)? [^.\n]*)[.:!…]+\s*/i;
  for (let i = 0; i < 3; i++) {
    const m = t.match(opener);
    if (!m || m[0].length === t.length) break;
    t = t.slice(m[0].length).trimStart();
  }
  return t;
}
