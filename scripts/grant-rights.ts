// One-off: give a staff member extra rights by email, with an audit entry. Same effect as
// ticking the boxes on their employee page (Employees → person → Module access & extra rights).
//   npx tsx scripts/grant-rights.ts <email> employees.invite employees.approve
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";

loadEnvConfig(process.cwd());

async function main() {
  const [email, ...rights] = process.argv.slice(2);
  if (!email || rights.length === 0) throw new Error("Usage: grant-rights <email> <capability> [capability…]");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `select m.id, m.organization_id, m.employee_id, m.role, m.status, m.granted_capabilities, u.name
       from organization_memberships m join users u on u.id = m.user_id where lower(u.email) = lower($1)`,
      [email],
    );
    if (rows.length !== 1) throw new Error(`Expected one membership for that email, found ${rows.length}`);
    const m = rows[0];
    if (m.status !== "ACTIVE") throw new Error("That login is not active");
    const next = [...new Set([...m.granted_capabilities, ...rights])];
    await pool.query("update organization_memberships set granted_capabilities = $1, updated_at = now() where id = $2", [next, m.id]);
    await pool.query(
      `insert into audit_logs (id, organization_id, action, entity_type, entity_id, metadata, created_at)
       values ($1, $2, 'employee.rights_updated', 'employee', $3, $4, now())`,
      [randomUUID(), m.organization_id, m.employee_id, JSON.stringify({ rights: next, source: "client feedback, 5 Nov 2026" })],
    );
    console.log(`${m.name} (${m.role}): ${next.join(", ")}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
