import { z } from "zod";

// Visual blocks the assistant can attach to an answer: KPI cards, charts and tables. Shared by
// the server (validates what the model sends) and the browser (renders it).

const num = z.union([z.number(), z.string().transform((s, c) => {
  const n = Number(s.replace(/[₹,%\s]/g, ""));
  if (!Number.isFinite(n)) { c.addIssue({ code: "custom", message: `"${s}" is not a number` }); return z.NEVER; }
  return n;
})]);

export const FORMATS = ["count", "inr", "percent", "minutes", "decimal"] as const;
export type BlockFormat = (typeof FORMATS)[number];

export const kpiBlockSchema = z.object({
  type: z.literal("kpis"),
  items: z.array(z.object({
    label: z.string().min(1).max(60),
    value: z.union([z.number(), z.string().max(40)]),
    format: z.enum(FORMATS).optional(),
    hint: z.string().max(120).optional(),
    tone: z.enum(["neutral", "good", "bad", "warn"]).optional(),
    change: z.string().max(30).optional(),
  })).min(1).max(8),
});

export const chartBlockSchema = z.object({
  type: z.literal("chart"),
  chart: z.enum(["bar", "column", "line", "area", "pie", "donut", "stacked"]),
  title: z.string().min(1).max(100),
  subtitle: z.string().max(160).optional(),
  labels: z.array(z.string().max(60)).min(1).max(60),
  series: z.array(z.object({ name: z.string().max(60), values: z.array(num).min(1).max(60) })).min(1).max(6),
  format: z.enum(FORMATS).optional(),
}).superRefine((c, ctx) => {
  c.series.forEach((s, i) => {
    if (s.values.length !== c.labels.length) ctx.addIssue({ code: "custom", path: ["series", i, "values"], message: `series "${s.name}" has ${s.values.length} values but there are ${c.labels.length} labels` });
  });
  if ((c.chart === "pie" || c.chart === "donut") && c.series.length !== 1) ctx.addIssue({ code: "custom", path: ["series"], message: "pie / donut charts take exactly one series" });
});

export const tableBlockSchema = z.object({
  type: z.literal("table"),
  title: z.string().max(100).optional(),
  columns: z.array(z.string().max(60)).min(1).max(12),
  rows: z.array(z.array(z.union([z.string().max(300), z.number(), z.null()]))).min(1).max(100),
});

export const blockSchema = z.union([kpiBlockSchema, chartBlockSchema, tableBlockSchema]);
export type Block = z.infer<typeof blockSchema>;
export type KpiBlock = z.infer<typeof kpiBlockSchema>;
export type ChartBlock = z.infer<typeof chartBlockSchema>;
export type TableBlock = z.infer<typeof tableBlockSchema>;

/** Events streamed from /api/assistant/chat to the browser, one JSON object per line. */
export type StreamEvent =
  | { type: "meta"; conversationId: string; userMessageId: string; title?: string }
  | { type: "status"; text: string }
  | { type: "tool"; id: string; name: string; label: string; state: "running" | "done" | "error" }
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "block"; block: Block }
  | { type: "followup"; text: string }
  | { type: "title"; title: string }
  | { type: "done"; messageId: string; durationMs: number }
  | { type: "error"; message: string; messageId?: string };
