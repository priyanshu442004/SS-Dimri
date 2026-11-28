import { TLDS } from "./tlds";

// Finding the candidate's email address in the text of a resume (Careers, client request 28 Nov 2026).
// Pure and deterministic, with no AI: an address is only ever an exact run of characters that is in the
// resume (or in one of its mailto: links), never a guess. The few repairs below only undo damage that
// text extraction itself does (words glued to the address, an address broken over two lines), and a
// repaired address is marked as such so the person uploading checks it before it is used.

export type EmailSource = "link" | "text" | "repaired";

export type EmailCandidate = {
  email: string;
  /** Where it was found: a mailto: link in the file, the text as written, or the text after undoing extraction damage. */
  sources: EmailSource[];
  /** Ends in a real top-level domain (IANA list). */
  validTld: boolean;
  /** Found after a "References" heading: probably someone else's address. */
  inReferences: boolean;
  /** Looks like a company mailbox (hr@, info@, careers@ …), not a person's. */
  roleAddress: boolean;
  /** "Did you mean …?" for a well-known provider that is misspelt (gmial.com → gmail.com). */
  suggestion: string | null;
  score: number;
};

export type ResumeLine = { text: string; size?: number; page?: number };

// One address: local part @ domain. Local part: the characters people actually use, not starting or
// ending with a dot. Domain: dot-separated labels, ending in letters.
const LOCAL = String.raw`[A-Za-z0-9_%+-](?:[A-Za-z0-9._%+'-]*[A-Za-z0-9_%+-])?`;
const DOMAIN = String.raw`(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}`;
const EMAIL_RE = () => new RegExp(String.raw`(?<![A-Za-z0-9._%+-])(${LOCAL})@(${DOMAIN})`, "g");
const SINGLE_EMAIL = new RegExp(String.raw`^${LOCAL}@${DOMAIN}$`);

/** Text that runs on after an address when extraction drops the space ("gmail.comLinkedIn", "gmail.comwww…"). */
const GLUE_WORDS = ["phone", "mobile", "mob", "tel", "ph", "contact", "linkedin", "github", "portfolio", "website", "www", "http", "https", "address", "location", "skype", "dob"];
/** Labels glued in front of an address ("Emailjohn@…", "E-mail:john@…" with the colon lost). */
const LABEL_PREFIX = /^(?:E-?mail(?:-?Id|ID)?|EMAIL(?:-?ID)?|E-MAIL(?:-?ID)?|Mail|MAIL)[:.-]?(?=[a-z0-9])/;
const ROLE_LOCAL = /^(?:hr|info|careers?|jobs?|recruit(?:ment|er|ing)?|admin|contact|support|help|office|enquir(?:y|ies)|sales|accounts?|noreply|no-reply|donotreply|mail|webmaster|team|hello)$/i;

const PROVIDER_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmaill.com": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com",
  "gmai.com": "gmail.com", "gmail.co": "gmail.com", "gmail.cm": "gmail.com", "gmail.con": "gmail.com", "gmail.om": "gmail.com",
  "gmail.comm": "gmail.com", "gmail.cmo": "gmail.com", "gmail.in": "gmail.com", "gmali.com": "gmail.com", "gemail.com": "gmail.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com", "yahoo.cm": "yahoo.com", "yhoo.com": "yahoo.com", "yaoo.com": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmai.com": "hotmail.com",
  "outlok.com": "outlook.com", "outllok.com": "outlook.com", "outlook.con": "outlook.com", "otlook.com": "outlook.com",
  "rediffmai.com": "rediffmail.com", "redifmail.com": "rediffmail.com", "rediffmail.con": "rediffmail.com", "icloud.con": "icloud.com",
};

/** Characters that look like @ or are invisible, as they come out of PDFs and Word files. */
export function cleanText(s: string): string {
  return s
    .normalize("NFKC") // full-width ＠ and letters → ASCII
    .replace(/[​-‍⁠﻿­]/g, "") // zero-width characters and soft hyphens
    .replace(/[﹫＠]/g, "@")
    .replace(/[‐-‒−]/g, "-")
    .replace(/ /g, " ");
}

/** True when `s` is one well-formed address (the check used for what a person types, too). */
export function isEmailShape(s: string): boolean {
  const v = s.trim();
  if (!SINGLE_EMAIL.test(v) || v.length > 254) return false;
  const [local, domain] = v.split("@");
  return local.length <= 64 && !local.includes("..") && domain.split(".").every((l) => l.length <= 63);
}

/** Undo text glued onto the end of the domain; returns the domain as it should be (lower case) and whether anything was cut. */
function trimDomain(raw: string): { domain: string; cut: boolean } {
  const labels = raw.split(".");
  // A label after the first that begins with a TLD and then a glue word: "gmail.comwww.linkedin.com".
  for (let i = 1; i < labels.length; i++) {
    const lower = labels[i].toLowerCase();
    for (const w of GLUE_WORDS) {
      if (lower.length > w.length && lower.endsWith(w) && TLDS.has(lower.slice(0, -w.length)) && (i < labels.length - 1 || !TLDS.has(lower))) {
        return { domain: [...labels.slice(0, i), lower.slice(0, -w.length)].join(".").toLowerCase(), cut: true };
      }
    }
  }
  const last = labels[labels.length - 1];
  const lowerLast = last.toLowerCase();
  if (!TLDS.has(lowerLast)) {
    // Case change inside the last label: "comLinkedIn", "comPhone".
    const m = /^([a-z]{2,})[A-Z]/.exec(last);
    if (m && TLDS.has(m[1])) return { domain: [...labels.slice(0, -1), m[1]].join(".").toLowerCase(), cut: true };
    // The longest TLD the last label starts with, when what follows is a glue word: "comphone".
    for (let n = lowerLast.length - 1; n >= 2; n--) {
      if (TLDS.has(lowerLast.slice(0, n)) && GLUE_WORDS.some((w) => lowerLast.slice(n).startsWith(w))) {
        return { domain: [...labels.slice(0, -1), lowerLast.slice(0, n)].join(".").toLowerCase(), cut: true };
      }
    }
  }
  return { domain: raw.toLowerCase(), cut: false };
}

type Hit = { email: string; index: number; source: EmailSource };

function scan(text: string, source: EmailSource): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(EMAIL_RE())) {
    let local = m[1];
    let src = source;
    const label = LABEL_PREFIX.exec(local);
    if (label && local.length > label[0].length) { local = local.slice(label[0].length); src = "repaired"; }
    if (local.includes("..") || local.length > 64) continue;
    // A rarer character just before the match ("a&b@…", "x!y@…") may belong to the address: the
    // match could be cut short, so the person checks it rather than it being trusted.
    const at = m.index ?? 0;
    if (at >= 2 && /[!#$&*/=?^`{|}~]/.test(text[at - 1]) && /[A-Za-z0-9]/.test(text[at - 2])) src = "repaired";
    const { domain, cut } = trimDomain(m[2]);
    if (cut) src = "repaired";
    const email = `${local}@${domain}`;
    if (!isEmailShape(email)) continue;
    hits.push({ email, index: m.index ?? 0, source: src });
  }
  return hits;
}

/**
 * Second look, used only when the text has no address as written: the extraction put spaces or a
 * line break inside one ("john @ gmail.com", "john.doe@gmail.\ncom", "john[at]gmail[dot]com").
 */
function repairedText(text: string): string {
  return text
    .split("\n").map(collapseLetterSpacing).join("\n")
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@")
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".")
    .replace(/([A-Za-z0-9._%+-]) *\n? *@ *\n? *([A-Za-z0-9])/g, "$1@$2")
    .replace(/(@[A-Za-z0-9.-]*[A-Za-z0-9])\s*\n\s*(\.?[A-Za-z0-9])/g, (_, a: string, b: string) => (a.endsWith(".") || b.startsWith(".") ? a + b : `${a}\n${b}`))
    .replace(/(@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.)\s+([A-Za-z]{2,})/g, "$1$2");
}

/** "v i k a s . y a d a v @ g m a i l . c o m" (letter-spaced text) → "vikas.yadav@gmail.com"; other text unchanged. */
export function collapseLetterSpacing(line: string): string {
  const tokens = line.split(" ");
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 5) out.push(run.join(""));
    else out.push(...run);
    run = [];
  };
  for (const tk of tokens) {
    if (tk.length >= 1 && tk.length <= 2) run.push(tk);
    else { flush(); out.push(tk); }
  }
  flush();
  return out.join(" ");
}

const FRAG_BEFORE = /^[A-Za-z0-9._%+'-]+$/;
const FRAG_AFTER = /^[A-Za-z0-9.-]+$/;
const HEADING_WORD = /^(?:contact|e-?mail|mail|id|email-?id|address|details|info)$/i;

/**
 * An address broken over lines in a narrow column ("chandrashekhar.venk" / "ataraman.ca@gmail.c" /
 * "om"): the address-bearing word joined with the fragment ending the line before and the one
 * starting the line after. Only readings that end in a real top-level domain are kept.
 */
function wrapHits(text: string): (Hit & { line: number })[] {
  const lines = text.split("\n").map((l) => l.trim());
  const starts: number[] = [];
  let pos = 0;
  for (const l of text.split("\n")) { starts.push(pos); pos += l.length + 1; }
  const out: (Hit & { line: number })[] = [];
  lines.forEach((line, i) => {
    if (!line.includes("@")) return;
    const tokens = line.split(" ");
    tokens.forEach((tok, k) => {
      if (!tok.includes("@")) return;
      let joined = tok;
      let changed = false;
      // Backwards: the last word of the line before, if it looks like a piece of an address
      // (has a dot, digit or underscore, or is the only thing on its line and not a heading).
      for (let j = i - 1, first = k === 0; first && j >= 0 && j >= i - 3; j--) {
        const prev = lines[j].split(" ");
        const frag = prev[prev.length - 1];
        const piece = !!frag && FRAG_BEFORE.test(frag) && /[A-Za-z]/.test(frag) && !HEADING_WORD.test(frag)
          && !/^[+\d-]+$/.test(frag) // a phone number on the line above
          && !/^[A-Z][a-z]+$/.test(frag) // a capitalised word ("Skills", "Delhi")
          && (/[._\d%+-]/.test(frag) || (prev.length === 1 && frag === frag.toLowerCase()));
        if (!piece) break;
        joined = frag + joined;
        changed = true;
        if (prev.length > 1) break; // the fragment was the end of a longer line: nothing before it belongs
      }
      // Forwards: the first word of the next line(s), when the address ends its line.
      for (let j = i + 1, last = k === tokens.length - 1; last && j < lines.length && j <= i + 2; j++) {
        const next = lines[j].split(" ");
        const frag = next[0];
        if (!frag || !FRAG_AFTER.test(frag)) break;
        joined = joined + frag;
        changed = true;
        if (next.length > 1) break;
      }
      if (!changed) return;
      for (const h of scan(joined, "repaired")) {
        if (TLDS.has(h.email.split(".").pop()!.toLowerCase())) out.push({ ...h, index: starts[i], source: "repaired", line: i });
      }
    });
  });
  return out;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length - 1;

/** Where the "References" section starts, if there is one (addresses after it belong to other people). */
function referencesStart(text: string): number {
  const m = /(?:^|\n)[\s•*\-–]*(?:references?|referees?|professional references?)\s*:?\s*(?:\n|$)/i.exec(text);
  return m ? m.index : Infinity;
}

const nameTokens = (name: string | null | undefined) =>
  (name ?? "").toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 3);

/**
 * Every distinct address in the resume, best first. `links` are the targets of the file's links
 * (only mailto: ones are used). `name` (when known) helps rank the candidate's own address first.
 */
export function findEmails(text: string, links: string[] = [], name?: string | null): EmailCandidate[] {
  const t = cleanText(text);
  const fromLinks: Hit[] = links
    .map((l) => cleanText(l).trim())
    .filter((l) => /^mailto:/i.test(l))
    .flatMap((l) => {
      let v = l.replace(/^mailto:/i, "").split("?")[0];
      try { v = decodeURIComponent(v); } catch { /* keep as is */ }
      return v.split(/[,;]/).map((x) => x.trim()).filter(isEmailShape).map((x) => {
        const [local, domain] = x.split("@");
        return { email: `${local}@${domain.toLowerCase()}`, index: -1, source: "link" as const };
      });
    });
  let fromText = scan(t, "text");
  // An address that may continue on the next / previous line: if joining the lines reads a different
  // address, both readings are offered and neither is trusted on its own ("gmail.co" + "m").
  const wrapped = wrapHits(t).filter((w) => !fromText.some((h) => h.email.toLowerCase() === w.email.toLowerCase()));
  if (wrapped.length) {
    const lines = new Set(wrapped.map((w) => w.line));
    fromText = fromText.map((h) => (lines.has(lineOf(t, h.index)) ? { ...h, source: "repaired" as const } : h));
    fromText.push(...wrapped);
  }
  if (fromText.length === 0) fromText = scan(repairedText(t), "repaired").map((h) => ({ ...h, source: "repaired" as const }));

  const refs = referencesStart(t);
  const tokens = nameTokens(name);
  const byKey = new Map<string, { email: string; sources: Set<EmailSource>; first: number }>();
  for (const h of [...fromLinks, ...fromText]) {
    const key = h.email.toLowerCase();
    const cur = byKey.get(key);
    if (cur) {
      cur.sources.add(h.source);
      if (h.index >= 0 && (cur.first < 0 || h.index < cur.first)) cur.first = h.index;
      // Prefer the spelling as written in the text over the link's.
      if (h.source === "text") cur.email = h.email;
    } else {
      byKey.set(key, { email: h.email, sources: new Set([h.source]), first: h.index });
    }
  }
  // A repaired reading that a link or the plain text confirms is no longer "repaired".
  for (const c of byKey.values()) if (c.sources.size > 1) c.sources.delete("repaired");

  const len = Math.max(t.length, 1);
  const out = [...byKey.values()].map((c): EmailCandidate => {
    const [local, domain] = c.email.split("@");
    const validTld = TLDS.has(domain.split(".").pop()!.toLowerCase());
    const inReferences = c.first >= 0 && c.first > refs;
    const roleAddress = ROLE_LOCAL.test(local);
    const lowerLocal = local.toLowerCase();
    const nameMatch = tokens.some((tk) => lowerLocal.includes(tk));
    const sources = [...c.sources].sort();
    let score = 0;
    if (c.sources.has("link")) score += 40;
    if (c.sources.has("text")) score += 25;
    if (c.first >= 0 && c.first < len * 0.3) score += 15;
    if (nameMatch) score += 25;
    if (inReferences) score -= 50;
    if (roleAddress) score -= 30;
    if (c.sources.has("repaired") && c.sources.size === 1) score -= 10;
    if (!validTld) score -= 40;
    return { email: c.email, sources, validTld, inReferences, roleAddress, suggestion: PROVIDER_TYPOS[domain.toLowerCase()] ? `${local}@${PROVIDER_TYPOS[domain.toLowerCase()]}` : null, score };
  });
  return out.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
}

// ---------------------------------------------------------------- name and phone (pre-filled, always editable)

const NOT_A_NAME = /\b(?:resume|r[ée]sum[ée]|curriculum|vitae|cv|bio-?data|profile|contact|e-?mail|phone|mobile|address|objective|summary|career|education|experience|skills?|personal|details|declaration|page|qualification|projects?|languages?|hobbies|references?|work|professional|about|me|linkedin|github|india|delhi|mumbai)\b/i;

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s'.-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

/** A line that reads like a person's name, cleaned ("NAME: PRIYANSHU SHARMA" → "Priyanshu Sharma"), else null. */
export function nameLike(line: string): string | null {
  const v = cleanText(line).replace(/^\s*(?:full\s+)?name\s*[:\-–]\s*/i, "")
    // "Ritika Chauhan (रितिका चौहान)": drop a bracketed part and other scripts.
    .replace(/\([^)]*\)/g, " ").replace(/[^\x00-\x7F]+/g, " ")
    .replace(/\s+/g, " ").replace(/^[\s|•*\-–:,.]+|[\s|•*\-–:,]+$/g, "");
  if (v.length < 3 || v.length > 60 || NOT_A_NAME.test(v)) return null;
  if (!/^[A-Za-z][A-Za-z.' -]*[A-Za-z.]$/.test(v)) return null;
  const words = v.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 5) return null;
  if (words.every((w) => w.replace(/\./g, "").length <= 1)) return null; // "P R I Y A" — letter-spaced, not reliable
  return v === v.toUpperCase() || v === v.toLowerCase() ? titleCase(v) : v;
}

/**
 * The candidate's name from the first lines of the resume: the biggest-font name-like line on the
 * first page (in a PDF the name is almost always the largest text), else the first name-like line.
 */
export function guessName(lines: ResumeLine[], email?: string | null): string | null {
  const top = lines.filter((l) => (l.page ?? 1) === 1).slice(0, 25);
  const tokens = email ? email.split("@")[0].toLowerCase().replace(/[^a-z]/g, " ") : "";
  let best: { name: string; score: number } | null = null;
  top.forEach((l, i) => {
    const name = nameLike(l.text);
    if (!name) return;
    const matchesEmail = nameTokens(name).some((tk) => tokens.includes(tk));
    const score = (l.size ?? 0) * 10 + (matchesEmail ? 60 : 0) - i;
    if (!best || score > best.score) best = { name, score };
  });
  return (best as { name: string; score: number } | null)?.name ?? null;
}

/** First Indian mobile number in the text, as +91XXXXXXXXXX (outside a References section). */
export function findPhone(text: string): string | null {
  const t = cleanText(text);
  const end = referencesStart(t);
  // Ten digits starting 6–9, optionally after +91 / 91 / 0, with at most one space or dash between digits.
  for (const m of t.matchAll(/(?<![\d+])(?:\+?\s?91[\s-]*|0)?([6-9](?:[ -]?\d){9})(?![\d])/g)) {
    if ((m.index ?? 0) > end) break;
    return `+91${m[1].replace(/\D/g, "")}`;
  }
  return null;
}
