import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { child, children, escapeXml, find, parseXml, plainText, topLevelElements, type XmlNode } from "./xml";

// Fills the firm's own Word templates, so an issued letter keeps their exact
// design (letterhead, fonts, tables, numbering). Placeholders are "{Field}" in a
// run of their own, coloured red in the template; the filled value takes the
// run's formatting without the red. The same filled file is rendered to HTML
// for reading in the portal.

const TEMPLATE_DIR = path.join(process.cwd(), "src", "lib", "hr-letters", "templates");

/** The firm the templates were written for; its letterhead is used verbatim. */
const TEMPLATE_FIRM = { body: "S S Dimri &amp; Associates", header: "S S DIMRI &amp; ASSOCIATES", signatory: "Sunil Dimri", signatoryRole: "Proprietor" };

export type Letterhead = { name: string; address: string | null; contact: string };

export type FillInput = {
  template: string;
  /** Placeholder values, e.g. { Joining_Date: "1 November 2026", Duty_1: "…" }. */
  values: Record<string, string>;
  /** Repeat groups: base placeholder → number of copies of its "_1" paragraph / table row. */
  repeat?: Record<string, number>;
  /** Only this part of a multi-format file ("FORMAT A" …), with the label removed from its heading. */
  section?: string;
  /** null keeps the template's own letterhead and firm name. */
  firm: { name: string; letterhead: Letterhead } | null;
  /** Replaces the template's signature block name / designation (letters only). */
  signatory?: { name: string; designation: string };
};

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
const RUN = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
const ROW = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;

export async function fillTemplate(input: FillInput): Promise<Uint8Array> {
  const files = unzipSync(new Uint8Array(await readFile(path.join(TEMPLATE_DIR, input.template))));
  const docXml = strFromU8(files["word/document.xml"]);

  const bodyStart = docXml.indexOf("<w:body>") + "<w:body>".length;
  const sectAt = docXml.lastIndexOf("<w:sectPr");
  let els = topLevelElements(docXml.slice(bodyStart, sectAt));
  if (input.section) els = cutSection(els, input.section);
  // The templates' italic "Example: …" lines are guidance for whoever fills them in.
  els = els.filter((el) => !plainText(el).startsWith("Example")).flatMap((el) => expand(el, input.repeat ?? {}));
  let body = els.map((el) => fillElement(el, input.values)).join("");

  if (input.firm) body = body.replaceAll(TEMPLATE_FIRM.body, escapeXml(input.firm.name));
  if (input.signatory) {
    body = body
      .replaceAll(`>${TEMPLATE_FIRM.signatory}</w:t>`, `>${escapeXml(input.signatory.name)}</w:t>`)
      .replaceAll(`>${TEMPLATE_FIRM.signatoryRole}</w:t>`, `>${escapeXml(input.signatory.designation)}</w:t>`);
  }
  files["word/document.xml"] = strToU8(docXml.slice(0, bodyStart) + body + docXml.slice(sectAt));

  if (input.firm) {
    for (const name of Object.keys(files).filter((n) => /^word\/header\d*\.xml$/.test(n))) {
      files[name] = strToU8(rewriteLetterhead(strFromU8(files[name]), input.firm.letterhead));
    }
  }
  return zipSync(files, { level: 6 });
}

/** Keep one format of a multi-format file: from its heading up to the next one, minus page breaks. */
function cutSection(els: string[], label: string) {
  const isHeading = (el: string, l?: string) => plainText(el).startsWith(l ? `${l} –` : "FORMAT ");
  const start = els.findIndex((el) => isHeading(el, label));
  if (start < 0) throw new Error(`Template section ${label} not found`);
  let end = els.findIndex((el, i) => i > start && isHeading(el));
  if (end < 0) end = els.length;
  return els
    .slice(start, end)
    .filter((el) => !(el.includes('w:type="page"') && !plainText(el).trim()))
    .map((el, i) => (i === 0 ? el.replace(`${label} – `, "") : el));
}

/** Repeat "_1" paragraphs / table rows of a repeat group; drop the template's extra "_2", "_3" … copies. */
function expand(el: string, repeat: Record<string, number>): string[] {
  const copies = (xml: string): string[] => {
    for (const m of xml.matchAll(/\{([A-Za-z][A-Za-z0-9_]*?)_(\d+)\}/g)) {
      const n = repeat[m[1]];
      if (n === undefined) continue;
      if (m[2] !== "1") return [];
      // Every "_1" field of the copied paragraph / row moves together (Date_1, In_1, Out_1 …).
      return Array.from({ length: n }, (_, i) => xml.replace(/\{([A-Za-z][A-Za-z0-9_]*?)_1\}/g, (_p, base: string) => `{${base}_${i + 1}}`));
    }
    return [xml];
  };
  if (el.startsWith("<w:tbl")) return [el.replace(ROW, (row) => copies(row).join(""))];
  return copies(el);
}

function fillElement(el: string, values: Record<string, string>): string {
  if (!el.includes("{")) return el;
  let found = false;
  let anyValue = false;
  const filled = el.replace(RUN, (run) => {
    if (!PLACEHOLDER.test(run)) return run;
    PLACEHOLDER.lastIndex = 0;
    found = true;
    return run
      .replace('<w:color w:val="C00000"/>', "")
      .replace(/(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g, (_m, open: string, text: string, close: string) => {
        const out = text.replace(PLACEHOLDER, (_p, key: string) => {
          const v = values[key] ?? "";
          if (v.trim()) anyValue = true;
          return escapeXml(v).replace(/\r?\n/g, `</w:t><w:br/><w:t xml:space="preserve">`);
        });
        return open.includes("xml:space") ? open + out + close : `<w:t xml:space="preserve">${out}${close}`;
      });
  });
  // An address line whose fields are all blank is left out rather than printed as ", –".
  if (found && !anyValue && filled.startsWith("<w:p") && !plainText(filled).replace(/[\s,–\-.:/]/g, "")) return "";
  return filled;
}

function rewriteLetterhead(xml: string, lh: Letterhead) {
  const lines = [lh.name.toUpperCase(), lh.address ?? "", lh.contact];
  let i = 0;
  return xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (p) => {
    const text = lines[i++];
    if (text === undefined) return p;
    let first = true;
    return p.replace(/(<w:t(?:\s[^>]*)?>)[^<]*(<\/w:t>)/g, (_m, open: string, close: string) => {
      const out = first ? escapeXml(text) : "";
      first = false;
      return open + out + close;
    });
  });
}

// ------------------------------------------------------------------ HTML view

type NumDef = { fmt: string; text: string; left: number; hanging: number };

const tw = (v: string | undefined) => (v ? Number(v) / 20 : 0); // twips → pt
const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const attr = (n: XmlNode | undefined, a = "w:val") => n?.attrs[a];

/** Letterhead and pages (split at page breaks) of a filled document, as inline-styled HTML. */
export function renderDocxHtml(bytes: Uint8Array): { header: string; pages: string[]; footer: boolean } {
  const files = unzipSync(bytes);
  const doc = parseXml(strFromU8(files["word/document.xml"]));
  const nums = numbering(files["word/numbering.xml"] ? strFromU8(files["word/numbering.xml"]) : "");
  const counters = new Map<string, number>();
  const headerName = Object.keys(files).find((n) => /^word\/header\d*\.xml$/.test(n));
  const header = headerName
    ? children(find(parseXml(strFromU8(files[headerName])), "w:hdr"), "w:p").map((p) => paragraph(p, nums, counters).html).join("")
    : "";

  const pages: string[] = [];
  let current = "";
  for (const el of find(doc, "w:body")?.children ?? []) {
    if (el.name === "w:p") {
      const r = paragraph(el, nums, counters);
      current += r.html;
      if (r.pageBreak) {
        pages.push(current);
        current = "";
      }
    } else if (el.name === "w:tbl") {
      current += table(el, nums, counters);
    }
  }
  if (current) pages.push(current);
  return { header, pages, footer: Object.keys(files).some((n) => /^word\/footer\d*\.xml$/.test(n)) };
}

function numbering(xml: string) {
  const out = new Map<string, NumDef>();
  if (!xml) return out;
  const root = find(parseXml(xml), "w:numbering");
  const abstract = new Map<string, NumDef>();
  for (const a of children(root, "w:abstractNum")) {
    const lvl = children(a, "w:lvl").find((l) => l.attrs["w:ilvl"] === "0");
    const ind = find(lvl, "w:ind");
    abstract.set(a.attrs["w:abstractNumId"], {
      fmt: attr(child(lvl, "w:numFmt")) ?? "bullet",
      text: attr(child(lvl, "w:lvlText")) ?? "•",
      left: tw(ind?.attrs["w:left"]) || 36,
      hanging: tw(ind?.attrs["w:hanging"]) || 18,
    });
  }
  for (const n of children(root, "w:num")) {
    const def = abstract.get(attr(child(n, "w:abstractNumId")) ?? "");
    if (def) out.set(n.attrs["w:numId"], def);
  }
  return out;
}

function runStyle(rPr: XmlNode | undefined) {
  const s: string[] = [];
  const on = (n: string) => {
    const e = child(rPr, n);
    return !!e && e.attrs["w:val"] !== "false" && e.attrs["w:val"] !== "0";
  };
  if (on("w:b")) s.push("font-weight:700");
  if (on("w:i")) s.push("font-style:italic");
  const u = child(rPr, "w:u");
  if (u && u.attrs["w:val"] !== "none") s.push("text-decoration:underline");
  const sz = attr(child(rPr, "w:sz"));
  if (sz) s.push(`font-size:${Number(sz) / 2}pt`);
  const color = attr(child(rPr, "w:color"));
  if (color && color !== "auto" && color !== "C00000") s.push(`color:#${color}`);
  return s.join(";");
}

function runs(p: XmlNode): { html: string; pageBreak: boolean; empty: boolean } {
  let html = "";
  let pageBreak = false;
  let empty = true;
  for (const r of children(p, "w:r")) {
    const style = runStyle(child(r, "w:rPr"));
    let inner = "";
    for (const c of r.children) {
      if (c.name === "w:t") inner += escHtml(c.children.map((t) => t.text ?? "").join(""));
      else if (c.name === "w:tab") inner += "&emsp;";
      else if (c.name === "w:br") {
        if (c.attrs["w:type"] === "page") pageBreak = true;
        else inner += "<br>";
      }
    }
    if (inner.replace(/&emsp;|<br>/g, "").trim()) empty = false;
    if (inner) html += style ? `<span style="${style}">${inner}</span>` : inner;
  }
  return { html, pageBreak, empty };
}

function paragraph(p: XmlNode, nums: Map<string, NumDef>, counters: Map<string, number>) {
  const pPr = child(p, "w:pPr");
  const s: string[] = ["margin:0", "white-space:pre-wrap"]; // the templates space out signature lines with runs of spaces
  const jc = attr(child(pPr, "w:jc"));
  if (jc) s.push(`text-align:${jc === "both" ? "justify" : jc === "start" ? "left" : jc === "end" ? "right" : jc}`);
  const sp = child(pPr, "w:spacing");
  if (sp?.attrs["w:before"]) s.push(`margin-top:${tw(sp.attrs["w:before"])}pt`);
  if (sp?.attrs["w:after"]) s.push(`margin-bottom:${tw(sp.attrs["w:after"])}pt`);
  s.push(`line-height:${sp?.attrs["w:line"] && (sp.attrs["w:lineRule"] ?? "auto") === "auto" ? Number(sp.attrs["w:line"]) / 240 : 1.15}`);
  const bottom = find(child(pPr, "w:pBdr"), "w:bottom");
  if (bottom) s.push(`border-bottom:${Math.max(0.5, Number(bottom.attrs["w:sz"] ?? 4) / 8)}pt solid #${bottom.attrs["w:color"] ?? "000"}`, `padding-bottom:${Number(bottom.attrs["w:space"] ?? 1)}pt`);

  const r = runs(p);
  let marker = "";
  const numId = attr(find(child(pPr, "w:numPr"), "w:numId"));
  const def = numId ? nums.get(numId) : undefined;
  if (def) {
    const n = (counters.get(numId!) ?? 0) + 1;
    counters.set(numId!, n);
    s.push(`padding-left:${def.left}pt`, `text-indent:-${def.hanging}pt`);
    const label = def.fmt === "bullet" ? def.text : def.text.replace("%1", String(n));
    marker = `<span style="display:inline-block;width:${def.hanging}pt;text-indent:0">${escHtml(label)}</span>`;
  }
  const content = r.empty && !marker ? "&nbsp;" : marker + r.html;
  return { html: `<p style="${s.join(";")}">${content}</p>`, pageBreak: r.pageBreak };
}

function table(t: XmlNode, nums: Map<string, NumDef>, counters: Map<string, number>) {
  const cols = children(child(t, "w:tblGrid"), "w:gridCol").map((c) => tw(c.attrs["w:w"]));
  const total = cols.reduce((a, b) => a + b, 0) || 480;
  let html = `<table style="width:100%;max-width:${total}pt;border-collapse:collapse;table-layout:fixed;margin:0">`;
  html += `<colgroup>${cols.map((w) => `<col style="width:${((w / total) * 100).toFixed(2)}%">`).join("")}</colgroup>`;
  for (const tr of children(t, "w:tr")) {
    html += "<tr>";
    for (const tc of children(tr, "w:tc")) {
      const tcPr = child(tc, "w:tcPr");
      const s: string[] = ["vertical-align:top"];
      const borders = child(tcPr, "w:tcBorders");
      for (const side of ["top", "left", "bottom", "right"]) {
        const b = child(borders, `w:${side}`);
        s.push(`border-${side}:${b && b.attrs["w:val"] !== "nil" ? `${Math.max(0.5, Number(b.attrs["w:sz"] ?? 4) / 8)}pt solid #${b.attrs["w:color"] === "auto" ? "000" : b.attrs["w:color"] ?? "000"}` : "0.5pt solid #000"}`);
      }
      const fill = child(tcPr, "w:shd")?.attrs["w:fill"];
      if (fill && fill !== "auto") s.push(`background:#${fill}`);
      const mar = child(tcPr, "w:tcMar");
      s.push(`padding:${tw(child(mar, "w:top")?.attrs["w:w"]) || 3}pt ${tw(child(mar, "w:right")?.attrs["w:w"]) || 5}pt ${tw(child(mar, "w:bottom")?.attrs["w:w"]) || 3}pt ${tw(child(mar, "w:left")?.attrs["w:w"]) || 5}pt`);
      const span = attr(child(tcPr, "w:gridSpan"));
      const inner = children(tc, "w:p").map((p) => paragraph(p, nums, counters).html).join("");
      html += `<td${span ? ` colspan="${span}"` : ""} style="${s.join(";")}">${inner}</td>`;
    }
    html += "</tr>";
  }
  return html + "</table>";
}
