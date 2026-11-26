import { z } from "zod";

// What the assistant sends to make a PDF or an Excel file (25 Nov 2026). Tables either list rows taken
// from the tool results, or point at a data set the tools returned in this answer (`from`), so long
// lists are copied by the server straight from the database result. Calculations are formulas over
// other columns (`computed`) and totals (`totals`): the server works them out — the model never types a
// calculated number. Every number and name typed in is checked against the data looked up.

export const COL_TYPES = ["text", "int", "number", "inr", "percent", "date", "hours"] as const;
export type ColType = (typeof COL_TYPES)[number];

const cellValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
const colType = z.enum(COL_TYPES).catch("text");

export const columnSchema = z.object({
  header: z.string().trim().min(1).max(60),
  type: colType.default("text"),
  /** With `from`: the field of each record, dot path ("employee.firstName"); "a|b" joins fields with a space. */
  field: z.string().trim().max(160).optional(),
  total: z.enum(["sum", "avg", "count", "none"]).optional(),
});

export const computedSchema = z.object({
  header: z.string().trim().min(1).max(60),
  type: colType.default("number"),
  /** Arithmetic over other columns by header in braces: "{Present days} / {Working days} * 100". */
  formula: z.string().trim().min(3).max(300),
  total: z.enum(["sum", "avg", "count", "none"]).optional(),
});

export const tableSchema = z.object({
  title: z.string().trim().max(120).optional(),
  columns: z.array(columnSchema).min(1).max(20),
  rows: z.array(z.array(cellValue).max(20)).max(3000).optional(),
  from: z.object({
    /** A data set id returned by a data tool in this answer ("d1", "d2" …). */
    dataset: z.string().trim().max(10),
    /** Where the list is in that result, e.g. "rows", "perPerson", "perDay". */
    path: z.string().trim().max(120).optional(),
    /** Keep only records whose field equals the value, e.g. { "state": "LATE" }. */
    where: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    limit: z.number().int().min(1).max(5000).optional(),
  }).optional(),
  computed: z.array(computedSchema).max(8).optional(),
  /** Sort by a column header (after computing). */
  sort: z.object({ column: z.string().max(60), desc: z.boolean().optional() }).optional(),
  totals: z.boolean().optional(),
}).refine((t) => !!t.rows || !!t.from, { message: "Give the table rows, or `from` with a data set id" });

export const kpiSchema = z.object({ label: z.string().trim().min(1).max(60), value: z.union([z.number(), z.string().max(60)]), type: colType.optional(), hint: z.string().max(120).optional() });

export const chartSchema = z.object({
  chart: z.enum(["bar", "column", "line", "pie", "donut"]),
  title: z.string().trim().min(1).max(100),
  labels: z.array(z.string().max(60)).min(1).max(40),
  series: z.array(z.object({ name: z.string().max(60), values: z.array(z.number()).min(1).max(40) })).min(1).max(5),
  format: colType.optional(),
}).superRefine((c, ctx) => {
  c.series.forEach((s, i) => { if (s.values.length !== c.labels.length) ctx.addIssue({ code: "custom", path: ["series", i], message: `series "${s.name}" has ${s.values.length} values for ${c.labels.length} labels` }); });
  if ((c.chart === "pie" || c.chart === "donut") && c.series.length !== 1) ctx.addIssue({ code: "custom", path: ["series"], message: "a pie / donut chart takes one series" });
});

export const pdfSpecSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(200).optional(),
  fileName: z.string().trim().max(80).optional(),
  landscape: z.boolean().optional(),
  kpis: z.array(kpiSchema).max(8).optional(),
  sections: z.array(z.object({
    heading: z.string().trim().max(120).optional(),
    text: z.string().max(3000).optional(),
    bullets: z.array(z.string().max(400)).max(30).optional(),
    kpis: z.array(kpiSchema).max(8).optional(),
    table: tableSchema.optional(),
    chart: chartSchema.optional(),
  })).min(1).max(20),
});

export const excelSpecSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(200).optional(),
  fileName: z.string().trim().max(80).optional(),
  sheets: z.array(z.object({
    name: z.string().trim().min(1).max(31),
    title: z.string().trim().max(120).optional(),
    kpis: z.array(kpiSchema).max(8).optional(),
    table: tableSchema,
    notes: z.array(z.string().max(300)).max(10).optional(),
  })).min(1).max(12),
});

export type PdfSpec = z.infer<typeof pdfSpecSchema>;
export type ExcelSpec = z.infer<typeof excelSpecSchema>;
export type TableSpec = z.infer<typeof tableSchema>;
export type KpiSpec = z.infer<typeof kpiSchema>;
export type ChartSpec = z.infer<typeof chartSchema>;
