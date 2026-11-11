// Turns whatever an n8n webhook sends back into clean Markdown text.
// n8n workflows answer in many shapes — `{ output }` from an AI Agent node,
// `{ text }` / `{ message }` / `{ response }` from a Respond to Webhook node,
// an array of items, a bare string, or even HTML — so we look for the text
// rather than depend on one exact format.

const TEXT_KEYS = [
  "output", "text", "reply", "response", "answer", "message", "content",
  "report", "summary", "result", "data", "json", "body",
];

function pick(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((v) => pick(v, depth + 1)).filter((v): v is string => !!v && v.trim() !== "");
    return parts.length ? parts.join("\n\n") : null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of TEXT_KEYS) {
      if (key in obj) {
        const found = pick(obj[key], depth + 1);
        if (found && found.trim()) return found;
      }
    }
    // OpenAI-style `{ choices: [{ message: { content } }] }`
    if (Array.isArray(obj.choices)) return pick(obj.choices, depth + 1);
  }
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h([1-6])[^>]*>/gi, (_, n) => `\n\n${"#".repeat(Number(n))} `)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<\/(p|div|h[1-6]|ul|ol|table|tr)>/gi, "\n\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Normalises line endings, escaped newlines, wrapping code fences and blank-line runs. */
export function cleanReply(text: string): string {
  let t = text.replace(/\r\n?/g, "\n");
  // A JSON-encoded string that arrived double-escaped: "Line one\\nLine two".
  if (!t.includes("\n") && t.includes("\\n")) t = t.replace(/\\n/g, "\n").replace(/\\t/g, "  ").replace(/\\"/g, '"');
  t = t.trim();
  // Models sometimes wrap the whole answer in ```markdown … ```.
  const fenced = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  if (fenced) t = fenced[1].trim();
  if (/^<(!doctype|html|body|div|p|h[1-6]|ul|ol|table)\b/i.test(t)) t = htmlToText(t).trim();
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

/** Extracts the readable reply from a raw webhook response body. */
export function extractReply(raw: string): string {
  const body = raw.trim();
  if (!body) return "";
  try {
    const parsed: unknown = JSON.parse(body);
    const found = pick(parsed);
    if (found != null) return cleanReply(found);
    // Unknown JSON shape: show it rather than nothing.
    return "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
  } catch {
    return cleanReply(body);
  }
}
