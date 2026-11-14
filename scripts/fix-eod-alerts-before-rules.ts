// One-off clean-up after the office rules release (14 Nov 2026).
//
// The release went live at about 13:30 IST on 14 Nov. Its first scheduled run flagged every
// working day of the previous week as "EOD report not filed — ₹100 fine", and flagged everyone
// at work for a missing 10:30 morning plan, although neither could have been filed before then.
// The code now starts these rules on 14 Nov (EOD) and 15 Nov (morning plan on time), so no fines
// remain; this removes the alerts that were already sent:
//   1. "EOD report for <day before 14 Nov> not filed" (each person)
//   2. "N EOD reports not filed" sent to Team Leads / admins on 14 Nov (all about those days)
//   3. "Your morning plan was due by 10:30" and "No morning plan yet" sent on 14 Nov
//   4. "Update your timesheet for <day before 14 Nov>" escalations, if any were made
//   5. "— filed late" is dropped from "EOD report from X (<day before 14 Nov>)" (the EOD stays)
//
// Run AFTER the code fix is deployed (otherwise the old code can flag again).
// Usage: npx tsx scripts/fix-eod-alerts-before-rules.ts           (dry run: counts only)
//        npx tsx scripts/fix-eod-alerts-before-rules.ts --apply   (changes the database)
import { loadEnvConfig } from "@next/env";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
const apply = process.argv.includes("--apply");

const START = "2026-11-14"; // EOD_RULES_FROM in src/lib/domain/daily-plan.ts
// Alerts sent on the go-live day (IST).
const DAY_FROM = new Date("2026-11-14T00:00:00+05:30");
const DAY_TO = new Date("2026-11-15T00:00:00+05:30");

async function main() {
  await prisma.$transaction(async (tx) => {
    // The day an alert is about is in its link (…&date=YYYY-MM-DD).
    const aboutBefore = (type: string) => tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM notifications WHERE type = ${type} AND substring(link from 'date=([0-9]{4}-[0-9]{2}-[0-9]{2})') < ${START}`;

    const eodMissing = (await aboutBefore("daily_plan.eod_missing")).map((r) => r.id);
    const escalated = (await aboutBefore("daily_plan.escalated")).map((r) => r.id);
    const filedLate = (await aboutBefore("daily_plan.eod")).map((r) => r.id);
    const sentToday = { createdAt: { gte: DAY_FROM, lt: DAY_TO } };

    const counts = {
      "EOD not filed (each person, days before 14 Nov)": eodMissing.length,
      "EOD not filed (Team Leads / admins, sent 14 Nov)": await tx.notification.count({ where: { type: "daily_plan.eod_missing_team", ...sentToday } }),
      "Morning plan missing (each person, sent 14 Nov)": await tx.notification.count({ where: { type: "daily_plan.missing", ...sentToday } }),
      "Morning plan missing (Team Leads / admins, sent 14 Nov)": await tx.notification.count({ where: { type: "daily_plan.missing_team", ...sentToday } }),
      "Escalations for days before 14 Nov": escalated.length,
      "EOD filed: '— filed late' to remove": await tx.notification.count({ where: { id: { in: filedLate }, title: { contains: " — filed late" } } }),
    };
    console.table(counts);
    if (!apply) {
      console.log("Dry run: nothing changed. Re-run with --apply to clean up.");
      return;
    }

    await tx.notification.deleteMany({ where: { id: { in: [...eodMissing, ...escalated] } } });
    await tx.notification.deleteMany({ where: { type: { in: ["daily_plan.eod_missing_team", "daily_plan.missing", "daily_plan.missing_team"] }, ...sentToday } });
    await tx.$executeRaw`UPDATE notifications SET title = replace(title, ' — filed late', '') WHERE id = ANY(${filedLate}::uuid[])`;
    console.log("Done: the alerts above were removed.");
  });
}

main().finally(() => prisma.$disconnect());
