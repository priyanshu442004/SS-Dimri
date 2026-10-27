import { loadEnvConfig } from "@next/env";
import { Pool } from "@neondatabase/serverless";

// Test-only time travel for the approval grace period. Every helper refuses to
// touch anything outside an organization created by the e2e suite (owner
// email @e2e.invalid). Plain SQL: Playwright cannot load the ESM Prisma client.
loadEnvConfig(process.cwd());
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DAY = 86_400_000;

export const days = (n: number) => n * DAY;

/** Sets the account's creation time to `ageMs` milliseconds ago (the grace clock starts there). */
export async function setAccountAge(loginIdOrEmail: string, ageMs: number) {
  const { rows } = await pool.query<{ employee_id: string | null; client_id: string | null }>(
    `SELECT m.employee_id, m.client_id
       FROM users u
       JOIN organization_memberships m ON m.user_id = u.id
      WHERE (u.email = $1 OR u.username = lower($1))
        AND EXISTS (
          SELECT 1 FROM organization_memberships o JOIN users ou ON ou.id = o.user_id
           WHERE o.organization_id = m.organization_id AND o.role = 'OWNER' AND ou.email LIKE '%@e2e.invalid')
      LIMIT 1`,
    [loginIdOrEmail],
  );
  const m = rows[0];
  if (!m) throw new Error("Refusing to modify an account outside an e2e test organization.");
  const createdAt = new Date(Date.now() - ageMs);
  if (m.employee_id) await pool.query("UPDATE employees SET created_at = $1 WHERE id = $2", [createdAt, m.employee_id]);
  else if (m.client_id) await pool.query("UPDATE clients SET created_at = $1 WHERE id = $2", [createdAt, m.client_id]);
  else throw new Error("Account has no employee or client record.");
}

/** Makes a test invitation's temporary password expired. */
export async function expireInvitation(email: string) {
  const { rowCount } = await pool.query(
    `UPDATE organization_memberships m SET temp_password_expires_at = now() - interval '1 minute'
       FROM users u
      WHERE u.id = m.user_id AND u.email = $1
        AND EXISTS (
          SELECT 1 FROM organization_memberships o JOIN users ou ON ou.id = o.user_id
           WHERE o.organization_id = m.organization_id AND o.role = 'OWNER' AND ou.email LIKE '%@e2e.invalid')`,
    [email.toLowerCase()],
  );
  if (!rowCount) throw new Error("Refusing to modify an account outside an e2e test organization.");
}

export async function disconnect() {
  await pool.end();
}
