import "server-only";
import { can, type Member } from "@/lib/permissions";

// AI assistant settings from the server environment (.env.local). Read on use, so a restart
// with new values takes effect without a rebuild. Nothing here is ever sent to the browser.

const int = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export function aiConfig() {
  const thinking = (process.env.DEEPSEEK_THINKING ?? "disabled").toLowerCase() === "enabled";
  const effort = (process.env.DEEPSEEK_REASONING_EFFORT ?? "high").toLowerCase();
  return {
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() || null,
    baseUrl: (process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/+$/, ""),
    model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-pro",
    thinking,
    reasoningEffort: (["low", "high", "max"].includes(effort) ? effort : "high") as "low" | "high" | "max",
    maxToolRounds: int(process.env.AI_MAX_TOOL_ROUNDS, 8, 1, 16),
    maxOutputTokens: int(process.env.AI_MAX_OUTPUT_TOKENS, 4000, 256, 32000),
  };
}

export function sheetConfig(organizationId: string) {
  const url = process.env.AI_SHEET_URL?.trim() || "";
  const id = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(url)?.[1] ?? null;
  const allowed = (process.env.AI_SHEET_ORGANIZATION_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    sheetId: id && allowed.includes(organizationId) ? id : null,
    freshSeconds: int(process.env.AI_SHEET_FRESH_SECONDS, 60, 5, 3600),
  };
}

/**
 * The sheet holds the firm's finances (revenue, profit, staff rates), so it is offered to
 * owners, administrators and managers (and anyone given that right), not to every team lead.
 */
export function sheetFor(ctx: Member & { organization: { id: string } }) {
  const cfg = sheetConfig(ctx.organization.id);
  return cfg.sheetId && can(ctx, "reports.client") ? cfg : null;
}
