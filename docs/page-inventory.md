# Page & Workflow Inventory

Every route, who may use it, what it does, and the data and permissions behind it. Route protection is enforced on the server: `requireCapability` / `requireClientContext` for pages and `actionContext` / `clientActionContext` for server actions (see [role-permission-matrix.md](role-permission-matrix.md)). The proxy only redirects visitors without a session cookie.

Roles: **O** Owner · **A** Administrator · **M** Manager · **S** Senior · **T** Team member · **C** Client · **P** Public (signed out).

## 1. Public website

| Route | Roles | Purpose | Data / entities |
|---|---|---|---|
| `/` | P (all) | Firm introduction, services by department, how engagement works, portal modules, FAQ, contact | `services` (confirmed + active), verified firm details |
| `/services` | P | Service catalogue grouped by department | `services`, `departments` (no fees) |
| `/services/[slug]` | P | Service detail, how to request it | `services` |
| `/pricing` | P | Billing bases and quote request — no invented prices | classification master (billing basis) |
| `/help` | P | Searchable FAQ with categories | static, verified answers |
| `/login` | P | Sign in with login ID (staff) or email (client); show/hide password; forgot link | Better Auth (`users`, `accounts`, `sessions`) |
| `/register` | P | Choose: full business registration, quick registration, staff info, firm registration | — |
| `/register/business` | P | Redirects to `/register` (clients are registered by their firm) | — |
| `/register/quick` | P | Redirects to `/register` | — |
| `/register/firm` | P (only until the firm exists) | Owner registers the practice (organization + owner) | `organizations`, master data per organization |
| `/forgot-password` | P | Reset request; identical response for any input; notifies administrators | `notifications` |
| `/reset-password?token=` | P | Set password from a single-use link (setup or reset) | `verifications` (hashed token) |
| `/account/pending` | C (not yet active) | Registration status: inside the 7-day access period (end time, link to portal), access period ended, rejected (reason), inactive | `clients`, `organizations.approval_grace_days` |
| `/api/session/status` | signed-in users | Own access state for live sign-out (no other data) | — |
| `/account/inactive` | signed-in without active access | Disabled account guidance | — |
| 404 / error | all | Not found, unexpected error (no internal details) | — |

## 2. Client portal (`/client`, role C, client status ACTIVE or ON_HOLD)

| Route | Purpose | Data shown (client-safe fields only) |
|---|---|---|
| `/client` | Overview: needed from you, work in progress, awaiting your review, completed, services, assigned team (names), dues | `pending_items` (pending with client, `client_visible`), `tasks` (`client_visible`), `client_services`, `team_allocations`, `client_dues` |
| `/client/requests`, `/client/requests/[id]` | Requests from the firm; reply with text and a document | `pending_items`, `follow_ups` (`client_visible`), `client_documents` |
| `/client/work`, `/client/work/[id]` | Shared work items, client-visible remarks, accept / raise observations | `tasks`, `task_activities` (`client_visible`) |
| `/client/documents` | Documents the client has shared; upload | `client_documents`, `stored_files` |
| `/client/profile` | Registered business details (read-only); own display name and password | `clients`, contacts, representative names (no PAN/Aadhaar), `users.name` |
| `/client/notifications` | Notifications; opening one marks it read (`/api/notifications/[id]`) | `notifications` |

## 3. Internal application (`/app`)

| Route | Roles | Purpose | Key entities |
|---|---|---|---|
| `/app` | O A M S T | Redirect by role (server-side) | — |
| `/app/admin` | O A | Admin dashboard: approvals, overdue, review queue, attendance, timesheet, dues, recent activity | many (counts) |
| `/app/manager` | M (O A) | Review queue, deadlines, workload, day reports, blockers | `tasks`, `day_reports`, `pending_items` |
| `/app/senior` | S | Team (reportees) workload, reviews, own day | same, scoped to reportees |
| `/app/workspace` | T | My tasks, attendance, timesheet, day report, pending, my clients | own records |
| `/app/search` | O A M S T | Global search (clients, tasks, staff) within the user's scope | `clients`, `tasks`, `employees` |
| `/app/notifications` | all staff | In-app notifications; opening one marks it read and follows a validated in-app link | `notifications` |
| `/app/profile` | all staff | My profile: account details (read-only role/status), display name, password | `users`, `organization_memberships`, `sessions` |
| `/app/onboarding` | staff with an employee record | My employee record / onboarding, documents | `employees` + children |
| `/app/clients` | O A M S; T (own clients) | Client directory: search, status tabs, service filter, pagination | `clients` |
| `/app/clients/approvals` | O A | Approval queue with missing-information summary | `clients` |
| `/app/clients/new` | O A M | Staff quick registration | `clients` |
| `/app/clients/[id]` | scoped | Tabs: overview & approval actions, registration details (edit), GSTIN/contacts/representatives, services, documents, portal access, activity | client entities, `audit_logs` |
| `/app/employees`, `/new`, `/[id]` | O A (M S view) | Staff directory, create login (setup link), profile, work summary, approval, role/access, reporting lines, reset link | `employees`, `organization_memberships` |
| `/app/employees/[id]?tab=letters` | O A | Letters & memos: issue an offer letter, appointment letter (employee / trainee) or memo (general, late attendance, show cause) from the firm's Word templates; approve + issue the appointment letter in one step; list with acceptance / acknowledgement status | `employee_letters`, `employee_memos`, `stored_files` |
| `/app/letters/[id]` | the staff member; O A | The issued letter or memo laid out as the template, Word download, print / PDF (`/app/letters/[id]/print`); staff accept a letter or acknowledge a memo (written explanation required for show cause) | `employee_letters`, `employee_memos`, `audit_logs` |
| `/app/allocations`, `/[id]` | O A M (S view; T own) | Availability board, allocations by client, change/end, detail with history, timesheet link | `team_allocations` |
| `/app/tasks` (list / board / calendar), `/new`, `/[id]` | all staff (scoped) | Tasks with maker/checker, waiting states, remarks (internal or client-visible), attachments, reminders, client sharing | `tasks`, `task_*` |
| `/app/attendance` | all staff | My attendance (mark in/out with location/photo), team view (leads), corrections (admins), leave | `attendance_records`, `attendance_corrections`, `leave_requests` |
| `/app/timesheet` | all staff | Staff: daily work log only. Leads: Tracker (every entry, client/member/date filters, bulk review), Pending (entries awaiting review with 24 h / 36 h review window, returned entries, per-member summary), Dashboard (hours by client / member / work type / place, member scorecard, member × client), plus "My daily log" | `timesheet_entries` |
| `/app/timesheet/[id]` | owner; leads | Entry detail: client/task/allocation links, linked follow-ups, review (mark reviewed / return), correction, history with diffs | `timesheet_entries`, `pending_items`, `audit_logs` |
| `/app/day-reports`, `/[id]` | all staff | Day report with prefill, send to managers; detail with review remark, related timesheet entries and tasks, history | `day_reports`, `day_report_recipients`, `timesheet_entries`, `task_activities`, `audit_logs` |
| `/app/pending` | all staff (scoped) | Pending tracker 12A / 12B, responsible person, latest follow-up, task/timesheet links, client visibility, client replies | `pending_items`, `follow_ups` |
| `/app/observations`, `/[id]` | O A M S (all); T (assigned) | Client observation register, log, status changes, reassignment, history | `client_observations`, `follow_ups` |
| `/app/reports/clients`, `/[id]` | O A M | Client report (13A): team hours, hours by day, drill-down links, tasks, pending both sides, fees, commitments; dues (13B); snapshots; print | many; `client_reports`, `client_dues` |
| `/app/reports/clients/[id]/export` | O A M | Client-facing CSV (no internal remarks), audited | as above |
| `/app/dues` | O A M | Fees & dues overview: outstanding, overdue, by client, agreed fees | `client_dues`, `client_services` |
| `/app/services`, `/[id]` | O A | Service catalogue & departments; edit, publish, deactivate | `services`, `departments` |
| `/app/compliances` | all staff | Compliance calendar reference | `compliance_items` |
| `/app/settings` | O A | Organization, certificate, leave & timing policy, lists & preferences (designations, work types, pending-days basis, timezone), roles & permissions, audit log | `organizations`, `attendance_policies`, `designations`, `work_types`, `audit_logs` |

## 4. Key workflows

| Workflow | Steps | Transactions / safeguards |
|---|---|---|
| Firm setup | `/register/firm` → owner + organization + master data → `/app/admin` | One transaction; page closes after the first firm |
| Staff onboarding | Admin creates login → one-time setup link (72 h) → staff sets password → completes onboarding → admin approves (temporary → permanent ID) / review / reject | Licence limit; link single-use and hashed; staff locked to onboarding until approved |
| Client registration (by the firm) | `/app/clients/new` (wizard) or `/app/clients/new/quick` → `PENDING_APPROVAL` → portal login invited from the client's Portal access tab → admin approves in queue → client notified → `/client` | One transaction for records; documents stored after; rate-limited; duplicate GSTIN check |
| Staff-registered client | `/app/clients/new` → pending → approve → optional portal invite (setup link) | — |
| Client approval | Approve / reject (reason) / hold / discontinue / reactivate / resubmit | Optimistic concurrency on status; audit; notifications |
| Client requests | Staff creates pending item "pending with client", shown in portal → client replies (+ document) → staff sees "Client reply" → staff closes | Only `client_visible` items/notes reach the portal |
| Task lifecycle | Create → assign → start → (wait for client / team) → submit → checker approves or requests changes → completed; cancel (managers) / reopen (leads) | State machine; maker cannot approve own work; no delete |
| Client review of work | Lead shares task and requests review → client accepts or raises observations | Client sees only shared tasks and client-visible remarks |
| HR letters & memos | Admin fills the template's fields (pre-filled from the staff record) → .docx generated from the firm's template, stored privately, emailed as an attachment and notified → staff reads it in the portal → accepts (offer acceptance date recorded) / acknowledges or replies → admins (and the memo's issuer) notified | Numbers per financial year (OL/AL/TL/MEMO); another firm gets its own name and letterhead; audit on issue / accept / acknowledge |
| Password reset | `/forgot-password` (generic response) → admin notified → admin issues link → `/reset-password` | Hash-only storage; 2 h expiry; single use; sessions revoked |
| Attendance correction | Admin records/corrects with reason | Original and new values kept in `attendance_corrections` |
| Timesheet review | Leader opens entry → mark reviewed, or return with remark → employee notified → corrects (resubmitted) → leader reviews | Not one's own entry; only submitted entries; optimistic update; audit with diff |
| Day report review | Reporter sends → recipient reads (read time recorded) → marks reviewed with optional remark → reporter notified | Organization-scoped; audit |
| Client observation | Client raises observations in the portal (or a lead logs one) → responsible person works it → resolved (note becomes resolution) → manager closes; reopen allowed | Status transitions validated; every change is a follow-up row + audit |
| Client report export | Manager opens report → print or download client-facing CSV | Same capability; internal remarks excluded; formula-safe CSV; audit |
| Overdue notice | First page load after a task's due time → one notice to assignees, maker and checker | Claimed atomically via `tasks.overdue_notified_at` |
