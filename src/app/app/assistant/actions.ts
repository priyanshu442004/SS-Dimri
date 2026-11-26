"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionContext, AuthorizationError } from "@/lib/session";
import { toView, type ChatMessageView, type ConversationSummary } from "./view";

// Chat history for the AI assistant: every action works only on the caller's own chats in
// their own firm.

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function owner() {
  const ctx = await actionContext("assistant.use");
  return { userId: ctx.user.id, organizationId: ctx.organization.id };
}

async function guarded<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, message: e.message };
    console.error("assistant action failed", e instanceof Error ? e.message : e);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

const id = z.string().uuid();

export async function listConversations(search?: string): Promise<Result<ConversationSummary[]>> {
  return guarded(async () => {
    const o = await owner();
    const q = (search ?? "").trim().slice(0, 100);
    const rows = await prisma.aiConversation.findMany({
      where: {
        ...o,
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { messages: { some: { content: { contains: q, mode: "insensitive" } } } }] } : {}),
      },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 200,
      select: { id: true, title: true, pinned: true, updatedAt: true },
    });
    return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  });
}

export async function loadConversation(conversationId: string): Promise<Result<{ id: string; title: string; messages: ChatMessageView[] }>> {
  return guarded(async () => {
    const o = await owner();
    const c = await prisma.aiConversation.findFirst({
      where: { id: id.parse(conversationId), ...o },
      select: {
        id: true, title: true,
        messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, quote: true, blocks: true, followUp: true, status: true, feedback: true, durationMs: true, createdAt: true } },
      },
    });
    if (!c) throw new AuthorizationError("This chat no longer exists.");
    return { id: c.id, title: c.title, messages: c.messages.map(toView) };
  });
}

export async function renameConversation(conversationId: string, title: string): Promise<Result<string>> {
  return guarded(async () => {
    const o = await owner();
    const t = z.string().trim().min(1).max(80).parse(title);
    const r = await prisma.aiConversation.updateMany({ where: { id: id.parse(conversationId), ...o }, data: { title: t } });
    if (!r.count) throw new AuthorizationError("This chat no longer exists.");
    return t;
  });
}

export async function setPinned(conversationId: string, pinned: boolean): Promise<Result<boolean>> {
  return guarded(async () => {
    const o = await owner();
    // updatedAt is kept: pinning should not move the chat in the date groups.
    const c = await prisma.aiConversation.findFirst({ where: { id: id.parse(conversationId), ...o }, select: { updatedAt: true } });
    if (!c) throw new AuthorizationError("This chat no longer exists.");
    await prisma.aiConversation.update({ where: { id: conversationId }, data: { pinned, updatedAt: c.updatedAt } });
    return pinned;
  });
}

export async function deleteConversation(conversationId: string): Promise<Result<true>> {
  return guarded(async () => {
    const o = await owner();
    const chat = id.parse(conversationId);
    // The PDF / Excel files made in that chat go with it.
    await prisma.aiGeneratedFile.deleteMany({ where: { conversationId: chat, userId: o.userId, organizationId: o.organizationId } });
    await prisma.aiConversation.deleteMany({ where: { id: chat, ...o } });
    return true as const;
  });
}

export async function deleteAllConversations(): Promise<Result<number>> {
  return guarded(async () => {
    const o = await owner();
    await prisma.aiGeneratedFile.deleteMany({ where: { userId: o.userId, organizationId: o.organizationId } });
    const r = await prisma.aiConversation.deleteMany({ where: o });
    return r.count;
  });
}

export async function setFeedback(messageId: string, value: 1 | -1 | null): Promise<Result<number | null>> {
  return guarded(async () => {
    const o = await owner();
    const v = value === 1 || value === -1 ? value : null;
    const r = await prisma.aiMessage.updateMany({ where: { id: id.parse(messageId), role: "assistant", conversation: o }, data: { feedback: v } });
    if (!r.count) throw new AuthorizationError("This answer no longer exists.");
    return v;
  });
}
