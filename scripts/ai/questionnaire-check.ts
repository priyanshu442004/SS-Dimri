// Questionnaire coverage (npx tsx scripts/ai/questionnaire-check.ts, with the test-database env): runs, for each question in the client's Business Questionnaire, the
// tool call(s) the assistant would make, against the live Google Sheet and the LOCAL demo ERP,
// and prints the facts the answer would be built from. Test database only.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Mod = require("module"); const orig = Mod._load; Mod._load = function (r: string, ...a: unknown[]) { return r === "server-only" ? {} : orig.call(this, r, ...a); };

type Row = (string | number)[];
const num = (v: unknown) => { const s = String(v ?? "").replace(/[₹,\s]/g, ""); const neg = /^\(.*\)$/.test(s); const n = Number(s.replace(/[()%]/g, "")); return Number.isFinite(n) ? (neg ? -n : n) : NaN; };

async function main() {
  if (!/@pg:5432\/ssdimri_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("test database only");
  const { prisma } = await import("../../src/lib/db");
  const { runTool } = await import("../../src/lib/ai/tools");
  const org = await prisma.organization.findFirstOrThrow({ where: { tradeName: "Demo CA Firm" } });
  process.env.AI_SHEET_ORGANIZATION_IDS = org.id;
  const ctx = { user: { id: "x", name: "Demo Owner", email: "", username: null }, role: "OWNER", grantedCapabilities: [], moduleRestricted: false, allowedModules: [], membershipId: "q", mustChangePassword: false, tempPasswordExpiresAt: null, organization: { id: org.id, tradeName: org.tradeName, timezone: "Asia/Kolkata", pendingDaysBasis: "CALENDAR" }, employee: null, client: null, access: { state: "full", graceEndsAt: null } } as never;
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await runTool(ctx, name, args);
    if (r.failed) throw new Error(`${name} failed: ${JSON.stringify(r.result)}`);
    return r.result as Record<string, unknown>;
  };
  const sheet = async (tab: string, extra: Record<string, unknown> = {}) => (await call("read_sheet", { tab, limit: 300, ...extra })) as { columns: string[]; rows: Row[]; totalMatching: number; about: string[] };
  const col = (t: { columns: string[] }, name: string) => t.columns.findIndex((c) => c.toLowerCase().includes(name.toLowerCase())) + 1; // +1: row[0] is the sheet row number
  const out: [string, string, string][] = [];
  const ok = (id: string, q: string, a: string) => out.push([id, q, a]);
  const t0 = Date.now();

  // ---------------- Part A
  const staff = await sheet("Staff Rates");
  const [erpStaff] = await Promise.all([call("query_database", { model: "Employee", operation: "count", args: { where: { employmentStatus: { not: "EXITED" } } } })]);
  const roleRows = staff.rows.filter((r) => r[col(staff, "Rate")] && String(r[1]).length > 2 && !/role/i.test(String(r[1])));
  ok("1.1", "How many staff do I have?", `ERP: ${(erpStaff as { count: number }).count} active employees; sheet tab "Staff Rates" columns: ${staff.columns.slice(0, 6).join(", ")}`);
  ok("1.2/1.4", "People per role / cost per hour", roleRows.slice(0, 8).map((r) => r.slice(1, 4).join(" · ")).join(" | "));
  const natureIdx = staff.columns.findIndex((c) => /nature/i.test(c)) + 1;
  ok("1.3", "Office / client site / placed at client", natureIdx ? `column "${staff.columns[natureIdx - 1]}" present; values: ${[...new Set(staff.rows.map((r) => r[natureIdx]).filter(Boolean))].join(", ")}` : `search: ${JSON.stringify((await call("read_sheet", { search: "Frontend", limit: 5 })).totalMatches)} matches for "Frontend"`);

  const clients = await sheet("Clients");
  const nIdx = col(clients, "Nature"); const sIdx = col(clients, "Status"); const bIdx = col(clients, "Branch");
  ok("2.1", "How many clients?", `sheet: ${clients.rows.length} clients; ERP demo: ${(await call("query_database", { model: "Client", operation: "count" }) as { count: number }).count}`);
  ok("2.2", "Monthly vs one-time", Object.entries(clients.rows.reduce<Record<string, number>>((m, r) => ((m[String(r[nIdx])] = (m[String(r[nIdx])] ?? 0) + 1), m), {})).map(([k, v]) => `${k}: ${v}`).join(", "));
  ok("2.3", "Branch → clients", clients.rows.map((r) => `${r[1]} → ${r[bIdx]}`).join(" | "));
  ok("2.4", "Inactive clients", clients.rows.filter((r) => !/active/i.test(String(r[sIdx])) || /inactive/i.test(String(r[sIdx]))).map((r) => `${r[1]} (${r[sIdx]})`).join(", ") || "none inactive");

  const fees = await sheet("Service Fees");
  ok("3.1-3.4", "Services, price, billing basis, days", `${fees.rows.length} rows; columns: ${fees.columns.slice(0, 8).join(", ")}; e.g. ${fees.rows.slice(0, 2).map((r) => r.slice(1, 7).join(" · ")).join(" | ")}`);
  const tracker = await sheet("Tracker");
  const svcIdx = col(tracker, "Service");
  const sold = new Set(tracker.rows.map((r) => String(r[svcIdx])));
  const feeNameIdx = fees.columns.findIndex((c) => /service/i.test(c) && !/code/i.test(c)) + 1;
  ok("3.5", "Services never sold", fees.rows.map((r) => String(r[feeNameIdx])).filter((s) => s && s.length > 3 && ![...sold].some((x) => x.startsWith(s.slice(0, 18)))).slice(0, 12).join(", "));

  // ---------------- Part B (ERP)
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const month = `${today.slice(0, 8)}01`;
  const day = await call("attendance_report", { from: today, to: today }) as { totals: Record<string, number>; rows: { name: string; state: string; late: { minutes: number } | null; leave: unknown }[] };
  ok("4.1/4.2", "Today's attendance", JSON.stringify(day.totals));
  const mon = await call("attendance_report", { from: month, to: today }) as { totals: Record<string, number>; perPerson: { name: string; attendancePercent: number; late: number; lateMinutes: number; leave: number; autoAbsent: number; role: string }[]; perRole: unknown[]; timesheetOnUnmarkedDays?: unknown[] };
  ok("4.3", "Attendance % this month", `${mon.totals.attendancePercent}% (on time ${mon.totals.onTimePercentOfPresent}% of present days)`);
  ok("4.4", "Best / weakest attendance", `best ${mon.perPerson[0].name} ${mon.perPerson[0].attendancePercent}%, weakest ${mon.perPerson.at(-1)!.name} ${mon.perPerson.at(-1)!.attendancePercent}%`);
  const notMarked = day.rows.filter((r) => r.state === "NOT_MARKED");
  ok("5.1-5.3", "Not marked today, leave vs forgot", `${notMarked.length}: ${notMarked.map((r) => `${r.name} (${r.leave ? "on leave" : "not marked"})`).join(", ")}`);
  ok("5.4", "Missed marking this month", mon.perPerson.filter((p) => p.autoAbsent).map((p) => `${p.name} ${p.autoAbsent}`).join(", ") || "nobody was auto-marked absent (demo data has manual absences only)");
  ok("5.5", "Hours logged on unmarked days", mon.timesheetOnUnmarkedDays ? `${mon.timesheetOnUnmarkedDays.length} cases` : "none (no ERP timesheets on unmarked days)");
  const late = day.rows.filter((r) => r.late);
  ok("6.1/6.2", "Late today, by minutes", late.map((r) => `${r.name} ${r.late!.minutes}m`).join(", ") || "none");
  const mostLate = [...mon.perPerson].sort((a, b) => b.late - a.late)[0];
  ok("6.3", "Late most often this month", `${mostLate.name}: ${mostLate.late} days, ${mostLate.lateMinutes} min`);
  ok("6.4", "Lateness by role", JSON.stringify(mon.perRole).slice(0, 300));
  const week = await call("attendance_report", { from: today, to: today, status: "LEAVE" }) as { rows: { name: string; leave: { returns: string } | null }[] };
  const leaves = await call("query_database", { model: "LeaveRequest", operation: "findMany", args: { where: { status: { in: ["APPROVED", "PENDING"] }, toDate: { gte: today } }, select: { fromDate: true, toDate: true, status: true, leaveType: true, employee: { select: { firstName: true, lastName: true } } } } }) as { rows: unknown[] };
  ok("7.1/7.2", "On leave today + return date", week.rows.map((r) => `${r.name} back ${r.leave?.returns}`).join(", ") || "nobody on leave today");
  ok("7.3/7.4", "Leave this week / upcoming (with pending tasks via Task query)", JSON.stringify(leaves.rows).slice(0, 300));
  const leaveDays = await call("query_database", { model: "LeaveRequest", operation: "groupBy", args: { by: ["employeeId"], where: { status: "APPROVED", fromDate: { gte: month } }, _count: { _all: true } } }) as { rows: unknown[] };
  ok("7.5", "Leave days per person this month", JSON.stringify(leaveDays.rows).slice(0, 300));

  // ---------------- Part C (sheet)
  const checks = await sheet("Data Checks");
  ok("8.1/8.2", "Revenue / profit so far", checks.rows.filter((r) => /revenue earned|margin|total staff cost/i.test(String(r[1]))).map((r) => `${r[1]} = ${r[2]}`).join(" | "));
  const cp = await sheet("Client Profit");
  const cpRev = col(cp, "Total Revenue") || col(cp, "Revenue"); const cpProfit = col(cp, "Profit");
  const cpRows = cp.rows.filter((r) => r[1] && !/total/i.test(String(r[1])) && Number.isFinite(num(r[cpRev])));
  const topClient = [...cpRows].sort((a, b) => num(b[cpRev]) - num(a[cpRev]))[0];
  ok("8.3", "Top client by revenue", topClient ? `${topClient[1]} ₹${topClient[cpRev]} (column "${cp.columns[cpRev - 1]}")` : `columns: ${cp.columns.join(", ")}`);
  ok("8.5", "Loss-making client", cpRows.filter((r) => num(r[cpProfit]) < 0).map((r) => r[1]).join(", ") || `none loss-making by "${cp.columns[cpProfit - 1]}"`);
  const statusIdx = col(tracker, "Work Status"); const dueIdx = col(tracker, "Due By – Team"); const clientIdx = col(tracker, "Client Name"); const pendIdx = col(tracker, "Pending Item – Client"); const makerIdx = col(tracker, "Maker");
  const open = tracker.rows.filter((r) => !/completed/i.test(String(r[statusIdx])));
  ok("9.1/9.2", "Open / overdue work by client", `${open.length} open of ${tracker.rows.length}; by client: ${Object.entries(open.reduce<Record<string, number>>((m, r) => ((m[String(r[clientIdx])] = (m[String(r[clientIdx])] ?? 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(", ")}; due-date column "${tracker.columns[dueIdx - 1]}"`);
  ok("9.3", "Waiting for client documents", `${open.filter((r) => r[pendIdx]).length} open items have a client pending item`);
  ok("9.4", "Most pending work by maker", Object.entries(open.reduce<Record<string, number>>((m, r) => ((m[String(r[makerIdx] || "Unassigned")] = (m[String(r[makerIdx] || "Unassigned")] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(", "));
  const pend = await sheet("Client Pending Report");
  ok("10.x", "Documents pending report", `${pend.rows.length} rows; columns: ${pend.columns.join(", ")}`);
  const ts = await sheet("Timesheet", { limit: 300 });
  ok("11.x", "Team hours", `${ts.totalMatching} timesheet rows; columns: ${ts.columns.slice(0, 10).join(", ")}`);
  const ret = await sheet("Retainers");
  ok("12.x", "Monthly fee clients", `${ret.rows.length} rows; columns: ${ret.columns.slice(0, 7).join(", ")}`);
  ok("13.x", "Data checks", checks.rows.slice(-6).map((r) => r.slice(1, 3).join(" = ")).join(" | "));

  for (const [id, q, a] of out) console.log(`\n[${id}] ${q}\n   → ${a}`);
  console.log(`\n${out.length} checks in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
