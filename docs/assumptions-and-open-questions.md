# SS Dimri — Assumptions and Open Questions

Nothing below is presented as client-confirmed unless marked **Confirmed**. Every provisional choice is reversible with a normal migration. Q-numbers are referenced from [requirements-traceability.md](requirements-traceability.md).

## Confirmed by the client (implemented as rules)

1. **One certificate per organization** → `organization_certificates.organization_id` is unique.
2. **One client can have multiple GSTINs** → `client_gst_registrations` (ID, client ID, GSTIN only).
3. **Quick registration → `PENDING_APPROVAL` → admin approves → active**, on the same record.
4. **Seven days = trial/probation period** → stored per employee, defaulted from a configurable organization setting.
5. **Constitution types**: Proprietor, Firm, Company, Trust, HUF.

## Open questions for the client

| # | Topic | Question | Current (reversible) handling |
|---|---|---|---|
| Q-1 | Nature of User | What are the exact dropdown options? Do they differ for organizations, clients and services? | Configurable table `nature_of_user_options`, empty. |
| Q-2 | One Time / Retainer scope | Does One Time / Retainer describe the **whole client** or **each service engagement**? What exactly is the “one-month” retainer expiry? | Both `clients.nature_of_client` and `client_services.engagement_nature` exist (nullable). One will be dropped once confirmed. No expiry rule enforced. |
| Q-3 | Nature of Employee | Is the first option “Frontend”, “Extended” or something else? Is “On-site” here the same as the On-site/Off-site employment type? | Configurable `employee_nature_options` seeded per organization with Frontend / Backend / On-site; original handwriting kept in `source_wording`. |
| Q-4 | Rejected temporary employees | When an admin does not approve, should the temporary ID be **deleted** or **sent for review**? Who reviews? How long must records be kept? | Both supported: `UNDER_REVIEW` or `REJECTED`. Hard delete is possible only when the person has no operational history (attendance, timesheets, tasks… are RESTRICT). |
| Q-5 | Bank book upload | Required, optional, or removed (it is crossed out)? | Optional column `employee_bank_accounts.bank_book_file_id`. |
| Q-6 | Attendance Active / Non-active | Crossed out — drop it, or does it mean something (e.g. employee active status, geofence active)? | Not implemented. |
| Q-7 | Roles and approvals | Which roles exist (owner, admin, manager, staff…)? Who may approve clients, employees, leave, and reports? How do “sub-users / licenses” map to roles and to the single-/multi-user setting? | `organization_memberships.role` enum OWNER/ADMIN/MANAGER/STAFF (provisional); `licensed_user_limit`. |
| Q-8 | Retainer renewal | On expiry, is the retainer renewed automatically, re-approved, or must the client “fill the remaining details”? | `client_services.retainer_start_date/end_date` and `renewed_from_id` chain; no automation. |
| Q-9 | Timesheet remark | The handwritten remark heading looks like “Discomfort Remark” — what is it? | Generic `pending_items.remark`. |
| Q-10 | “Government Department” | How does the “Government Department” heading in the 10B notes relate to the pending fields? (E.g. pending with a government department as a third party?) | Not modelled. Could become a third `pending_with` value or a separate field. |
| Q-11 | Services List | Is the “Services List” the client-specific engagement list (current reading), or a catalogue of sub-services under each “Nature of Service”? | `services` = master; `client_services` = Services List per client. |
| Q-12 | Fees, dues, payments | Is “Fees Total” the sum of agreed service fees or a separately agreed contract total? How do fees, invoices, receipts and “Dues” (13B) relate? Is billing monthly for retainers? | Fees total derived from `client_services.agreed_fee`; `client_dues` as a simple extension point; no invoicing/payment tables. |
| Q-13 | GST portal validation | Should GSTINs be verified live against the GST portal (needs a GSP/API provider)? For organizations only, or clients too? | Format validation only; `organizations.gst_verification_status`. Client GST table intentionally has no verification columns yet. |
| Q-14 | Previous company / employer | In the organization form continuation, do “Previous Company Details” and “Details of Previous Employer” + “Experience Certificate” refer to the **organization** or to **employees**? | Both preserved: `organization_previous_companies` (organization) and `employee_previous_employments` (employee, with experience certificate). |
| Q-15 | Client addresses | “Address” appears twice in the client form. One address, or several (registered, billing, per GSTIN)? | Single `clients.address`. |
| Q-16 | Client classification / checklist | What items are on the client checklist? | Not modelled beyond existing classification fields. |
| Q-17 | GSTIN uniqueness | Must a GSTIN be unique across all clients of the organization (or globally)? | Unique per client only (`client_id`, `gstin`); indexed for duplicate checks in the app. |
| Q-18 | Representatives | Minimum/maximum representatives per constitution (e.g. exactly one proprietor/karta; at least two partners/directors)? | No limits enforced; `constitutions.allows_multiple` is descriptive. |
| Q-19 | “Bank Account Code” | Account number, customer ID, or something else? | Interpreted as account number (encrypted). |
| Q-20 | “Reference of the Reference” | What does this mean — a referee, and who referred that referee? | `employee_references` with `referred_by` and notes. |
| Q-21 | Increment wording | Exact meaning of the “increment amount / continuation” note? | `employee_salary_records.increment_notes` plus structured amount/percent/date. |
| Q-22 | Availability colours | Exact meaning of green / orange (free vs partly allocated? present vs on leave?). | Data available: allocation %, dates, attendance, leave. Colours are UI logic. |
| Q-23 | Writing for / Writing from | Is “writing for” a client-side person/remark and “writing from” the requesting team member? | `writing_for_remark`, `writing_from_employee_id` + `writing_from_remark`. |
| Q-24 | Attendance rules | Can there be several in/out sessions per day? How are corrections made and approved? How are leaves approved and counted (half days)? | No unique (employee, date); `leave_requests` with PENDING/APPROVED/REJECTED; no correction workflow yet. |
| Q-25 | Message through WhatsApp | Is this the message text, a flag that it was sent, or an automatic WhatsApp integration? | Free text `timesheet_entries.whatsapp_message`. |
| Q-26 | Day report | Content/format of the day report and delivery channel (in-app, email, WhatsApp)? Is it generated from timesheets? | `day_reports` (summary, status) + `day_report_recipients`. |
| Q-27 | Client observation status | What statuses does the client observation go through? | Provisional enum NOT_SHARED / PENDING_CLIENT_REVIEW / ACCEPTED / OBSERVATIONS_RAISED. |
| Q-28 | End-of-month summary | Exact wording/content of the end-of-month section in 13A. | `client_reports.summary_notes` + JSON snapshot. |
| Q-29 | Quick registration | Which client fields are mandatory at quick registration? | Only trade name required (Zod `clientQuickRegistrationSchema`). |
| Q-30 | Client status vs activity | Is “Status” on the client form the approval status, or an operational active/inactive flag? | One `clients.status` lifecycle (DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, INACTIVE); approval facts kept separately in `approved_at/by`. |
| Q-31 | Data retention / Aadhaar | Retention periods for rejected clients/employees, ex-employees, documents? Aadhaar storage must follow UIDAI rules — is storing the number required, or is last-4/masked copy enough? | Aadhaar encrypted at rest with last-4 only for display. |

## Technical assumptions (engineering decisions, reversible)

- **Tenant model**: an organization is a tenant; the schema supports several organizations even if only SS Dimri uses it initially.
- **Membership roles** are an enum for now; a roles/permissions table can replace it when Q-7 is answered.
- **Designations, employee natures and departments** are per-organization rows so they can be edited without migrations. Defaults are created by `createOrganizationDefaults()` when an organization is registered.
- **Human-readable codes** (client code, service code, employee codes) are optional strings unique per organization; their format/sequence is not yet defined.
- **Timezone**: timestamps in UTC; calendar dates in `organizations.timezone` (Asia/Kolkata).
- **Constitution representatives** are tied to a client; rows with no `client_id` represent the organization’s own representatives (the organization form also has a constitution).
- **Client report snapshot** is a JSON document; its shape will be defined with the report UI (versioned by `snapshot_version`).
- **Prisma 7.10.1** pinned (stable) instead of the 8.0 release candidate on npm’s `latest` tag.
- **Shared S3 bucket**: this project writes only under `ss-dimri/`. A dedicated bucket (or an IAM policy restricted to this prefix) is recommended before production.
