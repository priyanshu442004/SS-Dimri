# Data Dictionary

Two layers:

1. **[database-schema-reference.md](database-schema-reference.md)** is the authoritative, generated list of every table (61), column, type, nullability, default, index and foreign key, read from the live database (`npm run docs:schema`). Regenerate it after each migration.
2. **This document** adds what the database cannot express: validation rules, sensitivity classes, the authoritative source of each reported value, and deletion behaviour. Relationships and diagrams: [database-erd.md](database-erd.md). Design notes and the migration history: [database-design.md](database-design.md).

## 1. Sensitivity classes

| Class | Meaning | Handling |
|---|---|---|
| **S3: secret** | Credentials and tokens | Never stored in clear, never logged, never shown |
| **S2: restricted personal** | Identity and bank numbers, HR documents, location | Encrypted or access-restricted; last 4 digits for display |
| **S1: business confidential** | Client business data, tax identifiers, fees, internal remarks | Organization-scoped; role-restricted; internal remarks never reach clients |
| **S0: internal** | Operational data (statuses, dates) | Organization-scoped |

## 2. Sensitive and validated fields

| Table.column | Class | Validation | Visible to |
|---|---|---|---|
| `accounts.password` | S3 | ≥ 10 chars; scrypt hash (Better Auth) | nobody |
| `sessions.token`, `verifications.*` | S3 | Random; password links stored as SHA-256 hash only | nobody |
| `employees.aadhaar_encrypted` / `aadhaar_last4` | S2 | `^[2-9][0-9]{11}$`; AES-256-GCM | last 4: employee and admins; full value never sent to the browser |
| `constitution_members.aadhaar_encrypted` / `aadhaar_last4` | S2 | same | staff with client access (last 4) |
| `employee_bank_accounts.account_number_encrypted` / `account_number_last4`, `ifsc` | S2 | IFSC `^[A-Z]{4}0[A-Z0-9]{6}$` | employee and admins |
| `employees.pan`, `constitution_members.pan`, `clients.pan`, `organizations.pan` | S1 | `^[A-Z]{5}[0-9]{4}[A-Z]$`, upper-cased | staff with access to the record |
| `organizations.tan` | S1 | `^[A-Z]{4}[0-9]{5}[A-Z]$` | admins |
| `client_gst_registrations.gstin`, `organizations.gstin` | S1 | `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`; unique per client in the database; unique per organization at registration | staff with client access; the client (own) |
| `*.mobile`, `contact_mobile` | S1 | `^(\+91)?[6-9][0-9]{9}$` | staff with access; the client (own contacts) |
| `attendance_records.time_in_latitude/longitude`, photos | S2 | Optional; numeric ranges checked by the database | the employee, `attendance.view_all` |
| Employee HR files (`stored_files` linked to employee documents, Aadhaar/PAN copies, bank book, memos) | S2 | Type by content; 10 MB | the employee, `employees.manage` |
| `task_activities.note`, `pending_items.*`, `follow_ups.note` with `client_visible = false` | S1 | Text length limits (Zod) | internal staff with access |
| `client_services.agreed_fee`, `client_dues.amount` | S1 | ≥ 0, ≤ 999,999,999,999.99 | `reports.client` / `dues.manage`; the client sees its own dues |

## 3. Authoritative source for every reported value

| Reported value | Source of truth | Never taken from |
|---|---|---|
| Team on a client | `team_allocations` overlapping the period, plus anyone with timesheet entries or task assignments for the client | free text |
| Hours (recorded / reviewed) | `timesheet_entries.approx_minutes` by `work_date`; reviewed = status REVIEWED | attendance |
| Attendance status and work hours | `attendance_records` (+ policy for indicative figures) | timesheets |
| Task status, overdue | `tasks.status`, derived from `due_at` | client report text |
| Maker / checker | `tasks.maker_employee_id`, `checker_employee_id`, `maker_status`, `checker_status` | — |
| Pending, our side / client side | `pending_items.pending_with` | — |
| Days pending | `requested_on` → `closed_at` or today (IST), basis from `organizations.pending_days_basis` | follow-up dates |
| Client observation | `client_observations` (register) and `tasks.client_observation_status` (per shared task) | — |
| Agreed fee | `client_services.agreed_fee` (current value) | — |
| Outstanding dues | `client_dues` with status OPEN | fee amounts |
| Historical report | `client_reports.snapshot` (frozen JSON for the period) | live tables |

## 4. Deletion and history

| Entity | Rule |
|---|---|
| Organizations, clients, employees | Never hard-deleted by the application; status changes (INACTIVE, EXITED, DISABLED) keep history. Foreign keys from operational tables are RESTRICT |
| Tasks | No delete; CANCELLED keeps the history |
| Allocations | Never edited in place once active: changes end the old row and create a linked new one |
| Attendance | Corrections write `attendance_corrections` with original and new values |
| Timesheet entries | The owner may delete an entry until it is reviewed; corrections are audited with a field diff |
| GSTINs, contacts, representatives | May be removed by `clients.edit` (confirmation); removal is audited |
| Stored files | Not deleted by users; deleting a parent row sets the link to null where defined |
| Follow-ups, notifications | Cascade with their parent (pending item, due, observation; user) |

## 5. Timezone and dates

All timestamps are `timestamptz` (UTC). Calendar dates (`work_date`, `attendance_date`, `requested_on`, `due_by`, `observed_on`) are `date` columns representing the firm's local day in Asia/Kolkata; "today" is always computed in IST (`isoDateInTz`).
