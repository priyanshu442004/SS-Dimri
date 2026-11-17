import "server-only";
import type { AppContext } from "@/lib/session";
import type { Block, StreamEvent } from "./blocks";
import { aiConfig } from "./config";
import { streamStep, type ChatMessage } from "./deepseek";
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

function blockSummary(blocks: unknown): string {
  if (!Array.isArray(blocks) || !blocks.length) return "";
  const parts = (blocks as Block[]).map((b) => {
    if (b.type === "kpis") return `KPIs: ${b.items.map((i) => `${i.label} = ${i.value}`).join("; ")}`;
    if (b.type === "chart") return `${b.chart} chart "${b.title}": ${b.labels.slice(0, 20).map((l, i) => `${l} ${b.series.map((s) => s.values[i]).join("/")}`).join(", ")}`;
    return `table "${b.title ?? ""}" (${b.columns.join(", ")}): ${b.rows.slice(0, 15).map((r) => r.join(" | ")).join("; ")}`;
  });
  return `\n[Shown with this answer] ${parts.join(" || ")}`.slice(0, 2500);
}

/** Past turns → model messages. The latest few answers keep their data notes for follow-ups. */
export function historyMessages(history: HistoryMessage[], thinking: boolean): ChatMessage[] {
  const recent = history.slice(-16);
  const assistantIdx = recent.map((m, i) => (m.role === "assistant" ? i : -1)).filter((i) => i >= 0);
  const keepContextFrom = assistantIdx.at(-4) ?? 0;
  return recent.map((m, i): ChatMessage => {
    if (m.role === "user") return { role: "user", content: userTurnText(m.content, m.quote) };
    const extra = i >= keepContextFrom ? `${blockSummary(m.blocks)}${m.context ? `\n[Data used] ${m.context}` : ""}` : "";
    const msg: ChatMessage = { role: "assistant", content: `${m.content || "(answer shown as visuals)"}${extra}` };
    if (thinking) msg.reasoning_content = m.reasoning ?? "";
    return msg;
  });
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
      onText: (t) => { stepText += t; emit({ type: "text", text: t }); },
      onReasoning: (t) => emit({ type: "reasoning", text: t }),
    });
    reasoning = step.reasoning;
    answer += step.content;

    if (!step.toolCalls.length) break;

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
    if (stepText.trim()) emit({ type: "text", text: "\n\n" });
    if (stepText.trim()) answer += "\n\n";
  }

  return {
    content: answer.trim(),
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
    { role: "system", content: "Write a 2–6 word title for a chat that starts with the user's question. Title case, no quotes, no trailing punctuation. Reply with the title only." },
    { role: "user", content: question.slice(0, 500) },
  ];
}
