// Turns a table spec into finished rows: rows copied from a data set (straight from the tool result),
// or typed rows checked against the data; then the computed columns and totals, worked out here —
// never by the model. Problems (a number or name not found in the data, a bad formula) are collected
// and sent back to the model so it fetches the data instead of guessing. Pure.

import type { ColType, TableSpec } from "./spec";
import { FactIndex, toIso, toNumber } from "./facts";

export type Value = string | number | null;
export type ResolvedColumn = { header: string; type: ColType; total?: "sum" | "avg" | "count" | "none"; /** Excel formula with {r} for the row, for computed columns. */ excel?: string };
export type ResolvedTable = { title?: string; columns: ResolvedColumn[]; rows: Value[][]; totals: (Value | undefined)[] | null; computedFrom: Set<number> };

export type Datasets = Map<string, unknown>;

// ---------------------------------------------------------------- formulas: + - * / ( ) numbers {Column}

type Node = { k: "num"; v: number } | { k: "col"; i: number } | { k: "op"; op: "+" | "-" | "*" | "/"; a: Node; b: Node } | { k: "neg"; a: Node };

export function parseFormula(src: string, headers: string[]): Node {
  const tokens: string[] = [];
  const re = /\s*(\{[^}]{1,60}\}|\d+(?:\.\d+)?|[-+*/()])/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) { if (/^\s*$/.test(src.slice(pos))) break; throw new Error(`cannot read "${src.slice(pos, pos + 20)}"`); }
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  let i = 0;
  const peek = () => tokens[i];
  const expr = (): Node => {
    let a = term();
    while (peek() === "+" || peek() === "-") { const op = tokens[i++] as "+" | "-"; a = { k: "op", op, a, b: term() }; }
    return a;
  };
  const term = (): Node => {
    let a = factor();
    while (peek() === "*" || peek() === "/") { const op = tokens[i++] as "*" | "/"; a = { k: "op", op, a, b: factor() }; }
    return a;
  };
  const factor = (): Node => {
    const t = tokens[i++];
    if (t === undefined) throw new Error("the formula ends too early");
    if (t === "-") return { k: "neg", a: factor() };
    if (t === "(") { const e = expr(); if (tokens[i++] !== ")") throw new Error("a bracket is not closed"); return e; }
    if (t.startsWith("{")) {
      const name = t.slice(1, -1).trim().toLowerCase();
      const idx = headers.findIndex((h) => h.trim().toLowerCase() === name);
      if (idx < 0) throw new Error(`no column called "${t.slice(1, -1)}"`);
      return { k: "col", i: idx };
    }
    if (/^\d/.test(t)) return { k: "num", v: Number(t) };
    throw new Error(`unexpected "${t}"`);
  };
  const tree = expr();
  if (i !== tokens.length) throw new Error(`unexpected "${tokens[i]}"`);
  return tree;
}

export function evalFormula(n: Node, row: Value[]): number | null {
  switch (n.k) {
    case "num": return n.v;
    case "col": { const v = row[n.i]; return typeof v === "number" ? v : v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null; }
    case "neg": { const a = evalFormula(n.a, row); return a === null ? null : -a; }
    case "op": {
      const a = evalFormula(n.a, row); const b = evalFormula(n.b, row);
      if (a === null || b === null) return null;
      if (n.op === "/") return b === 0 ? null : a / b;
      return n.op === "+" ? a + b : n.op === "-" ? a - b : a * b;
    }
  }
}

export function excelFormula(n: Node, colLetter: (i: number) => string): string {
  switch (n.k) {
    case "num": return String(n.v);
    case "col": return `${colLetter(n.i)}{r}`;
    case "neg": return `-(${excelFormula(n.a, colLetter)})`;
    case "op": return `(${excelFormula(n.a, colLetter)}${n.op}${excelFormula(n.b, colLetter)})`;
  }
}

// ---------------------------------------------------------------- data sets

function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".").filter(Boolean)) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(part)) cur = cur[Number(part)];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

/** The list in a data set: the given path, or the first array found ("rows", "perPerson" …). */
function listOf(data: unknown, path?: string): unknown[] | null {
  if (path) { const v = at(data, path); return Array.isArray(v) ? v : null; }
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["rows", "perPerson", "perDay", "result"]) { const v = (data as Record<string, unknown>)[k]; if (Array.isArray(v)) return v; }
    const first = Object.values(data as Record<string, unknown>).find(Array.isArray);
    return (first as unknown[]) ?? null;
  }
  return null;
}

const fieldValue = (rec: unknown, field: string): unknown => {
  const parts = field.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts.map((p) => at(rec, p)).filter((x) => x !== null && x !== undefined && x !== "").join(" ") || null;
  return at(rec, field);
};

function normalise(v: unknown, type: ColType): Value {
  if (v === null || v === undefined) return null;
  if (type === "date") { const s = String(v); return toIso(s) ?? s.slice(0, 10); }
  if (type === "text") return typeof v === "object" ? JSON.stringify(v) : String(v);
  const n = toNumber(v);
  return n === null ? null : Number.isNaN(n) ? String(v) : n;
}

// ---------------------------------------------------------------- the table

export function resolveTable(t: TableSpec, facts: FactIndex, datasets: Datasets, problems: string[], where: string): ResolvedTable {
  const base = t.columns.map((c) => ({ header: c.header, type: c.type, total: c.total }));
  let rows: Value[][] = [];
  if (t.from) {
    const data = datasets.get(t.from.dataset);
    if (data === undefined) problems.push(`${where}: data set "${t.from.dataset}" is not one returned in this answer. Look the data up again in this answer and use the data set id the tool returns.`);
    else {
      let list = listOf(data, t.from.path);
      if (!list) problems.push(`${where}: no list at "${t.from.path ?? "(first list)"}" in data set ${t.from.dataset}.`);
      else {
        if (t.from.where) list = list.filter((rec) => Object.entries(t.from!.where!).every(([f, v]) => { const x = fieldValue(rec, f); return x === v || String(x).toLowerCase() === String(v).toLowerCase(); }));
        if (t.from.limit) list = list.slice(0, t.from.limit);
        const missingField = t.columns.find((c) => !c.field);
        if (missingField) problems.push(`${where}: with "from", every column needs a "field" (missing for "${missingField.header}").`);
        else rows = list.map((rec) => t.columns.map((c) => normalise(fieldValue(rec, c.field!), c.type)));
      }
    }
  } else {
    // Typed rows: every value must be found in the data looked up in this conversation.
    const bad: string[] = [];
    rows = (t.rows ?? []).map((r) => t.columns.map((c, i) => {
      const raw = r[i] ?? null;
      if (raw === null || raw === "") return null;
      if (c.type === "text") {
        const s = String(raw);
        const chk = facts.checkText(s);
        if (!chk.ok) bad.push(`"${s}" (${chk.missing.slice(0, 3).join(", ")})`);
        return s;
      }
      if (c.type === "date") {
        const iso = toIso(String(raw));
        if (!iso || !facts.hasDate(iso)) bad.push(`date "${raw}"`);
        return iso ?? String(raw);
      }
      const n = toNumber(raw);
      if (n === null) return null;
      if (Number.isNaN(n)) { const chk = facts.checkText(String(raw)); if (!chk.ok) bad.push(`"${raw}"`); return String(raw); }
      if (!facts.hasNumber(n)) bad.push(String(raw));
      return n;
    }));
    if (bad.length) problems.push(`${where}: these values are not in the data looked up in this conversation: ${[...new Set(bad)].slice(0, 12).join("; ")}${bad.length > 12 ? ` and ${bad.length - 12} more` : ""}. Look them up with the data tools (or use "from" with the data set), and use "computed" for calculations — never type a number yourself.`);
  }

  // Computed columns, worked out here.
  const headers = base.map((c) => c.header);
  const columns: ResolvedColumn[] = [...base];
  const computedFrom = new Set<number>();
  for (const c of t.computed ?? []) {
    try {
      const node = parseFormula(c.formula, headers);
      const idx = columns.length;
      columns.push({ header: c.header, type: c.type, total: c.total, excel: excelFormula(node, (i) => colLetter(i)) });
      headers.push(c.header);
      computedFrom.add(idx);
      rows = rows.map((r) => { const v = evalFormula(node, r); return [...r, v === null ? null : Math.round(v * 10000) / 10000]; });
    } catch (e) {
      problems.push(`${where}: computed column "${c.header}": ${e instanceof Error ? e.message : "bad formula"}. Use + - * / ( ), numbers and other columns in braces, e.g. "{Late days} / {Working days} * 100".`);
    }
  }
  if (t.sort) {
    const i = headers.findIndex((h) => h.toLowerCase() === t.sort!.column.toLowerCase());
    if (i >= 0) rows = [...rows].sort((a, b) => {
      const x = a[i]; const y = b[i];
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      return t.sort!.desc ? -r : r;
    });
  }
  let totals: (Value | undefined)[] | null = null;
  if (t.totals && rows.length) {
    totals = columns.map((c, i) => {
      if (i === 0) return "Total";
      const kind = c.total ?? (c.type !== "text" && c.type !== "date" && c.type !== "percent" ? "sum" : "none");
      if (kind === "none") return undefined;
      const vals = rows.map((r) => r[i]).filter((v): v is number => typeof v === "number");
      if (kind === "count") return vals.length;
      if (!vals.length) return null;
      const s = vals.reduce((a, b) => a + b, 0);
      return Math.round((kind === "avg" ? s / vals.length : s) * 100) / 100;
    });
  }
  return { title: t.title, columns, rows, totals, computedFrom };
}

export function colLetter(i: number) {
  let n = i + 1;
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Numbers the document itself produced (totals, computed values, row counts): text may quote them. */
export function documentNumbers(tables: ResolvedTable[]): FactIndex {
  const f = new FactIndex();
  for (const t of tables) {
    f.addNumber(t.rows.length);
    for (const r of t.rows) r.forEach((v, i) => { if (typeof v === "number") { f.addNumber(v); if (t.computedFrom.has(i)) f.addNumber(v); } });
    for (const v of t.totals ?? []) if (typeof v === "number") f.addNumber(v);
    // Averages / maxima / minima of each numeric column, which a summary sentence may mention.
    t.columns.forEach((_, i) => {
      const vals = t.rows.map((r) => r[i]).filter((v): v is number => typeof v === "number");
      if (!vals.length) return;
      f.addNumber(Math.max(...vals)); f.addNumber(Math.min(...vals)); f.addNumber(vals.reduce((a, b) => a + b, 0)); f.addNumber(vals.reduce((a, b) => a + b, 0) / vals.length);
      f.addNumber(vals.filter((v) => v > 0).length);
    });
  }
  return f;
}
