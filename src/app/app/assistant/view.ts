import type { Block } from "@/lib/ai/blocks";

export type ConversationSummary = { id: string; title: string; pinned: boolean; updatedAt: string };
export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  quote: string | null;
  blocks: Block[];
  followUp: string | null;
  status: string;
  feedback: number | null;
  durationMs: number | null;
  createdAt: string;
};

export function toView(m: { id: string; role: string; content: string; quote: string | null; blocks: unknown; followUp: string | null; status: string; feedback: number | null; durationMs: number | null; createdAt: Date }): ChatMessageView {
  return {
    id: m.id,
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
    quote: m.quote,
    blocks: Array.isArray(m.blocks) ? (m.blocks as Block[]) : [],
    followUp: m.followUp,
    status: m.status,
    feedback: m.feedback,
    durationMs: m.durationMs,
    createdAt: m.createdAt.toISOString(),
  };
}

