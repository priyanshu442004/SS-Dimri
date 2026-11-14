import { loadEnvConfig } from "@next/env";
import { Pool } from "@neondatabase/serverless";
import { applyLocalNeonProxy } from "../../src/lib/neon-local";

// Test-only data for the office-rules suite (rules.spec.ts). Every helper refuses to touch an
// organization whose owner is not an @e2e.invalid address. Plain SQL (Playwright cannot load the
// ESM Prisma client). People get the owner's password: the hash is copied, never re-created.
loadEnvConfig(process.cwd());
applyLocalNeonProxy();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type Person = { key: string; name: string; email: string; role: "MANAGER" | "SENIOR" | "STAFF"; reportsTo?: string; restricted?: boolean; salary: number };

async function orgOf(ownerEmail: string) {
  if (!ownerEmail.endsWith("@e2e.invalid")) throw new Error("Refusing to modify an organization outside the e2e suite.");
  const { rows } = await pool.query<{ organization_id: string; password: string }>(
    `SELECT m.organization_id, a.password FROM organization_memberships m JOIN users u ON u.id = m.user_id
       JOIN accounts a ON a.user_id = u.id AND a.provider_id = 'credential'
      WHERE m.role = 'OWNER' AND u.email = $1 LIMIT 1`,
    [ownerEmail.toLowerCase()],
  );
  if (!rows[0]) throw new Error("Owner not found.");
  return rows[0];
}

/** Staff with logins, reporting lines and salaries. Returns employee ids by key. */
export async function seedTeam(ownerEmail: string, people: Person[]) {
  const { organization_id: org, password } = await orgOf(ownerEmail);
  const ids: Record<string, string> = {};
  let n = 900;
  for (const p of people) {
    const user = (await pool.query<{ id: string }>(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, true, now(), now()) RETURNING id`, [p.name, p.email.toLowerCase()])).rows[0].id;
    await pool.query(`INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (gen_random_uuid(), $1::text, 'credential', $1::uuid, $2, now(), now())`, [user, password]);
    const [first, ...rest] = p.name.split(" ");
    const emp = (await pool.query<{ id: string }>(
      `INSERT INTO employees (id, organization_id, temporary_employee_code, first_name, last_name, email, approval_status, approved_at, employment_status, date_of_joining, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'APPROVED', now(), 'ACTIVE', '2026-08-01', now(), now()) RETURNING id`,
      [org, `TMP-R${n++}`, first, rest.join(" ") || null, p.email.toLowerCase()])).rows[0].id;
    await pool.query(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role, status, employee_id, module_restricted, allowed_modules, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', $4, $5, $6, now(), now())`,
      [org, user, p.role, emp, !!p.restricted, p.restricted ? ["attendance", "payroll"] : []]);
    await pool.query(`INSERT INTO employee_salary_records (id, employee_id, effective_from, agreed_salary, salary_period, salary_mode, created_at, updated_at) VALUES (gen_random_uuid(), $1, '2026-08-01', $2, 'MONTHLY', 'TRANSFER', now(), now())`, [emp, p.salary]);
    ids[p.key] = emp;
  }
  for (const p of people) {
    if (p.reportsTo) await pool.query(`INSERT INTO employee_reporting_relationships (id, employee_id, manager_id, is_primary, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, true, now(), now())`, [ids[p.key], ids[p.reportsTo]]);
  }
  return { org, ids };
}

/** One worked day: in / out at IST times, with the EOD filed at 19:00 that day unless `eod` is false. */
export async function workedDay(org: string, employeeId: string, iso: string, inT: string, outT: string | null, opts: { eod?: boolean } = {}) {
  await pool.query(
    `INSERT INTO attendance_records (id, organization_id, employee_id, attendance_date, time_in, time_out, status, work_location, time_in_latitude, time_in_longitude, scheduled_start, scheduled_end, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::date, ($3::date + $4::time) AT TIME ZONE 'Asia/Kolkata', CASE WHEN $5::time IS NULL THEN NULL ELSE ($3::date + $5::time) AT TIME ZONE 'Asia/Kolkata' END,
             'PRESENT', 'OFFICE', 28.6304, 77.1425, '09:30', '18:30', now(), now())`,
    [org, employeeId, iso, inT, outT]);
  if (opts.eod !== false) {
    await pool.query(
      `INSERT INTO daily_plans (id, organization_id, employee_id, plan_date, plan_submitted_at, eod_submitted_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3::date, ($3::date + time '10:00') AT TIME ZONE 'Asia/Kolkata', ($3::date + time '19:00') AT TIME ZONE 'Asia/Kolkata', now(), now())`,
      [org, employeeId, iso]);
  }
}

export async function approvedLeave(org: string, employeeId: string, iso: string, requestedBefore = true) {
  await pool.query(
    `INSERT INTO leave_requests (id, organization_id, employee_id, from_date, to_date, is_half_day, is_paid, status, with_intimation, leave_type, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::date, $3::date, false, true, 'APPROVED', $4, 'CASUAL', now(), now())`, [org, employeeId, iso, requestedBefore]);
}

export async function approvedOvertime(org: string, employeeId: string, iso: string) {
  await pool.query(
    `INSERT INTO attendance_requests (id, organization_id, employee_id, kind, request_date, at_time, reason, task, why_not_tomorrow, in_advance, status, decided_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'OVERTIME', $3::date, '20:30', 'Urgent', 'GST return filing', 'Due date tonight', true, 'APPROVED', now(), now(), now())`, [org, employeeId, iso]);
}

export async function addHolidayRow(org: string, iso: string, name: string) {
  await pool.query(`INSERT INTO holidays (id, organization_id, holiday_date, name, created_at) VALUES (gen_random_uuid(), $1, $2::date, $3, now())`, [org, iso, name]);
}

/** Change the test firm's policy (times as "HH:MM"). */
export async function setPolicy(ownerEmail: string, values: { autoAbsentAt?: string; morningPlanBy?: string }) {
  const { organization_id: org } = await orgOf(ownerEmail);
  await pool.query(`UPDATE attendance_policies SET auto_absent_at = COALESCE($2, auto_absent_at), morning_plan_by = COALESCE($3, morning_plan_by) WHERE organization_id = $1`,
    [org, values.autoAbsentAt ?? null, values.morningPlanBy ?? null]);
}

/** A worked day `daysAgo` back (skipping Sundays) whose EOD was never filed: its deadline has passed. */
export async function missedEodDay(org: string, employeeId: string): Promise<string | null> {
  // Only days from 14 Nov 2026 count: the EOD rule started then (EOD_RULES_FROM).
  const { rows } = await pool.query<{ d: string }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS d FROM (SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date - k) AS d FROM generate_series(3, 6) k) x
      WHERE extract(dow FROM d) <> 0 AND d >= DATE '2026-11-14' ORDER BY d DESC LIMIT 1`);
  const iso = rows[0]?.d;
  if (!iso) return null;
  await workedDay(org, employeeId, iso, "09:30", "18:30", { eod: false });
  return iso;
}

/** An active client of the test firm, with a primary contact and one service. */
export async function seedClient(org: string, name: string) {
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO clients (id, organization_id, client_code, trade_name, status, approved_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', now(), now(), now()) RETURNING id`, [org, `T-${name.slice(0, 12)}-${Math.random().toString(36).slice(2, 6)}`, name])).rows[0].id;
  await pool.query(`INSERT INTO client_contacts (id, client_id, name, mobile, is_primary, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, '9876543210', true, now(), now())`, [id, `${name} Contact`]);
  return id;
}

/** Allocation of a person to a client from `fromIso`, ongoing, full day. */
export async function allocate(org: string, clientId: string, employeeId: string, fromIso: string) {
  await pool.query(
    `INSERT INTO team_allocations (id, organization_id, client_id, employee_id, start_date, status, frequency, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::date, 'ACTIVE', 'DAILY', now(), now())`, [org, clientId, employeeId, fromIso]);
}

/** A service the firm offers (Services & departments). */
export async function seedService(org: string, name: string) {
  return (await pool.query<{ id: string }>(
    `INSERT INTO services (id, organization_id, name, is_active, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, true, now(), now()) RETURNING id`, [org, name])).rows[0].id;
}

/** Moves a task's "start work" back in time, so its worked minutes are known. */
export async function startedMinutesAgo(taskTitle: string, minutes: number) {
  await pool.query(
    `UPDATE task_activities SET created_at = now() - make_interval(mins => $2)
      WHERE type = 'STATUS_CHANGED' AND to_value = 'IN_PROGRESS' AND task_id IN (SELECT id FROM tasks WHERE title = $1)`, [taskTitle, minutes]);
}

export async function allocationStatus(clientId: string, employeeId: string) {
  return (await pool.query<{ status: string; end_date: string | null }>(`SELECT status, to_char(end_date, 'YYYY-MM-DD') AS end_date FROM team_allocations WHERE client_id = $1 AND employee_id = $2`, [clientId, employeeId])).rows[0];
}

export async function disconnectRules() {
  await pool.end();
}
