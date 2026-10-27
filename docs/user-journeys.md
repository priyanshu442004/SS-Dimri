# User Journeys

End-to-end journeys as implemented, with success, failure, rejection and recovery paths. Each step names the route (see [page-inventory.md](page-inventory.md)), the server-side check, and the end-to-end test that exercises it (`tests/e2e/workflow.spec.ts`, "E2E: …"). A journey step without a test reference is implemented but not covered by an automated end-to-end test.

Status per journey uses the five classes from the addendum: **Implemented and tested**, **Implemented but not fully tested**, **Partially implemented**, **Blocked**, **Awaiting business confirmation**.

---

## A. Public visitor → registered business → client portal

**Status: Implemented and tested** (rejected-applicant self-correction: **Awaiting business confirmation**).

```mermaid
flowchart TD
  V[Visitor: / , /services, /pricing, /help] --> R{/register}
  R -->|Quick| Q[/register/quick: required fields only/]
  R -->|Full| W[/register/business: 6-step wizard + review/]
  Q --> VAL{Server validation<br/>Zod + duplicate email / GSTIN}
  W --> VAL
  VAL -->|invalid| ERR[Field errors, input preserved] --> R
  VAL -->|duplicate| DUP[Generic duplicate message] --> R
  VAL -->|ok| P[(client PENDING_APPROVAL<br/>+ CLIENT login)]
  P --> ST[/account/pending: status page/]
  ST --> GR[Days 1-7: portal usable, banner shows the end time]
  GR -->|7 days over, not approved| LK[Signed out live; sign-in shows 'access period ended'; every /client route → status page]
  P --> N1[Admins notified] --> AQ[/app/clients/approvals/]
  AQ --> D{Admin decision}
  D -->|Approve - confirmed| A[(ACTIVE)] --> N2[Client notified] --> SI[/login → /client dashboard/]
  D -->|Reject - reason required| RJ[(REJECTED + reason)] --> N3[Client notified] --> ST
  RJ -->|staff: Resubmit for approval| P
  SI --> PORT[Requests, shared work, documents, dues, profile]
```

| Step | Route | Server control | Test |
|---|---|---|---|
| Quick registration | `/register/quick` | Zod; rate limit; email uniqueness; GSTIN duplicate check; one transaction | E2E: "a business registers itself (quick)…" |
| Full wizard | `/register/business` | Same, plus constitution-specific representatives, GSTIN format/duplicates | E2E: "full business registration wizard…" |
| Pending business: 7-day access, then locked | `/client/*` | `clientAccess` in `getContext`; `requireClientContext`; `AccessWatcher` | E2E: "a business registers itself (quick)…", "day 8: a business still awaiting approval…" |
| Clients never reach staff pages | `/app/*` | `requireContext` | E2E: quick registration test |
| Approval | `/app/clients/[id]` | `clients.approve`; state machine; optimistic status check; audit; notification | E2E: "admin approval queue…" |
| Rejection & resubmission | `/app/clients/[id]` | Reason required; record kept; staff `clients.edit` may resubmit | Unit: client workflow; not E2E |
| Remaining details after approval | Staff edit on `/app/clients/[id]` | `clients.edit` | Not E2E |

**Recovery:** a rejected applicant sees the reason and the office contact on `/account/pending`. Self-service correction by the applicant is **not** implemented; the firm has not confirmed whether applicants may edit and resubmit themselves (see [known-issues-and-decisions.md](known-issues-and-decisions.md) K-3).

## B. Firm owner registration

**Status: Implemented and tested.**

```mermaid
flowchart LR
  F[/register/firm/] --> C{Any firm exists?}
  C -->|yes, and ALLOW_FIRM_REGISTRATION unset| CL[Page closed]
  C -->|no| O[(organization + OWNER membership + master data<br/>one transaction)] --> AD[/app/admin/]
  AD --> S[Settings: organization, certificate, policy, lists]
  AD --> E[Employees: create logins → one-time setup links]
```

No password is ever shown to or set by another user: staff and invited client users receive single-use, hash-stored setup links (72 h). Test: E2E "owner registers the firm…", "owner creates staff logins…".

## C. Staff onboarding

**Status: Implemented and tested** (deactivation side effects: **Implemented but not fully tested**).

```mermaid
stateDiagram-v2
  [*] --> PENDING: admin creates login (setup link)
  PENDING --> PENDING: employee saves draft
  PENDING --> PENDING: employee submits (onboarding_submitted_at)
  PENDING --> APPROVED: admin approves + permanent ID (confirm)
  PENDING --> UNDER_REVIEW: admin sends for review (note)
  PENDING --> REJECTED: admin rejects (note required)
  UNDER_REVIEW --> APPROVED
  UNDER_REVIEW --> REJECTED
  REJECTED --> PENDING: employee corrects and resubmits
  APPROVED --> [*]
```

- For 7 days from login creation a pending member has their role's full access (banner with the end time). After that, until APPROVED, every capability-protected page redirects to `/app/onboarding`, actions are refused, and an open page signs out at the deadline. Rejection locks at once.
- The approver (`employees.manage`, Owner/Admin) also sets role and access status on the Access tab. **Nobody can change their own role or status**; the owner's role cannot be changed.
- Deactivating a login (status DISABLED) deletes its sessions immediately. Assigned tasks and allocations stay on the person's name until a lead reassigns them (K-7).
- Tests: E2E "employee sets a password via the link…", "admin approves onboarding…"; disabled-login behaviour is tested for client logins (E2E "a client cannot open another client's request; a disabled login loses access").

## D. Daily staff work

**Status: Implemented and tested.**

```mermaid
flowchart TD
  L[Sign in → role dashboard] --> AT[/app/attendance: mark in<br/>location optional, photo optional/]
  AT --> T[/app/tasks: assigned work/]
  T --> U[Start / hold / wait / submit; remarks; attachments]
  U --> TS[/app/timesheet: 10A daily entries/]
  TS --> CM[10B communication: pending with client vs with team]
  CM --> PD[/app/pending: follow-ups/]
  PD --> DR[/app/day-reports: prefilled from timesheet + task updates/]
  DR --> SEND[Send to managers] --> REV{Recipient review}
  REV -->|remark + reviewed| ACK[Reporter notified]
  TS --> TR{Leader reviews entry}
  TR -->|Return with remark| RET[(RETURNED)] --> FIX[Employee corrects → SUBMITTED] --> TR
  TR -->|Mark reviewed| OK[(REVIEWED: owner can no longer edit)]
```

- Work submitted ≠ reviewed: timesheet entries carry SUBMITTED / RETURNED / REVIEWED; the client report shows *recorded* and *reviewed* hours separately.
- Tests: E2E "team member: attendance…, timesheet, pending item and day report"; "senior returns a timesheet entry…".

## E. Client and team allocation

**Status: Implemented and tested.**

```mermaid
flowchart LR
  B[/app/allocations: availability board<br/>from real allocations/] --> S[Select client, member, role, %, dates]
  S --> CF{Conflict check<br/>over 100% / overlap}
  CF -->|conflict, no override| E[Error shown, nothing saved]
  CF -->|ok or explicit override - audited| A[(ACTIVE allocation)] --> N[Member notified]
  A --> CH[Change: effective date + reason - confirm]
  CH --> OLD[(old row ENDED day before)] & NEW[(new row replaces_allocation_id)]
  OLD --> N2[Outgoing member notified]
  NEW --> N3[Incoming member notified]
  A --> END[End allocation - confirm] --> N4[Member notified]
```

History is the chain of `replaces_allocation_id` rows; earlier timesheet entries keep their original employee, so reassignment never re-attributes past work. Test: E2E "allocation conflicts are not saved silently".

## F. Task with maker–checker review

**Status: Implemented and tested.** States and roles in [workflow-state-machines.md](workflow-state-machines.md#3-task).

```mermaid
sequenceDiagram
  actor Lead
  actor Maker as Maker (assignee)
  actor Checker
  Lead->>System: Create task (client, assignees, checker, priority/ASAP, due, reminders)
  System-->>Maker: Notification "New task"
  Maker->>System: Start → (wait for client / team) → resume → Submit for review
  Checker->>System: Approve → COMPLETED  |  Request changes → CHANGES_REQUESTED
  Note over Maker,Checker: The maker can never approve their own work
  System-->>Maker: Overdue notice once, if due time passes while open
```

**Completed means:** status COMPLETED, reached only through a checker's approval (or a reviewer when no checker is named). Submitted (PENDING_REVIEW), changes requested, waiting (AWAITING_CLIENT / AWAITING_TEAM_MEMBER), on hold and reopened (COMPLETED → IN_PROGRESS by a lead) are distinct states. Test: E2E "task: maker/checker cycle…".

## G. Pending tracker and client communication

**Status: Implemented and tested.**

```mermaid
flowchart TD
  I[Outstanding action identified] --> K{Pending with}
  K -->|CLIENT| C[(pending item: client, what, requested_on, due_by)]
  K -->|TEAM_MEMBER| T[(pending item: responsible employee)]
  C -->|client_visible| PO[Shown in portal /client/requests] --> RP[Client replies + document] --> FU[(follow-up, client reply)]
  T --> N[Responsible member notified]
  C & T --> UP[Follow-ups: notes, next follow-up date]
  UP --> CL[Close → closed_at]
  C & T --> D[Days pending = requested_on → today or closed_at<br/>calendar or business days setting]
```

The original `requested_on` is never overwritten by reminders or follow-ups. Tests: E2E "staff request appears in the client portal…", unit tests for `daysPending`.

## H. Reporting and dues

**Status: Implemented and tested** (fee schedules, invoices, payments: **Awaiting business confirmation**).

```mermaid
flowchart LR
  SRC[(clients, allocations, tasks, timesheets,<br/>pending items, services/fees, dues)] --> BR[buildClientReport: period filter]
  BR --> V[/app/reports/clients/id: 13A/]
  BR --> CSV[/export: client-facing CSV, audited/]
  BR --> SNAP[(client_reports snapshot: frozen copy)]
  DUES[(client_dues: manual)] --> B13[13B dues tab] & OV[/app/dues overview/]
```

- Current vs historical: the live report reads current records; a **snapshot** freezes it for the period. Agreed fees shown are the current values (labelled as agreed, not billed).
- A due is only *recorded*; nothing implies payment unless a user marks it SETTLED (with a follow-up note).
- Tests: E2E "client report shows team-wise hours…" (including CSV contents) and "staff without report rights cannot open the client report or its export".
