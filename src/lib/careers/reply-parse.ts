// Reading a candidate's reply to the careers email (pure, no I/O): what they wrote above the quoted
// original, whether it is an out-of-office answer or a bounce, and the five details when they are
// written as "label: value" (the usual way people answer a list of questions). DeepSeek is asked only
// for details this does not find (see reply-ai.ts), and only values that appear in the reply are kept.

export const DETAIL_FIELDS = ["currentCtc", "expectedCtc", "noticePeriod", "interviewSlots", "currentLocation"] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];
export type Details = Partial<Record<DetailField, string>>;

export const DETAIL_LABELS: Record<DetailField, string> = {
  currentCtc: "Current / last drawn CTC",
  expectedCtc: "Expected CTC",
  noticePeriod: "Notice period / earliest joining",
  interviewSlots: "Preferred interview slots",
  currentLocation: "Current location",
};

/** Message-IDs compared as the bare id in lower case: "<Abc@x>" → "abc@x". */
export const normalizeMessageId = (s: string | null | undefined) => (s ?? "").trim().replace(/^<|>$/g, "").trim().toLowerCase();

/** Every id in a References / In-Reply-To header. */
export function messageIdsIn(header: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(header) ? header.join(" ") : header ?? "";
  return [...raw.matchAll(/<([^<>\s]+)>/g)].map((m) => normalizeMessageId(m[1])).filter(Boolean);
}

/** "[Ref CV-7KQ2MX]" in a subject (also after "Re:" / "Fwd:"). */
export function refInSubject(subject: string | null | undefined): string | null {
  return /\bCV-([A-Z0-9]{6})\b/i.exec(subject ?? "")?.[0].toUpperCase() ?? null;
}

export type MailKind = "REPLY" | "AUTO_REPLY" | "BOUNCE";

export function classify(m: { from: string; subject: string | null; headers: Record<string, string | undefined> }): MailKind {
  const subject = m.subject ?? "";
  const ct = m.headers["content-type"] ?? "";
  if (/^(?:mailer-daemon|postmaster|mail-daemon)@/i.test(m.from) || /multipart\/report/i.test(ct) || /\b(?:undeliverable|undelivered|delivery status notification|failure notice|returned mail|delivery (?:has )?failed|mail delivery failed|could not be delivered)\b/i.test(subject)) return "BOUNCE";
  const auto = (m.headers["auto-submitted"] ?? "").toLowerCase();
  if ((auto && auto !== "no") || m.headers["x-autoreply"] || m.headers["x-autorespond"] || /auto[_-]?reply/i.test(m.headers["precedence"] ?? "")
    || /^(?:auto(?:matic)?[ -]?reply|out of (?:the )?office|away from (?:the )?office|autoreply)\b/i.test(subject.replace(/^(?:re|aw|fwd?):\s*/i, ""))) return "AUTO_REPLY";
  return "REPLY";
}

type Line = { text: string; quoted: boolean };

const QUOTE_HEADER = /^(?:On\s.{4,200}\bwrote:?|Le\s.{4,200}a écrit\s?:|-{2,}\s*Original Message\s*-{2,}|_{10,}|From:\s.+|Sent from my \w+|Get Outlook for \w+)$/i;

/** The reply split into lines, marking those that quote the original ("> …" or after "On … wrote:"). */
function lines(text: string): Line[] {
  const out: Line[] = [];
  let inQuote = false;
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i].replace(/\u00A0/g, " ").trimEnd();
    // Gmail wraps a long "On …, Name <addr> wrote:" over two lines.
    const joined = `${t.trim()} ${raw[i + 1]?.trim() ?? ""}`.trim();
    if (!inQuote && out.some((l) => l.text.trim()) && (QUOTE_HEADER.test(t.trim()) || (/^On\s/.test(t.trim()) && /\bwrote:?$/.test(joined)))) inQuote = true;
    const quoted = inQuote || /^\s*>/.test(t);
    out.push({ text: t.replace(/^\s*(?:>\s?)+/, ""), quoted });
  }
  return out;
}

/** What the candidate wrote, without the quoted original (the whole text when nothing else is left). */
export function replyBody(text: string): string {
  const own = lines(text).filter((l) => !l.quoted).map((l) => l.text).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return own || text.trim();
}

// The questions as the careers email asks them, and the ways people write them back.
const LABELS: [DetailField, RegExp][] = [
  ["expectedCtc", /\b(?:expected|expectation|desired)\s*(?:ctc|salary|package|compensation)?\b/i],
  ["currentCtc", /\b(?:current\s*(?:\/|or|&)?\s*last\s*drawn|current|last\s*drawn|present|existing)\s*(?:ctc|salary|package|compensation)\b|^\s*ctc\b/i],
  ["noticePeriod", /\bnotice\s*period\b|\bearliest\s*(?:joining|join)|\bjoining\s*date\b|\bcan\s*join\b|\bavailable\s*to\s*join\b/i],
  ["interviewSlots", /\b(?:preferred\s*)?(?:time\s*slots?|interview\s*(?:slots?|time|timings?|schedule))\b|\bpreferred\s*(?:time|slot)/i],
  ["currentLocation", /\b(?:current\s*)?location\b|\bcurrent\s*city\b|\bcurrently\s*(?:based|located|staying|living)\b|\bresiding\s*(?:at|in)\b/i],
];

function labelOf(s: string): DetailField | null {
  const head = s.split(/[:\-–=]/)[0];
  for (const [field, re] of LABELS) if (re.test(head)) return field;
  return null;
}

const clip = (v: string) => v.replace(/\s+/g, " ").replace(/^[\s:\-–=*•]+|[\s*•]+$/g, "").slice(0, 200).trim();

/**
 * "Label: value" answers. A value is taken only from what the candidate wrote (never from the
 * quoted original), so the questions themselves are never read as answers; a label on a quoted
 * line with the answer on the next line of their own ("> Expected CTC" / "6 LPA") also counts.
 */
export function labelledDetails(text: string): Details {
  const ls = lines(text);
  const out: Details = {};
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    const s = l.text.trim().replace(/^[\s\-•*>\d.)]+/, "");
    if (!s) continue;
    const field = labelOf(s);
    if (!field || out[field]) continue;
    const sep = /^[^:\-–=]{2,80}?\s*[:\-–=]+\s*(.+)$/.exec(s);
    if (sep && !l.quoted) {
      const v = clip(sep[1]);
      if (v && !labelOf(v)) { out[field] = v; continue; }
    }
    // "Expected CTC 6 LPA": the label, then the answer on the same line without a separator.
    if (!sep && !l.quoted) {
      const re = LABELS.find(([f]) => f === field)![1];
      const m = re.exec(s);
      const v = m ? clip(s.slice((m.index ?? 0) + m[0].length)) : "";
      if (v && /\d|[a-z]{3,}/i.test(v) && !labelOf(v)) { out[field] = v; continue; }
    }
    // The answer on the next line(s) the candidate wrote.
    const next = ls.slice(i + 1, i + 3).find((n) => n.text.trim());
    if (next && !next.quoted && !labelOf(next.text.trim().replace(/^[\s\-•*>\d.)]+/, ""))) {
      const v = clip(next.text);
      if (v) out[field] = v;
    }
  }
  return out;
}

/**
 * True when a value (from the AI) is backed by the reply: most of its words / numbers appear in it.
 * Stops an invented value ("Not mentioned", a guessed city) from being saved.
 */
export function supportedBy(value: string, body: string): boolean {
  const words = value.toLowerCase().match(/[a-z]{3,}|\d+(?:\.\d+)?/g) ?? [];
  if (!words.length) return false;
  const hay = body.toLowerCase();
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits / words.length >= 0.6 && (!/\d/.test(value) || (value.match(/\d+(?:\.\d+)?/g) ?? []).every((n) => hay.includes(n)));
}
