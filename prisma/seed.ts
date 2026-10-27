// Idempotent seed for GLOBAL reference data from the client's ERP master data
// pack (prisma/data/ssda-master-data.json). Safe to re-run: upserts by code.
// Per-organization data (departments, services, work types, designations,
// attendance policy) is created when an organization registers — see
// src/lib/domain/organization-defaults.ts.
// "Nature of User" options are intentionally NOT seeded (pending confirmation).
import { loadEnvConfig } from "@next/env";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import type { ConstitutionMemberRole, ConstitutionType } from "../src/generated/prisma/enums";
import master from "./data/ssda-master-data.json";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

// Master-data constitution codes → schema enum + representative role.
// The five handwritten types keep their original enum values.
const CONSTITUTION_MAP: Record<string, { type: ConstitutionType; role: ConstitutionMemberRole; multiple: boolean }> = {
  "CON-01": { type: "INDIVIDUAL", role: "OTHER", multiple: false },
  "CON-02": { type: "HUF", role: "KARTA", multiple: false },
  "CON-03": { type: "PROPRIETOR", role: "PROPRIETOR", multiple: false },
  "CON-04": { type: "FIRM", role: "PARTNER", multiple: true },
  "CON-05": { type: "LLP", role: "PARTNER", multiple: true },
  "CON-06": { type: "COMPANY", role: "DIRECTOR", multiple: true },
  "CON-07": { type: "PUBLIC_COMPANY", role: "DIRECTOR", multiple: true },
  "CON-08": { type: "OPC", role: "DIRECTOR", multiple: false },
  "CON-09": { type: "TRUST", role: "TRUSTEE", multiple: true },
  "CON-10": { type: "AOP_BOI", role: "MEMBER", multiple: true },
  "CON-11": { type: "GOVERNMENT", role: "OTHER", multiple: true },
};

async function main() {
  for (const [i, c] of master.constitutions.entries()) {
    const m = CONSTITUTION_MAP[c.code];
    if (!m) throw new Error(`Unmapped constitution ${c.code}`);
    const data = { code: c.code, name: c.label, representativeRole: m.role, allowsMultiple: m.multiple, sortOrder: i + 1 };
    await prisma.constitution.upsert({ where: { type: m.type }, update: data, create: { type: m.type, ...data } });
  }
  for (const [i, n] of master.businessNatures.entries()) {
    const data = { label: n.label, description: n.description, sortOrder: i + 1 };
    await prisma.businessNature.upsert({ where: { code: n.code }, update: data, create: { code: n.code, ...data } });
  }
  for (const [i, o] of master.classifications.entries()) {
    const data = { basis: o.basis as never, label: o.label, description: o.description, sortOrder: i + 1 };
    await prisma.classificationOption.upsert({ where: { code: o.code }, update: data, create: { code: o.code, ...data } });
  }
  // Compliance list has no natural key in the source; replace it as a whole.
  await prisma.$transaction([
    prisma.complianceItem.deleteMany({}),
    prisma.complianceItem.createMany({ data: master.compliances.map((c, i) => ({ ...c, sortOrder: i + 1 })) }),
  ]);

  const [constitutions, natures, options, compliances] = await Promise.all([
    prisma.constitution.count(),
    prisma.businessNature.count(),
    prisma.classificationOption.count(),
    prisma.complianceItem.count(),
  ]);
  console.log({ constitutions, natures, options, compliances });
}

main()
  .catch((e) => {
    console.error("Seed failed:", e instanceof Error ? e.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
