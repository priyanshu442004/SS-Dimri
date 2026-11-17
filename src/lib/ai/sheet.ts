import "server-only";
import { cacheGet, cacheSet, singleFlight } from "./cache";

// Live reader for the firm's public Google Sheet. Nothing about the sheet is hard-coded: the
// tab list is read from the sheet itself and each tab's header row is detected from its
// content, so added / renamed / deleted tabs, columns and rows are picked up automatically.
//
// Fetched only when the assistant calls a sheet tool (never per question). A copy younger than
// AI_SHEET_FRESH_SECONDS is reused; an older one is re-fetched, and served only if Google is
// unreachable ("stale if error"), so answers are live without paying for a fetch every time.

const STALE_IF_ERROR_SECONDS = 24 * 3600;
const FETCH_TIMEOUT_MS = 8000;

export type SheetTab = { name: string; gid: string };
export type TabData = { name: string; gid: string; title: string[]; headerRow: number; header: string[]; rows: { n: number; cells: string[] }[]; totalRows: number };

class SheetError extends Error {
  override name = "SheetError";
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "User-Agent": "Mozilla/5.0 (office-erp assistant)" } });
  if (!res.ok) throw new SheetError(res.status === 404 ? "The Google Sheet was not found (check the link)." : `Google Sheets answered with error ${res.status}.`);
  const text = await res.text();
  if (/<title>[^<]*(Sign in|Login)/i.test(text.slice(0, 3000))) throw new SheetError("The Google Sheet is not public. Share it as 'Anyone with the link can view'.");
  return text;
}

/** Fresh copy if young enough; otherwise re-fetch, falling back to the old copy on failure. */
async function liveCached<T>(key: string, freshSeconds: number, force: boolean, load: () => Promise<T>): Promise<{ value: T; ageSeconds: number; stale: boolean }> {
  const cached = await cacheGet<T>(key, { shared: true, maxStaleSeconds: STALE_IF_ERROR_SECONDS });
  if (cached && !force && cached.ageSeconds <= freshSeconds) return { ...cached, stale: false };
  try {
    const value = await singleFlight(key, load);
    await cacheSet(key, value, { shared: true, ttlSeconds: STALE_IF_ERROR_SECONDS });
    return { value, ageSeconds: 0, stale: false };
  } catch (e) {
    if (cached) return { ...cached, stale: true };
    throw e;
  }
}

// ---------------------------------------------------------------- tabs

function parseTabs(html: string): SheetTab[] {
  const tabs: SheetTab[] = [];
  const re = /\{name:\s*"((?:[^"\\]|\\.)*)",\s*pageUrl:\s*"[^"]*",\s*gid:\s*"(\d+)"/g;
  for (const m of html.matchAll(re)) {
    const name = JSON.parse(`"${m[1]}"`) as string;
    if (!tabs.some((t) => t.gid === m[2])) tabs.push({ name, gid: m[2] });
  }
  return tabs;
}

export async function listTabs(sheetId: string, freshSeconds: number, force = false) {
  return liveCached(`sheet:${sheetId}:tabs`, freshSeconds, force, async () => {
    const html = await fetchText(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`);
    const tabs = parseTabs(html);
    if (!tabs.length) throw new SheetError("Could not read the list of tabs from the Google Sheet.");
    return tabs;
  });
}

// ---------------------------------------------------------------- CSV

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const filled = (r: string[]) => r.filter((c) => c.trim() !== "").length;

/**
 * Splits a tab into its title lines, header row and data rows. The header is the first row
 * that is (nearly) as wide as the widest rows in the tab and mostly text, not numbers.
 */
export function shapeTab(name: string, gid: string, grid: string[][]): TabData {
  const clean = grid.map((r) => r.map((c) => c.replace(/\s+/g, " ").trim()));
  let width = 0;
  for (const r of clean) for (let i = r.length - 1; i >= 0; i--) if (r[i]) { width = Math.max(width, i + 1); break; }
  const rows = clean.map((r) => r.slice(0, width));
  const counts = rows.slice(0, 60).map(filled).sort((a, b) => b - a);
  const typical = counts[Math.min(2, counts.length - 1)] ?? 0;
  let headerIdx = rows.findIndex((r, i) => {
    if (i > 40) return false;
    const n = filled(r);
    if (n < Math.max(2, Math.ceil(typical * 0.6))) return false;
    const texty = r.filter((c) => c && !/^[-+₹$\d.,%/: ]+$/.test(c)).length;
    return texty >= n * 0.7;
  });
  if (headerIdx < 0) headerIdx = 0;
  const header = rows[headerIdx]?.map((h, i) => h || `Col${i + 1}`) ?? [];
  // Title lines = the leading one-cell rows (sheet title, notes). Everything else is data, even
  // rows above the detected header (tabs often hold several small tables): nothing is dropped.
  let titleEnd = 0;
  while (titleEnd < headerIdx && filled(rows[titleEnd]) <= 1) titleEnd++;
  const title = rows.slice(0, titleEnd).map((r) => r.filter(Boolean).join(" | ")).filter(Boolean).map((t) => t.slice(0, 400));
  const data = rows
    .map((cells, i) => ({ n: i + 1, cells }))
    .filter((r, i) => i >= titleEnd && i !== headerIdx && filled(r.cells) > 0);
  return { name, gid, title, headerRow: headerIdx + 1, header, rows: data, totalRows: data.length };
}

async function loadTab(sheetId: string, tab: SheetTab, freshSeconds: number, force: boolean) {
  return liveCached(`sheet:${sheetId}:tab:${tab.gid}`, freshSeconds, force, async () => {
    const csv = await fetchText(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tab.gid}`);
    return shapeTab(tab.name, tab.gid, parseCsv(csv));
  });
}

function resolveTab(tabs: SheetTab[], wanted: string): SheetTab | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const w = norm(wanted);
  return tabs.find((t) => t.gid === wanted) ?? tabs.find((t) => norm(t.name) === w) ?? tabs.find((t) => norm(t.name).includes(w) || w.includes(norm(t.name))) ?? null;
}

// ---------------------------------------------------------------- tool entry points

const cellText = (c: string) => (c.length > 160 ? `${c.slice(0, 157)}…` : c);

/** Every tab with its title, columns and number of data rows (all tabs fetched in parallel). */
export async function describeSheet(sheetId: string, freshSeconds: number, force = false) {
  const { value: tabs, stale } = await listTabs(sheetId, freshSeconds, force);
  const loaded = await Promise.all(tabs.map((t) => loadTab(sheetId, t, freshSeconds, force).then((r) => r, (e: unknown) => ({ error: e instanceof Error ? e.message : "failed", tab: t }))));
  return {
    fetched: stale ? "Google could not be reached; showing the last saved copy." : "live",
    tabs: loaded.map((r) =>
      "error" in r
        ? { tab: r.tab.name, error: r.error }
        : { tab: r.value.name, about: r.value.title.slice(0, 2).join(" / ").slice(0, 300), columns: r.value.header.filter((h) => !/^Col\d+$/.test(h)), dataRows: r.value.totalRows },
    ),
  };
}

export async function readSheet(
  sheetId: string,
  freshSeconds: number,
  args: { tab?: string; search?: string; columns?: string[]; offset?: number; limit?: number; refresh?: boolean },
) {
  const force = !!args.refresh;
  const { value: tabs } = await listTabs(sheetId, freshSeconds, force);
  const limit = Math.min(300, Math.max(1, args.limit ?? 80));
  const offset = Math.max(0, args.offset ?? 0);
  const terms = (args.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const match = (cells: string[]) => !terms.length || terms.every((t) => cells.some((c) => c.toLowerCase().includes(t)));

  // No tab named: search every tab.
  if (!args.tab) {
    if (!terms.length) return { error: "Name a tab, or give search words to look through every tab.", tabs: tabs.map((t) => t.name) };
    const all = await Promise.all(tabs.map((t) => loadTab(sheetId, t, freshSeconds, force).catch(() => null)));
    const hits = all.flatMap((r) => (r ? r.value.rows.filter((row) => match(row.cells) || match([...r.value.title])).slice(0, 25).map((row) => ({ tab: r.value.name, row: row.n, values: Object.fromEntries(row.cells.map((c, i) => [r.value.header[i] ?? `Col${i + 1}`, cellText(c)]).filter(([, v]) => v)) })) : []));
    return { search: args.search, matches: hits.slice(0, limit), totalMatches: hits.length };
  }

  const tab = resolveTab(tabs, args.tab);
  if (!tab) return { error: `No tab called "${args.tab}".`, tabs: tabs.map((t) => t.name) };
  const { value: data, stale, ageSeconds } = await loadTab(sheetId, tab, freshSeconds, force);
  let colIdx = data.header.map((_, i) => i);
  if (args.columns?.length) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const want = args.columns.map(norm);
    const picked = colIdx.filter((i) => want.some((w) => norm(data.header[i]).includes(w)));
    if (picked.length) colIdx = picked;
  }
  const rows = data.rows.filter((r) => match(r.cells));
  const page = rows.slice(offset, offset + limit);
  return {
    tab: data.name,
    fetched: stale ? "Google could not be reached; this is the last saved copy." : ageSeconds > 1 ? `cached ${Math.round(ageSeconds)}s ago` : "live",
    about: data.title.slice(0, 4),
    headerRow: data.headerRow,
    columns: colIdx.map((i) => data.header[i]),
    rows: page.map((r) => [r.n, ...colIdx.map((i) => cellText(r.cells[i] ?? ""))]),
    rowFormat: "[sheet row number, ...values in `columns` order]. A tab can hold several tables: rows may include section titles and the header rows of later sub-tables; read them in order and use those sub-headers for the rows under them.",
    shown: page.length,
    totalMatching: rows.length,
    ...(offset + limit < rows.length ? { more: `Use offset ${offset + limit} for the next rows.` } : {}),
  };
}

export { SheetError };
