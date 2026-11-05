// Interface language. English is the source text and the fallback; `HI` maps an English
// string (or a pattern) to its Hindi text. Anything without an entry — names, client data,
// codes — is shown exactly as it is.
//
// Patterns: {} matches any text, {#} matches a value that starts with a digit (a count, a
// date, a time). Prefer {#}: it keeps a task called "Due diligence" from being read as the
// pattern "Due {#}". Placeholders are filled in order.

import { HI } from "./hi";

export type Locale = "en" | "hi";
export const LANG_COOKIE = "ss_lang";

const MONTHS: Record<string, string> = {
  Jan: "जन", Feb: "फ़र", Mar: "मार्च", Apr: "अप्रैल", May: "मई", Jun: "जून", Jul: "जुल", Aug: "अग", Sep: "सित", Oct: "अक्टू", Nov: "नव", Dec: "दिस",
};

const exact = new Map<string, string>();
const patterns: { re: RegExp; to: string }[] = [];
for (const [from, to] of Object.entries(HI)) {
  if (/\{#?\}/.test(from)) {
    const source = from
      .split(/(\{#?\})/)
      .map((part) => (part === "{}" ? "(.+?)" : part === "{#}" ? "(\\d.*?)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("");
    patterns.push({ re: new RegExp(`^${source}$`), to });
  } else {
    exact.set(from, to);
  }
}

// Results are cached: the same few thousand strings repeat on every render.
const cache = new Map<string, string>();
const CACHE_LIMIT = 20_000;

function lookup(text: string): string | null {
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (m) {
      let i = 1;
      // Captured values may be translatable themselves ("Status: In progress"). Each is
      // shorter than the text it came from, so this always ends.
      return p.to.replace(/\{#?\}/g, () => {
        const v = m[i++] ?? "";
        return lookup(v) ?? v;
      });
    }
  }
  // Dates such as "05 Nov 2026" or "05 Nov 2026, 10:30 am".
  if (/^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(text)) {
    return text
      .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/, (m) => MONTHS[m])
      .replace(/\bam\b/i, "पूर्वाह्न")
      .replace(/\bpm\b/i, "अपराह्न");
  }
  return null;
}

/** Hindi for one piece of interface text; surrounding spaces are kept, unknown text is returned unchanged. */
export function translateText(text: string): string {
  if (text.length < 2 || !/[A-Za-z]/.test(text)) return text;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const core = text.trim();
  const found = lookup(core.replace(/\s+/g, " "));
  const at = text.indexOf(core);
  const out = found === null ? text : text.slice(0, at) + found + text.slice(at + core.length);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(text, out);
  return out;
}

/** Is this path part of the signed-in portals? The public website stays in English. */
export function isTranslatedPath(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/") || pathname === "/client" || pathname.startsWith("/client/");
}

export function parseLangCookie(cookieHeader: string): Locale {
  return /(?:^|;\s*)ss_lang=hi(?:;|$)/.test(cookieHeader) ? "hi" : "en";
}
