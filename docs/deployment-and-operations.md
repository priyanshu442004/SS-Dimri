# Deployment and Operations

How to set up, deploy, operate, back up and recover the SS Dimri practice portal. Nothing here requires resetting or recreating the database.

## 1. Requirements

| Component | Version / note |
|---|---|
| Node.js | 20.9+ (LTS); the app is built with Next.js 16 |
| Database | Neon PostgreSQL (pooled URL for the app, direct URL for migrations) |
| File storage | Private AWS S3 bucket; objects live under `S3_KEY_PREFIX` (default `ss-dimri/`) |
| HTTPS | Required in production (HSTS and `upgrade-insecure-requests` are sent) |

## 2. Environment variables

Set these in the hosting provider's secret store. Do **not** commit them or put them in a `.env` file that goes into the repository (`.env*` files are git-ignored; `.env.example` holds placeholders only).

| Variable | Required | Purpose |
|---|:-:|---|
| `DATABASE_URL` | ✔ | Neon **pooled** connection string (host contains `-pooler`), used at runtime |
| `DIRECT_URL` | ✔ (migrations) | Neon **direct** connection string, used only by `prisma migrate deploy` |
| `BETTER_AUTH_SECRET` | ✔ | 32 random bytes, base64. Rotating it signs everyone out |
| `BETTER_AUTH_URL` | ✔ | Public origin, e.g. `https://portal.example.in`. Must match the URL users open (origin checks) |
| `DATA_ENCRYPTION_KEY` | ✔ | 32 random bytes, base64 — encrypts Aadhaar and bank numbers. **Back it up separately; losing it makes those fields unreadable.** Never rotate it without a re-encryption script |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | ✔ | IAM user limited to `s3:GetObject`, `s3:PutObject`, `s3:ListBucket` on the bucket/prefix |
| `AWS_REGION`, `AWS_BUCKET_NAME` | ✔ | Bucket location |
| `S3_KEY_PREFIX` | | Folder inside the bucket (default `ss-dimri`) |
| `PUBLIC_ORGANIZATION_ID` | | Firm that public registrations belong to (default: the only organization) |
| `ALLOW_FIRM_REGISTRATION` | | `true` keeps `/register/firm` open after the first firm (default closed) |
| `AUTH_SIGNIN_LIMIT_PER_MINUTE` | | Per-IP sign-in attempts per minute (default 5). Raise only for automated tests |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | ✔ (for email) | Outgoing mail (staff invitations and decisions). Port 465 uses TLS. Without them, invitations are created but the email is logged as failed |
| `MAIL_FROM` | | Sender, e.g. `Firm name <info@example.com>` (default: `SMTP_USER`) |
| `MAIL_CAPTURE_DIR` | | Tests only: messages to `*.invalid` addresses are written here instead of being sent |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 3. Release steps

```bash
npm ci
npm run verify               # Prisma validate, typecheck, lint, unit tests
npm run db:migrate:status    # shows pending migrations; never resets
npm run db:migrate:deploy    # applies pending migrations only
npm run db:drift             # optional: confirms the database matches the migrations
npm run build
npm run start                # or the platform's Node start command (port from $PORT / -p)
```

- `db:migrate:deploy` only applies migrations that have not run yet. Never run `prisma migrate reset`, `prisma db push` or `migrate dev` against the production database.
- All five migrations up to `20261026210000_attendance_one_per_day` are additive (see [database-design.md](database-design.md)). Take a Neon branch or a point-in-time-restore marker before applying a new migration.
- `npm run db:seed` loads only master data (constitutions, compliance calendar) and is idempotent. It does not import spreadsheet sample records.
- `npm run storage:check` confirms S3 credentials and the prefix before go-live.

## 4. First run

1. Open `/register/firm` and register the firm owner. The page closes once one firm exists.
2. Sign in as owner → Settings: check the organization details, the certificate, the leave & timing policy (both versions are provisional), and **Lists & preferences** (designations, work types, pending-days basis).
3. Services & departments: confirm which services are public.
4. Employees: create staff logins and send each person their one-time setup link (72 hours).

## 5. Health and monitoring

- `GET /api/health` returns `{"status":"ok","database":"ok"}` or HTTP 503 with no connection details — use it for uptime checks.
- Application errors are shown to users without internal details. Check the platform logs for stack traces. Logs never contain passwords, tokens, PAN/Aadhaar or connection strings.
- The audit log is under Settings → Audit log.

## 6. Security headers

Set in `next.config.ts` for every response: Content-Security-Policy (self-only scripts, styles and fonts; images also from `*.amazonaws.com` for S3 links; no framing; `object-src 'none'`), Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy (location and camera only for this site, used by attendance). If the app runs behind a CDN, do not strip these headers.

## 7. Backups and retention

- Neon: enable point-in-time restore for the production branch.
- S3: enable versioning on the bucket, and keep it private ("block all public access"). Files are served only through 5-minute pre-signed links after a permission check.
- Data retention periods have not been decided by the firm (see U10 in [requirements-and-decisions.md](requirements-and-decisions.md)); nothing is deleted automatically.

## 8. Not yet configured

- Email/SMS delivery: password links, approvals and reminders are in-app only. Administrators send setup and reset links themselves.
- Scheduled jobs: task reminders and overdue notices are sent when staff open the app. An external scheduler is not required, but one can call a page load or a future endpoint.

## 9. Local development

```bash
cp .env.example .env.local   # fill in values; never commit
npm ci
npm run db:migrate:status    # against a development branch, not production
npm run dev                  # http://localhost:3000
```

**Development and production must use different Neon branches/databases and different S3 prefixes.** The values in this repository's `.env.local` point at the single database used during development and testing so far (see L-7 in [known-issues-and-decisions.md](known-issues-and-decisions.md)). Before go-live, create a production branch and production credentials, and keep the end-to-end tests on a separate test branch.

## 10. Production smoke test (after every deploy)

1. `GET /api/health` returns `{"status":"ok","database":"ok"}`.
2. `npm run db:migrate:status` reports no pending migrations; `npm run db:drift` reports no differences.
3. Sign in as an administrator; open Dashboard, Clients, Tasks, Timesheet and Settings → Audit log.
4. Open one stored document (checks S3 credentials and pre-signed links).
5. Sign in as a test client login (if one exists) and open `/client`.
6. Check the response headers of `/` include `Content-Security-Policy` and `Strict-Transport-Security`.

## 11. Backup and restore

| Asset | Backup | Restore |
|---|---|---|
| Database (Neon) | Point-in-time restore (history window depends on the Neon plan; check the project settings). Before each migration, create a branch from production as a named restore point | Restore by creating a branch at a timestamp, verifying it, then pointing `DATABASE_URL`/`DIRECT_URL` at it (or using Neon's restore to reset the production branch, which Neon keeps as a backup branch) |
| Files (S3) | Enable bucket versioning; optionally replicate to a second region | Restore previous object versions |
| `DATA_ENCRYPTION_KEY` | Store in two places outside the hosting provider (e.g. a password manager vault) | Required to read Aadhaar and bank numbers; there is no recovery without it |
| Configuration | Environment variable names in `.env.example`; values in the secret store | Re-enter in the host |

Test a restore at least once before go-live: create a branch at a past timestamp and run the smoke test against it.

## 12. Migration rollback and forward recovery

- Migrations are additive and applied with `migrate deploy` only. Prisma has no automatic "down" migrations.
- **Preferred: forward fix.** Write a new migration that corrects the problem.
- **If a migration damaged data:** restore the pre-migration Neon branch (§11), then deploy the previous application version.
- **If the application release is bad but the schema is fine:** redeploy the previous build; additive migrations are backward-compatible with the previous code.
- Never edit an applied migration file and never use `migrate reset` or `db push` on shared databases.

## 13. Account and administrator recovery

| Situation | Procedure |
|---|---|
| Staff or client forgot password | `/forgot-password` notifies administrators, who issue a 2-hour reset link from the person's page |
| Administrator forgot password | Another administrator or the owner issues a link from Employees → person → Access |
| The only owner/administrator is locked out | Operator procedure with database access: run `npx tsx scripts/issue-recovery-link.ts <email>` (owners/administrators only). It prints a single-use 2-hour reset link, stores only its hash and writes an audit entry; deliver the link out of band. Plan for at least two administrator accounts to avoid this |
| A login must be blocked at once | Disable it (sessions are deleted immediately) |
| Lost `BETTER_AUTH_SECRET` | Set a new one; all users sign in again |

## 14. Monitoring

- Uptime: `GET /api/health` every minute.
- Errors: the host's application logs (server errors are logged without request bodies or secrets).
- Audit: Settings → Audit log for approvals, role changes, corrections, exports.
- Database: Neon console (connections, storage, slow queries).

## 15. Data retention

No retention periods have been decided (K-10). The application never purges records; disabled, ended, cancelled and discontinued records stay for history. Uploaded files stay in S3 until deleted by an operator.
