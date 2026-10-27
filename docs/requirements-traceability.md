# SS Dimri — Requirement Traceability

Every item from the client’s handwritten notes (as compiled in the project brief) mapped to its implementation. Notation: `table.column`. **Derived** = calculated from stored data, not a column (helpers in `src/lib/domain/derived.ts`). **App** = behaviour implemented in the application layer, backed by the listed data. **Q-n** = see [assumptions-and-open-questions.md](assumptions-and-open-questions.md).

Status legend (field-level tables §1–§17): ✅ implemented · 🟡 implemented provisionally (open question) · 📝 documented only (meaning unclear, no column invented).

Requirement-level classification (§18, as required by the final addendum): **IT** Implemented and tested · **IN** Implemented but not fully tested · **PI** Partially implemented · **BL** Blocked · **AC** Awaiting business confirmation. "Tested" means covered by a test that was **actually run and passed** (`tests/domain.test.ts`, `tests/rules.test.ts`, `tests/e2e/workflow.spec.ts`); see [testing-strategy.md](testing-strategy.md) for the run results.

---

## 1. Organization registration (“Forms Detail”, Section A)

| Requirement | Implementation | Status |
|---|---|---|
| ID | `organizations.id` | ✅ |
| Trade Name | `organizations.trade_name` | ✅ |
| Legal Name | `organizations.legal_name` | ✅ |
| Address | `organizations.address` | ✅ |
| TAN | `organizations.tan` (+ Zod `tanSchema`) | ✅ |
| PAN | `organizations.pan` (+ Zod `panSchema`) | ✅ |
| GST — validate against GST portal | `organizations.gstin`, `gst_verification_status`, `gst_verified_at`; Zod `gstinSchema` checks format; portal API integration is future work (Q-13) | 🟡 |
| Certificates | `organization_certificates` (one per organization — see §2) | ✅ |
| Nature of User — dropdown, options pending | `organizations.nature_of_user_id` → `nature_of_user_options` (configurable, not seeded) (Q-1) | 🟡 |
| Constitution — FK | `organizations.constitution_id` → `constitutions` | ✅ |
| Profile Picture | `organizations.profile_picture_file_id` → `stored_files` | ✅ |
| Contact Details — manually entered | `organizations.contact_person_name`, `contact_mobile`, `contact_email`, `contact_phone` | ✅ |
| Password / authentication | `users` + `accounts.password` (scrypt hash via Better Auth); linked through `organization_memberships`. No password on `organizations`. | ✅ |
| Single-user or multi-user access | `organizations.access_mode` enum `SINGLE_USER` / `MULTI_USER` (one setting, not two booleans) | ✅ |
| Sub-users / licenses | `organizations.licensed_user_limit` + `organization_memberships` (role, status); App enforces the limit (Q-7) | 🟡 |
| Number of Employees | `organizations.declared_employee_count` (declared); actual = Derived count of `employees` | ✅ |
| Number of Clients | `organizations.declared_client_count` (declared); actual = Derived count of `clients` | ✅ |
| Previous Company Details | `organization_previous_companies` (company_name, address, from/to, details) (Q-14) | 🟡 |
| Details of Previous Employer — Name | `employee_previous_employments.employer_name` (Q-14) | 🟡 |
| — Address | `employee_previous_employments.employer_address` | 🟡 |
| — Designation | `employee_previous_employments.designation` | 🟡 |
| — Contact Number | `employee_previous_employments.contact_number` | 🟡 |
| Experience Certificate — upload | `employee_previous_employments.experience_certificate_file_id` → `stored_files` | ✅ |
| Leave Policy — document | `organization_documents` with `type = LEAVE_POLICY`, `effective_from` | ✅ |
| Default probation (“7 days”, configurable) | `organizations.default_probation_days` (default 7) | ✅ |

## 2. Organization certificate (Section B)

| Requirement | Implementation | Status |
|---|---|---|
| One certificate per organization (confirmed) | `organization_certificates.organization_id` UNIQUE → 1:1 with `organizations` | ✅ |
| Secure file reference (not a public URL) | `organization_certificates.file_id` → `stored_files` (private S3 key; pre-signed access only) | ✅ |
| Certificate metadata | `certificate_name`, `certificate_number`, `issued_on`, `expires_on`, `notes` (all optional) | ✅ |

## 3. Client / business registration (Section C)

| Requirement | Implementation | Status |
|---|---|---|
| ID | `clients.id` (+ optional human-readable `client_code`, unique per organization) | ✅ |
| Trade Name | `clients.trade_name` (required) | ✅ |
| Legal Name | `clients.legal_name` | ✅ |
| Address | `clients.address` (listed twice in the notes; treated as one address — Q-15) | ✅ |
| TAN | `clients.tan` | ✅ |
| PAN | `clients.pan` (indexed) | ✅ |
| GST / GSTIN — multiple | `client_gst_registrations` (see §4) | ✅ |
| Certificates | `client_documents` with `type = REGISTRATION_CERTIFICATE` (multiple allowed) | ✅ |
| Nature of User — dropdown | `clients.nature_of_user_id` → `nature_of_user_options` (Q-1) | 🟡 |
| Nature of Client — One Time / Retainer | `clients.nature_of_client` enum `ONE_TIME` / `RETAINER`; also `client_services.engagement_nature` until scope is confirmed (Q-2) | 🟡 |
| Constitution — FK | `clients.constitution_id` → `constitutions` | ✅ |
| Nature of Services Offered — FK to service list | `client_services` (client ↔ `services` many-to-many) | ✅ |
| Profile Picture | `clients.profile_picture_file_id` → `stored_files` | ✅ |
| Client classification / checklist | Classification = constitution, nature of user, nature of client, MSME flag, status. A separate checklist was not specified (Q-16) | 🟡 |
| Status | `clients.status` enum `DRAFT`, `PENDING_APPROVAL`, `ACTIVE`, `REJECTED`, `INACTIVE` | ✅ |
| PO Detail | `client_purchase_orders` (po_number, po_date, amount, valid_from/to, details, file) | ✅ |
| MSME — Yes/No | `clients.is_msme` (nullable = not yet answered) | ✅ |
| MSME Registration Number | `clients.msme_registration_number` | ✅ |
| MSME Certificate Upload | `clients.msme_certificate_file_id` → `stored_files` | ✅ |
| ESI Number | `clients.esi_number` | ✅ |
| ESI Certificate Upload | `clients.esi_certificate_file_id` → `stored_files` | ✅ |
| PF Number | `clients.pf_number` | ✅ |
| PF Certificate | `clients.pf_certificate_file_id` → `stored_files` | ✅ |
| Fees Total | Derived: Σ `client_services.agreed_fee` (Q-12) | 🟡 |
| Quick registration → `PENDING_APPROVAL` (confirmed) | `clients.status` default `PENDING_APPROVAL`; `submitted_at`, `created_by_id` | ✅ |
| Admin approval → active (confirmed) | same row: `status = ACTIVE`, `approved_at`, `approved_by_id` → `users`; `audit_logs` entry | ✅ |
| No duplicate client records on approval | Approval updates the existing row; no copy table | ✅ |
| Rejection | `status = REJECTED`, `rejected_at`, `rejected_by_id`, `rejection_reason` | ✅ |
| Fill remaining details later (incomplete registration) | All non-essential columns nullable; `details_completed_at`; Zod `clientQuickRegistrationSchema` vs `clientDetailsSchema` | ✅ |
| One-month retainer expiry + renewal / fill remaining details | `client_services.retainer_start_date`, `retainer_end_date`, `renewed_from_id`; **no expiry rule enforced** (Q-2, Q-8) | 🟡 |

## 4. GST registrations

| Requirement | Implementation | Status |
|---|---|---|
| One client → multiple GSTINs (confirmed) | `client_gst_registrations` 1:N from `clients` | ✅ |
| ID | `client_gst_registrations.id` | ✅ |
| Client ID — FK | `client_gst_registrations.client_id` → `clients` (cascade) | ✅ |
| GSTIN | `client_gst_registrations.gstin` varchar(15), indexed; Zod format check | ✅ |
| No state/address/certificate/verification columns yet | None added (only `created_at` / `updated_at` timestamps) | ✅ |
| Prevent duplicate GSTINs | UNIQUE (`client_id`, `gstin`); organization-wide/global uniqueness pending (Q-17) | 🟡 |

## 5. Constitution (Section D)

| Requirement | Implementation | Status |
|---|---|---|
| Five types: Proprietor, Firm, Company, Trust, HUF | `constitutions` (enum `ConstitutionType`), seeded in the initial migration | ✅ |
| Constitution as ID / FK from client form | `constitutions.id`; `clients.constitution_id`, `organizations.constitution_id` | ✅ |
| Representative type per constitution | `constitutions.representative_role` (Proprietor / Partner / Director / Trustee / Karta) | ✅ |
| Representatives without repeating columns | `constitution_members` (one row per person, `role` enum) | ✅ |
| Name of person / partners / directors / trustees / karta | `constitution_members.full_name` + `role` | ✅ |
| Mobile number(s) | `constitution_members.mobile` | ✅ |
| Email address(es) | `constitution_members.email` | ✅ |
| Address(es) | `constitution_members.address` | ✅ |
| PAN | `constitution_members.pan` | ✅ |
| Aadhaar | `constitution_members.aadhaar_encrypted` (AES-256-GCM) + `aadhaar_last4` | ✅ |
| Profile picture(s) | `constitution_members.profile_picture_file_id` → `stored_files` | ✅ |
| Number of representatives not fixed | Unlimited rows; `constitutions.allows_multiple` is descriptive only, not enforced (Q-18) | ✅ |
| Sensitive data handled securely | Aadhaar encrypted; PAN never logged; restricted APIs (App) | ✅ |

## 6. Services offered (Section E) and services list (Section F)

Mapping: **Services Offered = `services` (master)**; **Services List = `client_services` (a service engaged by a specific client)**. One master table, no duplicate service tables (alternative reading in Q-11).

| Requirement | Implementation | Status |
|---|---|---|
| E: Service ID | `services.id` + `services.service_code` | ✅ |
| E: Department | `services.department_id` → `departments` | ✅ |
| E: Service name | `services.name` (unique per organization) | ✅ |
| E: Fee | `services.default_fee`; client-specific `client_services.agreed_fee` | ✅ |
| E: Nature of User, if applicable | `services.nature_of_user_id` → `nature_of_user_options` | 🟡 |
| E: Description | `services.description` | ✅ |
| E: Timeline / estimated duration | `services.estimated_duration_days`, `services.timeline_note` | ✅ |
| E: Point of Contact — Name / Mobile / Email / Address | `services.poc_name`, `poc_mobile`, `poc_email`, `poc_address` (+ optional `poc_employee_id`) | ✅ |
| E: Client form references services by FK | `client_services.service_id` → `services` | ✅ |
| Client ↔ multiple services; service ↔ multiple clients | `client_services` junction | ✅ |
| Fee/timeline not fixed for every client | `client_services.agreed_fee`, `start_date`, `due_date`, `timeline_note` | ✅ |
| F: ID | `client_services.id` | ✅ |
| F: Service / nature of service — FK | `client_services.service_id` | ✅ |
| F: Description | `client_services.description` | ✅ |
| F: Timeline | `client_services.start_date`, `due_date`, `timeline_note` | ✅ |
| F: Point of Contact — Name / Mobile / Email / Address | `client_services.poc_name`, `poc_mobile`, `poc_email`, `poc_address` (+ optional `poc_employee_id`) | ✅ |

## 7. Employee / staff registration (Section G)

| Requirement | Implementation | Status |
|---|---|---|
| ID — temporary or permanent | `employees.temporary_employee_code`, `permanent_employee_code` (each unique per org), `id_type` enum `TEMPORARY`/`PERMANENT`, `permanent_id_assigned_at` | ✅ |
| First Name / Last Name | `employees.first_name`, `last_name` | ✅ |
| Gender | `employees.gender` enum | ✅ |
| Age | Derived from `employees.date_of_birth` | ✅ |
| Aadhaar Number | `employees.aadhaar_encrypted` + `aadhaar_last4` | ✅ |
| Aadhaar Document Upload | `employees.aadhaar_document_file_id` → `stored_files` | ✅ |
| PAN Number | `employees.pan_number` | ✅ |
| PAN Document Upload | `employees.pan_document_file_id` → `stored_files` | ✅ |
| Address — current and permanent; one or more | `employee_addresses` (`type` = CURRENT / PERMANENT / OTHER; multiple rows) | ✅ |
| Bank Account Code / Account Details | `employee_bank_accounts.account_number_encrypted` + `account_number_last4`, `account_holder_name`, `bank_name` (Q-19) | 🟡 |
| IFSC Code | `employee_bank_accounts.ifsc_code` (+ Zod `ifscSchema`) | ✅ |
| Branch | `employee_bank_accounts.branch` | ✅ |
| Bank Book Upload (crossed out) | `employee_bank_accounts.bank_book_file_id` — **optional** (Q-5) | 🟡 |
| Designation (Manager, Senior, Executive, Account Trainee, Associate Partner) | `employees.designation_id` → `designations` (configurable; defaults in `src/lib/domain/organization-defaults.ts`) | ✅ |
| Nature of Employee (Frontend/Extended?, Backend, On-site) | `employees.nature_id` → `employee_nature_options` (`source_wording` keeps the handwriting) (Q-3) | 🟡 |
| Whom to Report — multi-select | `employee_reporting_relationships` (self-referential M:N) | ✅ |
| Qualification | `employee_qualifications.qualification`, `institution`, `year_of_passing` | ✅ |
| Certificate Upload | `employee_qualifications.certificate_file_id` → `stored_files` | ✅ |
| Profile Picture | `employees.profile_picture_file_id` → `stored_files` | ✅ |
| Marital Status | `employees.marital_status` enum | ✅ |
| Reference of the Reference | `employee_references` (name, relationship, mobile, email, address, `referred_by`, notes) (Q-20) | 🟡 |
| Mobile Number | `employees.mobile` | ✅ |
| Email ID | `employees.email` | ✅ |
| Message / remarks | `employees.remarks` | ✅ |
| Type of employment — On-site / Off-site | `employees.work_location_type` enum `ON_SITE` / `OFF_SITE` | ✅ |
| Agreed salary | `employee_salary_records.agreed_salary`, `salary_period`, `effective_from` | ✅ |
| Committed increment | `employee_salary_records.committed_increment_amount`, `committed_increment_percent`, `committed_increment_date` | ✅ |
| Increment amount / continuation details | `employee_salary_records.increment_notes` (Q-21) | 🟡 |
| Official email / email app | `employees.official_email` | ✅ |
| Joining letter | `employee_documents` `type = JOINING_LETTER` | ✅ |
| Offer letter | `employee_documents` `type = OFFER_LETTER` | ✅ |
| Memo — misconduct | `employee_memos` (`category = MISCONDUCT`, subject, description, issued_by, file, acknowledged_at) | ✅ |
| Temporary ID initially | default `id_type = TEMPORARY`, `approval_status = PENDING` | ✅ |
| Admin approval → permanent ID | `approval_status = APPROVED`, `approved_at`, `approved_by_id` → `users`; `permanent_employee_code`; CHECK requires code when PERMANENT | ✅ |
| Not approved → delete or send for review | `approval_status = UNDER_REVIEW` (+ `review_notes`) or `REJECTED` (`rejected_at/by`); hard delete possible only without operational history (Q-4) | 🟡 |
| Seven-day trial / probation | `employment_status = PROBATION`, `probation_start_date`, `probation_end_date`; default from `organizations.default_probation_days` (7, editable) | ✅ |
| Approval vs employment status kept separate | `approval_status` ≠ `employment_status` ≠ `id_type` | ✅ |

## 8. Team allocation (Section H)

| Requirement | Implementation | Status |
|---|---|---|
| ID | `team_allocations.id` | ✅ |
| Retainer/client job display | App, from `team_allocations` + `client_services` (`engagement_nature`) | ✅ |
| Calendar view | App, from `team_allocations.start_date` / `end_date` | ✅ |
| Available person display | App, Derived from allocations, `attendance_records`, `leave_requests` | ✅ |
| Availability colours (green / orange) | App; underlying data: `allocation_percent`, `status`, dates (colour rules Q-22) | 🟡 |
| Client/business ID — FK | `team_allocations.client_id` → `clients` | ✅ |
| Expanded client details: Trade Name | `clients.trade_name` via FK | ✅ |
| — Services Offered | `client_services` via client (or `team_allocations.client_service_id`) | ✅ |
| — Point of Contact | `client_services.poc_*` | ✅ |
| — Timeline | `client_services.start_date` / `due_date` / `timeline_note` | ✅ |
| — Team Members Allocated | `team_allocations` rows for the client → `employees` | ✅ |
| — Profile Picture | `clients.profile_picture_file_id` | ✅ |
| Junior / Mid-level / Senior | `team_allocations.seniority_level` (+ `designations.seniority_level` default) | ✅ |
| Availability | `team_allocations.allocation_percent` + Derived | ✅ |
| Change of Allocation | `replaces_allocation_id`, `change_reason`, `status = ENDED` on the old row (history kept) | ✅ |
| Connection with Timesheet | `timesheet_entries.team_allocation_id` → `team_allocations` | ✅ |
| No list of IDs in a text field | One row per employee allocation | ✅ |

## 9. Task management (Section I)

| Requirement | Implementation | Status |
|---|---|---|
| ID | `tasks.id` | ✅ |
| Calendar view of available resources | App, from `team_allocations`, `task_assignments`, `tasks.due_at`, attendance/leave | ✅ |
| Client/business ID — FK | `tasks.client_id` → `clients` (+ optional `client_service_id`) | ✅ |
| Quick task: Text / written work | `tasks.title`, `tasks.description` | ✅ |
| Quick task: Image | `task_attachments` `kind = IMAGE` | ✅ |
| Quick task: Document | `task_attachments` `kind = DOCUMENT` | ✅ |
| Priority High / Medium / Low | `tasks.priority` enum | ✅ |
| ASAP | `tasks.is_asap` | ✅ |
| Timeline | `tasks.start_at`, `tasks.due_at` | ✅ |
| Attached artifact | `task_attachments.file_id` → `stored_files` | ✅ |
| Reminder option / timings | `task_reminders` (`remind_at`, `channel`, `status`, `recipient_employee_id`) | ✅ |
| Status: Pending task | `tasks.status = PENDING` (also IN_PROGRESS, ON_HOLD, COMPLETED, CANCELLED) | ✅ |
| Status: Overdue | Derived: `due_at < now()` and not COMPLETED/CANCELLED (never stored → never contradictory) | ✅ |
| Assignment of task (possibly multiple) | `task_assignments` junction | ✅ |
| Writing for — client side / remark | `tasks.writing_for_remark` (Q-23) | 🟡 |
| Writing from — team member / remark | `tasks.writing_from_employee_id` → `employees`, `writing_from_remark` (Q-23) | 🟡 |
| Maker and status | `tasks.maker_employee_id` → `employees`, `maker_status`, `maker_updated_at` | ✅ |
| Checker and status | `tasks.checker_employee_id` → `employees`, `checker_status`, `checker_updated_at` | ✅ |
| Status change history | `task_activities` (append-only) | ✅ |
| Task status ≠ maker/checker review status | separate columns/enums | ✅ |

## 10. Attendance (Section J)

| Requirement | Implementation | Status |
|---|---|---|
| ID | `attendance_records.id` | ✅ |
| Staff ID — FK | `attendance_records.employee_id` → `employees` | ✅ |
| Time In — with date | `attendance_records.attendance_date`, `time_in` (timestamptz) | ✅ |
| Time Out — with date | `attendance_records.time_out` | ✅ |
| Latitude / Longitude | `time_in_latitude`, `time_in_longitude`, `time_out_latitude`, `time_out_longitude` (range-checked) | ✅ |
| Active / Non-active (crossed out) | **Not implemented** — pending (Q-6) | 📝 |
| Status P / A / L / HD | `attendance_records.status` enum `PRESENT`, `ABSENT`, `LEAVE`, `HALF_DAY` | ✅ |
| Live picture capture | `time_in_photo_file_id`, `time_out_photo_file_id` → `stored_files` | ✅ |
| Work hours — calculated | Derived: `time_out − time_in` | ✅ |
| Allowed paid leaves | `leave_balances.allowed_paid_leaves` per period; applications in `leave_requests` | ✅ |
| Employee / team member display | App, from `employees` | ✅ |
| Corrections / multiple sessions / leave approval rules | Not invented; no unique (employee, date) constraint (Q-24) | 📝 |

## 11. Daily timesheet — 10A

| Requirement | Implementation | Status |
|---|---|---|
| ID | `timesheet_entries.id` | ✅ |
| Team Member Name / Staff ID — FK | `timesheet_entries.employee_id` → `employees` | ✅ |
| Serial Number | `timesheet_entries.serial_number` | ✅ |
| Date of Visit | `timesheet_entries.work_date` | ✅ |
| Client Name | `timesheet_entries.client_id` → `clients`; `client_name_text` for unregistered clients | ✅ |
| Place of Work | `timesheet_entries.place_of_work` | ✅ |
| Type of Work | `timesheet_entries.type_of_work` (free text until options are known) | ✅ |
| Bank Name — bank/card work | `timesheet_entries.bank_name` | ✅ |
| Period From / Period To | `timesheet_entries.period_from`, `period_to` | ✅ |
| Number of Transactions / Entries | `timesheet_entries.transaction_count` | ✅ |
| Approximate Time Taken — minutes | `timesheet_entries.approx_minutes` | ✅ |
| Message through WhatsApp | `timesheet_entries.whatsapp_message` (Q-25) | 🟡 |
| Optional task link | `timesheet_entries.task_id` (nullable) | ✅ |

## 12. Timesheet communication — 10B

Implemented as one normalized table, `pending_items`, with `pending_with` = `CLIENT` or `TEAM_MEMBER` and shared fields.

| Requirement | Implementation | Status |
|---|---|---|
| Details of work done | `timesheet_entries.work_details` | ✅ |
| Status of work done | `timesheet_entries.work_status` | ✅ |
| Pending with client | `pending_items.pending_with = CLIENT` (+ `client_id`) | ✅ |
| What we asked — client has not provided | `pending_items.request_description` (pending_with CLIENT) | ✅ |
| Asked based on / request given on — date | `pending_items.requested_on` | ✅ |
| Due by client / date promised | `pending_items.due_by` | ✅ |
| Status — Clear / Open / Closed | `pending_items.status` `OPEN` / `CLOSED` (+ `closed_at`) | ✅ |
| Days pending — automatic | Derived: `(closed_at or today) − requested_on` | ✅ |
| Pending with team member | `pending_items.pending_with = TEAM_MEMBER`, `pending_with_employee_id` → `employees` | ✅ |
| What client asked us — still to be done | `pending_items.request_description` (pending_with TEAM_MEMBER) | ✅ |
| Remark (“Discomfort Remark”?) | `pending_items.remark` (Q-9) | 🟡 |
| “Government Department” heading | Not modelled — meaning unclear (Q-10) | 📝 |
| Link to work / task / client | `timesheet_entry_id`, `task_id`, `client_id` (all optional) | ✅ |

## 13. Day report — 11

| Requirement | Implementation | Status |
|---|---|---|
| Name of Reporting Person | `day_reports.reporting_employee_id` → `employees` | ✅ |
| Send to the Manager | `day_report_recipients.recipient_employee_id` → `employees` (one or more), `sent_at`, `read_at`, `acknowledged_at` | ✅ |
| Report date / content | `day_reports.report_date`, `summary`, `status`, `submitted_at`; format & delivery pending (Q-26) | 🟡 |

## 14. Pending tracker — 12A Daily

| Requirement | Implementation | Status |
|---|---|---|
| Daily pending work | `pending_items` with `category = DAILY` (index on organization, category, status) | ✅ |

## 15. Pending tracker — 12B Communication

| Requirement | Implementation | Status |
|---|---|---|
| Communication follow-ups | `pending_items` with `category = COMMUNICATION` | ✅ |
| Retrieve 12A and 12B separately | filter on `category`; client- vs team-side on `pending_with` | ✅ |

## 16. Client report — 13A

Live report = query of source tables; `client_reports.snapshot` freezes it when generated.

| Requirement | Implementation | Status |
|---|---|---|
| Details of Team List | `team_allocations` → `employees` for the client | ✅ |
| Maker / Maker status | `tasks.maker_employee_id`, `maker_status` | ✅ |
| Checked / Checker / Checker status | `tasks.checker_employee_id`, `checker_status` | ✅ |
| Client observation status | `tasks.client_observation_status`, `client_observation_note` (values Q-27) | 🟡 |
| Pending task — our side | `pending_items` `pending_with = TEAM_MEMBER` + open `tasks` | ✅ |
| Pending task — client side | `pending_items` `pending_with = CLIENT` | ✅ |
| Fees details | `client_services.agreed_fee`, `client_dues` | ✅ |
| Team involved | `team_allocations`, `task_assignments`, `timesheet_entries` | ✅ |
| Team-wise committed work | `work_commitments` (employee, client, period, description, target, status) | ✅ |
| End-of-month summary / details | `client_reports.summary_notes`, `report_type = MONTHLY_SUMMARY`, `period_start/end` (Q-28) | 🟡 |
| Historical snapshot | `client_reports.snapshot` (JSON), `snapshot_version`, `generated_at/by`, optional `export_file_id` | ✅ |

## 17. Client pending report — 13B

| Requirement | Implementation | Status |
|---|---|---|
| Dues | `client_dues` (amount, due_date, status OPEN/SETTLED/WRITTEN_OFF, reference_number, optional `client_service_id`) — extension point, no accounting system (Q-12) | 🟡 |

---

## Cross-cutting requirements

| Requirement | Implementation |
|---|---|
| Approval metadata references administrator/user | `clients.approved_by_id` / `rejected_by_id`, `employees.approved_by_id` / `rejected_by_id`, `leave_requests.decided_by_id` → `users`; plus `audit_logs` |
| Uploaded documents associated with the right owner | owner FK on document tables / single-slot FK columns; `stored_files.organization_id` |
| Preserve historical assignments, activities, approvals | `team_allocations` change chain, `task_assignments.removed_at`, `task_activities`, approval timestamps, `audit_logs`, RESTRICT on operational FKs |
| Organization-scoped access | `organization_id` on every top-level table + `organization_memberships` (App enforcement) |

## 18. Requirement-level status (all sources)

Sources: **HW** handwritten notes / DFD · **GD** Google Drive references · **S2** implementation specification · **S3** UI/UX specification (Pages 1–60) · **AD** final addendum. Tests: **U** unit (`tests/domain.test.ts`, `tests/rules.test.ts`), **E** end-to-end test title in `tests/e2e/workflow.spec.ts`.

| # | Requirement | Source | Implementation | Status | Test |
|---|---|---|---|---|---|
| 1 | Public website: home, services, service detail, pricing (no invented fees), help search | S2, S3 P1–5 | `src/app/(public)` | IT | E “public pages render verified firm content…” |
| 2 | Firm/owner registration, closes after first firm | HW A, S3 | `/register/firm`, `firm-registration.ts` | IT | E “owner registers the firm…” |
| 3 | Sign in by login ID or email; generic errors; rate limit | S3 P6 | `/login`, `auth.ts` | IT | E “wrong passwords get one generic message…” |
| 4 | Forgot / reset password, no enumeration, single-use links | S3 P7 | `/forgot-password`, `password-links.ts` | IT | E “forgot password never reveals accounts…” |
| 5 | Quick registration → pending → approval (same record) | HW C | `/register/quick`, client workflow | IT | E “a business registers itself (quick)…”, “admin approval queue…”; U client workflow |
| 6 | Full registration wizard; representatives validated against the constitution | S3 P9–10, AD §5.8 | `/register/business`, `constitution.ts` | IT (wizard) / IN (server role rule) | E “full business registration wizard…”; U “constitution representatives” |
| 7 | Multiple GSTINs per client, GSTIN-only rows, duplicates rejected | HW C, §4 | `client_gst_registrations` | IT | E wizard; “staff quick registration … duplicate GSTIN rejected” |
| 8 | Pending accounts: 7-day access from creation, then locked until approved; live sign-out at the deadline; rejected = no access | Owner decision 26 Oct 2026 | `approval-access.ts`, `session.ts`, `AccessWatcher` | IT | U “approval grace period”; E “pending staff: full access for 7 days…”, “a business registers itself (quick)…”, “day 8: a business…” |
| 9 | Rejected applicant corrects and resubmits | AD §3A | office resubmits (staff) | AC | — (K-3) |
| 10 | Staff login by administrator, one-time setup link, no password shown | HW G, S3 | `employees.ts` | IT | E “owner creates staff logins…” |
| 11 | Onboarding: submit, approve (temporary → permanent ID), review, reject | HW G | onboarding workflow | IT (approve) / IN (review, reject) | E “employee sets a password…”, “admin approves onboarding…” |
| 12 | Pending staff blocked until approved | HW G, AD §3C | `requireCapability` | IT | E “… is blocked until approved” |
| 13 | No self role/status change; owner role fixed | AD §3C, §6 | `updateAccessAction` | IN | — |
| 14 | Deactivating a login ends its sessions; open pages sign out within 30 s | AD §3C, §6 | `setPortalUserStatus`, `updateAccessAction`, `AccessWatcher` | IT (client) / IN (staff) | E “… a disabled login loses access” |
| 15 | Roles and server-side permission matrix | S2, AD §6 | `permissions.ts`, `session.ts` | IT | U permissions; E no-access redirects |
| 16 | Cross-client / cross-role access blocked (URL, id) | AD §6 | scopes, 404s | IT | E cross-client 404; staff export 404; staff no-access |
| 17 | Allocation: availability from real data, conflicts, history, notifications in and out | HW H, AD §3E | `allocations.ts`, `allocation.ts` | IT (conflicts) / IN (change notifications) | E “allocation conflicts are not saved silently”; U conflicts |
| 18 | Tasks: priority/ASAP, due, reminders, attachments, list/board/calendar | HW I | `tasks.ts` | IT (core) / IN (attachments, reminders) | E “task: maker/checker cycle…” |
| 19 | Maker–checker; maker cannot approve own work | HW I | `task-workflow.ts` | IT | U canPerform; E task test |
| 20 | Waiting on client / team member states | S3 | task workflow | IT | E task test |
| 21 | Overdue derived; one-time overdue notice | S3 P59 | `derived.ts`, `deliverOverdueNotices` | IT (derived) / IN (notice) | U isTaskOverdue |
| 22 | Attendance mark in/out, location optional, late reason | HW J | `attendance.ts` | IT | E “team member: attendance…” |
| 23 | One attendance record per employee per day (concurrency) | AD §8 | unique index (migration 5), conditional writes | IN | — |
| 24 | Attendance corrections audited with original values | HW J | `attendance_corrections` | IN | — |
| 25 | Leave: request, decide (reportees only, not own), race-safe | HW J | `attendance.ts` | IN | — |
| 26 | Policy figures (two versions) configurable and indicative | GD | `attendance-policy.ts` | IT (calculation) / AC (which policy) | U evaluateDay, summarizeMonth |
| 27 | Timesheet 10A daily entries | HW 10A | `/app/timesheet` | IT | E “team member…” |
| 28 | Communication 10B: client side vs our side | HW 10B, S3 P43 | pending items | IT | E “staff request appears in the client portal…” |
| 29 | Timesheet review: mark reviewed, return with remark, correct with history | S3 P44–45 | `worklog.ts`, `/app/timesheet/[id]` | IT | E “senior returns a timesheet entry…” |
| 30 | Pending tracker 12A/12B: responsible person, links, follow-ups | HW 12A/B, S3 P46–48 | `/app/pending` | IT | E “team member…”, “staff request appears…” |
| 31 | Days pending (calendar / business, IST, original date kept) | S3 P43, AD §3G | `daysPending` | IT | U daysPending |
| 32 | Day report: prefill, recipients, review remark, related work | HW 11, S3 P49–51 | `/app/day-reports` | IT | E “team member…”, “senior returns…” |
| 33 | Client report 13A from source records; hours by day; recorded vs reviewed; drill-down | HW 13A, S3 P52–54, AD §9 | `client-report.ts` | IT | E “client report shows team-wise hours…” |
| 34 | Client-facing CSV without internal remarks; same authorization; audited | S3 P55 | export route | IT | E client report test (CSV), “staff without report rights…”; U toCsv |
| 35 | Print view | S3 P55 | print CSS | IN | — |
| 36 | Client pending report / dues 13B | HW 13B | `client_dues` | IT | E client report test (records a due) |
| 37 | Fees & dues overview, no invented tax or invoice | S3 P57, AD §5.6 | `/app/dues` | IN / AC (scope) | E layout checks only |
| 38 | Client observations register with history | S3 P56 | `observations.ts` | IN | U transitions; E layout checks only |
| 39 | Client portal: requests, replies with documents, shared work, accept / raise observations | S3 | `/client/*` | IT (requests, replies) / IN (observations) | E “staff request appears…” |
| 40 | My profile (name, password) | S3 P58 | `/app/profile`, `/client/profile` | IN | E layout checks only |
| 41 | Notifications: opening marks read, safe links, real events only | S3 P59 | `/api/notifications/[id]` | IT | E “senior returns…”, “forgot password…” (open a notification); U safeAppPath |
| 42 | Settings: designations, work types, pending-days basis, timezone read-only | S3 P60 | `/app/settings?tab=lists` | IN | E layout checks only |
| 43 | Confirmation for consequential actions | S3 §28 | `confirm` on buttons | IT (client/onboarding approval, reset link) / IN (others) | E dialogs accepted in approval tests |
| 44 | List sorting; duplicate-submit prevention; input kept on errors | S3 §28 | list pages, `ActionForm` | IN | — |
| 45 | CSP and security headers | S3 §30 | `next.config.ts` | IN | — (headers not asserted) |
| 46 | Private file storage, content-type checks, authorized downloads | S2, AD §7 | `files.ts`, `/api/files/[id]` | IN | — (no upload E2E) |
| 47 | Sensitive identifiers encrypted / masked (Aadhaar, bank) | HW G, S2 | AES-GCM, last-4 columns | IT | E “admin approves onboarding … Aadhaar is masked” |
| 48 | Audit log for consequential actions | S2, AD §8 | `audit.ts` | IN | — (written, not asserted) |
| 49 | Responsive layouts (phone, tablet), no horizontal scroll | S3 §34 | Tailwind layouts | IT | E phone-width and tablet tests |
| 50 | Email / SMS / WhatsApp notifications | S2, AD §10 | — | BL (no provider configured) | — |
| 51 | GST portal verification | HW A | — | BL (no API access) | — |
| 52 | Malware scanning of uploads | AD §7 | type and size checks only | PI | — |
| 53 | Fee schedules, invoices, payments | AD §5.6 | — | AC (K-1) | — |
| 54 | One-time vs retainer rules; one-month expiry | HW C, AD §5.1–2 | optional fields only | AC (K-4, K-5) | — |
| 55 | Documentation set required by the addendum | AD §2 | `docs/` | IN (reviewed against the code; no automated check) | — |
