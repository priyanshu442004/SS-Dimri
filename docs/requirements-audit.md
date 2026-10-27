# SS Dimri & Associates — Requirements Audit

Sources reviewed for the application build (October 2026). Every reference supplied was accessed; nothing was skipped.

## 1. Reference inventory

| # | Reference (Google Drive) | What it is | Kind of content | Influences |
|---|---|---|---|---|
| 1 | Doc `1s17msV0…` | **Offer letter template** (merge fields: candidate, designation, department, joining date, place of posting, reporting to, monthly salary, probation period, acceptance date) | HR template + firm letterhead | Employee onboarding fields (designation, department, reporting, probation, salary); document type `OFFER_LETTER`; firm contact details |
| 2 | Doc `1wyeli0w…` | **Memo formats**: A general, B late arrival/attendance, C show-cause | HR templates | `employee_memos` (memo number, category LATE_ATTENDANCE / SHOW_CAUSE / GENERAL, action required, reply-by date); confirms attendance rules |
| 3 | Doc `15kh5Kcz…` | **Leave & Timing Policy — older version** (overtime **slabs**: <2.5 h actual, >2.5 h = ½ day, >5 h = 1 day; OT from 6:46 PM) | Business rules | Attendance policy engine (SLABS mode) |
| 4 | Doc `1pLJUUdr…` | **Leave & Timing Policy — newer version** (overtime on **actual minutes**, required hours table, short-day offset, OT days = minutes ÷ 540, Sunday earned-leave rules) | Business rules | Attendance policy engine (ACTUAL_MINUTES mode, default) |
| 5 | Sheet `1fXW94yV…` | **ERP Master Data Pack — newer version** (12 sheets) | Master data, sample/historical data, rules | Services, departments, compliances, client classification, nature of business, firm details, policy rules (with "current practice" differences), staff list, document checklist, client list |
| 6 | Sheet `1Yn2HWOI…` | **ERP Master Data Pack — earlier version** | Same as #5, older | Identical to #5 except: policy sheet uses the slab overtime rules; single appointment-letter template. **#5 is treated as current.** |
| 7 | Doc `1cUlX6sT…` | **Appointment letter — trainee** | HR template | `employment_type = TRAINEE`; stipend, mentor, training period |
| 8 | Doc `1uB5o_7C…` | **Appointment letter — employee** (Schedule I compensation: basic, HRA, medical, conveyance, incentive, PF, ESI, gross) | HR template | Salary records; casual/sick leave entitlement; "not less than 9 hours each day" |
| 9 | Doc `15vGgy4J…` | **Appointment letter — employee** (titled "– EMPLOYEE") | HR template | **Duplicate of #8** apart from the title |
| — | Handwritten notes (prior brief) | Database tables, forms | Specification | Database schema (see requirements-traceability.md) |
| — | Handwritten **Data Flow Diagram** (2 pages, this round) | Public pages, account creation flow, modules ①–⑤ and role visibility | Functional specification | Routes, roles, permissions, dashboards |

The master data pack explicitly says it was "prepared for the ERP software developer"; its yellow (to-fill) and orange (policy vs practice differs) cells are treated as open items, not decisions.

## 2. Requirements extracted from the Data Flow Diagram

| DFD element | Implemented as |
|---|---|
| Public: Home (client management, task tracker) | `/` — firm introduction, services by department, portal modules |
| Public: Services offered (attendance module, task management) | `/services` (professional services) + "practice portal" section on home (application modules) — kept **separate**, as requested |
| Public: Pricing page | `/pricing` — billing bases only; **no prices invented** |
| Public: Help centre | `/help` — FAQ + verified contact |
| Sign in / Create account | `/sign-in` (login ID or email), `/create-account` |
| Create account (Owner / Admin portal) → Business registration form ① | Owner account + organization registration in one transaction; owner lands on `/app/admin` |
| Define no. of employees; create ID & pass along with name & designation (role) | `/app/employees/new`: login ID, generated temporary password (shown once), designation **and** a separate system role; licence limit enforced |
| Employee fills all details, then admin approves (staff onboard module ①) | `/app/onboarding` (self-service, documents, submit) → `/app/employees/[id]` approve / review / reject; other modules locked until approved |
| Client registration / quick registration (client onboard module ②) | `/app/clients/new` (quick) → PENDING_APPROVAL → admin approval; full registration tabs |
| ③ (A) Team allocation & (B) Task management: shown to admin, manager, senior; team member employee-wise; calendar view for all | `/app/allocations` (availability board, change history; staff see their own), `/app/tasks` (list + calendar; staff see their own) |
| Team member can update status of task and fill remark; **do not have delete rights** | Task state machine; staff actions limited to start / hold / submit + remarks; no delete anywhere; cancel = managers/admins only |
| Attendance module: admin/manager/senior collectively; team member individually only for marking | `/app/attendance` tabs: My attendance (all), Team attendance (leads), corrections (admins) |
| ④ Time sheet: Daily (A) table / Collectively (B) table; all data to admin; managers/senior review, create task, update status; rest fill timesheet only | `/app/timesheet`: Daily (10A), Communication (10B), Collective team view with review (leads) |
| Module tables day-wise: Day report, Pending tracker, Client pending report; collective: Tracker & Pending tracker & Dashboard ("shared doc") | `/app/day-reports`, `/app/pending` (12A/12B), client pending report (13B) inside client report; dashboards per role |
| ⑤ Client report → admin & manager | `/app/reports/clients` — capability `reports.client` = Owner/Admin/Manager only |

## 3. Requirements extracted from the master data pack (#5)

- **Services (sheet 1):** 13 services (10 "Given", 3 "Suggested") with department, scope, frequency, deliverable, suggested billing basis; 17 accounts-outsourcing **work types** (WT-01…17) "from your Team Daily Work Log" → timesheet "Type of work" dropdown.
- **Departments (sheet 2):** 7 given + 3 suggested.
- **Compliances (sheet 3):** 54 compliance items (GST, TDS, Income Tax, ROC, ESI, EPF, MSME) with due dates as of Oct 2026 → `/app/compliances` reference page, with a warning to verify each year.
- **Client basis (sheet 4):** classification masters A–G. A = constitution (11 values, extends the 5 handwritten types); B GST status; C billing basis; D place of work (matches the daily work log); E turnover; F client status; G priority.
- **Firm details (sheet 5):** used for the public website and footer (address, phone, email, website, office timings, landmark, maps link). Bank account and proprietor personal data were **not** published.
- **Nature of business (sheet 6):** 29 types, primary + secondary per client.
- **Leave policy rules (sheet 7):** rule IDs LT-01…13, OT-01…07, LV-01…07, AL-01…04 with "current practice" differences.
- **Staff details (sheet 11) & document checklist (11a):** 30 staff with codes SSDA-001…030, joining dates, salaries, salary mode, reporting lines; one fully-filled sample. The checklist defines the onboarding documents (PAN, Aadhaar, photos, 10th/12th/degree, previous employer letters, salary slips, offer/appointment letters, policy acknowledgement, joining form, cancelled cheque, UAN, ESI IP).
- **Client details (sheet 12):** 38 clients compiled from WhatsApp check-ins (short names, visit counts, team visiting; legal names etc. blank).

## 4. How the files influenced the build

| Area | Decision |
|---|---|
| Database | Migration 2 added: business natures, classification options + per-client classification, client contacts, work types, compliance items, attendance policy, attendance corrections, task reviews, follow-ups, notifications; new enum values (SENIOR role, ON_HOLD client status, 6 more constitutions, task statuses ASSIGNED / PENDING_REVIEW / CHANGES_REQUESTED, pending IN_PROGRESS / AWAITING_RESPONSE, employee document types from the checklist, memo categories). All additive. |
| Seed | Global masters (11 constitutions, 29 natures, 23 classification options, 54 compliances) are seeded idempotently from `prisma/data/ssda-master-data.json`; per-organization masters (10 departments, 13 services, 17 work types, designations, policy defaults) are created when an organization registers. |
| Validation | PAN / GSTIN / TAN patterns tested against the firm's own identifiers. |
| UI | Public services page lists only "Given" services; "Suggested" items are flagged in admin and can be confirmed. |
| Staff & client lists (sheets 11, 12) | **Not imported automatically.** They contain personal and salary data and many blank columns; importing them should be a deliberate step by the firm after go-live (see open questions Q-A9). |

## 5. Conflicts and contradictions (not silently resolved)

| # | Conflict | Sources | Handling |
|---|---|---|---|
| C1 | **Overtime:** slabs (<2.5 h actual, >2.5 h ½ day, >5 h 1 day, from 6:46 PM) vs actual minutes beyond required hours with no slabs | #3 vs #4; sheet 7 of #6 vs #5 | Both implemented in `src/lib/domain/attendance-policy.ts`; organization setting `overtime_mode` (default ACTUAL_MINUTES = newer). Figures are labelled **indicative** and never turned into pay. |
| C2 | **Required hours:** 9 h normal / 8 h 30 m far-client 1st–15th / 8 h 30 m for named staff (newer) vs "onsite staff must justify 8 hours" (both) | #4, #5 sheet 7 (LT-11 vs Sep-26 practice) | Configurable per employee `attendance_profile` (STANDARD 9 h, ONSITE 8 h, FAR_CLIENT 8 h 30 m on days 1–15, REDUCED_HOURS 8 h 30 m). |
| C3 | **Sunday:** "earned leave by attending during the week" and ">3 leave days in a week makes Sunday leave" appear only in the newer version | #3 vs #4 | Not applied by any calculation. Recorded for confirmation. |
| C4 | **Monthly leave vs appointment letter:** 1 leave/month with intimation (policy) vs `{Casual_Leave}` + `{Sick_Leave}` days (AL-01/02: "1 day") | #4 vs #8 | `paid_leaves_per_month` setting (default 1) and leave types CASUAL/SICK; no balance arithmetic until confirmed. |
| C5 | **No-leave bonus:** policy +2 days vs Sep-26 sheet also +1 day when leave is taken | #5 sheet 7 LV-02 | Not calculated (payroll out of scope). |
| C6 | **Late penalty** (2 lates = ½ day) "not applied in Sep-26 salary sheet" | #5 LT-04 | Calculated as an indicative flag only. |
| C7 | **OT days rounding:** Sep-26 sheet rounds OT days, policy says actual | #5 OT-04 | No rounding (2 decimals shown), indicative only. |
| C8 | **Constitution list:** 5 types in handwritten notes vs 11 in the master data | Notes vs #5 sheet 4 | Superset used; the five handwritten types keep their original identifiers. |
| C9 | **Client status:** approval lifecycle (notes) vs Active / On hold / Discontinued / Prospect (sheet 4 F) | Notes vs #5 | Lifecycle PENDING_APPROVAL → ACTIVE → ON_HOLD → INACTIVE ("Discontinued"); "Prospect" not modelled (see Q-A4). |
| C10 | **Public site purpose:** DFD lists app modules (client management, task tracker, attendance) on the public home/services pages; the brief asks for a firm website with professional services | DFD vs brief | Both: professional services on `/services`; portal modules described separately on the home page. |
| C11 | **Designation = role?** DFD: "Designation (Role)"; brief: designation must not grant privileges | DFD vs brief | Separate fields: designation (job title) and system role (permissions), both set when the login is created. |
| C12 | Appointment letters #8 and #9 | Duplicate | Treated as one template. |
| C13 | Sheet 6 vs sheet 5 | Older vs newer | Sheet 5 used. |

## 6. Decisions taken (engineering, reversible)

- **Logins by ID:** staff sign in with an admin-issued login ID (Better Auth username plugin); email optional. First sign-in forces a password change. Password recovery is admin-issued (no email provider configured) — see Q-A6.
- **Roles:** Owner, Administrator, Manager, Senior, Team member. Matrix in [role-permission-matrix.md](role-permission-matrix.md).
- **Approval gate:** staff without approved onboarding can only see their onboarding page.
- **Team members see only their own** tasks, allocations, clients they work on, attendance, timesheets and pending items.
- **Client portal not built:** the DFD has no client login and the references do not describe client-facing functions. All client data stays internal.
- **WhatsApp:** stored as text on timesheet entries; no messaging integration (no provider or authorisation supplied). Reminders and notifications are in-app.
- **Payroll:** no salary, deduction or overtime pay calculation anywhere.
- **Uploads** go through the server (10 MB, type detected from file content) into the private `ss-dimri/` S3 prefix; downloads use 5-minute signed links after an authorization check.
- **Forms:** server actions with Zod validation on the server and inline error display (React `useActionState`) instead of React Hook Form — fewer client-side dependencies, same validation rules for every caller.

## 7. Outstanding questions for the firm

(In addition to Q-1…Q-31 in [assumptions-and-open-questions.md](assumptions-and-open-questions.md).)

| # | Question |
|---|---|
| Q-A1 | Which Leave & Timing Policy version applies (overtime slabs vs actual minutes; Sunday rules)? |
| Q-A2 | Should the ERP ever compute salary days / deductions, or only report attendance? |
| Q-A3 | Confirm the three "Suggested" services (ROC/MCA, ESI & EPF, MSME) and three suggested departments. |
| Q-A4 | Is "Prospect / Lead" a client status the ERP should track before quick registration? |
| Q-A5 | Should clients get their own login (client portal)? If yes, which information may they see? |
| Q-A6 | Email provider for password reset and notifications (or keep admin-issued passwords)? |
| Q-A7 | Is WhatsApp integration wanted (requires an authorised WhatsApp Business provider)? |
| Q-A8 | Who approves planned leave — the senior, the reporting manager, or the administrator? |
| Q-A9 | Should the 30 staff and 38 clients from the master data pack be imported, and who verifies the blank fields first? |
| Q-A10 | Firm logo and brand colours (none supplied — the current identity is an interim, centrally replaceable design). |
| Q-A11 | Office opening after hours and late sitting (after 6:45 PM) need team-lead permission — should this be an approval workflow in the ERP? |
