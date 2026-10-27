# S S Dimri & Associates — Practice Portal

Web application for S S Dimri & Associates (New Delhi): a public website plus an internal portal for client onboarding, staff onboarding, team allocation, tasks with maker–checker review, attendance, timesheets, day reports, pending trackers and client reports.

- Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · PostgreSQL on Neon · Prisma 7 · Better Auth · Zod · private AWS S3
- Docs: [`docs/`](docs/)

  | Document | Contents |
  |---|---|
  | [requirements-traceability.md](docs/requirements-traceability.md) | Every requirement → source, implementation, status class, test |
  | [user-journeys.md](docs/user-journeys.md) | End-to-end journeys A–H with diagrams, failure and recovery paths |
  | [page-inventory.md](docs/page-inventory.md) | Every route, its roles, data and workflows |
  | [role-permission-matrix.md](docs/role-permission-matrix.md) | Permissions by role and action |
  | [business-rules.md](docs/business-rules.md) | Confirmed rules, configurable values, provisional defaults |
  | [workflow-state-machines.md](docs/workflow-state-machines.md) | Statuses, transitions, who, audit, concurrency |
  | [database-erd.md](docs/database-erd.md), [data-dictionary.md](docs/data-dictionary.md), [database-design.md](docs/database-design.md), [database-schema-reference.md](docs/database-schema-reference.md) | Relationships, field sensitivity and validation, design and migrations, generated column reference |
  | [security.md](docs/security.md) | Authentication, authorization, data and file security, remaining risks |
  | [testing-strategy.md](docs/testing-strategy.md) | Test layers and the actual results |
  | [deployment-and-operations.md](docs/deployment-and-operations.md) | Setup, migrations, deploy, backup, recovery, monitoring |
  | [known-issues-and-decisions.md](docs/known-issues-and-decisions.md) | Decisions awaiting the owner, limitations, prioritised improvements |
  | [requirements-and-decisions.md](docs/requirements-and-decisions.md), [requirements-audit.md](docs/requirements-audit.md), [assumptions-and-open-questions.md](docs/assumptions-and-open-questions.md) | Decision history and source analysis |

## Getting started

Requires Node.js ≥ 20.19, npm and (for end-to-end tests) Google Chrome.

```bash
npm install                  # also generates the Prisma client (postinstall)
cp .env.example .env.local   # fill in real values — never commit .env.local
npm run db:migrate:deploy    # apply migrations (safe; never resets data)
npm run db:seed              # global master data (constitutions, natures of business, classifications, compliances)
npm run dev                  # http://localhost:3000
```

Open `/register/firm` to register the firm (owner login + business registration); this page closes once the firm exists. The firm's departments, 13 services and 17 work types are created automatically from the master data pack. Then add employees under **Employees → Add employee**: each gets a login ID and a one-time setup link to choose their own password. Businesses register themselves at `/register` and are activated from **Clients → Approval queue**.

## Modules (from the handwritten Data Flow Diagram)

| Module | Route | Who |
|---|---|---|
| Public site: Home, Services (+ detail), Pricing, searchable Help Centre | `/`, `/services`, `/services/[slug]`, `/pricing`, `/help` | Everyone |
| Sign in, registration choice, business registration (6-step), quick registration, forgot / reset password, account status | `/login`, `/register`, `/register/business`, `/register/quick`, `/forgot-password`, `/reset-password`, `/account/pending` | Everyone |
| Client portal — requests, shared work, documents, profile, dues | `/client` | Approved clients |
| Dashboards (automatic redirect by role) | `/app/admin`, `/app/manager`, `/app/senior`, `/app/workspace` | By role |
| ① Staff onboarding — admin creates ID & password, employee fills details, admin approves | `/app/employees`, `/app/onboarding` | Admin / employee |
| ② Client onboarding — quick registration → approval; GSTINs, contacts, constitution representatives, services, documents | `/app/clients` | Admin, manager (team members: their clients) |
| ③A Team allocation — availability board, conflicts, change history | `/app/allocations` | Leads (team members: their own) |
| ③B Task management — list & calendar, maker/checker, remarks, attachments, reminders; no delete for team members | `/app/tasks` | Everyone (scoped) |
| Attendance — mark in/out with location & photo, team view, corrections, leave | `/app/attendance` | Everyone / leads |
| ④ Timesheet — Daily (10A), Communication (10B), Collective; entry detail with review / return / correction history | `/app/timesheet`, `/app/timesheet/[id]` | Everyone / leads |
| Day report (11) with manager review remarks; Pending tracker 12A / 12B | `/app/day-reports`, `/app/pending` | Everyone |
| ⑤ Client report (13A, hours by day, drill-down, print, client-facing CSV) + client pending report / dues (13B) | `/app/reports/clients` | Admin, manager |
| Client observations register; fees & dues overview | `/app/observations`, `/app/dues` | Leads / managers |
| My profile (name, password); notifications | `/app/profile`, `/app/notifications` | Everyone |
| Services & departments, compliance calendar, settings (policy, certificate, lists & preferences, roles, audit log) | `/app/services`, `/app/compliances`, `/app/settings` | Admin |

## Scripts

| Script | Purpose |
|---|---|
| `dev` / `build` / `start` | Development server / production build / production server |
| `lint`, `typecheck`, `test` | ESLint · route types + `tsc --noEmit` · unit tests (Vitest) |
| `verify` | Prisma validate + typecheck + lint + unit tests |
| `test:e2e` | Playwright end-to-end walk-through in installed Chrome against the configured database (builds must exist: run `npm run build` first) |
| `test:e2e:cleanup` | Delete only the e2e test organizations (owner email ending `@e2e.invalid`) |
| `db:migrate:dev` / `db:migrate:deploy` / `db:migrate:status` / `db:drift` | Migrations (never `reset` or `db push` on the shared database) |
| `db:seed` / `db:check` / `db:studio` | Idempotent master-data seed · connectivity check · Prisma Studio |
| `docs:schema` | Regenerate `docs/database-schema-reference.md` from the live database |
| `storage:check` / `storage:setup` | Verify S3 access / create the `ss-dimri/` folder |

## Project layout

```
prisma/              schema, migrations (source of truth), seed, data/ssda-master-data.json
src/app/(public)/    public website and authentication pages
src/app/app/         internal portal (one folder per module; actions.ts = server actions)
src/app/api/         Better Auth endpoints, authorized file downloads, health check
src/components/      design-system primitives, forms, calendar
src/lib/domain/      pure business rules (task & client state machines, attendance policy, allocation conflicts) — unit-tested
src/lib/services/    database operations per module (scoping, transactions, audit, notifications)
src/lib/             auth, session/authorization, permissions, env, encryption, S3, dates
tests/               unit tests (Vitest) and end-to-end tests (Playwright)
```

## Deployment

See [docs/deployment-and-operations.md](docs/deployment-and-operations.md) (environment variables, migration-only release steps, health check, backups).

## Security notes

- Server-side authorization on every page and action ([permission matrix](docs/role-permission-matrix.md)); data is always scoped to the signed-in user's organization.
- Passwords hashed by Better Auth; sign-in is rate-limited; sessions expire after 12 hours.
- Aadhaar and bank account numbers are AES-256-GCM encrypted (`DATA_ENCRYPTION_KEY` — back it up).
- Uploads are type-checked by content, limited to 10 MB, stored privately in S3 and served through short-lived signed links after a permission check.
- Approvals, corrections, reviews, exports and other sensitive changes are written to the audit log.
- Content-Security-Policy and other security headers on every response; stored notification links and sign-in `next` targets are restricted to same-site app paths.
- CSV exports neutralise spreadsheet formulas and leave out internal remarks.
