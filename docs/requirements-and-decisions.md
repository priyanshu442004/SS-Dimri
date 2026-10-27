# Requirements & Decisions Register

This register tracks the requirements from the third specification ("Master UI/UX, product design, full-stack implementation & database integration"), in addition to [requirements-audit.md](requirements-audit.md) (client documents and Data Flow Diagram) and [requirements-traceability.md](requirements-traceability.md) (handwritten database notes).

> **Note:** the specification as received was truncated after "Page 43: Communication Timesheet". Requirements after that point (the remaining pending-tracker, daily-report, client-report and any later sections) were not received; the existing implementations of those modules were kept.

Legend: **E** explicit requirement · **I** implementation decision · **O** open — needs the firm's confirmation.

## 1. Sources

| Source | Status |
|---|---|
| Nine Google Drive references | All accessed and analysed — see requirements-audit.md §1 |
| Handwritten notes and Data Flow Diagram | Implemented — see requirements-audit.md §2 and requirements-traceability.md |
| This specification (sections 1–18, partial) | Implemented as below |

## 2. Decisions

| # | Topic | Kind | Original wording / requirement | Decision |
|---|---|---|---|---|
| D1 | Client role & portal | E | "Approved Client → client portal" | New role `CLIENT`, portal at `/client`, scoped strictly to the client's own record; only records staff mark client-visible are shown |
| D2 | Public business registration | E | Pages 9–10 | `/register/business` (6-step wizard with review) and `/register/quick`; both create `PENDING_APPROVAL`; client login created at the same time so the applicant can follow the status |
| D3 | Quick-registration fields | I | "If the list is unavailable, choose a minimal, safe, configurable set" | Required: trade name, contact person, mobile, email, password, consent. Optional: PAN, GSTINs, services, engagement type |
| D4 | Which firm a public registration belongs to | I | — | `PUBLIC_ORGANIZATION_ID`, or the only organization; registration disabled otherwise rather than guessing |
| D5 | Firm (owner) registration | I | DFD "Create account (owner)" vs. "Public users must not grant themselves privileges" | Open only until the first firm exists (or `ALLOW_FIRM_REGISTRATION=true`) |
| D6 | Staff credentials | E | "Staff member … receives a one-time setup link"; "do not expose generated credentials" | Admin gets a one-time setup link (72 h); no password is ever shown to the admin |
| D7 | Password reset without an email provider | I/O | Page 7 | Single-use, 2-hour, hash-stored links. `/forgot-password` notifies administrators who issue the link; generic response prevents account enumeration. **O:** connect an email provider to send links automatically |
| D8 | Route names | I | `/login`, `/register`, `/admin/dashboard`, `/clients`, `/staff` … | Public routes follow the spec (`/login`, `/register`; old URLs redirect). Internal routes keep the existing `/app/...` structure (`/app/admin`, `/app/clients`, `/app/employees` = staff directory) per "adapt route names to the existing application" |
| D9 | Task states | E/I | Open, assigned, in progress, awaiting client, awaiting team member, in review, completed, closed; overdue derived | Added `AWAITING_CLIENT`, `AWAITING_TEAM_MEMBER`; "in review" = `PENDING_REVIEW`; "closed" = `COMPLETED` (no separate closed state); overdue derived |
| D10 | Internal vs client-visible remarks | E | "Clearly distinguish internal remarks from client-visible communication" | `client_visible` flag on task remarks, pending items and follow-ups; default internal |
| D11 | Board view | E | "list, calendar, and board-style views" | Tasks: list, board (to do / in progress / waiting / in review / done), calendar |
| D12 | Mobile lists | E | "Convert tables into concise mobile rows" | Clients, tasks, employees lists render rows on phones; other tables scroll within their card |
| D13 | Global search | E | "Global search if supported" | `/app/search` across clients, tasks and staff within the user's scope |
| D14 | Configurable roles | I | Page 25 "only if the implementation requires configurable role administration" | Fixed roles with a server-enforced matrix shown in Settings → Roles & permissions; owner cannot be demoted |
| D15 | Public services | E | "Service details should come from approved database records" | Public site lists services that are **confirmed and active** in the database; fees never shown |
| D16 | Pricing | E | "Do not invent fees" | Billing bases + quote request; no amounts |
| D17 | Forms library | I | "React Hook Form or equivalent" | Server actions + Zod (server validation) + `useActionState`; the business wizard keeps step state on the client. Equivalent behaviour with fewer dependencies |
| D18 | UI library | I | "shadcn/ui or an equivalent coherent component system" | In-repo component set (`src/components`) on Tailwind tokens; accessible labels, focus states, unique field ids |
| D19 | Photography | I | "Authentic professional-services imagery … properly licensed" | No licensed photos supplied; local SVG illustration only. **O:** supply photographs or approve stock images |
| D20 | Logo | I/O | "Temporary wordmark … documented as provisional" | "SD" monogram + serif wordmark is **provisional** |
| D21 | Client observation | E | 13A "client observation status" | Clients accept or raise observations on work shared for review |
| D22 | ESF Number | E | "the intended field is the ESI number" | Implemented as ESI number |
| D23 | Trial period | E | "seven days" | Organization default probation 7 days, editable |
| D24 | One-time vs retainer | O | "pending client confirmation" | Optional on client and per engagement; no rules attached |
| D25 | Communication timesheet — whose side | E | Page 43 "separate client-side from internal dependencies" | Every pending item is *pending with client* or *pending with a team member*; the two are listed, counted and reported separately |
| D26 | Pending days basis | I/O | "calendar or business-day basis, documented, not assumed confirmed" | Organization setting (Settings → Lists & preferences), default **calendar days**. Business days exclude Sundays only; no public-holiday calendar exists. Counted from the request date to today (or closure), using IST |
| D27 | Timesheet review | E | Pages 44–45 | Per-entry review: *Mark reviewed* or *Return for correction* (remark required). Owners may correct until reviewed (correction resubmits a returned entry); administrators may correct any entry with a reason. Every review and correction is audited with a field-by-field diff shown as the entry's history |
| D28 | Pending tracker sources | E | Pages 46–48 "no duplicate sources of truth" | A pending item may link to its task and timesheet entry; the tracker shows those links and the responsible person instead of copying data |
| D29 | Day report review | E | Pages 49–51 | Each recipient marks the report reviewed with an optional remark; the reporter is notified; related timesheet entries and tasks updated that day are linked, not copied |
| D30 | Client report export | E | Pages 52–55 | Print view (browser print / save as PDF) and a client-facing CSV. Same `reports.client` authorization; the CSV omits internal remarks (due follow-up notes, our-side pending descriptions, maker/checker status, review remarks) and neutralises spreadsheet formulas. Each export is audited |
| D31 | Client observations | E/I | Page 56 | Observation register with source (client / team), responsible person, status history. Statuses OPEN → IN_PROGRESS → RESOLVED → CLOSED, reopenable — **provisional**. Observations a client raises from the portal are registered automatically. Leads manage all; others see those assigned to them; only managers close or reassign |
| D32 | Fees & dues | E | Page 57 "no invented tax or invoicing" | Read-only overview of agreed fees on active services and manually recorded dues (outstanding, overdue). No tax, invoice numbering or payment collection |
| D33 | My profile | E | Page 58 | Every user may change their display name and password; role, status, email and username are read-only |
| D34 | Notifications | E | Page 59 | Opening a notification marks it read and follows its link only if it is a same-site path for that user's area. Events: assignments, reviews/returns, remarks to the task team, client replies/observations, one-time overdue notice per task, reminders, approvals |
| D35 | Settings lists | E | Page 60 | Designations and timesheet work types can be added and deactivated (existing records keep their value). Timezone fixed to Asia/Kolkata (shown read-only). Departments and services are managed on Services & departments |
| D36 | Security headers | E | Section 30 | CSP (`default-src 'self'`, no framing, `object-src 'none'`, S3 images only), HSTS, nosniff, referrer policy, permissions policy. `'unsafe-inline'` scripts are required by Next.js without nonce rendering; `'unsafe-eval'` is development-only |
| D37 | High-impact confirmations | E | Section 28 | Browser confirmation before approving clients/onboarding, changing allocations, rejecting, disabling logins, cancelling tasks, deactivating list values, issuing reset links |

## 3. Open questions (new in this round)

| # | Question |
|---|---|
| Q-B1 | Which email/SMS provider should send password links, approval notices and reminders? |
| Q-B2 | Should clients be able to edit their own contact details / add GSTINs from the portal, or always via the office? (Currently via the office.) |
| Q-B3 | Should clients see fee amounts per service in the portal? (Currently: dues only.) |
| Q-B4 | Which additional fields are mandatory for quick registration, if any? |
| Q-B5 | Photographs and logo for the public website. |
| Q-B6 | ~~The remainder of the specification after Page 43.~~ Received and implemented (Pages 43–60, sections 24–35). |

## 4. Unresolved items (kept explicit, Section 32)

None of these is assumed confirmed. Where the application needs a behaviour, the provisional choice is listed and can be changed without data loss.

| # | Item | Current behaviour |
|---|---|---|
| U1 | One-time vs retainer engagements | Optional field; no billing or renewal rules |
| U2 | Mandatory quick-registration fields | Minimal set (D3) |
| U3 | Fees, taxes, invoices, payment collection | Agreed fee and manual dues only (D32) |
| U4 | Leave & timing policy (two versions differ on overtime and Sundays) | Both modes configurable; figures indicative; no payroll effect |
| U5 | Calendar vs business days for pending | Setting, default calendar (D26); no holiday calendar |
| U6 | Exact task transitions the firm wants | Implemented state machine (D9) |
| U7 | Whether clients may comment on tasks | Clients may add remarks only on tasks shared with them |
| U8 | Rejection rules (client registration, onboarding, observations) | Reason required; record kept; resubmission allowed |
| U9 | Observation statuses | Provisional lifecycle (D31) |
| U10 | Data retention and deletion periods | Nothing is purged; soft states (cancelled, discontinued, disabled) keep history |
| U11 | Email / SMS / WhatsApp delivery | In-app notifications only (Q-B1) |
