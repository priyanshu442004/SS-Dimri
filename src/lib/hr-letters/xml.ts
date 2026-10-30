// Minimal XML helpers for the firm's Word templates (WordprocessingML written by
// a generator: well-formed, no DTDs, no CDATA). Two views are needed:
//  - raw top-level element strings, so a filled document keeps the template's
//    exact markup;
//  - a small element tree, so a letter can be shown in the browser.

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text?: string };

const TOKEN = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|([^<]+)/g;
const ATTR = /([\w:.-]+)\s*=\s*"([^"]*)"/g;

export function decodeEntities(s: string) {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()] ?? m;
  });
}

export function escapeXml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Parse into an element tree. Text nodes are `{ name: "#text", text }`. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [] };
  const stack = [root];
  for (const m of xml.matchAll(TOKEN)) {
    const [, close, name, rawAttrs, selfClose, text] = m;
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      top.children.push({ name: "#text", attrs: {}, children: [], text: decodeEntities(text) });
    } else if (!name) {
      continue; // declaration or comment
    } else if (close) {
      if (stack.length > 1) stack.pop();
    } else {
      const attrs: Record<string, string> = {};
      for (const a of (rawAttrs ?? "").matchAll(ATTR)) attrs[a[1]] = decodeEntities(a[2]);
      const node: XmlNode = { name, attrs, children: [] };
      top.children.push(node);
      if (!selfClose) stack.push(node);
    }
  }
  return root;
}

export const child = (n: XmlNode | undefined, name: string) => n?.children.find((c) => c.name === name);
export const children = (n: XmlNode | undefined, name: string) => n?.children.filter((c) => c.name === name) ?? [];

/** First descendant with this name (depth-first). */
export function find(n: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!n) return undefined;
  for (const c of n.children) {
    if (c.name === name) return c;
    const d = find(c, name);
    if (d) return d;
  }
  return undefined;
}

/**
 * Split an XML fragment into its top-level elements as raw strings, keeping
 * whitespace between them out. Used to cut and repeat paragraphs / rows.
 */
export function topLevelElements(fragment: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (const m of fragment.matchAll(/<(\/?)[\w:.-]+(?:\s+[\w:.-]+\s*=\s*"[^"]*")*\s*(\/?)>/g)) {
    const isClose = m[1] === "/";
    const isSelf = m[2] === "/";
    if (!isClose && depth === 0) start = m.index!;
    if (isClose) depth--;
    else if (!isSelf) depth++;
    if (depth === 0 && start >= 0) {
      out.push(fragment.slice(start, m.index! + m[0].length));
      start = -1;
    }
  }
  return out;
}

/** Concatenated text of all <w:t> runs in a raw element string. */
export function plainText(xml: string) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => decodeEntities(m[1])).join("");
}
