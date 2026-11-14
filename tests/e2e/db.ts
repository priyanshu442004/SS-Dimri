import { loadEnvConfig } from "@next/env";
import { Pool } from "@neondatabase/serverless";
import { applyLocalNeonProxy } from "../../src/lib/neon-local";

// Test-only time travel for the approval grace period. Every helper refuses to
// touch anything outside an organization created by the e2e suite (owner
// email @e2e.invalid). Plain SQL: Playwright cannot load the ESM Prisma client.
loadEnvConfig(process.cwd());
applyLocalNeonProxy();
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

/** More user licences for a test organization. */
export async function raiseLicenceLimit(ownerEmail: string, limit: number) {
  if (!ownerEmail.endsWith("@e2e.invalid")) throw new Error("Refusing to modify an organization outside the e2e suite.");
  await pool.query(
    `UPDATE organizations o SET licensed_user_limit = $2
      WHERE EXISTS (SELECT 1 FROM organization_memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = o.id AND m.role = 'OWNER' AND u.email = $1)`,
    [ownerEmail.toLowerCase(), limit],
  );
}

/** Makes a test task's scheduled reminders due now. */
export async function makeRemindersDue(title: string) {
  await pool.query(
    `UPDATE task_reminders r SET remind_at = now() - interval '1 minute'
       FROM tasks t WHERE t.id = r.task_id AND t.title = $1 AND r.status = 'SCHEDULED'
        AND EXISTS (SELECT 1 FROM organization_memberships o JOIN users ou ON ou.id = o.user_id
                     WHERE o.organization_id = t.organization_id AND o.role = 'OWNER' AND ou.email LIKE '%@e2e.invalid')`,
    [title],
  );
}

/** A marked-in day `daysAgo` days back with no time out (a forgotten mark-out), for a test employee. */
export async function addForgottenMarkOut(loginEmail: string, daysAgo: number) {
  const { rowCount } = await pool.query(
    `INSERT INTO attendance_records (id, organization_id, employee_id, attendance_date, time_in, status, created_at, updated_at)
     SELECT gen_random_uuid(), m.organization_id, m.employee_id, (now() AT TIME ZONE 'Asia/Kolkata')::date - $2::int,
            ((now() AT TIME ZONE 'Asia/Kolkata')::date - $2::int + time '09:35') AT TIME ZONE 'Asia/Kolkata', 'PRESENT', now(), now()
       FROM organization_memberships m JOIN users u ON u.id = m.user_id
      WHERE u.email = $1 AND m.employee_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM organization_memberships o JOIN users ou ON ou.id = o.user_id
                     WHERE o.organization_id = m.organization_id AND o.role = 'OWNER' AND ou.email LIKE '%@e2e.invalid')
     ON CONFLICT (employee_id, attendance_date) DO NOTHING`,
    [loginEmail.toLowerCase(), daysAgo],
  );
  if (!rowCount) throw new Error("No attendance added (outside an e2e organization, or the day already exists).");
}

/**
 * Office rule 3 marks everyone not in by 12:00 absent, and nobody can then mark in. The suite runs at
 * any hour, so its firm's cut-off moves to the end of the day.
 */
export async function relaxAttendanceCutoff(ownerEmail: string) {
  if (!ownerEmail.endsWith("@e2e.invalid")) throw new Error("Refusing to modify an organization outside the e2e suite.");
  await pool.query(
    `UPDATE attendance_policies p SET auto_absent_at = '23:59'
      WHERE EXISTS (SELECT 1 FROM organization_memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = p.organization_id AND m.role = 'OWNER' AND u.email = $1)`,
    [ownerEmail.toLowerCase()],
  );
}

export async function disconnect() {
  await pool.end();
}
