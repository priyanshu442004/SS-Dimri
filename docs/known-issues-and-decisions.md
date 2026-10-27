# Known Issues and Decisions

The single list of (1) business decisions that need the owner's confirmation, (2) implementation limitations and unavailable integrations, and (3) the prioritised list of remaining work. Detailed decision history: [requirements-and-decisions.md](requirements-and-decisions.md) (D1–D37, U1–U11) and [assumptions-and-open-questions.md](assumptions-and-open-questions.md) (Q-1…). Working defaults: [business-rules.md](business-rules.md) §3.

## 1. Decisions requiring the owner's confirmation

Ordered by impact. "Current behaviour" is reversible; nothing below is enforced as a final rule.

| # | Decision | Why it matters | Current behaviour |
|---|---|---|---|
| K-1 | **Fees and dues scope**: fee schedules, invoices, GST on fees, payment recording, receipts, outstanding balances? | Financial accuracy | Agreed fee per engagement (informational) and manually recorded dues (OPEN / SETTLED / WRITTEN_OFF). No tax, invoices or payments. A fee amount never implies payment |
| K-2 | **Leave & timing policy**: which of the two documents applies (overtime: actual minutes or 2.5 h / 5 h slabs; Sunday rules); half-day, late, absent rules | Payroll / HR | Both modes configurable; figures labelled indicative; no salary effect; `policy_confirmed = false` |
| K-3 | **Rejected client applications**: may the applicant correct and resubmit themselves, or only through the office? | Access control | Applicant sees the reason and office contact; staff correct and resubmit |
| K-4 | **Seven-day trial vs one-month expiry**: confirm that 7 days is employee probation and say what the one-month rule applies to (client, engagement, one-time assignment) and what happens at expiry | Contract / billing | 7-day probation implemented (configurable); one-month expiry recorded but **not enforced** |
| K-5 | **One-time vs retainer**: does it describe the client or each engagement? What event confirms it? | Billing, renewals | Optional on both; resolved when a user with `clients.edit` records it; no behaviour depends on it |
| K-6 | **Client observation statuses** | Reporting | OPEN → IN_PROGRESS → RESOLVED → CLOSED, reopenable (provisional) |
| K-7 | **Deactivating staff**: should open tasks and allocations be reassigned automatically or flagged, and to whom? | Work continuity | Login disabled immediately; work remains on the person's name until a lead changes it |
| K-8 | **Pending days**: calendar or business days; which holidays | Reporting | Setting (default calendar); business days exclude Sundays only |
| K-9 | **Client comments on tasks**: may clients comment on all shared tasks, or only respond to review requests? | Communication | Clients may add remarks on tasks shared with them and accept / raise observations |
| K-10 | **Data retention and deletion** (staff, clients, documents, attendance locations) | Legal / privacy | Nothing is purged; soft states keep history |
| K-11 | **Notification channels** | Delivery | **Email configured (27 Oct 2026)** for staff invitations and decisions. WhatsApp planned later (no button yet). Client notices are still in-app only |
| K-12 | **Unclear source labels**: "Nature of User" options; "Frontend / Extended" employee nature; other handwritten fields in Q-1, Q-3 | Data model | Configurable lists; original wording kept |
| K-13 | **GST portal verification** | Data quality | Format check only; status "not verified" |
| K-14 | **Who may approve staff vs change roles**: today the same administrators do both (nobody on themselves). Should role changes need a second approver? | Access control | Owner/Admin approve and set roles; self-change blocked; owner's role fixed |
| K-15 | **Website photographs and logo** | Brand | No stock photos; provisional "SD" monogram |
| ~~K-16~~ | **Access while awaiting approval** | Access control | **Decided 26 Oct 2026:** 7 days from account creation for staff and clients, role's full access, live sign-out at the end (business-rules R12) |

## 2. Implementation limitations and unavailable integrations

| # | Limitation | Impact | Status |
|---|---|---|---|
| L-1 | Email covers staff invitations and approval decisions only; WhatsApp and SMS not integrated | Other events are in-app only | Partially available (K-11) |
| L-2 | No GST portal API | GSTINs are format-checked only | Unavailable integration (K-13) |
| L-3 | No malware scanning of uploads | Infected files could be stored (type and size are checked) | Not implemented |
| L-4 | Reminders and overdue notices run on page load, not on a scheduler | Delivered when anyone in the firm next opens the app | By design until a scheduler is needed |
| L-5 | In-app notifications are written in the same transaction as the business change | If writing the notification failed, the change would roll back too (same database, so both succeed or neither) | Decision: atomic, no partial state. Revisit for external channels (use an outbox) |
| L-6 | No server-side idempotency keys for repeated "add" forms (timesheet entry, pending item, remark) | A retry after a network failure could add a second entry, which the user can delete. Buttons are disabled while saving; registrations, approvals, attendance and reviews are protected by constraints or conditional updates | Known limitation |
| L-7 | End-to-end tests run against the same Neon database as development | Tests create and delete only `@e2e.invalid` organizations, but a separate test database is the safer practice | **Create a Neon branch for tests before production use** |
| L-8 | Uploaded files from test runs remain in S3 under `ss-dimri/org/<test-org-id>/` | Storage clutter only; not linked to any live record | Clean up the prefixes |
| L-9 | Fees shown in a live report are the current agreed values | Historical periods show today's fee | Use saved snapshots for historical reports |
| L-10 | No multi-factor authentication | Password-only sign-in | Recommended for owner/admin |
| L-11 | CSP allows inline scripts | Weaker XSS defence-in-depth | Nonce-based CSP later |
| L-12 | Session-expiry, notification-failure and concurrent-approval paths are covered by code and unit-level rules, not by end-to-end tests | See [testing-strategy.md](testing-strategy.md) §4 | Test gap |
| L-13 | Applicants cannot edit a rejected registration themselves | Depends on K-3 | Awaiting confirmation |

## 3. Prioritised remaining improvements

1. **Rotate the Neon password and AWS keys** that were shared in chat (security).
2. **Separate test database** (Neon branch) and a separate S3 prefix or bucket for tests (L-7, L-8).
3. **Owner decisions K-1 to K-5**, then implement the confirmed fee, policy, rejection and expiry rules.
4. **Email provider** for setup/reset links and approval notices, with an outbox and retries (L-1, L-5).
5. **Malware scanning** of uploads (L-3).
6. **MFA** for owner and administrators (L-10).
7. **Integration tests** for session expiry, concurrent approvals and failure paths (L-12).
8. **Deactivation workflow**: show open work when disabling a person and offer reassignment (K-7).
9. **Scheduler** for reminders and overdue notices once external channels exist (L-4).
10. **Nonce-based CSP** (L-11).
