import "server-only";
import { aiConfig } from "./config";
import type { ToolSpec } from "./tools";

// Minimal streaming client for DeepSeek's OpenAI-compatible Chat Completions API
// (https://api-docs.deepseek.com). No SDK: one fetch, Server-Sent Events parsed by hand.

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; reasoning_content?: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type StepResult = { content: string; reasoning: string; toolCalls: ToolCall[]; finishReason: string | null; usage?: { prompt_tokens: number; completion_tokens: number; prompt_cache_hit_tokens?: number } };

export class AiServiceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AiServiceError";
  }
}

function friendly(status: number, body: string): string {
  if (status === 401) return "The AI service rejected the API key. Ask the administrator to check DEEPSEEK_API_KEY.";
  if (status === 402) return "The AI service account has run out of balance. Ask the administrator to top it up.";
  if (status === 429) return "The AI service is busy right now. Please try again in a few seconds.";
  if (status === 400 && /model/i.test(body)) return "The configured AI model is not available. Ask the administrator to check DEEPSEEK_MODEL.";
  if (status >= 500) return "The AI service is having trouble right now. Please try again shortly.";
  return `The AI service returned an error (${status}).`;
}

// ---------------------------------------------------------------- tool calls written as text
//
// Now and then the model writes a tool call into its answer text in its own internal markup —
// "<｜DSML｜function_calls><｜DSML｜invoke name=\"query_database\"><｜DSML｜parameter name=\"args\" string=\"false\">{…}…"
// — instead of sending a real tool call. That markup must never reach the user: it is held back
// while streaming, turned into real tool calls (so the lookup still runs and the user gets the
// answer), and stripped from any text.

/** Start of the internal tool-call markup (full-width or ASCII bars, any spacing). */
const MARKUP = /<\s*\/?\s*[｜|][\s｜|]*(?:DSML|tool[▁_ ]?calls?|function[▁_ ]?calls?)/i;
const MARKUP_PREFIX = /<\s*[｜|]?\s*[A-Za-z▁_]{0,14}$/;

/** Text with any internal tool-call markup (and everything after it) removed. */
export function stripToolMarkup(text: string): string {
  const i = text.search(MARKUP);
  return i < 0 ? text : text.slice(0, i).trimEnd();
}

/** Tool calls written as markup in the text → real tool calls. */
export function parseToolMarkup(text: string): ToolCall[] {
  const i = text.search(MARKUP);
  if (i < 0) return [];
  const body = text.slice(i).replace(/[｜]/g, "|");
  const calls: ToolCall[] = [];
  const T = (tag: string, close = false) => String.raw`<\s*${close ? String.raw`\/?\s*` : ""}(?:\|\s*){1,3}DSML\s*(?:\|\s*){1,3}${close ? String.raw`\/?\s*` : ""}` + tag;
  const invoke = new RegExp(T("invoke") + String.raw`\s+name\s*=\s*"([a-z_]+)"\s*>([\s\S]*?)(?=` + T("invoke", true) + String.raw`\s*>|` + T("invoke") + String.raw`\s|$)`, "gi");
  const param = new RegExp(T("parameter") + String.raw`\s+name\s*=\s*"([^"]+)"(?:\s+string\s*=\s*"(true|false)")?\s*>([\s\S]*?)` + T("parameter", true) + String.raw`\s*>`, "gi");
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = invoke.exec(body))) {
    const args: Record<string, unknown> = {};
    let p: RegExpExecArray | null;
    param.lastIndex = 0;
    while ((p = param.exec(m[2]))) {
      const raw = p[3].trim();
      if (p[2] === "true") { args[p[1]] = raw; continue; }
      try { args[p[1]] = JSON.parse(raw); } catch { args[p[1]] = raw; }
    }
    calls.push({ id: `markup_${Date.now().toString(36)}_${n++}`, type: "function", function: { name: m[1], arguments: JSON.stringify(args) } });
  }
  return calls;
}

/**
 * One model step, streamed. `onText` / `onReasoning` get deltas as they arrive. Retries once on
 * 429 / 5xx / network errors before any output was produced.
 */
export async function streamStep(
  messages: ChatMessage[],
  opts: { tools?: ToolSpec[]; signal: AbortSignal; onText?: (t: string) => void; onReasoning?: (t: string) => void; maxTokens?: number; thinking?: boolean },
): Promise<StepResult> {
  const cfg = aiConfig();
  if (!cfg.apiKey) throw new AiServiceError("The AI assistant is not configured yet (DEEPSEEK_API_KEY is missing).");
  const thinking = opts.thinking ?? cfg.thinking;
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: opts.maxTokens ?? cfg.maxOutputTokens,
    thinking: { type: thinking ? "enabled" : "disabled" },
  };
  if (thinking) body.reasoning_effort = cfg.reasoningEffort;
  else body.temperature = 0.2;
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
    body.parallel_tool_calls = true;
  }

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal: opts.signal,
        cache: "no-store",
      });
    } catch (e) {
      if (opts.signal.aborted) throw e;
      if (attempt === 1) throw new AiServiceError("Could not reach the AI service. Please check the connection and try again.");
      await new Promise((r) => setTimeout(r, 700));
      continue;
    }
    if (res.ok) break;
    const text = await res.text().catch(() => "");
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    console.error("DeepSeek error", res.status, text.slice(0, 300));
    throw new AiServiceError(friendly(res.status, text), res.status);
  }
  if (!res?.body) throw new AiServiceError("The AI service sent an empty response.");

  const out: StepResult = { content: "", reasoning: "", toolCalls: [], finishReason: null };
  // Text is passed on as it arrives, except a tail that may be the start of tool-call markup.
  let shown = 0;
  let markup = false;
  const flush = (final: boolean) => {
    if (markup || !opts.onText) return;
    const at = out.content.search(MARKUP);
    if (at >= 0) {
      markup = true;
      if (at > shown) opts.onText(out.content.slice(shown, at));
      shown = at;
      return;
    }
    let upto = out.content.length;
    if (!final) { const tail = out.content.slice(-24).match(MARKUP_PREFIX); if (tail) upto -= tail[0].length; }
    if (upto > shown) { opts.onText(out.content.slice(shown, upto)); shown = upto; }
  };
  const calls: { id: string; name: string; args: string }[] = [];
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let chunk: {
        choices?: { delta?: { content?: string | null; reasoning_content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[];
        usage?: StepResult["usage"];
        error?: { message?: string };
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new AiServiceError(chunk.error.message ?? "The AI service reported an error.");
      if (chunk.usage) out.usage = chunk.usage;
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const d = choice.delta ?? {};
      if (d.reasoning_content) { out.reasoning += d.reasoning_content; opts.onReasoning?.(d.reasoning_content); }
      if (d.content) { out.content += d.content; flush(false); }
      for (const tc of d.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.args += tc.function.arguments;
      }
      if (choice.finish_reason) out.finishReason = choice.finish_reason;
    }
  }
  flush(true);
  out.toolCalls = calls.filter(Boolean).map((c, i) => ({ id: c.id || `call_${i}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } }));
  if (MARKUP.test(out.content)) {
    // Tool calls written as text: run them as real calls (when tools were offered), never show the markup.
    const written = opts.tools?.length ? parseToolMarkup(out.content).filter((c) => opts.tools!.some((t) => t.function.name === c.function.name)) : [];
    out.toolCalls = [...out.toolCalls, ...written];
    out.content = stripToolMarkup(out.content);
    console.warn("AI: tool-call markup in text", written.length ? `→ ${written.length} call(s)` : "(stripped)");
  }
  return out;
}

/** Short non-streamed completion (chat titles). Fails quietly. */
export async function quickCompletion(messages: ChatMessage[], maxTokens: number, signal: AbortSignal): Promise<string | null> {
  try {
    const r = await streamStep(messages, { signal, maxTokens, thinking: false });
    return r.content.trim() || null;
  } catch {
    return null;
  }
}
