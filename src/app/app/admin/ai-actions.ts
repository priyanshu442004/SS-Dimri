"use server";

import { z } from "zod";
import { actionContext, AuthorizationError } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractReply } from "@/lib/ai-reply";

// n8n webhooks for the admin dashboard's AI Summary and AI Chat. The workflow
// logic lives in n8n; these only forward the request and clean up the reply.
// The URLs act as secrets (anyone holding them can trigger the workflows), so
// they live only in the server environment, never in the repository.

export type AiResult = { ok: true; text: string } | { ok: false; message: string };

async function callWebhook(url: string | undefined, body: unknown, timeoutMs: number): Promise<AiResult> {
  if (!url) return { ok: false, message: "The AI service is not configured yet. Please contact the administrator." };
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/plain, */*" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.error("AI webhook unreachable", e instanceof Error ? e.name : "unknown");
    return { ok: false, message: timedOut ? "The AI service took too long to answer. Please try again." : "Could not reach the AI service. Please check the connection and try again." };
  }
  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("AI webhook error", res.status, raw.slice(0, 300));
    return { ok: false, message: `The AI service ran into a problem (error ${res.status}). Please try again in a moment.` };
  }
  const text = extractReply(raw);
  if (!text) return { ok: false, message: "The AI service sent back an empty answer. Please try again." };
  return { ok: true, text };
}

async function guard(limitName: string, max: number): Promise<AiResult | null> {
  try {
    await actionContext("org.manage");
  } catch (e) {
    return { ok: false, message: e instanceof AuthorizationError ? e.message : "You are not allowed to do this." };
  }
  if (!(await checkRateLimit(limitName, max, 60))) return { ok: false, message: "Too many requests. Please wait a minute and try again." };
  return null;
}

export async function aiSummaryAction(): Promise<AiResult> {
  const blocked = await guard("ai-summary", 6);
  if (blocked) return blocked;
  return callWebhook(process.env.N8N_SUMMARY_WEBHOOK_URL, { text: "Generate Report" }, 180_000);
}

const chatSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  userText: z.string().trim().min(1).max(4000),
});

export async function aiChatAction(sessionId: string, userText: string): Promise<AiResult> {
  const parsed = chatSchema.safeParse({ sessionId, userText });
  if (!parsed.success) return { ok: false, message: "Please type a question (up to 4000 characters)." };
  const blocked = await guard("ai-chat", 30);
  if (blocked) return blocked;
  return callWebhook(process.env.N8N_CHAT_WEBHOOK_URL, { sessionID: parsed.data.sessionId, userText: parsed.data.userText }, 120_000);
}
