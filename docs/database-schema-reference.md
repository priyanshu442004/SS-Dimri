# Database Schema Reference (generated)

> **Generated from the live PostgreSQL catalog by `npm run docs:schema`. Do not edit by hand.**
> Generated: 2026-10-26T16:20:57.304Z · Tables: 61 · Enums: 57
>
> Purpose of each table, design rationale and requirement mapping: see `database-design.md`,
> `database-erd.md` and `requirements-traceability.md`.

Legend: **PK** primary key · **FK** foreign key · **UQ** single-column unique · `NULL` = nullable.

## Contents

- [accounts](#accounts)
- [attendance_corrections](#attendance_corrections)
- [attendance_policies](#attendance_policies)
- [attendance_records](#attendance_records)
- [audit_logs](#audit_logs)
- [business_natures](#business_natures)
- [classification_options](#classification_options)
- [client_classifications](#client_classifications)
- [client_contacts](#client_contacts)
- [client_documents](#client_documents)
- [client_dues](#client_dues)
- [client_gst_registrations](#client_gst_registrations)
- [client_observations](#client_observations)
- [client_purchase_orders](#client_purchase_orders)
- [client_reports](#client_reports)
- [client_services](#client_services)
- [clients](#clients)
- [compliance_items](#compliance_items)
- [constitution_members](#constitution_members)
- [constitutions](#constitutions)
- [day_report_recipients](#day_report_recipients)
- [day_reports](#day_reports)
- [departments](#departments)
- [designations](#designations)
- [employee_addresses](#employee_addresses)
- [employee_bank_accounts](#employee_bank_accounts)
- [employee_documents](#employee_documents)
- [employee_memos](#employee_memos)
- [employee_nature_options](#employee_nature_options)
- [employee_previous_employments](#employee_previous_employments)
- [employee_qualifications](#employee_qualifications)
- [employee_references](#employee_references)
- [employee_reporting_relationships](#employee_reporting_relationships)
- [employee_salary_records](#employee_salary_records)
- [employees](#employees)
- [follow_ups](#follow_ups)
- [leave_balances](#leave_balances)
- [leave_requests](#leave_requests)
- [nature_of_user_options](#nature_of_user_options)
- [notifications](#notifications)
- [organization_certificates](#organization_certificates)
- [organization_documents](#organization_documents)
- [organization_memberships](#organization_memberships)
- [organization_previous_companies](#organization_previous_companies)
- [organizations](#organizations)
- [pending_items](#pending_items)
- [services](#services)
- [sessions](#sessions)
- [stored_files](#stored_files)
- [task_activities](#task_activities)
- [task_assignments](#task_assignments)
- [task_attachments](#task_attachments)
- [task_reminders](#task_reminders)
- [task_reviews](#task_reviews)
- [tasks](#tasks)
- [team_allocations](#team_allocations)
- [timesheet_entries](#timesheet_entries)
- [users](#users)
- [verifications](#verifications)
- [work_commitments](#work_commitments)
- [work_types](#work_types)
- [Enum types](#enum-types)

## accounts

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| account_id | text | NOT NULL |  |  |
| provider_id | text | NOT NULL |  |  |
| user_id | uuid | NOT NULL |  | **FK** → users.id (on delete cascade) |
| access_token | text | NULL |  |  |
| refresh_token | text | NULL |  |  |
| id_token | text | NULL |  |  |
| access_token_expires_at | timestamptz | NULL |  |  |
| refresh_token_expires_at | timestamptz | NULL |  |  |
| scope | text | NULL |  |  |
| password | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `accounts_user_id_idx` (user_id)

## attendance_corrections

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| attendance_record_id | uuid | NOT NULL |  | **FK** → attendance_records.id (on delete restrict) |
| actor_user_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| reason | text | NOT NULL |  |  |
| original_values | jsonb | NOT NULL |  |  |
| new_values | jsonb | NOT NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |

**Indexes / unique constraints**

- `attendance_corrections_attendance_record_id_idx` (attendance_record_id)

## attendance_policies

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **UQ** **FK** → organizations.id (on delete cascade) |
| office_start | varchar(5) | NOT NULL | `'09:30'::character varying` |  |
| reporting_grace_until | varchar(5) | NOT NULL | `'09:45'::character varying` |  |
| lunch_start | varchar(5) | NOT NULL | `'13:00'::character varying` |  |
| lunch_end | varchar(5) | NOT NULL | `'13:30'::character varying` |  |
| office_end | varchar(5) | NOT NULL | `'18:30'::character varying` |  |
| leaving_grace_until | varchar(5) | NOT NULL | `'18:45'::character varying` |  |
| half_day_if_leaving_before | varchar(5) | NOT NULL | `'17:30'::character varying` |  |
| required_minutes | integer | NOT NULL | `540` |  |
| onsite_required_minutes | integer | NOT NULL | `480` |  |
| reduced_required_minutes | integer | NOT NULL | `510` |  |
| far_client_early_month_minutes | integer | NOT NULL | `510` |  |
| far_client_early_month_until_day | integer | NOT NULL | `15` |  |
| late_arrivals_per_half_day | integer | NOT NULL | `2` |  |
| late_grace_per_month | integer | NOT NULL | `1` |  |
| overtime_mode | OvertimeMode | NOT NULL | `'ACTUAL_MINUTES'::"OvertimeMode"` |  |
| overtime_minutes_per_day | integer | NOT NULL | `540` |  |
| paid_leaves_per_month | numeric(4,1) | NOT NULL | `1` |  |
| planned_leave_notice_days | integer | NOT NULL | `15` |  |
| policy_confirmed | boolean | NOT NULL | `false` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `attendance_policies_organization_id_key` (organization_id)

## attendance_records

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete restrict) |
| attendance_date | date | NOT NULL |  |  |
| time_in | timestamptz | NULL |  |  |
| time_out | timestamptz | NULL |  |  |
| time_in_latitude | numeric(9,6) | NULL |  |  |
| time_in_longitude | numeric(9,6) | NULL |  |  |
| time_out_latitude | numeric(9,6) | NULL |  |  |
| time_out_longitude | numeric(9,6) | NULL |  |  |
| time_in_photo_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| time_out_photo_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| status | AttendanceStatus | NOT NULL |  |  |
| remarks | text | NULL |  |  |
| recorded_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| late_reason | text | NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `attendance_records_employee_id_attendance_date_key` (employee_id, attendance_date)
- `attendance_records_organization_id_attendance_date_idx` (organization_id, attendance_date)
- UNIQUE `attendance_records_time_in_photo_file_id_key` (time_in_photo_file_id)
- UNIQUE `attendance_records_time_out_photo_file_id_key` (time_out_photo_file_id)

**Check constraints**

- `attendance_coordinates_check`: `CHECK ((((time_in_latitude IS NULL) OR ((time_in_latitude >= ('-90'::integer)::numeric) AND (time_in_latitude <= (90)::numeric))) AND ((time_out_latitude IS NULL) OR ((time_out_latitude >= ('-90'::integer)::numeric) AND (time_out_latitude <= (90)::numeric))) AND ((time_in_longitude IS NULL) OR ((time_in_longitude >= ('-180'::integer)::numeric) AND (time_in_longitude <= (180)::numeric))) AND ((time_out_longitude IS NULL) OR ((time_out_longitude >= ('-180'::integer)::numeric) AND (time_out_longitude <= (180)::numeric)))))`
- `attendance_time_order_check`: `CHECK (((time_out IS NULL) OR (time_in IS NULL) OR (time_out >= time_in)))`

## audit_logs

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NULL |  | **FK** → organizations.id (on delete set null) |
| actor_user_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| action | text | NOT NULL |  |  |
| entity_type | text | NOT NULL |  |  |
| entity_id | uuid | NULL |  |  |
| metadata | jsonb | NULL |  |  |
| ip_address | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |

**Indexes / unique constraints**

- `audit_logs_entity_type_entity_id_idx` (entity_type, entity_id)
- `audit_logs_organization_id_created_at_idx` (organization_id, created_at)

## business_natures

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| code | text | NOT NULL |  | **UQ** |
| label | text | NOT NULL |  |  |
| description | text | NULL |  |  |
| sort_order | integer | NOT NULL | `0` |  |
| is_active | boolean | NOT NULL | `true` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `business_natures_code_key` (code)

## classification_options

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| basis | ClassificationBasis | NOT NULL |  |  |
| code | text | NOT NULL |  | **UQ** |
| label | text | NOT NULL |  |  |
| description | text | NULL |  |  |
| sort_order | integer | NOT NULL | `0` |  |
| is_active | boolean | NOT NULL | `true` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `classification_options_basis_idx` (basis)
- UNIQUE `classification_options_code_key` (code)

## client_classifications

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete cascade) |
| basis | ClassificationBasis | NOT NULL |  |  |
| option_id | uuid | NOT NULL |  | **FK** → classification_options.id (on delete restrict) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |

**Indexes / unique constraints**

- UNIQUE `client_classifications_client_id_basis_key` (client_id, basis)
- `client_classifications_option_id_idx` (option_id)

## client_contacts

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete cascade) |
| name | text | NOT NULL |  |  |
| designation | text | NULL |  |  |
| mobile | varchar(20) | NULL |  |  |
| email | text | NULL |  |  |
| address | text | NULL |  |  |
| is_primary | boolean | NOT NULL | `false` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `client_contacts_client_id_idx` (client_id)

## client_documents

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete cascade) |
| type | ClientDocumentType | NOT NULL |  |  |
| title | text | NULL |  |  |
| file_id | uuid | NOT NULL |  | **UQ** **FK** → stored_files.id (on delete restrict) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `client_documents_client_id_type_idx` (client_id, type)
- UNIQUE `client_documents_file_id_key` (file_id)

## client_dues

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete restrict) |
| client_service_id | uuid | NULL |  | **FK** → client_services.id (on delete set null) |
| description | text | NOT NULL |  |  |
| reference_number | text | NULL |  |  |
| amount | numeric(14,2) | NOT NULL |  |  |
| due_date | date | NULL |  |  |
| status | DueStatus | NOT NULL | `'OPEN'::"DueStatus"` |  |
| settled_at | timestamptz | NULL |  |  |
| notes | text | NULL |  |  |
| created_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `client_dues_client_id_status_idx` (client_id, status)
- `client_dues_organization_id_status_due_date_idx` (organization_id, status, due_date)

**Check constraints**

- `client_dues_amount_check`: `CHECK ((amount >= (0)::numeric))`

## client_gst_registrations

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete cascade) |
| gstin | varchar(15) | NOT NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `client_gst_registrations_client_id_gstin_key` (client_id, gstin)
- `client_gst_registrations_gstin_idx` (gstin)

## client_observations

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete restrict) |
| task_id | uuid | NULL |  | **FK** → tasks.id (on delete set null) |
| client_service_id | uuid | NULL |  | **FK** → client_services.id (on delete set null) |
| responsible_employee_id | uuid | NULL |  | **FK** → employees.id (on delete set null) |
| observed_on | date | NOT NULL |  |  |
| details | text | NOT NULL |  |  |
| status | ObservationStatus | NOT NULL | `'OPEN'::"ObservationStatus"` |  |
| source | ObservationSource | NOT NULL | `'STAFF'::"ObservationSource"` |  |
| resolution | text | NULL |  |  |
| closed_at | timestamptz | NULL |  |  |
| created_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `client_observations_client_id_status_idx` (client_id, status)
- `client_observations_organization_id_status_idx` (organization_id, status)
- `client_observations_task_id_idx` (task_id)

## client_purchase_orders

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete cascade) |
| client_service_id | uuid | NULL |  | **FK** → client_services.id (on delete set null) |
| po_number | text | NOT NULL |  |  |
| po_date | date | NULL |  |  |
| amount | numeric(14,2) | NULL |  |  |
| valid_from | date | NULL |  |  |
| valid_to | date | NULL |  |  |
| details | text | NULL |  |  |
| file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `client_purchase_orders_client_id_po_number_key` (client_id, po_number)
- UNIQUE `client_purchase_orders_file_id_key` (file_id)
- `client_purchase_orders_organization_id_idx` (organization_id)

**Check constraints**

- `client_purchase_orders_amount_check`: `CHECK (((amount IS NULL) OR (amount >= (0)::numeric)))`

## client_reports

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete restrict) |
| report_type | ClientReportType | NOT NULL | `'MONTHLY_SUMMARY'::"ClientReportType"` |  |
| period_start | date | NOT NULL |  |  |
| period_end | date | NOT NULL |  |  |
| status | ClientReportStatus | NOT NULL | `'DRAFT'::"ClientReportStatus"` |  |
| summary_notes | text | NULL |  |  |
| snapshot | jsonb | NULL |  |  |
| snapshot_version | integer | NOT NULL | `1` |  |
| export_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| generated_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| generated_at | timestamptz | NULL |  |  |
| shared_at | timestamptz | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `client_reports_client_id_period_start_idx` (client_id, period_start)
- UNIQUE `client_reports_export_file_id_key` (export_file_id)
- `client_reports_organization_id_period_start_idx` (organization_id, period_start)

**Check constraints**

- `client_reports_dates_check`: `CHECK ((period_end >= period_start))`

## client_services

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete cascade) |
| service_id | uuid | NOT NULL |  | **FK** → services.id (on delete restrict) |
| description | text | NULL |  |  |
| agreed_fee | numeric(14,2) | NULL |  |  |
| engagement_nature | ClientEngagementNature | NULL |  |  |
| start_date | date | NULL |  |  |
| due_date | date | NULL |  |  |
| timeline_note | text | NULL |  |  |
| retainer_start_date | date | NULL |  |  |
| retainer_end_date | date | NULL |  |  |
| renewed_from_id | uuid | NULL |  | **UQ** **FK** → client_services.id (on delete set null) |
| status | ClientServiceStatus | NOT NULL | `'ACTIVE'::"ClientServiceStatus"` |  |
| poc_employee_id | uuid | NULL |  | **FK** → employees.id (on delete set null) |
| poc_name | text | NULL |  |  |
| poc_mobile | varchar(20) | NULL |  |  |
| poc_email | text | NULL |  |  |
| poc_address | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `client_services_client_id_status_idx` (client_id, status)
- `client_services_organization_id_idx` (organization_id)
- UNIQUE `client_services_renewed_from_id_key` (renewed_from_id)
- `client_services_service_id_idx` (service_id)

**Check constraints**

- `client_services_dates_check`: `CHECK (((due_date IS NULL) OR (start_date IS NULL) OR (due_date >= start_date)))`
- `client_services_fee_check`: `CHECK (((agreed_fee IS NULL) OR (agreed_fee >= (0)::numeric)))`
- `client_services_retainer_dates_check`: `CHECK (((retainer_end_date IS NULL) OR (retainer_start_date IS NULL) OR (retainer_end_date >= retainer_start_date)))`

## clients

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| client_code | text | NULL |  |  |
| trade_name | text | NOT NULL |  |  |
| legal_name | text | NULL |  |  |
| address | text | NULL |  |  |
| tan | varchar(10) | NULL |  |  |
| pan | varchar(10) | NULL |  |  |
| nature_of_user_id | uuid | NULL |  | **FK** → nature_of_user_options.id (on delete set null) |
| nature_of_client | ClientEngagementNature | NULL |  |  |
| constitution_id | uuid | NULL |  | **FK** → constitutions.id (on delete restrict) |
| profile_picture_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| is_msme | boolean | NULL |  |  |
| msme_registration_number | text | NULL |  |  |
| msme_certificate_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| esi_number | text | NULL |  |  |
| esi_certificate_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| pf_number | text | NULL |  |  |
| pf_certificate_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| status | ClientStatus | NOT NULL | `'PENDING_APPROVAL'::"ClientStatus"` |  |
| created_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| submitted_at | timestamptz | NULL |  |  |
| approved_at | timestamptz | NULL |  |  |
| approved_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| rejected_at | timestamptz | NULL |  |  |
| rejected_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| rejection_reason | text | NULL |  |  |
| details_completed_at | timestamptz | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| primary_business_nature_id | uuid | NULL |  | **FK** → business_natures.id (on delete set null) |
| secondary_business_nature_id | uuid | NULL |  | **FK** → business_natures.id (on delete set null) |
| registration_channel | ClientRegistrationChannel | NOT NULL | `'STAFF'::"ClientRegistrationChannel"` |  |

**Indexes / unique constraints**

- UNIQUE `clients_esi_certificate_file_id_key` (esi_certificate_file_id)
- UNIQUE `clients_msme_certificate_file_id_key` (msme_certificate_file_id)
- UNIQUE `clients_organization_id_client_code_key` (organization_id, client_code)
- `clients_organization_id_status_idx` (organization_id, status)
- `clients_organization_id_trade_name_idx` (organization_id, trade_name)
- `clients_pan_idx` (pan)
- UNIQUE `clients_pf_certificate_file_id_key` (pf_certificate_file_id)
- UNIQUE `clients_profile_picture_file_id_key` (profile_picture_file_id)

## compliance_items

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| department | text | NOT NULL |  |  |
| name | text | NOT NULL |  |  |
| form | text | NULL |  |  |
| applicable_to | text | NULL |  |  |
| frequency | text | NULL |  |  |
| due_date_rule | text | NULL |  |  |
| penalty | text | NULL |  |  |
| remarks | text | NULL |  |  |
| sort_order | integer | NOT NULL | `0` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `compliance_items_department_idx` (department)

## constitution_members

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| client_id | uuid | NULL |  | **FK** → clients.id (on delete cascade) |
| role | ConstitutionMemberRole | NOT NULL |  |  |
| full_name | text | NOT NULL |  |  |
| mobile | varchar(20) | NULL |  |  |
| email | text | NULL |  |  |
| address | text | NULL |  |  |
| pan | varchar(10) | NULL |  |  |
| aadhaar_encrypted | text | NULL |  |  |
| aadhaar_last4 | char(4) | NULL |  |  |
| profile_picture_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| is_primary | boolean | NOT NULL | `false` |  |
| sort_order | integer | NOT NULL | `0` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `constitution_members_client_id_idx` (client_id)
- `constitution_members_organization_id_idx` (organization_id)
- UNIQUE `constitution_members_profile_picture_file_id_key` (profile_picture_file_id)

## constitutions

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| type | ConstitutionType | NOT NULL |  | **UQ** |
| name | text | NOT NULL |  |  |
| representative_role | ConstitutionMemberRole | NOT NULL |  |  |
| allows_multiple | boolean | NOT NULL | `true` |  |
| sort_order | integer | NOT NULL | `0` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| code | text | NULL |  | **UQ** |

**Indexes / unique constraints**

- UNIQUE `constitutions_code_key` (code)
- UNIQUE `constitutions_type_key` (type)

## day_report_recipients

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| day_report_id | uuid | NOT NULL |  | **FK** → day_reports.id (on delete cascade) |
| recipient_employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete restrict) |
| sent_at | timestamptz | NULL |  |  |
| read_at | timestamptz | NULL |  |  |
| acknowledged_at | timestamptz | NULL |  |  |
| review_remark | text | NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `day_report_recipients_day_report_id_recipient_employee_id_key` (day_report_id, recipient_employee_id)
- `day_report_recipients_recipient_employee_id_idx` (recipient_employee_id)

## day_reports

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| reporting_employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete restrict) |
| report_date | date | NOT NULL |  |  |
| summary | text | NULL |  |  |
| status | DayReportStatus | NOT NULL | `'DRAFT'::"DayReportStatus"` |  |
| submitted_at | timestamptz | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| blockers | text | NULL |  |  |
| completed_work | text | NULL |  |  |
| new_assignments | text | NULL |  |  |
| pending_work | text | NULL |  |  |
| work_plan | text | NULL |  |  |

**Indexes / unique constraints**

- `day_reports_organization_id_report_date_idx` (organization_id, report_date)
- `day_reports_reporting_employee_id_report_date_idx` (reporting_employee_id, report_date)

## departments

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| name | text | NOT NULL |  |  |
| description | text | NULL |  |  |
| is_active | boolean | NOT NULL | `true` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| code | text | NULL |  |  |
| is_confirmed | boolean | NOT NULL | `true` |  |
| scope | text | NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `departments_organization_id_name_key` (organization_id, name)

## designations

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| name | text | NOT NULL |  |  |
| seniority_level | SeniorityLevel | NULL |  |  |
| sort_order | integer | NOT NULL | `0` |  |
| is_active | boolean | NOT NULL | `true` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `designations_organization_id_name_key` (organization_id, name)

## employee_addresses

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| type | AddressType | NOT NULL |  |  |
| line1 | text | NOT NULL |  |  |
| line2 | text | NULL |  |  |
| city | text | NULL |  |  |
| state | text | NULL |  |  |
| pincode | varchar(10) | NULL |  |  |
| country | text | NOT NULL | `'India'::text` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `employee_addresses_employee_id_type_idx` (employee_id, type)

## employee_bank_accounts

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| account_holder_name | text | NULL |  |  |
| account_number_encrypted | text | NOT NULL |  |  |
| account_number_last4 | varchar(4) | NOT NULL |  |  |
| ifsc_code | varchar(11) | NOT NULL |  |  |
| bank_name | text | NULL |  |  |
| branch | text | NULL |  |  |
| bank_book_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| is_primary | boolean | NOT NULL | `true` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `employee_bank_accounts_bank_book_file_id_key` (bank_book_file_id)
- `employee_bank_accounts_employee_id_idx` (employee_id)

## employee_documents

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| type | EmployeeDocumentType | NOT NULL |  |  |
| title | text | NULL |  |  |
| issued_on | date | NULL |  |  |
| file_id | uuid | NOT NULL |  | **UQ** **FK** → stored_files.id (on delete restrict) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `employee_documents_employee_id_type_idx` (employee_id, type)
- UNIQUE `employee_documents_file_id_key` (file_id)

## employee_memos

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| memo_date | date | NOT NULL |  |  |
| category | MemoCategory | NOT NULL | `'OTHER'::"MemoCategory"` |  |
| subject | text | NOT NULL |  |  |
| description | text | NULL |  |  |
| issued_by_employee_id | uuid | NULL |  | **FK** → employees.id (on delete set null) |
| file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| acknowledged_at | timestamptz | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| action_required | text | NULL |  |  |
| memo_number | text | NULL |  |  |
| reply_by_date | date | NULL |  |  |

**Indexes / unique constraints**

- `employee_memos_employee_id_memo_date_idx` (employee_id, memo_date)
- UNIQUE `employee_memos_file_id_key` (file_id)

## employee_nature_options

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| label | text | NOT NULL |  |  |
| source_wording | text | NULL |  |  |
| sort_order | integer | NOT NULL | `0` |  |
| is_active | boolean | NOT NULL | `true` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `employee_nature_options_organization_id_label_key` (organization_id, label)

## employee_previous_employments

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| employer_name | text | NOT NULL |  |  |
| employer_address | text | NULL |  |  |
| designation | text | NULL |  |  |
| contact_number | varchar(20) | NULL |  |  |
| from_date | date | NULL |  |  |
| to_date | date | NULL |  |  |
| experience_certificate_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `employee_previous_employments_employee_id_idx` (employee_id)
- UNIQUE `employee_previous_employments_experience_certificate_file_i_key` (experience_certificate_file_id)

## employee_qualifications

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| qualification | text | NOT NULL |  |  |
| institution | text | NULL |  |  |
| year_of_passing | integer | NULL |  |  |
| certificate_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `employee_qualifications_certificate_file_id_key` (certificate_file_id)
- `employee_qualifications_employee_id_idx` (employee_id)

## employee_references

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| name | text | NOT NULL |  |  |
| relationship | text | NULL |  |  |
| mobile | varchar(20) | NULL |  |  |
| email | text | NULL |  |  |
| address | text | NULL |  |  |
| referred_by | text | NULL |  |  |
| notes | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `employee_references_employee_id_idx` (employee_id)

## employee_reporting_relationships

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| manager_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| is_primary | boolean | NOT NULL | `false` |  |
| start_date | date | NULL |  |  |
| end_date | date | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `employee_reporting_relationships_employee_id_manager_id_key` (employee_id, manager_id)
- `employee_reporting_relationships_manager_id_idx` (manager_id)

**Check constraints**

- `employee_reporting_not_self_check`: `CHECK ((employee_id <> manager_id))`

## employee_salary_records

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| effective_from | date | NOT NULL |  |  |
| agreed_salary | numeric(14,2) | NOT NULL |  |  |
| salary_period | SalaryPeriod | NOT NULL | `'MONTHLY'::"SalaryPeriod"` |  |
| committed_increment_amount | numeric(14,2) | NULL |  |  |
| committed_increment_percent | numeric(5,2) | NULL |  |  |
| committed_increment_date | date | NULL |  |  |
| increment_notes | text | NULL |  |  |
| created_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| salary_mode | SalaryMode | NULL |  |  |

**Indexes / unique constraints**

- `employee_salary_records_employee_id_effective_from_idx` (employee_id, effective_from)

**Check constraints**

- `employee_salary_records_amount_check`: `CHECK ((agreed_salary >= (0)::numeric))`

## employees

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| temporary_employee_code | text | NOT NULL |  |  |
| permanent_employee_code | text | NULL |  |  |
| id_type | EmployeeIdType | NOT NULL | `'TEMPORARY'::"EmployeeIdType"` |  |
| permanent_id_assigned_at | timestamptz | NULL |  |  |
| approval_status | EmployeeApprovalStatus | NOT NULL | `'PENDING'::"EmployeeApprovalStatus"` |  |
| approved_at | timestamptz | NULL |  |  |
| approved_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| rejected_at | timestamptz | NULL |  |  |
| rejected_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| review_notes | text | NULL |  |  |
| employment_status | EmploymentStatus | NOT NULL | `'PROBATION'::"EmploymentStatus"` |  |
| date_of_joining | date | NULL |  |  |
| probation_start_date | date | NULL |  |  |
| probation_end_date | date | NULL |  |  |
| exit_date | date | NULL |  |  |
| first_name | text | NOT NULL |  |  |
| last_name | text | NULL |  |  |
| gender | Gender | NULL |  |  |
| date_of_birth | date | NULL |  |  |
| marital_status | MaritalStatus | NULL |  |  |
| aadhaar_encrypted | text | NULL |  |  |
| aadhaar_last4 | char(4) | NULL |  |  |
| aadhaar_document_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| pan_number | varchar(10) | NULL |  |  |
| pan_document_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| designation_id | uuid | NULL |  | **FK** → designations.id (on delete set null) |
| nature_id | uuid | NULL |  | **FK** → employee_nature_options.id (on delete set null) |
| work_location_type | WorkLocationType | NULL |  |  |
| mobile | varchar(20) | NULL |  |  |
| email | text | NULL |  |  |
| official_email | text | NULL |  |  |
| profile_picture_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| remarks | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| attendance_profile | AttendanceProfile | NOT NULL | `'STANDARD'::"AttendanceProfile"` |  |
| department_id | uuid | NULL |  | **FK** → departments.id (on delete set null) |
| emergency_contact_name | text | NULL |  |  |
| emergency_contact_phone | varchar(20) | NULL |  |  |
| emergency_contact_relation | text | NULL |  |  |
| employment_type | EmploymentType | NOT NULL | `'EMPLOYEE'::"EmploymentType"` |  |
| esi_ip_number | text | NULL |  |  |
| father_name | text | NULL |  |  |
| mother_name | text | NULL |  |  |
| offer_accepted_on | date | NULL |  |  |
| onboarding_submitted_at | timestamptz | NULL |  |  |
| uan_number | text | NULL |  |  |
| voter_id_number | text | NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `employees_aadhaar_document_file_id_key` (aadhaar_document_file_id)
- `employees_designation_id_idx` (designation_id)
- `employees_organization_id_approval_status_idx` (organization_id, approval_status)
- `employees_organization_id_employment_status_idx` (organization_id, employment_status)
- UNIQUE `employees_organization_id_permanent_employee_code_key` (organization_id, permanent_employee_code)
- UNIQUE `employees_organization_id_temporary_employee_code_key` (organization_id, temporary_employee_code)
- UNIQUE `employees_pan_document_file_id_key` (pan_document_file_id)
- UNIQUE `employees_profile_picture_file_id_key` (profile_picture_file_id)

**Check constraints**

- `employees_permanent_code_check`: `CHECK (((id_type <> 'PERMANENT'::EmployeeIdType) OR (permanent_employee_code IS NOT NULL)))`
- `employees_probation_dates_check`: `CHECK (((probation_end_date IS NULL) OR (probation_start_date IS NULL) OR (probation_end_date >= probation_start_date)))`

## follow_ups

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| pending_item_id | uuid | NULL |  | **FK** → pending_items.id (on delete cascade) |
| client_due_id | uuid | NULL |  | **FK** → client_dues.id (on delete cascade) |
| note | text | NOT NULL |  |  |
| next_follow_up_on | date | NULL |  |  |
| actor_user_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| client_visible | boolean | NOT NULL | `false` |  |
| file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| observation_id | uuid | NULL |  | **FK** → client_observations.id (on delete cascade) |

**Indexes / unique constraints**

- `follow_ups_client_due_id_idx` (client_due_id)
- UNIQUE `follow_ups_file_id_key` (file_id)
- `follow_ups_observation_id_idx` (observation_id)
- `follow_ups_pending_item_id_idx` (pending_item_id)

## leave_balances

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete cascade) |
| period_start | date | NOT NULL |  |  |
| period_end | date | NOT NULL |  |  |
| allowed_paid_leaves | numeric(5,1) | NOT NULL |  |  |
| notes | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `leave_balances_employee_id_period_start_key` (employee_id, period_start)
- `leave_balances_organization_id_idx` (organization_id)

**Check constraints**

- `leave_balances_dates_check`: `CHECK (((period_end >= period_start) AND (allowed_paid_leaves >= (0)::numeric)))`

## leave_requests

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete restrict) |
| from_date | date | NOT NULL |  |  |
| to_date | date | NOT NULL |  |  |
| is_half_day | boolean | NOT NULL | `false` |  |
| is_paid | boolean | NOT NULL | `true` |  |
| reason | text | NULL |  |  |
| status | LeaveRequestStatus | NOT NULL | `'PENDING'::"LeaveRequestStatus"` |  |
| decided_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| decided_at | timestamptz | NULL |  |  |
| decision_note | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| leave_type | LeaveType | NOT NULL | `'CASUAL'::"LeaveType"` |  |
| with_intimation | boolean | NOT NULL | `true` |  |

**Indexes / unique constraints**

- `leave_requests_employee_id_from_date_idx` (employee_id, from_date)
- `leave_requests_organization_id_status_idx` (organization_id, status)

**Check constraints**

- `leave_requests_dates_check`: `CHECK ((to_date >= from_date))`

## nature_of_user_options

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| code | text | NOT NULL |  | **UQ** |
| label | text | NOT NULL |  |  |
| is_active | boolean | NOT NULL | `true` |  |
| sort_order | integer | NOT NULL | `0` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `nature_of_user_options_code_key` (code)

## notifications

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| user_id | uuid | NOT NULL |  | **FK** → users.id (on delete cascade) |
| type | text | NOT NULL |  |  |
| title | text | NOT NULL |  |  |
| body | text | NULL |  |  |
| link | text | NULL |  |  |
| read_at | timestamptz | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |

**Indexes / unique constraints**

- `notifications_user_id_read_at_created_at_idx` (user_id, read_at, created_at)

## organization_certificates

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **UQ** **FK** → organizations.id (on delete cascade) |
| certificate_name | text | NULL |  |  |
| certificate_number | text | NULL |  |  |
| issued_on | date | NULL |  |  |
| expires_on | date | NULL |  |  |
| file_id | uuid | NOT NULL |  | **UQ** **FK** → stored_files.id (on delete restrict) |
| notes | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `organization_certificates_file_id_key` (file_id)
- UNIQUE `organization_certificates_organization_id_key` (organization_id)

## organization_documents

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| type | OrganizationDocumentType | NOT NULL |  |  |
| title | text | NULL |  |  |
| file_id | uuid | NOT NULL |  | **UQ** **FK** → stored_files.id (on delete restrict) |
| effective_from | date | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `organization_documents_file_id_key` (file_id)
- `organization_documents_organization_id_type_idx` (organization_id, type)

## organization_memberships

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| user_id | uuid | NOT NULL |  | **FK** → users.id (on delete cascade) |
| employee_id | uuid | NULL |  | **UQ** **FK** → employees.id (on delete set null) |
| role | MembershipRole | NOT NULL | `'STAFF'::"MembershipRole"` |  |
| status | MembershipStatus | NOT NULL | `'ACTIVE'::"MembershipStatus"` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| must_change_password | boolean | NOT NULL | `false` |  |
| client_id | uuid | NULL |  | **FK** → clients.id (on delete restrict) |

**Indexes / unique constraints**

- `organization_memberships_client_id_idx` (client_id)
- UNIQUE `organization_memberships_employee_id_key` (employee_id)
- UNIQUE `organization_memberships_organization_id_user_id_key` (organization_id, user_id)
- `organization_memberships_user_id_idx` (user_id)

## organization_previous_companies

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| company_name | text | NOT NULL |  |  |
| address | text | NULL |  |  |
| from_date | date | NULL |  |  |
| to_date | date | NULL |  |  |
| details | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `organization_previous_companies_organization_id_idx` (organization_id)

## organizations

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| trade_name | text | NOT NULL |  |  |
| legal_name | text | NULL |  |  |
| address | text | NULL |  |  |
| tan | varchar(10) | NULL |  |  |
| pan | varchar(10) | NULL |  |  |
| gstin | varchar(15) | NULL |  |  |
| gst_verification_status | GstVerificationStatus | NOT NULL | `'NOT_VERIFIED'::"GstVerificationStatus"` |  |
| gst_verified_at | timestamptz | NULL |  |  |
| nature_of_user_id | uuid | NULL |  | **FK** → nature_of_user_options.id (on delete set null) |
| constitution_id | uuid | NULL |  | **FK** → constitutions.id (on delete restrict) |
| profile_picture_file_id | uuid | NULL |  | **UQ** **FK** → stored_files.id (on delete set null) |
| contact_person_name | text | NULL |  |  |
| contact_mobile | varchar(20) | NULL |  |  |
| contact_email | text | NULL |  |  |
| contact_phone | varchar(20) | NULL |  |  |
| access_mode | OrganizationAccessMode | NOT NULL | `'SINGLE_USER'::"OrganizationAccessMode"` |  |
| licensed_user_limit | integer | NOT NULL | `1` |  |
| declared_employee_count | integer | NULL |  |  |
| declared_client_count | integer | NULL |  |  |
| default_probation_days | integer | NOT NULL | `7` |  |
| timezone | text | NOT NULL | `'Asia/Kolkata'::text` |  |
| status | OrganizationStatus | NOT NULL | `'ACTIVE'::"OrganizationStatus"` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| pending_days_basis | PendingDaysBasis | NOT NULL | `'CALENDAR'::"PendingDaysBasis"` |  |
| approval_grace_days | integer | NOT NULL | `7` |  |

**Indexes / unique constraints**

- `organizations_gstin_idx` (gstin)
- `organizations_pan_idx` (pan)
- UNIQUE `organizations_profile_picture_file_id_key` (profile_picture_file_id)

**Check constraints**

- `organizations_approval_grace_days_check`: `CHECK (((approval_grace_days >= 0) AND (approval_grace_days <= 90)))`
- `organizations_declared_counts_check`: `CHECK ((((declared_employee_count IS NULL) OR (declared_employee_count >= 0)) AND ((declared_client_count IS NULL) OR (declared_client_count >= 0))))`
- `organizations_default_probation_days_check`: `CHECK ((default_probation_days >= 0))`
- `organizations_licensed_user_limit_check`: `CHECK ((licensed_user_limit >= 1))`

## pending_items

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| category | PendingCategory | NOT NULL |  |  |
| pending_with | PendingWith | NOT NULL |  |  |
| client_id | uuid | NULL |  | **FK** → clients.id (on delete restrict) |
| task_id | uuid | NULL |  | **FK** → tasks.id (on delete set null) |
| timesheet_entry_id | uuid | NULL |  | **FK** → timesheet_entries.id (on delete set null) |
| pending_with_employee_id | uuid | NULL |  | **FK** → employees.id (on delete restrict) |
| raised_by_employee_id | uuid | NULL |  | **FK** → employees.id (on delete set null) |
| request_description | text | NOT NULL |  |  |
| requested_on | date | NOT NULL |  |  |
| due_by | date | NULL |  |  |
| status | PendingStatus | NOT NULL | `'OPEN'::"PendingStatus"` |  |
| closed_at | timestamptz | NULL |  |  |
| remark | text | NULL |  |  |
| created_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| client_visible | boolean | NOT NULL | `false` |  |

**Indexes / unique constraints**

- `pending_items_client_id_status_idx` (client_id, status)
- `pending_items_organization_id_category_status_idx` (organization_id, category, status)
- `pending_items_organization_id_pending_with_status_idx` (organization_id, pending_with, status)
- `pending_items_pending_with_employee_id_status_idx` (pending_with_employee_id, status)

**Check constraints**

- `pending_items_dates_check`: `CHECK (((due_by IS NULL) OR (due_by >= requested_on)))`

## services

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| service_code | text | NULL |  |  |
| department_id | uuid | NULL |  | **FK** → departments.id (on delete set null) |
| name | text | NOT NULL |  |  |
| description | text | NULL |  |  |
| default_fee | numeric(14,2) | NULL |  |  |
| nature_of_user_id | uuid | NULL |  | **FK** → nature_of_user_options.id (on delete set null) |
| estimated_duration_days | integer | NULL |  |  |
| timeline_note | text | NULL |  |  |
| poc_employee_id | uuid | NULL |  | **FK** → employees.id (on delete set null) |
| poc_name | text | NULL |  |  |
| poc_mobile | varchar(20) | NULL |  |  |
| poc_email | text | NULL |  |  |
| poc_address | text | NULL |  |  |
| is_active | boolean | NOT NULL | `true` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| billing_basis | text | NULL |  |  |
| deliverable | text | NULL |  |  |
| frequency | text | NULL |  |  |
| is_confirmed | boolean | NOT NULL | `true` |  |

**Indexes / unique constraints**

- `services_department_id_idx` (department_id)
- UNIQUE `services_organization_id_name_key` (organization_id, name)
- UNIQUE `services_organization_id_service_code_key` (organization_id, service_code)

**Check constraints**

- `services_fee_check`: `CHECK (((default_fee IS NULL) OR (default_fee >= (0)::numeric)))`

## sessions

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| expires_at | timestamptz | NOT NULL |  |  |
| token | text | NOT NULL |  | **UQ** |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| ip_address | text | NULL |  |  |
| user_agent | text | NULL |  |  |
| user_id | uuid | NOT NULL |  | **FK** → users.id (on delete cascade) |

**Indexes / unique constraints**

- UNIQUE `sessions_token_key` (token)
- `sessions_user_id_idx` (user_id)

## stored_files

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NULL |  | **FK** → organizations.id (on delete restrict) |
| provider | FileStorageProvider | NOT NULL | `'S3'::"FileStorageProvider"` |  |
| bucket | text | NOT NULL |  |  |
| object_key | text | NOT NULL |  | **UQ** |
| original_file_name | text | NOT NULL |  |  |
| mime_type | text | NOT NULL |  |  |
| size_bytes | bigint | NOT NULL |  |  |
| checksum_sha256 | varchar(64) | NULL |  |  |
| uploaded_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| deleted_at | timestamptz | NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `stored_files_object_key_key` (object_key)
- `stored_files_organization_id_idx` (organization_id)

**Check constraints**

- `stored_files_size_check`: `CHECK ((size_bytes >= 0))`

## task_activities

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| task_id | uuid | NOT NULL |  | **FK** → tasks.id (on delete cascade) |
| actor_user_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| type | TaskActivityType | NOT NULL |  |  |
| from_value | text | NULL |  |  |
| to_value | text | NULL |  |  |
| note | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| client_visible | boolean | NOT NULL | `false` |  |

**Indexes / unique constraints**

- `task_activities_task_id_created_at_idx` (task_id, created_at)

## task_assignments

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| task_id | uuid | NOT NULL |  | **FK** → tasks.id (on delete cascade) |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete restrict) |
| assigned_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| assigned_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| removed_at | timestamptz | NULL |  |  |

**Indexes / unique constraints**

- `task_assignments_employee_id_idx` (employee_id)
- UNIQUE `task_assignments_task_id_employee_id_key` (task_id, employee_id)

## task_attachments

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| task_id | uuid | NOT NULL |  | **FK** → tasks.id (on delete cascade) |
| file_id | uuid | NOT NULL |  | **UQ** **FK** → stored_files.id (on delete restrict) |
| kind | TaskAttachmentKind | NOT NULL |  |  |
| caption | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |

**Indexes / unique constraints**

- UNIQUE `task_attachments_file_id_key` (file_id)
- `task_attachments_task_id_idx` (task_id)

## task_reminders

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| task_id | uuid | NOT NULL |  | **FK** → tasks.id (on delete cascade) |
| recipient_employee_id | uuid | NULL |  | **FK** → employees.id (on delete set null) |
| remind_at | timestamptz | NOT NULL |  |  |
| channel | ReminderChannel | NOT NULL | `'IN_APP'::"ReminderChannel"` |  |
| status | ReminderStatus | NOT NULL | `'SCHEDULED'::"ReminderStatus"` |  |
| sent_at | timestamptz | NULL |  |  |
| note | text | NULL |  |  |
| created_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `task_reminders_status_remind_at_idx` (status, remind_at)
- `task_reminders_task_id_idx` (task_id)

## task_reviews

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| task_id | uuid | NOT NULL |  | **FK** → tasks.id (on delete cascade) |
| reviewer_employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete restrict) |
| decision | ReviewDecision | NOT NULL |  |  |
| comment | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |

**Indexes / unique constraints**

- `task_reviews_task_id_created_at_idx` (task_id, created_at)

## tasks

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| client_id | uuid | NULL |  | **FK** → clients.id (on delete restrict) |
| client_service_id | uuid | NULL |  | **FK** → client_services.id (on delete set null) |
| title | text | NOT NULL |  |  |
| description | text | NULL |  |  |
| priority | TaskPriority | NOT NULL | `'MEDIUM'::"TaskPriority"` |  |
| is_asap | boolean | NOT NULL | `false` |  |
| start_at | timestamptz | NULL |  |  |
| due_at | timestamptz | NULL |  |  |
| status | TaskStatus | NOT NULL | `'PENDING'::"TaskStatus"` |  |
| completed_at | timestamptz | NULL |  |  |
| writing_for_remark | text | NULL |  |  |
| writing_from_employee_id | uuid | NULL |  | **FK** → employees.id (on delete set null) |
| writing_from_remark | text | NULL |  |  |
| maker_employee_id | uuid | NULL |  | **FK** → employees.id (on delete restrict) |
| maker_status | MakerStatus | NOT NULL | `'NOT_STARTED'::"MakerStatus"` |  |
| maker_updated_at | timestamptz | NULL |  |  |
| checker_employee_id | uuid | NULL |  | **FK** → employees.id (on delete restrict) |
| checker_status | CheckerStatus | NOT NULL | `'NOT_STARTED'::"CheckerStatus"` |  |
| checker_updated_at | timestamptz | NULL |  |  |
| client_observation_status | ClientObservationStatus | NOT NULL | `'NOT_SHARED'::"ClientObservationStatus"` |  |
| client_observation_note | text | NULL |  |  |
| created_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| client_visible | boolean | NOT NULL | `false` |  |
| overdue_notified_at | timestamptz | NULL |  |  |

**Indexes / unique constraints**

- `tasks_checker_employee_id_idx` (checker_employee_id)
- `tasks_client_id_status_idx` (client_id, status)
- `tasks_maker_employee_id_idx` (maker_employee_id)
- `tasks_organization_id_status_due_at_idx` (organization_id, status, due_at)

## team_allocations

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete restrict) |
| client_service_id | uuid | NULL |  | **FK** → client_services.id (on delete set null) |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete restrict) |
| seniority_level | SeniorityLevel | NULL |  |  |
| start_date | date | NOT NULL |  |  |
| end_date | date | NULL |  |  |
| allocation_percent | integer | NULL |  |  |
| status | AllocationStatus | NOT NULL | `'ACTIVE'::"AllocationStatus"` |  |
| replaces_allocation_id | uuid | NULL |  | **UQ** **FK** → team_allocations.id (on delete set null) |
| change_reason | text | NULL |  |  |
| created_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `team_allocations_client_id_status_idx` (client_id, status)
- `team_allocations_employee_id_start_date_end_date_idx` (employee_id, start_date, end_date)
- `team_allocations_organization_id_status_idx` (organization_id, status)
- UNIQUE `team_allocations_replaces_allocation_id_key` (replaces_allocation_id)

**Check constraints**

- `team_allocations_dates_check`: `CHECK (((end_date IS NULL) OR (end_date >= start_date)))`
- `team_allocations_not_self_replace_check`: `CHECK (((replaces_allocation_id IS NULL) OR (replaces_allocation_id <> id)))`
- `team_allocations_percent_check`: `CHECK (((allocation_percent IS NULL) OR ((allocation_percent >= 0) AND (allocation_percent <= 100))))`

## timesheet_entries

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete restrict) |
| serial_number | integer | NULL |  |  |
| work_date | date | NOT NULL |  |  |
| client_id | uuid | NULL |  | **FK** → clients.id (on delete restrict) |
| client_name_text | text | NULL |  |  |
| client_service_id | uuid | NULL |  | **FK** → client_services.id (on delete set null) |
| task_id | uuid | NULL |  | **FK** → tasks.id (on delete set null) |
| team_allocation_id | uuid | NULL |  | **FK** → team_allocations.id (on delete set null) |
| place_of_work | text | NULL |  |  |
| type_of_work | text | NULL |  |  |
| bank_name | text | NULL |  |  |
| period_from | date | NULL |  |  |
| period_to | date | NULL |  |  |
| transaction_count | integer | NULL |  |  |
| approx_minutes | integer | NULL |  |  |
| whatsapp_message | text | NULL |  |  |
| work_details | text | NULL |  |  |
| work_status | WorkStatus | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| review_note | text | NULL |  |  |
| reviewed_at | timestamptz | NULL |  |  |
| reviewed_by_id | uuid | NULL |  | **FK** → users.id (on delete set null) |
| status | TimesheetStatus | NOT NULL | `'SUBMITTED'::"TimesheetStatus"` |  |
| work_type_id | uuid | NULL |  | **FK** → work_types.id (on delete set null) |

**Indexes / unique constraints**

- `timesheet_entries_client_id_work_date_idx` (client_id, work_date)
- `timesheet_entries_employee_id_work_date_idx` (employee_id, work_date)
- `timesheet_entries_organization_id_work_date_idx` (organization_id, work_date)
- `timesheet_entries_task_id_idx` (task_id)

**Check constraints**

- `timesheet_entries_counts_check`: `CHECK ((((approx_minutes IS NULL) OR (approx_minutes >= 0)) AND ((transaction_count IS NULL) OR (transaction_count >= 0))))`
- `timesheet_entries_period_check`: `CHECK (((period_to IS NULL) OR (period_from IS NULL) OR (period_to >= period_from)))`

## users

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| name | text | NOT NULL |  |  |
| email | text | NOT NULL |  | **UQ** |
| email_verified | boolean | NOT NULL | `false` |  |
| image | text | NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |
| display_username | text | NULL |  |  |
| username | text | NULL |  | **UQ** |

**Indexes / unique constraints**

- UNIQUE `users_email_key` (email)
- UNIQUE `users_username_key` (username)

## verifications

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| identifier | text | NOT NULL |  |  |
| value | text | NOT NULL |  |  |
| expires_at | timestamptz | NOT NULL |  |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `verifications_identifier_idx` (identifier)

## work_commitments

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete restrict) |
| client_id | uuid | NOT NULL |  | **FK** → clients.id (on delete cascade) |
| client_service_id | uuid | NULL |  | **FK** → client_services.id (on delete set null) |
| employee_id | uuid | NOT NULL |  | **FK** → employees.id (on delete restrict) |
| period_start | date | NOT NULL |  |  |
| period_end | date | NOT NULL |  |  |
| description | text | NOT NULL |  |  |
| target_date | date | NULL |  |  |
| status | CommitmentStatus | NOT NULL | `'OPEN'::"CommitmentStatus"` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- `work_commitments_client_id_period_start_idx` (client_id, period_start)
- `work_commitments_employee_id_period_start_idx` (employee_id, period_start)
- `work_commitments_organization_id_idx` (organization_id)

**Check constraints**

- `work_commitments_dates_check`: `CHECK ((period_end >= period_start))`

## work_types

| Column | Type | Null | Default | Keys / references |
|---|---|---|---|---|
| id | uuid | NOT NULL |  | **PK** |
| organization_id | uuid | NOT NULL |  | **FK** → organizations.id (on delete cascade) |
| code | text | NULL |  |  |
| name | text | NOT NULL |  |  |
| sort_order | integer | NOT NULL | `0` |  |
| is_active | boolean | NOT NULL | `true` |  |
| created_at | timestamptz | NOT NULL | `CURRENT_TIMESTAMP` |  |
| updated_at | timestamptz | NOT NULL |  |  |

**Indexes / unique constraints**

- UNIQUE `work_types_organization_id_name_key` (organization_id, name)

## Enum types

| Enum | Values |
|---|---|
| AddressType | CURRENT, PERMANENT, OTHER |
| AllocationStatus | PLANNED, ACTIVE, ENDED, CANCELLED |
| AttendanceProfile | STANDARD, ONSITE, FAR_CLIENT, REDUCED_HOURS |
| AttendanceStatus | PRESENT, ABSENT, LEAVE, HALF_DAY |
| CheckerStatus | NOT_STARTED, IN_REVIEW, APPROVED, CHANGES_REQUESTED |
| ClassificationBasis | GST_STATUS, BILLING_BASIS, PLACE_OF_WORK, TURNOVER, PRIORITY |
| ClientDocumentType | REGISTRATION_CERTIFICATE, OTHER |
| ClientEngagementNature | ONE_TIME, RETAINER |
| ClientObservationStatus | NOT_SHARED, PENDING_CLIENT_REVIEW, ACCEPTED, OBSERVATIONS_RAISED |
| ClientRegistrationChannel | STAFF, CLIENT_QUICK, CLIENT_FULL |
| ClientReportStatus | DRAFT, FINAL, SHARED |
| ClientReportType | MONTHLY_SUMMARY, AD_HOC |
| ClientServiceStatus | ACTIVE, ON_HOLD, COMPLETED, CANCELLED |
| ClientStatus | DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, INACTIVE, ON_HOLD |
| CommitmentStatus | OPEN, COMPLETED, CANCELLED |
| ConstitutionMemberRole | PROPRIETOR, PARTNER, DIRECTOR, TRUSTEE, KARTA, OTHER, MEMBER |
| ConstitutionType | PROPRIETOR, FIRM, COMPANY, TRUST, HUF, INDIVIDUAL, LLP, PUBLIC_COMPANY, OPC, AOP_BOI, GOVERNMENT |
| DayReportStatus | DRAFT, SUBMITTED, ACKNOWLEDGED |
| DueStatus | OPEN, SETTLED, WRITTEN_OFF |
| EmployeeApprovalStatus | PENDING, APPROVED, REJECTED, UNDER_REVIEW |
| EmployeeDocumentType | JOINING_LETTER, OFFER_LETTER, EXPERIENCE_CERTIFICATE, OTHER, PHOTOGRAPH, ADDRESS_PROOF, MARKSHEET_10, MARKSHEET_12, DEGREE, PROFESSIONAL_CERTIFICATE, RELIEVING_LETTER, SALARY_SLIP, APPOINTMENT_LETTER, POLICY_ACKNOWLEDGEMENT, JOINING_FORM, CANCELLED_CHEQUE |
| EmployeeIdType | TEMPORARY, PERMANENT |
| EmploymentStatus | PROBATION, ACTIVE, EXITED |
| EmploymentType | EMPLOYEE, TRAINEE |
| FileStorageProvider | S3 |
| Gender | MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY |
| GstVerificationStatus | NOT_VERIFIED, VERIFIED, FAILED |
| LeaveRequestStatus | PENDING, APPROVED, REJECTED, CANCELLED |
| LeaveType | CASUAL, SICK, PLANNED, UNPAID, OTHER |
| MakerStatus | NOT_STARTED, IN_PROGRESS, SUBMITTED |
| MaritalStatus | SINGLE, MARRIED, DIVORCED, WIDOWED, OTHER |
| MembershipRole | OWNER, ADMIN, MANAGER, STAFF, SENIOR, CLIENT |
| MembershipStatus | INVITED, ACTIVE, DISABLED |
| MemoCategory | MISCONDUCT, WARNING, OTHER, LATE_ATTENDANCE, SHOW_CAUSE, GENERAL |
| ObservationSource | CLIENT, STAFF |
| ObservationStatus | OPEN, IN_PROGRESS, RESOLVED, CLOSED |
| OrganizationAccessMode | SINGLE_USER, MULTI_USER |
| OrganizationDocumentType | LEAVE_POLICY, OTHER |
| OrganizationStatus | ACTIVE, SUSPENDED, CLOSED |
| OvertimeMode | ACTUAL_MINUTES, SLABS |
| PendingCategory | DAILY, COMMUNICATION |
| PendingDaysBasis | CALENDAR, BUSINESS |
| PendingStatus | OPEN, CLOSED, IN_PROGRESS, AWAITING_RESPONSE |
| PendingWith | CLIENT, TEAM_MEMBER |
| ReminderChannel | IN_APP, EMAIL, WHATSAPP |
| ReminderStatus | SCHEDULED, SENT, CANCELLED, FAILED |
| ReviewDecision | APPROVED, CHANGES_REQUESTED |
| SalaryMode | TRANSFER, CASH |
| SalaryPeriod | MONTHLY, ANNUAL |
| SeniorityLevel | JUNIOR, MID_LEVEL, SENIOR |
| TaskActivityType | CREATED, UPDATED, STATUS_CHANGED, MAKER_STATUS_CHANGED, CHECKER_STATUS_CHANGED, ASSIGNED, UNASSIGNED, ATTACHMENT_ADDED, COMMENT |
| TaskAttachmentKind | IMAGE, DOCUMENT, OTHER |
| TaskPriority | HIGH, MEDIUM, LOW |
| TaskStatus | PENDING, IN_PROGRESS, ON_HOLD, COMPLETED, CANCELLED, ASSIGNED, PENDING_REVIEW, CHANGES_REQUESTED, AWAITING_CLIENT, AWAITING_TEAM_MEMBER |
| TimesheetStatus | DRAFT, SUBMITTED, REVIEWED, RETURNED |
| WorkLocationType | ON_SITE, OFF_SITE |
| WorkStatus | COMPLETED, IN_PROGRESS, PENDING |
