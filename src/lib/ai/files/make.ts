import "server-only";
import { prisma } from "@/lib/db";
import { formatDate, isoDateInTz, dateOnly } from "@/lib/dates";
import { htmlToPdf } from "@/lib/pdf";
import type { AppContext } from "@/lib/session";
import { excelSpecSchema, pdfSpecSchema, type ChartSpec, type KpiSpec } from "./spec";
import { FactIndex, numbersIn } from "./facts";
import { documentNumbers, resolveTable, type Datasets, type ResolvedTable } from "./resolve";
import { pdfHtml, xlsxBytes, type DocMeta, type PdfDoc } from "./render";

// The assistant's create_pdf / create_excel (25 Nov 2026): check, build, store, and hand back a download
// block. Nothing is made while any figure is unverified — the model gets the list and must look the data
// up (or point at the data set) instead.

import type { FileBlock } from "../blocks";
export type { FileBlock };
export type MakeResult = { ok: true; block: FileBlock; message: string } | { ok: false; problems: string[] };

const MAX_BYTES = 8 * 1024 * 1024;

function safeName(name: string | undefined, title: string, ext: "pdf" | "xlsx", today: string) {
  const base = (name || title).replace(/\.(pdf|xlsx?)$/i, "").replace(/[^A-Za-z0-9 _-]+/g, " ").trim().replace(/\s+/g, "_").slice(0, 70) || "Report";
  return `${base}${/\d{4}/.test(base) ? "" : `_${today}`}.${ext}`;
}

function checker(facts: FactIndex, today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const todayNums = new Set([y, m, d]);
  return (docNums: FactIndex, problems: string[]) => ({
    text(where: string, s: string | undefined) {
      if (!s) return;
      const bad = numbersIn(s).filter((n) => !todayNums.has(n) && !facts.hasNumber(n) && !docNums.hasNumber(n));
      if (bad.length) problems.push(`${where}: the number${bad.length === 1 ? "" : "s"} ${[...new Set(bad)].slice(0, 8).join(", ")} ${bad.length === 1 ? "is" : "are"} not in the data looked up or in the file's own tables. Quote only figures from the data, or leave them out.`);
    },
    kpis(where: string, list: KpiSpec[] | undefined) {
      for (const k of list ?? []) {
        if (typeof k.value === "number") { if (!facts.hasNumber(k.value) && !docNums.hasNumber(k.value)) problems.push(`${where}: figure "${k.label}" = ${k.value} is not in the data looked up or in the file's tables.`); }
        else { const c = facts.checkText(k.value); if (!c.ok && numbersIn(k.value).some((n) => !docNums.hasNumber(n))) problems.push(`${where}: figure "${k.label}" = "${k.value}" is not in the data looked up.`); }
      }
    },
    chart(where: string, c: ChartSpec | undefined) {
      if (!c) return;
      const bad = c.series.flatMap((s) => s.values).filter((v) => !facts.hasNumber(v) && !docNums.hasNumber(v));
      if (bad.length) problems.push(`${where}: chart values ${[...new Set(bad)].slice(0, 8).join(", ")} are not in the data looked up.`);
      const badLabels = c.labels.filter((l) => !facts.checkText(l).ok);
      if (badLabels.length) problems.push(`${where}: chart labels not in the data: ${badLabels.slice(0, 6).join(", ")}.`);
    },
  });
}

async function store(ctx: AppContext, conversationId: string | null, kind: "pdf" | "xlsx", fileName: string, title: string, bytes: Uint8Array, summary: string): Promise<FileBlock> {
  if (bytes.byteLength > MAX_BYTES) throw new Error("The file is too large (over 8 MB). Make it smaller (fewer rows or sheets).");
  const f = await prisma.aiGeneratedFile.create({
    data: { organizationId: ctx.organization.id, userId: ctx.user.id, conversationId, kind, fileName, title, bytes: Buffer.from(bytes), sizeBytes: bytes.byteLength },
    select: { id: true },
  });
  return { type: "file", fileId: f.id, kind, fileName, title, sizeBytes: bytes.byteLength, summary };
}

function metaFor(ctx: AppContext, today: string): DocMeta {
  return { firm: ctx.organization.tradeName, preparedFor: ctx.user.name, preparedOn: formatDate(dateOnly(today)), asOf: formatDate(dateOnly(today)) };
}

const summaryOf = (tables: ResolvedTable[]) => tables.map((t) => `${t.title ? `${t.title}: ` : ""}${t.rows.length} row${t.rows.length === 1 ? "" : "s"} × ${t.columns.length} columns`).join("; ");

export async function makeExcel(ctx: AppContext, args: unknown, facts: FactIndex, datasets: Datasets, conversationId: string | null): Promise<MakeResult> {
  const parsed = excelSpecSchema.safeParse(args);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "input"}: ${i.message}`) };
  const spec = parsed.data;
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const problems: string[] = [];
  const tables = spec.sheets.map((s, i) => resolveTable({ ...s.table, title: s.table.title ?? s.title }, facts, datasets, problems, `sheet ${i + 1} "${s.name}"`));
  const doc = documentNumbers(tables);
  const chk = checker(facts, today)(doc, problems);
  chk.text("title", spec.title); chk.text("subtitle", spec.subtitle);
  spec.sheets.forEach((s, i) => { chk.text(`sheet ${i + 1} title`, s.title); chk.kpis(`sheet ${i + 1}`, s.kpis); for (const n of s.notes ?? []) chk.text(`sheet ${i + 1} note`, n); });
  if (problems.length) return { ok: false, problems };
  const bytes = xlsxBytes({ title: spec.title, subtitle: spec.subtitle, sheets: spec.sheets.map((s, i) => ({ name: s.name, title: s.title, kpis: s.kpis ?? [], table: tables[i], notes: s.notes })) }, metaFor(ctx, today));
  const fileName = safeName(spec.fileName, spec.title, "xlsx", today);
  const block = await store(ctx, conversationId, "xlsx", fileName, spec.title, bytes, `${spec.sheets.length} sheet${spec.sheets.length === 1 ? "" : "s"} — ${summaryOf(tables)}`);
  return { ok: true, block, message: `Excel file "${fileName}" is made and shown to the user as a download (${block.summary}). In your reply, say in one or two lines what it contains; do not list the rows again.` };
}

export async function makePdf(ctx: AppContext, args: unknown, facts: FactIndex, datasets: Datasets, conversationId: string | null): Promise<MakeResult> {
  const parsed = pdfSpecSchema.safeParse(args);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "input"}: ${i.message}`) };
  const spec = parsed.data;
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const problems: string[] = [];
  const tables: ResolvedTable[] = [];
  const sections: PdfDoc["sections"] = spec.sections.map((s, i) => {
    const table = s.table ? resolveTable(s.table, facts, datasets, problems, `section ${i + 1}${s.heading ? ` "${s.heading}"` : ""}`) : undefined;
    if (table) tables.push(table);
    return { heading: s.heading, text: s.text, bullets: s.bullets, kpis: s.kpis, table, chart: s.chart };
  });
  const doc = documentNumbers(tables);
  const chk = checker(facts, today)(doc, problems);
  chk.text("title", spec.title); chk.text("subtitle", spec.subtitle); chk.kpis("headline figures", spec.kpis);
  spec.sections.forEach((s, i) => {
    const w = `section ${i + 1}`;
    chk.text(`${w} heading`, s.heading); chk.text(`${w} text`, s.text); for (const b of s.bullets ?? []) chk.text(`${w} bullet`, b);
    chk.kpis(w, s.kpis); chk.chart(w, s.chart);
  });
  if (problems.length) return { ok: false, problems };
  const html = pdfHtml({ title: spec.title, subtitle: spec.subtitle, landscape: spec.landscape, kpis: spec.kpis ?? [], sections }, metaFor(ctx, today));
  const pdf = await htmlToPdf(html, { landscape: spec.landscape, margin: "12mm" });
  const fileName = safeName(spec.fileName, spec.title, "pdf", today);
  const parts = [`${spec.sections.length} section${spec.sections.length === 1 ? "" : "s"}`, tables.length ? summaryOf(tables) : "", spec.sections.some((s) => s.chart) ? `${spec.sections.filter((s) => s.chart).length} chart(s)` : ""].filter(Boolean);
  const block = await store(ctx, conversationId, "pdf", fileName, spec.title, new Uint8Array(pdf), parts.join(" — "));
  return { ok: true, block, message: `PDF "${fileName}" is made and shown to the user as a download (${block.summary}). In your reply, say in one or two lines what it contains; do not repeat the tables.` };
}
