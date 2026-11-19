// Financial Statement Analysis chat: DeepSeek answers from the four uploaded statements (+ the
// computed metrics), like a CFO. Concise, formatted for the reader.
import { stream } from "./deepseek.js";

const MAX_HISTORY = 16; // messages kept for follow-up context

const MULT = { rupees: 1, thousands: 1e3, lakhs: 1e5, crores: 1e7, millions: 1e6 };
const UNIT_TEXT = { thousands: "₹ thousands ('000)", lakhs: "₹ lakh", crores: "₹ crore", millions: "₹ million", rupees: "₹" };

/** Every statement line pre-converted to "₹x.xx Cr" so the model never has to convert units. */
function linesInCrore(a) {
  const m = MULT[a.unit] || 1e3;
  const out = {};
  for (const [name, st] of [["balanceSheet", a.statements.balanceSheet], ["profitLoss", a.statements.profitLoss], ["cashFlow", a.statements.cashFlow]]) {
    out[name] = {};
    for (const k of Object.keys({ ...st.c, ...st.p })) {
      if (k === "eps") continue;
      const f = (v) => (typeof v === "number" ? `₹${((v * m) / 1e7).toFixed(2)} Cr` : null);
      out[name][k] = { [a.fy]: f(st.c[k]), [a.pfy]: f(st.p[k]) };
    }
  }
  return out;
}

export function systemPrompt(session) {
  const a = session.analysis;
  const m = MULT[a.unit] || 1e3;
  const facts = {
    company: a.company, period: a.periodEnd, years: [a.fy, a.pfy], healthScore: `${a.score}/100 (${a.risk})`,
    dimensions: a.status,
    ratios: Object.fromEntries(Object.entries(a.ratios).map(([k, r]) => [k, { [a.fy]: r.c, [a.pfy]: r.p, variancePct: r.variance, source: r.source }])),
    statementLinesInCrore: linesInCrore(a),
    eps: { [a.fy]: a.statements.profitLoss.c.eps, [a.pfy]: a.statements.profitLoss.p.eps },
    // year-on-year growth already computed (%), so direction words (rose/fell) are always right
    growthPct: Object.fromEntries(Object.entries(a.figures.growth).map(([k, v]) => [k, v == null ? null : Math.round(v * 100) / 100])),
    dataQualityNotes: a.notes,
  };
  const rev = a.statements.profitLoss.c.revenueFromOperations;
  const example = typeof rev === "number" ? `e.g. revenue ${rev.toLocaleString("en-IN")} (${UNIT_TEXT[a.unit]}) = ₹${((rev * m) / 1e7).toFixed(2)} Cr` : "";
  return `You are "CFO Intelligence", a virtual Chief Financial Officer for ${a.company}.
You have the company's audited statements for ${a.fy} vs ${a.pfy}: Balance Sheet, Statement of Profit & Loss, Cash Flow Statement and the Analytical Ratios note.

HOW TO ANSWER
- Ground every number in the documents or the computed metrics below. Name the source briefly, e.g. (Balance Sheet) or (Ratio note).
- The PDFs show amounts in ${UNIT_TEXT[a.unit] || a.unit}. ALWAYS take money values from "statementLinesInCrore" below — they are already converted to ₹ Cr (${example}). Never convert units yourself. For amounts under ₹1 Cr you may write lakh (₹1 Cr = ₹100 L).
- Show the calculation briefly when you derive something (differences, shares, growth).
- You may use general CFO / accounting knowledge (Ind AS, Schedule III, ratios, working capital, funding, tax) to explain and advise — but say when something is general guidance rather than from these statements.
- If the documents don't contain what is asked, say so plainly and suggest what data would answer it. Never invent figures.
- Stay within finance, accounting, this company's performance and related business decisions. Politely decline unrelated topics.

STYLE
- Concise and meaningful: lead with the answer in one sentence, then support it. Usually 60–180 words; go longer only if the user asks for detail.
- Use Markdown that fits the content: a short heading (###) only for multi-part answers, bullet points for lists of drivers or actions, a small table for comparisons across years or ratios, **bold** for the key figure. No filler, no repeated disclaimers.
- For follow-ups, build on the conversation instead of repeating earlier answers.

COMPUTED METRICS (deterministic, from the same documents)
${JSON.stringify(facts)}

DOCUMENTS (text reconstructed from the PDFs; columns separated by " | ")
=== BALANCE SHEET ===
${session.texts.balanceSheet}

=== STATEMENT OF PROFIT & LOSS ===
${session.texts.profitLoss}

=== CASH FLOW STATEMENT ===
${session.texts.cashFlow}

=== ANALYTICAL RATIOS NOTE ===
${session.texts.ratios}`;
}

/** Streams the assistant reply for `question`, given prior `history` [{role, content}]. */
export function answer(session, history, question, signal) {
  const messages = [
    { role: "system", content: systemPrompt(session) },
    ...history.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];
  return stream(messages, { maxTokens: 1100, temperature: 0.3, signal });
}

export const SUGGESTIONS = [
  "Summarise the company's financial health in 5 points",
  "Why did net profit grow while revenue stayed flat?",
  "How risky is the short-term borrowing position?",
  "Explain the drop in current ratio",
  "What should management prioritise in the next 6 months?",
  "Compare key ratios for both years in a table",
];
