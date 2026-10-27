# Business Rules

Three kinds of rule, kept apart so nothing unconfirmed is presented as policy:

- **Confirmed**: stated by the firm (handwritten notes, DFD, specifications). Enforced in code and, where possible, by the database.
- **Configurable**: the firm can change the value in Settings without a code change. Defaults are provisional unless marked confirmed.
- **Provisional / unresolved**: an interpretation made so the software can work. Reversible. Each one is listed for confirmation in [known-issues-and-decisions.md](known-issues-and-decisions.md).

Sources: the handwritten notes and DFD, the nine Google Drive references ([requirements-audit.md](requirements-audit.md) §1), and the four specifications. See also [requirements-and-decisions.md](requirements-and-decisions.md) (decisions D1–D37, unresolved items U1–U11) and [assumptions-and-open-questions.md](assumptions-and-open-questions.md) (Q-1…).

## 1. Confirmed rules

| # | Rule | Where enforced |
|---|---|---|
| R1 | One certificate per organization | `organization_certificates.organization_id` UNIQUE |
| R2 | One client may have several GSTINs; the GSTIN registration row stores only the GSTIN | `client_gst_registrations` (id, client_id, gstin); format check; duplicate check per organization |
| R3 | Quick registration creates a pending record; only an authorized administrator activates it, on the same record | Client state machine; `clients.approve` |
| R4 | Constitution types: Proprietor, Firm, Company, Trust, HUF, each with its representative role (proprietor, partner, director, trustee, karta) | `constitutions` master; `constitution_members.role` validated against the constitution |
| R5 | Seven days = trial/probation for a new employee | `organizations.default_probation_days` (default 7), copied per employee; editable |
| R6 | Staff get their ID from the administrator; temporary ID until approval, then a permanent ID | Onboarding state machine; unique `permanent_employee_code` |
| R7 | Maker/checker: a maker never approves their own work | `canPerform` (unit-tested) |
| R8 | No task deletion by team members (cancel keeps history) | No delete action exists for anyone |
| R9 | Pending items are either *with the client* or *with a team member* | `pending_items.pending_with` enum |
| R10 | Client report built from source records; dues listed separately (13A/13B) | `buildClientReport` |
| R11 | Every query is limited to the signed-in user's organization; clients see only their own business | `getContext`, `*Scope()` helpers |
| R12 | Businesses (clients) awaiting approval: 7-day access, then locked until approved (details below) | `approval-access.ts`, `session.ts`, `AccessWatcher` |
| R13 | Staff: invited by email, set own password, submit details, no access until approved (see below) | `employees.ts`, `mailer.ts`, `/account/set-password` |

**Access while awaiting approval (owner decision, 26 Oct 2026; staff part superseded on 27 Oct — see R13).** A business awaiting registration approval may use the account for a grace period of **7 days** (configurable, Settings → Lists & preferences, 0–90; 0 = no access until approved), counted **exactly 7 × 24 hours from account creation** (staff: when the administrator created the login; business: when the registration record was created; resubmission does not restart it). During the period staff have their role's full access and clients the full portal; a banner shows the exact end time. When it ends: access stops on the server for every page, action, file download and export, and any open page signs the user out within a few seconds of the deadline (and within 30 seconds of a rejection or a disabled login). Signing in afterwards shows the reason: staff see only their onboarding page, clients their registration status. Approval restores full access at once; rejection removes access at once (no grace). Owners and administrators are never locked.

## 2. Configurable values (Settings)

| Value | Default | Status | Setting |
|---|---|---|---|
| Probation days | 7 | Confirmed default (R5) | Organization |
| Licensed user limit, access mode | 1 / single-user | Configurable | Organization |
| Office start / grace / lunch / end / leaving grace | 09:30 / 09:45 / 13:00–13:30 / 18:30 / 18:45 | Provisional (two policy versions) | Leave & timing policy |
| Half day if leaving before | 17:30 | Provisional | Policy |
| Required minutes: standard / on-site / reduced / far client (early month, until day) | 540 / 480 / 510 / 510 (day 15) | Provisional | Policy |
| Late arrivals per half day; late grace per month | 2; 1 | Provisional | Policy |
| Overtime mode | Actual minutes (alternative: 2.5 h / 5 h slabs) | **Unresolved**: the two policy documents differ | Policy |
| Paid leaves per month; planned-leave notice days | 1; 15 | Provisional | Policy |
| Policy confirmed flag | false | While false, attendance figures are labelled indicative and have no payroll effect | Policy |
| Access while awaiting approval | 7 days | **Confirmed** by the owner (R12) | Lists & preferences |
| Pending-days basis | Calendar days (alternative: business days, Sundays excluded; no holiday calendar) | Provisional | Lists & preferences |
| Designations (with seniority), timesheet work types | Seeded from the master data | Configurable; deactivation keeps history | Lists & preferences |
| Departments, service catalogue, public visibility | From the master data | Configurable | Services & departments |
| Timezone | Asia/Kolkata | Fixed (shown read-only) | — |
| Sign-in attempts per minute per IP | 5 | Configurable via environment | `AUTH_SIGNIN_LIMIT_PER_MINUTE` |

## 3. Provisional rules (working defaults awaiting confirmation)

| # | Topic | Working rule | Why it matters |
|---|---|---|---|
| P1 | Seven-day trial vs one-month expiry | Two different durations are kept separate. **7 days** = employee probation (R5). **One month** = the handwritten note on a *one-time assignment / retainer expiry*; it is **not enforced** and no expiry date is calculated, because it is unclear whether it applies to the client or to each engagement (Q-2). | Prevents silently merging two rules |
| P2 | One-time vs retainer | Optional on the client (`nature_of_client`) and per engagement (`engagement_nature`). It stays "not specified" until a user sets it; the pending state ends when a user with `clients.edit` records the classification. No billing or renewal behaviour depends on it. | Avoids inventing billing rules |
| P3 | Quick-registration mandatory fields | Trade name, contact person, mobile, email, password, consent; everything else is completed after approval by staff | D3 |
| P4 | Duplicate detection | Email unique per login; GSTIN unique per organization; PAN checked on staff registration. A repeated submission with the same email is refused with a generic message | Safe retries; no enumeration |
| P5 | Rejection | A reason is required; the record is kept. Clients: staff resubmit after correction. Employees: they correct and resubmit themselves | Self-service correction for clients is unconfirmed (K-3) |
| P6 | Attendance without location | Allowed; the missing location is recorded as missing. Photo optional | Location permission may be refused |
| P7 | Late arrival | After the grace time, the late flag is set and a reason requested; half-day conversion follows the policy counts (indicative) | Policy unconfirmed |
| P8 | Timesheet entries without a task | Allowed (the client name may even be free text). A task or allocation link is optional | The handwritten 10A has no task column |
| P9 | Hours in reports | *Recorded* = all entries dated in the period; *reviewed* = entries marked reviewed. Committed work is listed separately | Avoids presenting unreviewed work as approved |
| P10 | Observation statuses | OPEN → IN_PROGRESS → RESOLVED → CLOSED, reopenable | Not specified by the firm |
| P11 | Fees and dues | Agreed fee per engagement (informational) and manually recorded dues. No tax, invoice or payment logic; a fee amount never implies payment | U3 |
| P12 | Deactivated staff | Login disabled and sessions ended; open tasks and allocations remain assigned until a lead changes them | Reassignment policy unconfirmed (K-7) |
| P13 | Retention | Nothing is purged; soft states (cancelled, ended, discontinued, disabled) keep history | U10 |
| P14 | Unclear handwritten labels | Kept verbatim in `source_wording` or the open-question list; no meaning invented (e.g. "Frontend/Extended", "ESF Number" → ESI number per explicit instruction) | Q-3, D22 |

## 4. Derived values (never stored, one calculation each)

| Value | Definition | Code |
|---|---|---|
| Overdue task | `due_at` < now and status not COMPLETED/CANCELLED | `isTaskOverdue` |
| Days pending | From `requested_on` to `closed_at` (or today in IST); calendar or business days per setting | `daysPending` |
| Work hours | Time out − time in − lunch overlap; missing time out → no hours, flagged | `workHours`, `evaluateDay` |
| Availability | Sum of active allocation % per member per day | `availabilityOn`, `findConflicts` |
| Outstanding dues | Sum of OPEN dues | client report and dues overview |

## Staff invitation and approval (owner decision, 27 Oct 2026; supersedes the 7-day staff grace period)

1. An administrator invites a staff member with **name, email, mobile and role** only.
2. An email (SMTP) is sent with their email, a **temporary password valid 7 days** and the sign-in link. The temporary password is never shown in the app or stored in clear text.
3. Signing in with it opens **Set your password**; no other page or action works until it is replaced. Signing out and back in with the temporary password lands there again. After the change the temporary password stops working.
4. They then see only **Complete your details**. Mobile, PAN, Aadhaar and current address are required to submit (provisional minimum); documents are optional.
5. After submitting they see **"Your details are under review"** on every sign-in and every page until a decision.
6. The administrator **approves** (with a permanent employee ID), **holds** (optional note) or **rejects** (reason required). Each decision is emailed; the open page of the staff member updates by itself. A rejected person corrects and resubmits; a held person keeps waiting.
7. The approval email contains the sign-in link and their email, **never a password**.
8. Expired temporary password: the administrator uses **Resend invitation** (new temporary password; the old one stops working).
9. **Staff get no grace period.** The 7-day grace period applies only to businesses (clients) awaiting approval.
10. Email failures never undo the invitation or decision; every email is logged (sent / failed / not sent to test addresses) and shown on the staff list.
