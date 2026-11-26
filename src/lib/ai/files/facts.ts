// "No number or fact out of the blue" (client, 25 Nov 2026). Everything the assistant puts in a file is
// checked against what its tools returned in this conversation: every number must be one of those
// numbers (allowing the usual rounding, a fraction shown as %, minutes shown as hours), every name /
// word in a table cell must appear in that data, every date must be one of its dates. Calculated
// figures are not typed by the model at all: the server works them out (see resolve.ts). Pure.

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Words a table may use without them being in the data: statuses, units and plain connecting words. */
const COMMON = new Set([
  "the", "and", "for", "with", "from", "not", "yes", "none", "nil", "total", "totals", "grand", "all", "any", "each", "per", "of", "to", "by", "at", "in", "on", "or",
  "late", "present", "absent", "leave", "half", "day", "days", "full", "time", "office", "client", "clients", "visit", "marked", "mark", "out", "pending", "approved",
  "rejected", "done", "open", "closed", "active", "inactive", "overdue", "due", "paid", "unpaid", "sick", "casual", "planned", "other", "others", "minutes", "minute",
  "mins", "min", "hours", "hour", "hrs", "month", "months", "week", "weeks", "year", "years", "today", "yesterday", "morning", "evening", "first", "second", "grace",
  "very", "without", "request", "requested", "reason", "given", "amount", "salary", "net", "arrival", "early", "leaving", "worked", "working", "holiday", "sunday",
  "weekly", "off", "remark", "remarks", "unknown", "employee", "employees", "team", "member", "members", "staff", "name", "date", "status", "yes", "only", "more",
  "less", "than", "over", "under", "above", "below", "average", "avg", "count", "number", "rate", "percent", "share", "people", "person", "lead", "senior", "manager",
  "admin", "administrator", "owner", "rs", "inr", "rupees", "lakh", "crore", "thousand", "nos", "na", "n/a", "excused", "informed", "not marked", "unmarked", "auto",
  "ok", "good", "bad", "high", "low", "medium", "normal", "after", "before", "since", "till", "until", "between", "within", "approx", "about", "excluding", "including",
  ...MONTHS, ...MONTHS.map((m) => m.slice(0, 3)), ...DAYS, ...DAYS.map((d) => d.slice(0, 3)), "sept",
]);

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const NUM_RE = /-?\d[\d,]*(?:\.\d+)?/g;
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

export function tokensOf(s: string): string[] {
  return s.toLowerCase().normalize("NFKD").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Numbers written in a text ("₹1,25,000", "92.3%", "16 Nov 2026" → 125000, 92.3, 16, 2026). */
export function numbersIn(s: string): number[] {
  return [...s.matchAll(NUM_RE)].map((m) => Number(m[0].replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

export class FactIndex {
  private n2 = new Set<number>();
  private n1 = new Set<number>();
  private ints = new Set<number>();
  private words = new Set<string>();
  private dates = new Set<string>();
  private texts: string[] = [];

  addNumber(n: number) {
    if (!Number.isFinite(n)) return;
    for (const v of [n, Math.abs(n), n * 100, n / 60]) {
      this.n2.add(round(v, 2));
      this.n1.add(round(v, 1));
      this.ints.add(Math.round(v));
    }
  }

  addText(s: string) {
    if (!s) return;
    this.texts.push(s.toLowerCase());
    for (const t of tokensOf(s)) this.words.add(t);
    for (const n of numbersIn(s)) this.addNumber(n);
    for (const m of s.matchAll(ISO_RE)) {
      const iso = `${m[1]}-${m[2]}-${m[3]}`;
      this.dates.add(iso);
      const mo = Number(m[2]);
      if (mo >= 1 && mo <= 12) { this.words.add(MONTHS[mo - 1]); this.words.add(MONTHS[mo - 1].slice(0, 3)); }
      const d = new Date(`${iso}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) this.words.add(DAYS[d.getUTCDay()]);
    }
  }

  /** Every number and string anywhere in a tool result (any depth). */
  addJson(v: unknown, depth = 0) {
    if (depth > 12 || v === null || v === undefined) return;
    if (typeof v === "number") return this.addNumber(v);
    if (typeof v === "string") return this.addText(v);
    if (typeof v === "boolean") return;
    if (Array.isArray(v)) { this.addNumber(v.length); for (const x of v) this.addJson(x, depth + 1); return; }
    if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) { this.addText(k.replace(/([a-z])([A-Z])/g, "$1 $2")); this.addJson(x, depth + 1); }
  }

  hasNumber(n: number): boolean {
    if (!Number.isFinite(n)) return false;
    if (this.n2.has(round(n, 2)) || this.n2.has(round(Math.abs(n), 2))) return true;
    if (this.n1.has(round(n, 1))) return true;
    return Number.isInteger(n) && this.ints.has(Math.abs(n));
  }

  hasDate(iso: string): boolean {
    return this.dates.has(iso);
  }

  /** A table cell's text: each word must be in the data (or a plain word), each number a known number. */
  checkText(s: string): { ok: boolean; missing: string[] } {
    const t = s.trim().toLowerCase();
    if (!t || t === "—" || t === "-" || this.texts.some((x) => x === t)) return { ok: true, missing: [] };
    const missing: string[] = [];
    for (const tok of tokensOf(t)) {
      if (/^\d+(\.\d+)?$/.test(tok)) continue; // numbers inside text are checked separately
      if (tok.length < 3 || COMMON.has(tok) || this.words.has(tok)) continue;
      if (tok.endsWith("s") && (this.words.has(tok.slice(0, -1)) || COMMON.has(tok.slice(0, -1)))) continue;
      if (this.words.has(`${tok}s`)) continue;
      missing.push(tok);
    }
    for (const n of numbersIn(t)) if (!this.hasNumber(n)) missing.push(String(n));
    return { ok: missing.length === 0, missing };
  }
}

/** "16 Nov 2026", "16-11-2026", "2026-11-16", "16/11/2026" → "2026-11-16"; anything else → null. */
export function toIso(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-,]+(\d{4})$/.exec(t);
  if (m) {
    const mo = MONTHS.findIndex((x) => x.startsWith(m![2].toLowerCase().slice(0, 3)));
    if (mo >= 0) return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** "₹1,25,000.50", "92.3%", "3.5 h", "1,234" → number; blank / dash → null; text → NaN. */
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim();
  if (s === "—" || s === "-" || /^n\/?a$/i.test(s)) return null;
  const cleaned = s.replace(/^(₹|rs\.?|inr)\s*/i, "").replace(/,/g, "").replace(/\s*(%|h|hrs?|hours?|days?|km)$/i, "").trim();
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}
