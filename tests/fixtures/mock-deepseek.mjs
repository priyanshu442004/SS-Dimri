// A scripted stand-in for DeepSeek's OpenAI-compatible /chat/completions (streaming + tool
// calls), for end-to-end tests of the AI assistant without a real model or API key.
//   node tests/fixtures/mock-deepseek.mjs 4555
// It picks tools from keywords in the question, then answers from the tool results with KPI
// cards, a table and a follow-up — exercising the same code paths a real model does.
import http from "node:http";

const port = Number(process.argv[2] ?? 4555);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yesterday = new Date(Date.now() - 86400e3 + 5.5 * 3600e3).toISOString().slice(0, 10);
let callNo = 0;

function plan(question) {
  const q = question.toLowerCase();
  const id = () => `call_${++callNo}`;
  const fn = (name, args) => ({ id: id(), type: "function", function: { name, arguments: JSON.stringify(args) } });
  if (q.includes("selected excerpt")) {
    const excerpt = (/"""\n([\s\S]*?)\n"""/.exec(question)?.[1] ?? "").trim();
    const word = excerpt.split(/\s+/).find((w) => w.length > 4) ?? excerpt;
    return [fn("query_database", { model: "AttendanceRecord", operation: "findMany", args: { where: { lateReason: { contains: word } }, select: { attendanceDate: true, lateReason: true, employee: { select: { firstName: true, lastName: true } } }, orderBy: { attendanceDate: "desc" }, take: 20 } })];
  }
  if (q.includes("profit")) return [fn("read_sheet", { tab: "Team Profit", columns: ["Team Member", "Team Profit"], limit: 8 })];
  if (q.includes("overdue")) return [fn("query_database", { model: "Task", operation: "groupBy", args: { by: ["makerEmployeeId"], where: { status: { in: ["PENDING", "IN_PROGRESS", "ON_HOLD"] }, dueAt: { lt: new Date().toISOString() } } } })];
  if (q.includes("slow")) return [fn("attendance_report", { from: yesterday, to: yesterday, status: "LATE" })];
  if (q.includes("late") || q.includes("why")) return [fn("attendance_report", { from: yesterday, to: yesterday, status: "LATE" })];
  return [];
}

function answerFrom(toolMsgs) {
  const results = toolMsgs.map((m) => { try { return JSON.parse(m.content); } catch { return {}; } });
  const r = results[0] ?? {};
  if (r.rows && r.totals) {
    const names = r.rows.map((x) => x.name);
    return {
      text: `**${names.length} people** were late on ${r.period.from}: ${names.join(", ")}.`,
      calls: [
        ["show_kpis", { items: [{ label: "Late", value: names.length, tone: "bad", hint: r.period.from }, { label: "Present", value: r.totals.present }, { label: "Absent", value: r.totals.absent, tone: "warn" }] }],
        ["show_table", { title: "Late arrivals", columns: ["Name", "In", "Minutes late", "Reason"], rows: r.rows.map((x) => [x.name, x.timeIn, x.late?.minutes ?? null, x.lateReason]) }],
        ["suggest_follow_up", { question: "Who was late most often this month?" }],
      ],
    };
  }
  if (r.columns && r.tab) {
    const rows = r.rows.filter((x) => !/total/i.test(String(x[1]))).map((x) => [x[1], Number(String(x[2]).replace(/[(),]/g, "")) * (String(x[2]).startsWith("(") ? -1 : 1)]);
    return {
      text: `Team profit from the live sheet (${r.tab}): ${rows.filter((x) => x[1] < 0).map((x) => x[0]).join(", ") || "nobody"} is loss-making.`,
      calls: [
        ["show_chart", { chart: "bar", title: "Team profit (₹)", labels: rows.map((x) => x[0]), series: [{ name: "Profit", values: rows.map((x) => x[1]) }], format: "inr" }],
        ["suggest_follow_up", { question: "Why is Sanjay's margin negative?" }],
      ],
    };
  }
  if (r.rows && r.rows[0]?._count !== undefined) {
    return {
      text: `Overdue open tasks by person.`,
      calls: [
        ["show_chart", { chart: "bar", title: "Overdue tasks", labels: r.rows.map((x) => x.makerName ?? "Unassigned"), series: [{ name: "Tasks", values: r.rows.map((x) => x._count._all ?? x._count) }] }],
        ["show_kpis", { items: [{ label: "Overdue tasks", value: r.rows.reduce((s, x) => s + (x._count._all ?? x._count), 0), tone: "bad" }] }],
        ["suggest_follow_up", { question: "Which clients are these tasks for?" }],
      ],
    };
  }
  if (r.rows) {
    return { text: `Found ${r.rows.length} late arrivals for that reason: ${r.rows.map((x) => `${x.employee.firstName} (${x.attendanceDate})`).join(", ")}.`, calls: [["suggest_follow_up", { question: "Show this as a chart by person" }]] };
  }
  return { text: `I couldn't find that. ${JSON.stringify(r).slice(0, 200)}`, calls: [] };
}

async function streamResponse(res, { text = "", toolCalls = [], slow = false }) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const send = (delta, finish = null) => res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  for (const word of text.split(/(?<= )/)) {
    if (res.destroyed) return;
    send({ content: word });
    await sleep(slow ? 250 : 15);
  }
  toolCalls.forEach((c, index) => send({ tool_calls: [{ index, id: c.id, type: "function", function: { name: c.function.name, arguments: c.function.arguments } }] }));
  send({}, toolCalls.length ? "tool_calls" : "stop");
  res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 90 } })}\n\n`);
  res.end("data: [DONE]\n\n");
}

http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  if (req.headers.authorization !== "Bearer mock-key") { res.writeHead(401, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: { message: "Authentication Fails" } })); }
  const j = JSON.parse(body || "{}");
  const msgs = j.messages ?? [];
  const last = msgs.at(-1);
  if (!j.tools) return streamResponse(res, { text: "Late Arrivals Review" }); // title request
  if (last.role === "user") {
    const calls = plan(last.content);
    if (/stream slowly/i.test(last.content)) return streamResponse(res, { text: "This is a long answer that streams slowly so it can be stopped half way through by the user pressing stop. ".repeat(3), slow: true });
    if (!calls.length) return streamResponse(res, { text: "Hello! Ask me about attendance, tasks or the finance sheet." });
    return streamResponse(res, { toolCalls: calls });
  }
  const toolMsgs = [];
  for (let i = msgs.length - 1; i >= 0 && msgs[i].role === "tool"; i--) toolMsgs.unshift(msgs[i]);
  const a = answerFrom(toolMsgs);
  const fn = (name, args) => ({ id: `call_${++callNo}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
  return streamResponse(res, { text: a.text, toolCalls: a.calls.map(([n, x]) => fn(n, x)) });
}).listen(port, () => console.log(`mock deepseek on ${port}`));
