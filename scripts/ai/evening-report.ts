// Makes (and mails) a firm's evening "Daily AI Summary Report" by hand — e.g. after a missed run.
//   npx tsx scripts/ai/evening-report.ts <organizationId> [yesterday] [--no-mail] [--drop-manual-since=<ISO>]
// "yesterday" builds the previous day's report from its full-day figures (filed under that day).
import Module from "node:module";
const load = (Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = (r: string, ...a: unknown[]) => (r === "server-only" ? {} : load(r, ...a));
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const [orgId, which] = process.argv.slice(2);
  if (!orgId) throw new Error("Pass the organization id.");
  const flags = process.argv.slice(2);
  const { prisma } = await import("../../src/lib/db");
  const { dateOnly, isoDateInTz, addDays, toIsoDate } = await import("../../src/lib/dates");
  const ai = await import("../../src/lib/services/ai-report");
  const drop = flags.find((f) => f.startsWith("--drop-manual-since="))?.split("=")[1];
  if (drop) {
    const r = await prisma.aiReport.deleteMany({ where: { organizationId: orgId, trigger: "MANUAL", createdAt: { gte: new Date(drop) } } });
    console.log(`Removed ${r.count} manual report(s) made since ${drop}.`);
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } });
  const today = isoDateInTz(new Date(), org.timezone);
  const yesterday = which === "yesterday";
  const day = dateOnly(yesterday ? toIsoDate(addDays(dateOnly(today), -1)) : today);
  const existing = await prisma.aiReport.findUnique({ where: { organizationId_scheduledFor: { organizationId: orgId, scheduledFor: day } } });
  if (existing) await prisma.aiReport.delete({ where: { id: existing.id } });
  const row = await prisma.aiReport.create({ data: { organizationId: orgId, scheduledFor: day, trigger: "SCHEDULED" } });
  const report = await ai.generateReport(await ai.systemContext(orgId), { trigger: "SCHEDULED", rowId: row.id, period: yesterday ? "yesterday" : "today" });
  console.log(`Report ${report.id} for ${report.data.asOfDate}: AI text ${report.narrative.ai ? "yes" : "no (fallback)"}`);
  if (!flags.includes("--no-mail")) console.log("Mail:", JSON.stringify(await ai.mailReport(report.id)));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
