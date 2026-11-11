import { Fragment, type ReactNode } from "react";

// A small, safe Markdown renderer for AI replies. It builds React elements
// (never raw HTML), so nothing in a reply can inject markup or scripts.
// Covers what chat models actually produce: headings, paragraphs, bold/italic,
// inline code, code blocks, bullet and numbered lists, quotes, tables, rules, links.

function safeHref(url: string) {
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : null;
}

const INLINE = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w])|(https?:\/\/[^\s<)]+))/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const k = `${keyBase}-${i++}`;
    if (m[2] ?? m[3]) out.push(<strong key={k} className="font-semibold text-ink">{inline(m[2] ?? m[3], k)}</strong>);
    else if (m[4]) out.push(<code key={k} className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.85em]">{m[4]}</code>);
    else if (m[5]) {
      const href = safeHref(m[6]);
      out.push(href ? <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="text-stamp underline underline-offset-2">{m[5]}</a> : m[5]);
    } else if (m[7] ?? m[8]) out.push(<em key={k}>{inline(m[7] ?? m[8], k)}</em>);
    else if (m[9]) out.push(<a key={k} href={m[9]} target="_blank" rel="noopener noreferrer" className="break-all text-stamp underline underline-offset-2">{m[9]}</a>);
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const splitRow = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const k = `b${key++}`;

    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^\s*```(\w*)/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={k} className="overflow-x-auto rounded-lg bg-night px-3 py-2.5 font-mono text-xs leading-relaxed text-paper"><code>{code.join("\n")}</code></pre>);
      continue;
    }

    const h = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      const cls = level <= 1 ? "text-lg font-semibold" : level === 2 ? "text-base font-semibold" : "text-sm font-semibold";
      blocks.push(<p key={k} role="heading" aria-level={Math.min(level + 1, 6)} className={`${cls} mt-1 text-ink`}>{inline(h[2], k)}</p>);
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push(<hr key={k} className="border-line" />); i++; continue; }

    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitRow(lines[i++]));
      blocks.push(
        <div key={k} className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-subtle/60"><tr>{head.map((c, j) => <th key={j} className="px-3 py-2 font-semibold">{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri} className="border-t border-line">{head.map((_, j) => <td key={j} className="px-3 py-2 align-top">{inline(r[j] ?? "", `${k}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={k} className="border-l-2 border-line pl-3 text-muted"><Markdown text={quote.join("\n")} /></blockquote>);
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*+•]|\d+[.)])\s+/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const items: { indent: number; text: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+•]|\d+[.)])\s+(.*)$/);
        // A top-level switch between bullets and numbers starts a new list.
        if (m && m[1].length <= listMatch[1].length && /\d/.test(m[2]) !== ordered) break;
        if (m) { items.push({ indent: m[1].length, text: m[3] }); i++; continue; }
        // A wrapped continuation line belongs to the previous item.
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1].text += " " + lines[i].trim(); i++; continue; }
        break;
      }
      const base = Math.min(...items.map((it) => it.indent));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={k} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 marker:text-muted`}>
          {items.map((it, j) => <li key={j} style={it.indent > base ? { marginLeft: `${Math.min(it.indent - base, 8) * 0.5}rem` } : undefined}>{inline(it.text, `${k}i${j}`)}</li>)}
        </List>,
      );
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|```|>|([-*+•]|\d+[.)])\s)/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))) para.push(lines[i++]);
    if (para.length === 0) para.push(lines[i++]); // safety: always consume a line
    blocks.push(
      <p key={k}>
        {para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, `${k}p${j}`)}</Fragment>)}
      </p>,
    );
  }

  return <div className={`space-y-3 break-words text-sm leading-relaxed ${className ?? ""}`}>{blocks}</div>;
}
