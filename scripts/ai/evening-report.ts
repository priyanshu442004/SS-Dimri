// Makes (and mails) a firm's scheduled report by hand — e.g. after a missed run.
//   npx tsx scripts/ai/evening-report.ts <organizationId> [yesterday] [--no-mail] [--drop-manual-since=<ISO>]
//   npx tsx scripts/ai/evening-report.ts <organizationId> weekly [YYYY-MM-DD] [--no-mail]
// "yesterday" builds the previous day's daily report from its full-day figures (filed under that day).
// "weekly" builds the Monday-to-Sunday report of the week holding the date (default: the week just ended).
import Module from "node:module";
const load = (Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = (r: string, ...a: unknown[]) => (r === "server-only" ? {} : load(r, ...a));
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const [orgId, which, arg] = process.argv.slice(2);
  if (!orgId) throw new Error("Pass the organization id.");
  const flags = process.argv.slice(2);
  const { prisma } = await import("../../src/lib/db");
  const { dateOnly, isoDateInTz, addDays, toIsoDate } = await import("../../src/lib/dates");
  const ai = await import("../../src/lib/services/ai-report");
  const biz = await import("../../src/lib/services/business360");
  const drop = flags.find((f) => f.startsWith("--drop-manual-since="))?.split("=")[1];
  if (drop) {
    const r = await prisma.aiReport.deleteMany({ where: { organizationId: orgId, trigger: "MANUAL", createdAt: { gte: new Date(drop) } } });
    console.log(`Removed ${r.count} manual report(s) made since ${drop}.`);
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } });
  const today = isoDateInTz(new Date(), org.timezone);

  let report;
  if (which === "weekly") {
    const week = /^\d{4}-\d{2}-\d{2}$/.test(arg ?? "") ? biz.weekOf(arg) : biz.shiftRange(biz.weekOf(today), -7);
    const slot = dateOnly(week.from);
    const existing = await prisma.aiReport.findUnique({ where: { organizationId_kind_scheduledFor: { organizationId: orgId, kind: "WEEKLY", scheduledFor: slot } } });
    if (existing) await prisma.aiReport.delete({ where: { id: existing.id } });
    const row = await prisma.aiReport.create({ data: { organizationId: orgId, kind: "WEEKLY", scheduledFor: slot, trigger: "SCHEDULED" } });
    report = await ai.generateReport(await ai.systemContext(orgId), { trigger: "SCHEDULED", rowId: row.id, kind: "WEEKLY", week });
    console.log(`Weekly report ${report.id} for ${week.from} – ${week.to}: written text ${report.narrative.ai ? "yes" : "no (worked-out lines)"}`);
  } else {
    const yesterday = which === "yesterday";
    const day = dateOnly(yesterday ? toIsoDate(addDays(dateOnly(today), -1)) : today);
    const existing = await prisma.aiReport.findUnique({ where: { organizationId_kind_scheduledFor: { organizationId: orgId, kind: "DAILY", scheduledFor: day } } });
    if (existing) await prisma.aiReport.delete({ where: { id: existing.id } });
    const row = await prisma.aiReport.create({ data: { organizationId: orgId, kind: "DAILY", scheduledFor: day, trigger: "SCHEDULED" } });
    report = await ai.generateReport(await ai.systemContext(orgId), { trigger: "SCHEDULED", rowId: row.id, period: yesterday ? "yesterday" : "today" });
    console.log(`Daily report ${report.id} for ${toIsoDate(day)}: written text ${report.narrative.ai ? "yes" : "no (worked-out lines)"}`);
  }
  if (!flags.includes("--no-mail")) console.log("Mail:", JSON.stringify(await ai.mailReport(report.id)));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
