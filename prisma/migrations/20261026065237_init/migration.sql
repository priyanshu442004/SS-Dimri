-- CreateEnum
CREATE TYPE "OrganizationAccessMode" AS ENUM ('SINGLE_USER', 'MULTI_USER');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ConstitutionType" AS ENUM ('PROPRIETOR', 'FIRM', 'COMPANY', 'TRUST', 'HUF');

-- CreateEnum
CREATE TYPE "ConstitutionMemberRole" AS ENUM ('PROPRIETOR', 'PARTNER', 'DIRECTOR', 'TRUSTEE', 'KARTA', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ClientEngagementNature" AS ENUM ('ONE_TIME', 'RETAINER');

-- CreateEnum
CREATE TYPE "ClientServiceStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GstVerificationStatus" AS ENUM ('NOT_VERIFIED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "FileStorageProvider" AS ENUM ('S3');

-- CreateEnum
CREATE TYPE "OrganizationDocumentType" AS ENUM ('LEAVE_POLICY', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientDocumentType" AS ENUM ('REGISTRATION_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeDocumentType" AS ENUM ('JOINING_LETTER', 'OFFER_LETTER', 'EXPERIENCE_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeIdType" AS ENUM ('TEMPORARY', 'PERMANENT');

-- CreateEnum
CREATE TYPE "EmployeeApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('PROBATION', 'ACTIVE', 'EXITED');

-- CreateEnum
CREATE TYPE "WorkLocationType" AS ENUM ('ON_SITE', 'OFF_SITE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('CURRENT', 'PERMANENT', 'OTHER');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "MemoCategory" AS ENUM ('MISCONDUCT', 'WARNING', 'OTHER');

-- CreateEnum
CREATE TYPE "SeniorityLevel" AS ENUM ('JUNIOR', 'MID_LEVEL', 'SENIOR');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MakerStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "CheckerStatus" AS ENUM ('NOT_STARTED', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "ClientObservationStatus" AS ENUM ('NOT_SHARED', 'PENDING_CLIENT_REVIEW', 'ACCEPTED', 'OBSERVATIONS_RAISED');

-- CreateEnum
CREATE TYPE "TaskAttachmentKind" AS ENUM ('IMAGE', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskActivityType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'MAKER_STATUS_CHANGED', 'CHECKER_STATUS_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'ATTACHMENT_ADDED', 'COMMENT');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'PENDING');

-- CreateEnum
CREATE TYPE "PendingCategory" AS ENUM ('DAILY', 'COMMUNICATION');

-- CreateEnum
CREATE TYPE "PendingWith" AS ENUM ('CLIENT', 'TEAM_MEMBER');

-- CreateEnum
CREATE TYPE "PendingStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "DayReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "ClientReportType" AS ENUM ('MONTHLY_SUMMARY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "ClientReportStatus" AS ENUM ('DRAFT', 'FINAL', 'SHARED');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DueStatus" AS ENUM ('OPEN', 'SETTLED', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(3),
    "refresh_token_expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nature_of_user_options" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "nature_of_user_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "constitutions" (
    "id" UUID NOT NULL,
    "type" "ConstitutionType" NOT NULL,
    "name" TEXT NOT NULL,
    "representative_role" "ConstitutionMemberRole" NOT NULL,
    "allows_multiple" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "constitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "trade_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "address" TEXT,
    "tan" VARCHAR(10),
    "pan" VARCHAR(10),
    "gstin" VARCHAR(15),
    "gst_verification_status" "GstVerificationStatus" NOT NULL DEFAULT 'NOT_VERIFIED',
    "gst_verified_at" TIMESTAMPTZ(3),
    "nature_of_user_id" UUID,
    "constitution_id" UUID,
    "profile_picture_file_id" UUID,
    "contact_person_name" TEXT,
    "contact_mobile" VARCHAR(20),
    "contact_email" TEXT,
    "contact_phone" VARCHAR(20),
    "access_mode" "OrganizationAccessMode" NOT NULL DEFAULT 'SINGLE_USER',
    "licensed_user_limit" INTEGER NOT NULL DEFAULT 1,
    "declared_employee_count" INTEGER,
    "declared_client_count" INTEGER,
    "default_probation_days" INTEGER NOT NULL DEFAULT 7,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_certificates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "certificate_name" TEXT,
    "certificate_number" TEXT,
    "issued_on" DATE,
    "expires_on" DATE,
    "file_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_id" UUID,
    "role" "MembershipRole" NOT NULL DEFAULT 'STAFF',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "OrganizationDocumentType" NOT NULL,
    "title" TEXT,
    "file_id" UUID NOT NULL,
    "effective_from" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_previous_companies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "address" TEXT,
    "from_date" DATE,
    "to_date" DATE,
    "details" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_previous_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "provider" "FileStorageProvider" NOT NULL DEFAULT 'S3',
    "bucket" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" VARCHAR(64),
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_code" TEXT,
    "trade_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "address" TEXT,
    "tan" VARCHAR(10),
    "pan" VARCHAR(10),
    "nature_of_user_id" UUID,
    "nature_of_client" "ClientEngagementNature",
    "constitution_id" UUID,
    "profile_picture_file_id" UUID,
    "is_msme" BOOLEAN,
    "msme_registration_number" TEXT,
    "msme_certificate_file_id" UUID,
    "esi_number" TEXT,
    "esi_certificate_file_id" UUID,
    "pf_number" TEXT,
    "pf_certificate_file_id" UUID,
    "status" "ClientStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "created_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "rejected_at" TIMESTAMPTZ(3),
    "rejected_by_id" UUID,
    "rejection_reason" TEXT,
    "details_completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_gst_registrations" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "gstin" VARCHAR(15) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_gst_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "constitution_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID,
    "role" "ConstitutionMemberRole" NOT NULL,
    "full_name" TEXT NOT NULL,
    "mobile" VARCHAR(20),
    "email" TEXT,
    "address" TEXT,
    "pan" VARCHAR(10),
    "aadhaar_encrypted" TEXT,
    "aadhaar_last4" CHAR(4),
    "profile_picture_file_id" UUID,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "constitution_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_documents" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" "ClientDocumentType" NOT NULL,
    "title" TEXT,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_purchase_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "client_service_id" UUID,
    "po_number" TEXT NOT NULL,
    "po_date" DATE,
    "amount" DECIMAL(14,2),
    "valid_from" DATE,
    "valid_to" DATE,
    "details" TEXT,
    "file_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_code" TEXT,
    "department_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_fee" DECIMAL(14,2),
    "nature_of_user_id" UUID,
    "estimated_duration_days" INTEGER,
    "timeline_note" TEXT,
    "poc_employee_id" UUID,
    "poc_name" TEXT,
    "poc_mobile" VARCHAR(20),
    "poc_email" TEXT,
    "poc_address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_services" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "description" TEXT,
    "agreed_fee" DECIMAL(14,2),
    "engagement_nature" "ClientEngagementNature",
    "start_date" DATE,
    "due_date" DATE,
    "timeline_note" TEXT,
    "retainer_start_date" DATE,
    "retainer_end_date" DATE,
    "renewed_from_id" UUID,
    "status" "ClientServiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "poc_employee_id" UUID,
    "poc_name" TEXT,
    "poc_mobile" VARCHAR(20),
    "poc_email" TEXT,
    "poc_address" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "seniority_level" "SeniorityLevel",
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_nature_options" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "source_wording" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_nature_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "temporary_employee_code" TEXT NOT NULL,
    "permanent_employee_code" TEXT,
    "id_type" "EmployeeIdType" NOT NULL DEFAULT 'TEMPORARY',
    "permanent_id_assigned_at" TIMESTAMPTZ(3),
    "approval_status" "EmployeeApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "rejected_at" TIMESTAMPTZ(3),
    "rejected_by_id" UUID,
    "review_notes" TEXT,
    "employment_status" "EmploymentStatus" NOT NULL DEFAULT 'PROBATION',
    "date_of_joining" DATE,
    "probation_start_date" DATE,
    "probation_end_date" DATE,
    "exit_date" DATE,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "gender" "Gender",
    "date_of_birth" DATE,
    "marital_status" "MaritalStatus",
    "aadhaar_encrypted" TEXT,
    "aadhaar_last4" CHAR(4),
    "aadhaar_document_file_id" UUID,
    "pan_number" VARCHAR(10),
    "pan_document_file_id" UUID,
    "designation_id" UUID,
    "nature_id" UUID,
    "work_location_type" "WorkLocationType",
    "mobile" VARCHAR(20),
    "email" TEXT,
    "official_email" TEXT,
    "profile_picture_file_id" UUID,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_reporting_relationships" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_reporting_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_addresses" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "AddressType" NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" VARCHAR(10),
    "country" TEXT NOT NULL DEFAULT 'India',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bank_accounts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "account_holder_name" TEXT,
    "account_number_encrypted" TEXT NOT NULL,
    "account_number_last4" VARCHAR(4) NOT NULL,
    "ifsc_code" VARCHAR(11) NOT NULL,
    "bank_name" TEXT,
    "branch" TEXT,
    "bank_book_file_id" UUID,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_qualifications" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "qualification" TEXT NOT NULL,
    "institution" TEXT,
    "year_of_passing" INTEGER,
    "certificate_file_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_references" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "mobile" VARCHAR(20),
    "email" TEXT,
    "address" TEXT,
    "referred_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_previous_employments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employer_name" TEXT NOT NULL,
    "employer_address" TEXT,
    "designation" TEXT,
    "contact_number" VARCHAR(20),
    "from_date" DATE,
    "to_date" DATE,
    "experience_certificate_file_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_previous_employments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "EmployeeDocumentType" NOT NULL,
    "title" TEXT,
    "issued_on" DATE,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salary_records" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "agreed_salary" DECIMAL(14,2) NOT NULL,
    "salary_period" "SalaryPeriod" NOT NULL DEFAULT 'MONTHLY',
    "committed_increment_amount" DECIMAL(14,2),
    "committed_increment_percent" DECIMAL(5,2),
    "committed_increment_date" DATE,
    "increment_notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_salary_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_memos" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "memo_date" DATE NOT NULL,
    "category" "MemoCategory" NOT NULL DEFAULT 'OTHER',
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "issued_by_employee_id" UUID,
    "file_id" UUID,
    "acknowledged_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_memos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_allocations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "client_service_id" UUID,
    "employee_id" UUID NOT NULL,
    "seniority_level" "SeniorityLevel",
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "allocation_percent" INTEGER,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "replaces_allocation_id" UUID,
    "change_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "team_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID,
    "client_service_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "is_asap" BOOLEAN NOT NULL DEFAULT false,
    "start_at" TIMESTAMPTZ(3),
    "due_at" TIMESTAMPTZ(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMPTZ(3),
    "writing_for_remark" TEXT,
    "writing_from_employee_id" UUID,
    "writing_from_remark" TEXT,
    "maker_employee_id" UUID,
    "maker_status" "MakerStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "maker_updated_at" TIMESTAMPTZ(3),
    "checker_employee_id" UUID,
    "checker_status" "CheckerStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "checker_updated_at" TIMESTAMPTZ(3),
    "client_observation_status" "ClientObservationStatus" NOT NULL DEFAULT 'NOT_SHARED',
    "client_observation_note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_attachments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "kind" "TaskAttachmentKind" NOT NULL,
    "caption" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_reminders" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "recipient_employee_id" UUID,
    "remind_at" TIMESTAMPTZ(3) NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sent_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_activities" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "type" "TaskActivityType" NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "time_in" TIMESTAMPTZ(3),
    "time_out" TIMESTAMPTZ(3),
    "time_in_latitude" DECIMAL(9,6),
    "time_in_longitude" DECIMAL(9,6),
    "time_out_latitude" DECIMAL(9,6),
    "time_out_longitude" DECIMAL(9,6),
    "time_in_photo_file_id" UUID,
    "time_out_photo_file_id" UUID,
    "status" "AttendanceStatus" NOT NULL,
    "remarks" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "allowed_paid_leaves" DECIMAL(5,1) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "is_half_day" BOOLEAN NOT NULL DEFAULT false,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "serial_number" INTEGER,
    "work_date" DATE NOT NULL,
    "client_id" UUID,
    "client_name_text" TEXT,
    "client_service_id" UUID,
    "task_id" UUID,
    "team_allocation_id" UUID,
    "place_of_work" TEXT,
    "type_of_work" TEXT,
    "bank_name" TEXT,
    "period_from" DATE,
    "period_to" DATE,
    "transaction_count" INTEGER,
    "approx_minutes" INTEGER,
    "whatsapp_message" TEXT,
    "work_details" TEXT,
    "work_status" "WorkStatus",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category" "PendingCategory" NOT NULL,
    "pending_with" "PendingWith" NOT NULL,
    "client_id" UUID,
    "task_id" UUID,
    "timesheet_entry_id" UUID,
    "pending_with_employee_id" UUID,
    "raised_by_employee_id" UUID,
    "request_description" TEXT NOT NULL,
    "requested_on" DATE NOT NULL,
    "due_by" DATE,
    "status" "PendingStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(3),
    "remark" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pending_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_reports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "reporting_employee_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "summary" TEXT,
    "status" "DayReportStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "day_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_report_recipients" (
    "id" UUID NOT NULL,
    "day_report_id" UUID NOT NULL,
    "recipient_employee_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "acknowledged_at" TIMESTAMPTZ(3),

    CONSTRAINT "day_report_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_commitments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "client_service_id" UUID,
    "employee_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "target_date" DATE,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_reports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "report_type" "ClientReportType" NOT NULL DEFAULT 'MONTHLY_SUMMARY',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" "ClientReportStatus" NOT NULL DEFAULT 'DRAFT',
    "summary_notes" TEXT,
    "snapshot" JSONB,
    "snapshot_version" INTEGER NOT NULL DEFAULT 1,
    "export_file_id" UUID,
    "generated_by_id" UUID,
    "generated_at" TIMESTAMPTZ(3),
    "shared_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_dues" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "client_service_id" UUID,
    "description" TEXT NOT NULL,
    "reference_number" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "due_date" DATE,
    "status" "DueStatus" NOT NULL DEFAULT 'OPEN',
    "settled_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_dues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "nature_of_user_options_code_key" ON "nature_of_user_options"("code");

-- CreateIndex
CREATE UNIQUE INDEX "constitutions_type_key" ON "constitutions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_profile_picture_file_id_key" ON "organizations"("profile_picture_file_id");

-- CreateIndex
CREATE INDEX "organizations_pan_idx" ON "organizations"("pan");

-- CreateIndex
CREATE INDEX "organizations_gstin_idx" ON "organizations"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "organization_certificates_organization_id_key" ON "organization_certificates"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_certificates_file_id_key" ON "organization_certificates"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_employee_id_key" ON "organization_memberships"("employee_id");

-- CreateIndex
CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key" ON "organization_memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_documents_file_id_key" ON "organization_documents"("file_id");

-- CreateIndex
CREATE INDEX "organization_documents_organization_id_type_idx" ON "organization_documents"("organization_id", "type");

-- CreateIndex
CREATE INDEX "organization_previous_companies_organization_id_idx" ON "organization_previous_companies"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_object_key_key" ON "stored_files"("object_key");

-- CreateIndex
CREATE INDEX "stored_files_organization_id_idx" ON "stored_files"("organization_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_profile_picture_file_id_key" ON "clients"("profile_picture_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_msme_certificate_file_id_key" ON "clients"("msme_certificate_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_esi_certificate_file_id_key" ON "clients"("esi_certificate_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_pf_certificate_file_id_key" ON "clients"("pf_certificate_file_id");

-- CreateIndex
CREATE INDEX "clients_organization_id_status_idx" ON "clients"("organization_id", "status");

-- CreateIndex
CREATE INDEX "clients_organization_id_trade_name_idx" ON "clients"("organization_id", "trade_name");

-- CreateIndex
CREATE INDEX "clients_pan_idx" ON "clients"("pan");

-- CreateIndex
CREATE UNIQUE INDEX "clients_organization_id_client_code_key" ON "clients"("organization_id", "client_code");

-- CreateIndex
CREATE INDEX "client_gst_registrations_gstin_idx" ON "client_gst_registrations"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "client_gst_registrations_client_id_gstin_key" ON "client_gst_registrations"("client_id", "gstin");

-- CreateIndex
CREATE UNIQUE INDEX "constitution_members_profile_picture_file_id_key" ON "constitution_members"("profile_picture_file_id");

-- CreateIndex
CREATE INDEX "constitution_members_organization_id_idx" ON "constitution_members"("organization_id");

-- CreateIndex
CREATE INDEX "constitution_members_client_id_idx" ON "constitution_members"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_documents_file_id_key" ON "client_documents"("file_id");

-- CreateIndex
CREATE INDEX "client_documents_client_id_type_idx" ON "client_documents"("client_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "client_purchase_orders_file_id_key" ON "client_purchase_orders"("file_id");

-- CreateIndex
CREATE INDEX "client_purchase_orders_organization_id_idx" ON "client_purchase_orders"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_purchase_orders_client_id_po_number_key" ON "client_purchase_orders"("client_id", "po_number");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_name_key" ON "departments"("organization_id", "name");

-- CreateIndex
CREATE INDEX "services_department_id_idx" ON "services"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_organization_id_service_code_key" ON "services"("organization_id", "service_code");

-- CreateIndex
CREATE UNIQUE INDEX "services_organization_id_name_key" ON "services"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "client_services_renewed_from_id_key" ON "client_services"("renewed_from_id");

-- CreateIndex
CREATE INDEX "client_services_organization_id_idx" ON "client_services"("organization_id");

-- CreateIndex
CREATE INDEX "client_services_client_id_status_idx" ON "client_services"("client_id", "status");

-- CreateIndex
CREATE INDEX "client_services_service_id_idx" ON "client_services"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "designations_organization_id_name_key" ON "designations"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_nature_options_organization_id_label_key" ON "employee_nature_options"("organization_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "employees_aadhaar_document_file_id_key" ON "employees"("aadhaar_document_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_pan_document_file_id_key" ON "employees"("pan_document_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_profile_picture_file_id_key" ON "employees"("profile_picture_file_id");

-- CreateIndex
CREATE INDEX "employees_organization_id_approval_status_idx" ON "employees"("organization_id", "approval_status");

-- CreateIndex
CREATE INDEX "employees_organization_id_employment_status_idx" ON "employees"("organization_id", "employment_status");

-- CreateIndex
CREATE INDEX "employees_designation_id_idx" ON "employees"("designation_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_temporary_employee_code_key" ON "employees"("organization_id", "temporary_employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_permanent_employee_code_key" ON "employees"("organization_id", "permanent_employee_code");

-- CreateIndex
CREATE INDEX "employee_reporting_relationships_manager_id_idx" ON "employee_reporting_relationships"("manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_reporting_relationships_employee_id_manager_id_key" ON "employee_reporting_relationships"("employee_id", "manager_id");

-- CreateIndex
CREATE INDEX "employee_addresses_employee_id_type_idx" ON "employee_addresses"("employee_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "employee_bank_accounts_bank_book_file_id_key" ON "employee_bank_accounts"("bank_book_file_id");

-- CreateIndex
CREATE INDEX "employee_bank_accounts_employee_id_idx" ON "employee_bank_accounts"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_qualifications_certificate_file_id_key" ON "employee_qualifications"("certificate_file_id");

-- CreateIndex
CREATE INDEX "employee_qualifications_employee_id_idx" ON "employee_qualifications"("employee_id");

-- CreateIndex
CREATE INDEX "employee_references_employee_id_idx" ON "employee_references"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_previous_employments_experience_certificate_file_i_key" ON "employee_previous_employments"("experience_certificate_file_id");

-- CreateIndex
CREATE INDEX "employee_previous_employments_employee_id_idx" ON "employee_previous_employments"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_documents_file_id_key" ON "employee_documents"("file_id");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_type_idx" ON "employee_documents"("employee_id", "type");

-- CreateIndex
CREATE INDEX "employee_salary_records_employee_id_effective_from_idx" ON "employee_salary_records"("employee_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "employee_memos_file_id_key" ON "employee_memos"("file_id");

-- CreateIndex
CREATE INDEX "employee_memos_employee_id_memo_date_idx" ON "employee_memos"("employee_id", "memo_date");

-- CreateIndex
CREATE UNIQUE INDEX "team_allocations_replaces_allocation_id_key" ON "team_allocations"("replaces_allocation_id");

-- CreateIndex
CREATE INDEX "team_allocations_organization_id_status_idx" ON "team_allocations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "team_allocations_client_id_status_idx" ON "team_allocations"("client_id", "status");

-- CreateIndex
CREATE INDEX "team_allocations_employee_id_start_date_end_date_idx" ON "team_allocations"("employee_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "tasks_organization_id_status_due_at_idx" ON "tasks"("organization_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_client_id_status_idx" ON "tasks"("client_id", "status");

-- CreateIndex
CREATE INDEX "tasks_maker_employee_id_idx" ON "tasks"("maker_employee_id");

-- CreateIndex
CREATE INDEX "tasks_checker_employee_id_idx" ON "tasks"("checker_employee_id");

-- CreateIndex
CREATE INDEX "task_assignments_employee_id_idx" ON "task_assignments"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_task_id_employee_id_key" ON "task_assignments"("task_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_attachments_file_id_key" ON "task_attachments"("file_id");

-- CreateIndex
CREATE INDEX "task_attachments_task_id_idx" ON "task_attachments"("task_id");

-- CreateIndex
CREATE INDEX "task_reminders_status_remind_at_idx" ON "task_reminders"("status", "remind_at");

-- CreateIndex
CREATE INDEX "task_reminders_task_id_idx" ON "task_reminders"("task_id");

-- CreateIndex
CREATE INDEX "task_activities_task_id_created_at_idx" ON "task_activities"("task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_time_in_photo_file_id_key" ON "attendance_records"("time_in_photo_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_time_out_photo_file_id_key" ON "attendance_records"("time_out_photo_file_id");

-- CreateIndex
CREATE INDEX "attendance_records_organization_id_attendance_date_idx" ON "attendance_records"("organization_id", "attendance_date");

-- CreateIndex
CREATE INDEX "attendance_records_employee_id_attendance_date_idx" ON "attendance_records"("employee_id", "attendance_date");

-- CreateIndex
CREATE INDEX "leave_balances_organization_id_idx" ON "leave_balances"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_id_period_start_key" ON "leave_balances"("employee_id", "period_start");

-- CreateIndex
CREATE INDEX "leave_requests_organization_id_status_idx" ON "leave_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_from_date_idx" ON "leave_requests"("employee_id", "from_date");

-- CreateIndex
CREATE INDEX "timesheet_entries_organization_id_work_date_idx" ON "timesheet_entries"("organization_id", "work_date");

-- CreateIndex
CREATE INDEX "timesheet_entries_employee_id_work_date_idx" ON "timesheet_entries"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "timesheet_entries_client_id_work_date_idx" ON "timesheet_entries"("client_id", "work_date");

-- CreateIndex
CREATE INDEX "timesheet_entries_task_id_idx" ON "timesheet_entries"("task_id");

-- CreateIndex
CREATE INDEX "pending_items_organization_id_category_status_idx" ON "pending_items"("organization_id", "category", "status");

-- CreateIndex
CREATE INDEX "pending_items_organization_id_pending_with_status_idx" ON "pending_items"("organization_id", "pending_with", "status");

-- CreateIndex
CREATE INDEX "pending_items_client_id_status_idx" ON "pending_items"("client_id", "status");

-- CreateIndex
CREATE INDEX "pending_items_pending_with_employee_id_status_idx" ON "pending_items"("pending_with_employee_id", "status");

-- CreateIndex
CREATE INDEX "day_reports_organization_id_report_date_idx" ON "day_reports"("organization_id", "report_date");

-- CreateIndex
CREATE INDEX "day_reports_reporting_employee_id_report_date_idx" ON "day_reports"("reporting_employee_id", "report_date");

-- CreateIndex
CREATE INDEX "day_report_recipients_recipient_employee_id_idx" ON "day_report_recipients"("recipient_employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "day_report_recipients_day_report_id_recipient_employee_id_key" ON "day_report_recipients"("day_report_id", "recipient_employee_id");

-- CreateIndex
CREATE INDEX "work_commitments_client_id_period_start_idx" ON "work_commitments"("client_id", "period_start");

-- CreateIndex
CREATE INDEX "work_commitments_employee_id_period_start_idx" ON "work_commitments"("employee_id", "period_start");

-- CreateIndex
CREATE INDEX "work_commitments_organization_id_idx" ON "work_commitments"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_reports_export_file_id_key" ON "client_reports"("export_file_id");

-- CreateIndex
CREATE INDEX "client_reports_client_id_period_start_idx" ON "client_reports"("client_id", "period_start");

-- CreateIndex
CREATE INDEX "client_reports_organization_id_period_start_idx" ON "client_reports"("organization_id", "period_start");

-- CreateIndex
CREATE INDEX "client_dues_client_id_status_idx" ON "client_dues"("client_id", "status");

-- CreateIndex
CREATE INDEX "client_dues_organization_id_status_due_date_idx" ON "client_dues"("organization_id", "status", "due_date");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_nature_of_user_id_fkey" FOREIGN KEY ("nature_of_user_id") REFERENCES "nature_of_user_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_constitution_id_fkey" FOREIGN KEY ("constitution_id") REFERENCES "constitutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_profile_picture_file_id_fkey" FOREIGN KEY ("profile_picture_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_certificates" ADD CONSTRAINT "organization_certificates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_certificates" ADD CONSTRAINT "organization_certificates_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_previous_companies" ADD CONSTRAINT "organization_previous_companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_nature_of_user_id_fkey" FOREIGN KEY ("nature_of_user_id") REFERENCES "nature_of_user_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_constitution_id_fkey" FOREIGN KEY ("constitution_id") REFERENCES "constitutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_profile_picture_file_id_fkey" FOREIGN KEY ("profile_picture_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_msme_certificate_file_id_fkey" FOREIGN KEY ("msme_certificate_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_esi_certificate_file_id_fkey" FOREIGN KEY ("esi_certificate_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_pf_certificate_file_id_fkey" FOREIGN KEY ("pf_certificate_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_gst_registrations" ADD CONSTRAINT "client_gst_registrations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constitution_members" ADD CONSTRAINT "constitution_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constitution_members" ADD CONSTRAINT "constitution_members_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constitution_members" ADD CONSTRAINT "constitution_members_profile_picture_file_id_fkey" FOREIGN KEY ("profile_picture_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_client_service_id_fkey" FOREIGN KEY ("client_service_id") REFERENCES "client_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_nature_of_user_id_fkey" FOREIGN KEY ("nature_of_user_id") REFERENCES "nature_of_user_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_poc_employee_id_fkey" FOREIGN KEY ("poc_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_poc_employee_id_fkey" FOREIGN KEY ("poc_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_renewed_from_id_fkey" FOREIGN KEY ("renewed_from_id") REFERENCES "client_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_nature_options" ADD CONSTRAINT "employee_nature_options_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_nature_id_fkey" FOREIGN KEY ("nature_id") REFERENCES "employee_nature_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_profile_picture_file_id_fkey" FOREIGN KEY ("profile_picture_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_aadhaar_document_file_id_fkey" FOREIGN KEY ("aadhaar_document_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_pan_document_file_id_fkey" FOREIGN KEY ("pan_document_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_reporting_relationships" ADD CONSTRAINT "employee_reporting_relationships_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_reporting_relationships" ADD CONSTRAINT "employee_reporting_relationships_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_addresses" ADD CONSTRAINT "employee_addresses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_bank_book_file_id_fkey" FOREIGN KEY ("bank_book_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_qualifications" ADD CONSTRAINT "employee_qualifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_qualifications" ADD CONSTRAINT "employee_qualifications_certificate_file_id_fkey" FOREIGN KEY ("certificate_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_references" ADD CONSTRAINT "employee_references_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_previous_employments" ADD CONSTRAINT "employee_previous_employments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_previous_employments" ADD CONSTRAINT "employee_previous_employments_experience_certificate_file__fkey" FOREIGN KEY ("experience_certificate_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary_records" ADD CONSTRAINT "employee_salary_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary_records" ADD CONSTRAINT "employee_salary_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_memos" ADD CONSTRAINT "employee_memos_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_memos" ADD CONSTRAINT "employee_memos_issued_by_employee_id_fkey" FOREIGN KEY ("issued_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_memos" ADD CONSTRAINT "employee_memos_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_client_service_id_fkey" FOREIGN KEY ("client_service_id") REFERENCES "client_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_replaces_allocation_id_fkey" FOREIGN KEY ("replaces_allocation_id") REFERENCES "team_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_service_id_fkey" FOREIGN KEY ("client_service_id") REFERENCES "client_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_writing_from_employee_id_fkey" FOREIGN KEY ("writing_from_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_maker_employee_id_fkey" FOREIGN KEY ("maker_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_checker_employee_id_fkey" FOREIGN KEY ("checker_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_recipient_employee_id_fkey" FOREIGN KEY ("recipient_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_time_in_photo_file_id_fkey" FOREIGN KEY ("time_in_photo_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_time_out_photo_file_id_fkey" FOREIGN KEY ("time_out_photo_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_client_service_id_fkey" FOREIGN KEY ("client_service_id") REFERENCES "client_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_team_allocation_id_fkey" FOREIGN KEY ("team_allocation_id") REFERENCES "team_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_items" ADD CONSTRAINT "pending_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_items" ADD CONSTRAINT "pending_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_items" ADD CONSTRAINT "pending_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_items" ADD CONSTRAINT "pending_items_timesheet_entry_id_fkey" FOREIGN KEY ("timesheet_entry_id") REFERENCES "timesheet_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_items" ADD CONSTRAINT "pending_items_pending_with_employee_id_fkey" FOREIGN KEY ("pending_with_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_items" ADD CONSTRAINT "pending_items_raised_by_employee_id_fkey" FOREIGN KEY ("raised_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_items" ADD CONSTRAINT "pending_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_reports" ADD CONSTRAINT "day_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_reports" ADD CONSTRAINT "day_reports_reporting_employee_id_fkey" FOREIGN KEY ("reporting_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_report_recipients" ADD CONSTRAINT "day_report_recipients_day_report_id_fkey" FOREIGN KEY ("day_report_id") REFERENCES "day_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_report_recipients" ADD CONSTRAINT "day_report_recipients_recipient_employee_id_fkey" FOREIGN KEY ("recipient_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_client_service_id_fkey" FOREIGN KEY ("client_service_id") REFERENCES "client_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_export_file_id_fkey" FOREIGN KEY ("export_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_dues" ADD CONSTRAINT "client_dues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_dues" ADD CONSTRAINT "client_dues_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_dues" ADD CONSTRAINT "client_dues_client_service_id_fkey" FOREIGN KEY ("client_service_id") REFERENCES "client_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_dues" ADD CONSTRAINT "client_dues_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Hand-written additions (reviewed). Prisma does not model CHECK constraints,
-- so these do not cause schema drift.
-- =============================================================================

-- Confirmed constitution master data (Section D)
INSERT INTO "constitutions" ("id", "type", "name", "representative_role", "allows_multiple", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'PROPRIETOR', 'Proprietor', 'PROPRIETOR', false, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FIRM',       'Firm',       'PARTNER',    true,  2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'COMPANY',    'Company',    'DIRECTOR',   true,  3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRUST',      'Trust',      'TRUSTEE',    true,  4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HUF',        'HUF',        'KARTA',      false, 5, CURRENT_TIMESTAMP);

-- Integrity checks (structural truths only; no unconfirmed business rules)
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_licensed_user_limit_check" CHECK ("licensed_user_limit" >= 1);
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_default_probation_days_check" CHECK ("default_probation_days" >= 0);
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_declared_counts_check" CHECK (("declared_employee_count" IS NULL OR "declared_employee_count" >= 0) AND ("declared_client_count" IS NULL OR "declared_client_count" >= 0));

ALTER TABLE "employees" ADD CONSTRAINT "employees_permanent_code_check" CHECK ("id_type" <> 'PERMANENT' OR "permanent_employee_code" IS NOT NULL);
ALTER TABLE "employees" ADD CONSTRAINT "employees_probation_dates_check" CHECK ("probation_end_date" IS NULL OR "probation_start_date" IS NULL OR "probation_end_date" >= "probation_start_date");
ALTER TABLE "employee_reporting_relationships" ADD CONSTRAINT "employee_reporting_not_self_check" CHECK ("employee_id" <> "manager_id");

ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_percent_check" CHECK ("allocation_percent" IS NULL OR "allocation_percent" BETWEEN 0 AND 100);
ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_not_self_replace_check" CHECK ("replaces_allocation_id" IS NULL OR "replaces_allocation_id" <> "id");

ALTER TABLE "client_services" ADD CONSTRAINT "client_services_dates_check" CHECK ("due_date" IS NULL OR "start_date" IS NULL OR "due_date" >= "start_date");
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_retainer_dates_check" CHECK ("retainer_end_date" IS NULL OR "retainer_start_date" IS NULL OR "retainer_end_date" >= "retainer_start_date");
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_fee_check" CHECK ("agreed_fee" IS NULL OR "agreed_fee" >= 0);
ALTER TABLE "services" ADD CONSTRAINT "services_fee_check" CHECK ("default_fee" IS NULL OR "default_fee" >= 0);

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_time_order_check" CHECK ("time_out" IS NULL OR "time_in" IS NULL OR "time_out" >= "time_in");
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_coordinates_check" CHECK (
  ("time_in_latitude" IS NULL OR "time_in_latitude" BETWEEN -90 AND 90) AND
  ("time_out_latitude" IS NULL OR "time_out_latitude" BETWEEN -90 AND 90) AND
  ("time_in_longitude" IS NULL OR "time_in_longitude" BETWEEN -180 AND 180) AND
  ("time_out_longitude" IS NULL OR "time_out_longitude" BETWEEN -180 AND 180));

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_dates_check" CHECK ("to_date" >= "from_date");
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_dates_check" CHECK ("period_end" >= "period_start" AND "allowed_paid_leaves" >= 0);

ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_period_check" CHECK ("period_to" IS NULL OR "period_from" IS NULL OR "period_to" >= "period_from");
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_counts_check" CHECK (("approx_minutes" IS NULL OR "approx_minutes" >= 0) AND ("transaction_count" IS NULL OR "transaction_count" >= 0));

ALTER TABLE "pending_items" ADD CONSTRAINT "pending_items_dates_check" CHECK ("due_by" IS NULL OR "due_by" >= "requested_on");
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_dates_check" CHECK ("period_end" >= "period_start");
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_dates_check" CHECK ("period_end" >= "period_start");
ALTER TABLE "client_dues" ADD CONSTRAINT "client_dues_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_amount_check" CHECK ("amount" IS NULL OR "amount" >= 0);
ALTER TABLE "employee_salary_records" ADD CONSTRAINT "employee_salary_records_amount_check" CHECK ("agreed_salary" >= 0);
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_size_check" CHECK ("size_bytes" >= 0);
