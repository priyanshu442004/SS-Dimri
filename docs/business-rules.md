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
| R7 | Maker/checker: a named checker approves, and one person may hold both jobs when deputed alone (client feedback, 5 Nov 2026). With no checker named, a maker cannot approve their own work | `canPerform` (unit-tested) |
| R8 | No task deletion by team members (cancel keeps history) | No delete action exists for anyone |
| R9 | Pending items are either *with the client* or *with a team member* | `pending_items.pending_with` enum |
| R10 | Client report built from source records; dues listed separately (13A/13B) | `buildClientReport` |
| R11 | Every query is limited to the signed-in user's organization; clients see only their own business | `getContext`, `*Scope()` helpers |
| R12 | Businesses (clients) awaiting approval: 7-day access, then locked until approved (details below) | `approval-access.ts`, `session.ts`, `AccessWatcher` |
| R13 | Staff: invited by email, set own password, submit details, no access until approved (see below) | `employees.ts`, `mailer.ts`, `/account/set-password` |

**Access while awaiting approval (owner decision, 26 Oct 2026; staff part superseded on 27 Oct — see R13).** A business awaiting registration approval may use the account for a grace period of **7 days** (configurable, Settings → Lists & preferences, 0–90; 0 = no access until approved), counted **exactly 7 × 24 hours from account creation** (staff: when the administrator created the login; business: when the registration record was created; resubmission does not restart it). During the period staff have their role's full access and clients the full portal; a banner shows the exact end time. When it ends: access stops on the server for every page, action, file download and export, and any open page signs the user out within a few seconds of the deadline (and within 30 seconds of a rejection or a disabled login). Signing in afterwards shows the reason: staff see only their onboarding page, clients their registration status. Approval restores full access at once; rejection removes access at once (no grace). Owners and administrators are never locked.

## 1a. Leave, Timing and Office Decorum Rules (client PDF, 14 Nov 2026) — confirmed

How each point is applied. The calculation is one pure module (`lib/domain/attendance-policy.ts`, `lib/domain/daily-plan.ts`, tested in `tests/office-rules.test.ts`) used by My attendance, Team attendance, Payroll and the exports, so they always agree.

| Rule | Applied as |
|---|---|
| 1 Daily attendance, system-driven | Mark in/out only by the person (or a colleague with a photo); no correction form, no single-day deletion |
| 1 Map location | Required: the button refuses without it and explains how to allow it; the server refuses too (also for a colleague's mark) |
| 1 Not marked at salary time | Not marked = absent; with no leave request it counts double (rule 10) |
| 1 / 11 Philosophy and declaration | `/app/rules` shows the rules with live values; each person accepts once, and again after a policy change; Settings shows who has not |
| 2 Check-in/out | Time stamp, map location and work location (office name from Settings / Client office / Client visit, with the client) |
| 2 Morning plan by 10:30 | Client, task, expected completion; late plans shown as late; the Team Lead approves or edits (the person is notified; a changed plan goes back for approval) |
| 2 EOD report = timesheet | Every line Done / Pending / Carried forward; a reason required for each one not done; new work added; Pending and Carried forward lines start the next plan as old work |
| 2 Missed EOD / fines | Fileable until the next working day's reporting time; after that ₹100 (Settings). If it is still missing at the end of that day and the Team Lead did not escalate, ₹200 to the first person the employee reports to. Deducted in Payroll |
| 2 Auto-flags | After 10:30: people at work without a plan → them and their Team Lead. After the EOD deadline: the person and the Team Lead ("escalate today") |
| 2 / 3 Late or absent intimation | Form with reason and expected arrival; "can't come today" raises a same-day leave request |
| 3 12:00 Absent | The scheduled call marks everyone the rules apply to (not the owner), not in and not on leave, Absent; marking in after the cut-off is refused. Approved leave later still counts as leave in payroll |
| 4 Team Lead reporting | Plan and EOD go to the Team Lead (notified on submit); Team plans & EOD view |
| 5 Timings / client site | Office 9:30–18:30, grace 9:45. Client-site staff: the Team Lead fixes the reporting time; the day is 8 h from it and grace, half-day, overtime and absent times move with it (absent never before 12:00). The schedule is stored on each day |
| 6 Late | ≤ 15 min grace; 15 min–1 h on 3 days = ½ day (every 3); > 1 h = ½ day each; the first late arrival a month informed before the reporting time (and not marked "not genuine") is excused; ½ day = half a day's salary |
| 7 Lunch | 1:00–1:30, 30 min; the Team Lead may move it for today; longer lunches are flagged |
| 8 Leaving early / staying late | Leaving before 17:30 = ½ day (even with permission); before 18:30 without permission is flagged; staying after 18:45 needs a prior overtime request (task + why it can't wait), asked before 18:45; the Team Lead is notified of anyone still in without approval |
| 9 Overtime | Real minutes after 18:45 to the time out, approved requests only; paid at the day rate × minutes ÷ "overtime minutes paid as one day" (Settings, 540) |
| 10 Leave | ERP only. With intimation = asked before the reporting time of the first day (worked out, not ticked). 1 a month paid; more is unpaid. No request = double absent (a pending or rejected request = single). Planned leave must be asked 15 days ahead (refused otherwise). Sundays and office holidays with a full day away on both sides count as leave. No leave, absence or half day in a complete month (employed all month) = +2 days' salary |

Who the rules apply to: approved staff except the owner. Morning plan, EOD and their fines apply to those who use the timesheet module (not support staff limited to attendance and payroll).

## 1b. Requirements tracker, 14 Nov 2026 — confirmed

- **Office holidays from the firm's list.** Settings → Leave & timing policy → *Upload the holiday list* reads the "List of Holiday" Excel (sheet *ERP Import*: Date | Holiday Name | Day | Year | Holiday Type | Remark; the older CSV layout also works). From the chosen *applies from* date the uploaded list **replaces** the holidays; earlier dates keep the old list, so past attendance and salary never change. Sundays in the list are not stored (always off); two holidays on one day become one entry; half-day holidays are refused. Attendance, auto-absent, leave (Sunday/holiday inside a leave), plans/EOD and payroll all read this one list. Everyone sees the year's holidays on *Office rules*.
- **Timesheet clients.** A person's own Daily Log, morning plan and mark-in suggestions offer only the clients allocated to them on that date (plus clients of their open tasks and tracker work), and **Office / Other**. The server refuses another client. Owner and administrators see all clients. Pickers for new tasks and pending items show the clients the person can see in *Clients*.
- **Company-wise tasks.** The Daily Log lists "My clients" with each client's open tasks, *+ Add task* (client pre-filled) and *Log time*.
- **Task time → timesheet.** When a team member submits a task for review, the time from each *Start / resume work* to the next status change is added to their timesheet (one entry per session per day; a session left open overnight stops at office end and resumes at office start; Sundays in between are skipped). Only time since the previous submission counts.
- **Correcting an assigned task.** The creator (and administrators) may edit title, client, priority, timeline, details and remarks until the work is started (status Pending/Assigned, maker not started). The assignees are notified; the history notes what changed.
- **Several clients on one task.** Choosing several clients when creating a task creates one task per client with the same details, people, reminders and attachments.
- **Team Lead attendance.** *My team* (people who report to me) and *All attendance* (with the "see team attendance" right). Export follows the tab.
- **Ex-Employee.** *Resigned or terminated?* on the employee page: reason, last working day, note. Sign-in is disabled, client allocations end on the last working day (future ones are cancelled), the person moves to the *Ex-employees* tab. History stays. *Bring back as active* undoes it.
- **Client registration.** Contact person is mandatory in quick registration. Documents can be attached in quick and full registration; every file is checked (type, 10 MB each, 11 MB together) before the client is created, so a bad file never leaves a half-registered client. The full registration also takes State, Date of birth / incorporation, IT file no., GST / Income Tax / TRACES logins (passwords encrypted) and Remark (SSDA Client Master).
- **Client services.** Each service on a client can be edited (service, fee, dates, contact) and a completed or cancelled one made active again.

## 2. Configurable values (Settings)

| Value | Default | Status | Setting |
|---|---|---|---|
| Probation days | 7 | Confirmed default (R5) | Organization |
| Licensed user limit, access mode | 1 / single-user | Configurable | Organization |
| Office name, start / grace / lunch / end / overtime after | Office / 09:30 / 09:45 / 13:00–13:30 / 18:30 / 18:45 | **Confirmed** (rules 5, 7, 9) | Leave & timing policy |
| Half day if leaving before; absent if not in by; morning plan by | 17:30; 12:00; 10:30 | **Confirmed** (rules 8, 3, 2) | Policy |
| Client-site day | 480 minutes from the reporting time the Team Lead fixes | **Confirmed** (rule 5) | Policy |
| Late days per half day; late by more than = half day; late arrivals excused a month | 3; 60 min; 1 | **Confirmed** (rule 6) | Policy |
| Overtime | Actual minutes after 18:45, approved only; paid at day rate × minutes ÷ 540 | **Confirmed** (rule 9); the pay rate is a working assumption | Policy |
| Paid leaves per month; planned-leave notice; no-leave bonus; days for an absence without a request | 1; 15 days; 2 days; 2 | **Confirmed** (rule 10) | Policy |
| EOD fine; Team Lead fine | ₹100; ₹200 | **Confirmed** (rule 2) | Policy |
| Office holidays | none | Not working days; inside a continuous leave they count as leave | Policy → Office holidays |
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
| P6 | Attendance without location | **Superseded (rule 1):** not accepted; the person is told how to allow location. Photo optional | — |
| P7 | Late arrival | Superseded by the confirmed office rules (section 1a) | — |
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
