import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import type { ResumeLine } from "./email-extract";

// The text of a resume, as lines in reading order, plus the targets of its links (mailto: …).
// PDF: pdf.js (unpdf) — words are put back into lines from their position on the page, with a space
// wherever there is a visible gap, so an address never runs into the next word. DOCX: the XML of the
// body, headers and footers (contact details often sit in the header), and its hyperlink targets.
// Images and scanned PDFs have no text: the person uploading types the address.

export type ResumeText = { lines: ResumeLine[]; text: string; links: string[]; readable: boolean };

export class ResumeReadError extends Error {}

const EMPTY: ResumeText = { lines: [], text: "", links: [], readable: false };

type Item = { str: string; x: number; y: number; w: number; size: number };

export async function readResume(buf: Uint8Array, mime: string): Promise<ResumeText> {
  if (mime === "application/pdf") return readPdf(buf);
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return readDocx(buf);
  return EMPTY; // images: nothing to read
}

async function readPdf(buf: Uint8Array): Promise<ResumeText> {
  const { getDocumentProxy } = await import("unpdf");
  let doc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    doc = await getDocumentProxy(new Uint8Array(buf), { disableFontFace: true, useSystemFonts: false });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (/Password/i.test(name)) throw new ResumeReadError("This PDF is password-protected. Upload a copy without a password.");
    throw new ResumeReadError("This PDF could not be opened. It may be damaged — save it again as PDF and upload that.");
  }
  const lines: ResumeLine[] = [];
  const links: string[] = [];
  try {
    const pages = Math.min(doc.numPages, 15);
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: Item[] = [];
      for (const it of content.items) {
        if (!("str" in it) || !it.str) continue;
        const [a, b, , d, e, f] = it.transform as number[];
        const size = Math.hypot(b, d) || Math.abs(a) || 1;
        items.push({ str: it.str, x: e, y: f, w: it.width, size });
      }
      for (const row of groupLines(items)) {
        for (const seg of columns(row)) {
          const text = rowText(seg);
          if (text) lines.push({ text, page: p, size: Math.max(...seg.map((r) => r.size)) });
        }
      }
      for (const a of await page.getAnnotations()) {
        const url = (a as { url?: string; unsafeUrl?: string }).url ?? (a as { unsafeUrl?: string }).unsafeUrl;
        if (typeof url === "string") links.push(url);
      }
    }
  } finally {
    await (doc as { destroy?: () => Promise<void> }).destroy?.().catch(() => undefined);
    await (doc as { cleanup?: () => Promise<void> }).cleanup?.().catch(() => undefined);
  }
  const text = lines.map((l) => l.text).join("\n");
  return { lines, text, links, readable: text.replace(/\s/g, "").length >= 20 };
}

/** Items on (about) the same baseline, top to bottom. */
function groupLines(items: Item[]): Item[][] {
  const sorted = [...items].sort((p, q) => q.y - p.y || p.x - q.x);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) < Math.max(2, Math.min(r[0].size, it.size) * 0.5));
    if (row) row.push(it);
    else rows.push([it]);
  }
  rows.sort((p, q) => q[0].y - p[0].y);
  for (const r of rows) r.sort((p, q) => p.x - q.x);
  return rows;
}

/** A row split where there is a wide gap: the left and right columns of a two-column resume are separate lines. */
function columns(row: Item[]): Item[][] {
  const out: Item[][] = [];
  let end: number | null = null;
  for (const it of row) {
    if (end === null || it.x - end > Math.max(it.size, 8) * 3) out.push([it]);
    else out[out.length - 1].push(it);
    end = Math.max(end ?? -Infinity, it.x + it.w);
  }
  return out;
}

function rowText(row: Item[]): string {
  const words = row.filter((it) => it.str.trim());
  // Letter-spaced text ("v i k a s @ g m a i l"): every letter is placed on its own with the same
  // small gap. There a space is only a gap clearly wider than the usual one between letters.
  let threshold = (size: number) => size * 0.15;
  if (words.length >= 5 && words.filter((it) => it.str.trim().length <= 2).length >= words.length * 0.6) {
    const gaps = words.slice(1).map((it, i) => it.x - (words[i].x + words[i].w)).filter((g) => g >= 0).sort((p, q) => p - q);
    const median = gaps[Math.floor(gaps.length / 2)] ?? 0;
    threshold = (size: number) => Math.max(size * 0.15, median * 1.6 + size * 0.08);
  }
  let out = "";
  let end: number | null = null;
  for (const it of row) {
    if (!it.str.trim()) { out += " "; end = it.x + it.w; continue; }
    // A gap wider than a fraction of the letter size is a space (or a column break) on the page.
    if (end !== null && it.x - end > threshold(it.size) && !out.endsWith(" ")) out += " ";
    out += it.str;
    end = it.x + it.w;
  }
  return out.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------- DOCX

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : XML_ENTITIES[e.toLowerCase()] ?? "");

function docxText(xml: string, links: string[]): string {
  // Field-code hyperlinks: HYPERLINK "mailto:…"
  for (const m of xml.matchAll(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g)) {
    const h = /HYPERLINK\s+"([^"]+)"/i.exec(decodeXml(m[1]));
    if (h) links.push(h[1]);
  }
  // The same text box is stored twice (Word's version and a fallback): read only Word's.
  const body = xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, "");
  let out = "";
  for (const m of body.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>|<\/w:p>/g)) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (m[0].startsWith("<w:tab")) out += "\t";
    else out += "\n";
  }
  return out;
}

function readDocx(buf: Uint8Array): ResumeText {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf, { filter: (f) => /^word\/(?:document|header\d*|footer\d*)\.xml$|^word\/_rels\/[^/]+\.rels$/.test(f.name) });
  } catch {
    throw new ResumeReadError("This Word file could not be opened. Save it again as .docx or PDF and upload that.");
  }
  if (!files["word/document.xml"]) throw new ResumeReadError("This does not look like a Word document. Upload the resume as PDF or .docx.");
  const links: string[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (!name.endsWith(".rels")) continue;
    for (const m of strFromU8(data).matchAll(/Target="([^"]+)"/g)) links.push(decodeXml(m[1]));
  }
  const parts = [
    ...Object.keys(files).filter((n) => /header\d*\.xml$/.test(n)).sort(),
    "word/document.xml",
    ...Object.keys(files).filter((n) => /footer\d*\.xml$/.test(n)).sort(),
  ];
  const text = parts.map((n) => docxText(strFromU8(files[n]), links)).join("\n");
  const lines = text.split("\n").map((t) => t.replace(/[\t ]+/g, " ").trim()).filter(Boolean).map((t) => ({ text: t, page: 1 }));
  const joined = lines.map((l) => l.text).join("\n");
  return { lines, text: joined, links: links.filter((l) => /^mailto:/i.test(l)), readable: joined.replace(/\s/g, "").length >= 20 };
}
