import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionContext, AuthorizationError } from "@/lib/session";
import { fallbackTitle, runAgent, titleMessages, type HistoryMessage } from "@/lib/ai/agent";
import { aiConfig } from "@/lib/ai/config";
import { rateLimit } from "@/lib/ai/cache";
import { AiServiceError, quickCompletion } from "@/lib/ai/deepseek";
import type { StreamEvent } from "@/lib/ai/blocks";

// POST /api/assistant/chat — asks one question and streams the answer back as newline-
// delimited JSON events (see StreamEvent). Closing the request (the Stop button) stops the
// model; whatever was written so far is kept and marked "stopped".

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  conversationId: z.string().uuid().nullish(),
  text: z.string().trim().min(1, "Type a question.").max(4000, "Keep the question under 4000 characters."),
  quote: z.string().trim().max(2000).nullish(),
  /** Edit / regenerate: this message and everything after it are replaced. */
  replaceFromMessageId: z.string().uuid().nullish(),
  /** A new chat with a fixed name (the AI Reporting page). */
  title: z.string().trim().max(80).nullish(),
});

const json = (status: number, message: string) => Response.json({ error: message }, { status });

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await actionContext("assistant.use");
  } catch (e) {
    return json(e instanceof AuthorizationError ? 403 : 401, e instanceof Error ? e.message : "Not allowed.");
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const body = parsed.data;

  // Fewest round trips before the first byte: independent work runs in parallel.
  const owner = { userId: ctx.user.id, organizationId: ctx.organization.id };
  const [perMinute, perDay, existing] = await Promise.all([
    rateLimit(`chat:m:${ctx.user.id}`, 15, 60),
    rateLimit(`chat:d:${ctx.user.id}`, 400, 86_400),
    body.conversationId ? prisma.aiConversation.findFirst({ where: { id: body.conversationId, ...owner }, select: { id: true, title: true } }) : null,
  ]);
  if (!perMinute) return json(429, "You're asking very quickly. Please wait a few seconds and try again.");
  if (!perDay) return json(429, "Daily question limit reached. Please try again tomorrow.");
  if (body.conversationId && !existing) return json(404, "This chat no longer exists.");
  const conversation = existing ?? (await prisma.aiConversation.create({ data: { ...owner, title: body.title || "New chat" }, select: { id: true, title: true } }));
  const conversationId = conversation.id;

  if (body.replaceFromMessageId) {
    const from = await prisma.aiMessage.findFirst({ where: { id: body.replaceFromMessageId, conversationId }, select: { createdAt: true } });
    if (from) await prisma.aiMessage.deleteMany({ where: { conversationId, createdAt: { gte: from.createdAt } } });
  }

  const [past, userMessage] = await Promise.all([
    existing
      ? prisma.aiMessage.findMany({
          where: { conversationId, status: { not: "error" } },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: { id: true, role: true, content: true, quote: true, context: true, reasoning: true, blocks: true, followUp: true },
        })
      : Promise.resolve([]),
    prisma.aiMessage.create({ data: { conversationId, role: "user", content: body.text, quote: body.quote || null }, select: { id: true } }),
  ]);
  const history: HistoryMessage[] = past
    .filter((m) => m.id !== userMessage.id)
    .slice(0, 24)
    .reverse()
    .map(({ id: _id, ...m }) => ({ ...m, role: m.role === "user" ? "user" : "assistant" }));
  // Titled from the first real question: a chat that opened with "Hi" is still "New chat" and gets named later.
  const isFirst = history.length === 0 || conversation.title === "New chat";
  // Moves the chat to the top of the history; nothing waits for it.
  if (existing) void prisma.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }).catch(() => undefined);

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const started = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      // What the person has seen so far, kept if they press Stop.
      const partial: { text: string; blocks: unknown[]; followUp: string | null } = { text: "", blocks: [], followUp: null };
      const emit = (e: StreamEvent) => {
        if (e.type === "text") partial.text += e.text;
        else if (e.type === "text_set") partial.text = e.text;
        else if (e.type === "block") partial.blocks.push(e.block);
        else if (e.type === "followup") partial.followUp = e.text;
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      emit({ type: "meta", conversationId, userMessageId: userMessage.id, title: conversation.title });

      // Name a new chat from its first question, in parallel with the answer.
      const titleJob = isFirst
        ? quickCompletion(titleMessages(body.text, body.quote), 24, AbortSignal.timeout(15_000)).then(async (t) => {
            let title = (t ?? "").split("\n")[0].replace(/^["'\s#*]+|["'.*\s]+$/g, "").replace(/^title:\s*/i, "").slice(0, 80);
            // No usable title from the model: name it from the question, or from the selection it asks about.
            if (!title || (title.toLowerCase() === "new chat" && body.quote)) title = fallbackTitle(body.text, body.quote);
            if (title.toLowerCase() === "new chat") return;
            await prisma.aiConversation.update({ where: { id: conversationId }, data: { title } });
            emit({ type: "title", title });
          }).catch(() => undefined)
        : Promise.resolve();

      try {
        const r = await runAgent(ctx, history, { text: body.text, quote: body.quote }, emit, abort.signal, { conversationId });
        const saved = await prisma.aiMessage.create({
          data: {
            conversationId, role: "assistant", content: r.content, blocks: r.blocks.length ? r.blocks : undefined, followUp: r.followUp,
            context: r.context || null, reasoning: r.reasoning || null, status: r.stopped ? "stopped" : "done", model: aiConfig().model, durationMs: Date.now() - started,
          },
          select: { id: true },
        });
        await titleJob;
        emit({ type: "done", messageId: saved.id, durationMs: Date.now() - started });
      } catch (e) {
        const aborted = abort.signal.aborted;
        const message = aborted ? "Stopped." : e instanceof AiServiceError ? e.message : "Something went wrong while answering. Please try again.";
        if (!aborted && !(e instanceof AiServiceError)) console.error("assistant failed", e instanceof Error ? e.stack : e);
        const kept = aborted && (partial.text.trim() || partial.blocks.length);
        const saved = await prisma.aiMessage
          .create({
            data: {
              conversationId, role: "assistant", content: kept ? partial.text.trim() : message, blocks: kept && partial.blocks.length ? (partial.blocks as object[]) : undefined,
              followUp: kept ? partial.followUp : null, status: aborted ? "stopped" : "error", model: aiConfig().model, durationMs: Date.now() - started,
            },
            select: { id: true },
          })
          .catch(() => null);
        await titleJob;
        emit({ type: "error", message, messageId: saved?.id });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // nginx: pass chunks through immediately
    },
  });
}
