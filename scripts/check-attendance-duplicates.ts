// Read-only pre-migration check for migration 5 (one attendance record per
// employee per day): counts (employee, date) pairs with more than one row.
// Usage: npx tsx scripts/check-attendance-duplicates.ts
import { loadEnvConfig } from "@next/env";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const [dupes] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM (
      SELECT employee_id, attendance_date FROM attendance_records GROUP BY 1, 2 HAVING count(*) > 1
    ) d`;
  const total = await prisma.attendanceRecord.count();
  console.log(`attendance rows: ${total}; duplicate (employee, date) groups: ${dupes.n}`);
  if (Number(dupes.n) > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
