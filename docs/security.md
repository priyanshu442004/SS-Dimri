# Security

Controls as implemented, checked against the Next.js 16 authentication guide (`node_modules/next/dist/docs`), the OWASP Next.js and File Upload cheat sheets, and the code in this repository. Remaining risks are listed at the end and in [known-issues-and-decisions.md](known-issues-and-decisions.md).

## 1. Authentication and sessions

| Control | Implementation |
|---|---|
| Identity provider | Better Auth 1.7 (`src/lib/auth.ts`): email (clients, owner) or username (staff login ID) plus password |
| Password storage | Better Auth scrypt hash in `accounts.password`; minimum 10 characters; never logged or shown |
| Sessions | Database sessions, HttpOnly cookie, 12-hour lifetime, refreshed hourly while active. Changing a password revokes other sessions; disabling a login deletes all its sessions immediately |
| Brute force | Per-IP sign-in rate limit (default 5 per minute, `AUTH_SIGNIN_LIMIT_PER_MINUTE`); one generic error for unknown user and wrong password |
| Account enumeration | `/forgot-password` gives the same response for any input; registration duplicates use a generic message |
| Staff invitations | Emailed temporary password (owner decision): random, valid 7 days, hashed like any password, never displayed in the app or logged; must be replaced at first sign-in before anything else works; resending invalidates the previous one |
| Password reset | Single-use links; only the SHA-256 hash is stored (`verifications`); 2 h; issued by administrators |
| Email | SMTP over TLS (port 465); credentials in environment variables only; `email_outbox` logs recipient, template, status and error — never the body or a password |
| Self-registration | Creates PENDING records only; no public path grants a role. Firm (owner) registration closes after the first firm |
| Redirects after sign-in | `next` accepted only for `/app…` or `/client…` paths; stored notification links pass `safeAppPath` (rejects `//host`, backslashes, other areas) |

## 2. Authorization (server-side, every request)

- **Proxy** (`proxy.ts`) only redirects visitors without a session cookie. It is *not* relied on for authorization.
- **Pages**: `requireContext` (signed-in staff), `requireCapability(cap)` (role matrix + onboarding gate), `requireClientContext` (client logins, client ACTIVE/ON_HOLD).
- **Server actions**: `actionContext(cap)` / `clientActionContext()` re-resolve the session on every call; data passed from the page is never trusted.
- **Route handlers**: `/api/files/[id]`, `/api/notifications/[id]`, `/app/reports/clients/[id]/export` each authenticate and authorize independently.
- **Resource level**: every query is filtered by the caller's organization from the session; staff lists use scopes (`clientScope`, `taskScope`, `pendingScope`, `observationScope`, timesheet ownership); clients are limited to their own `client_id` and `client_visible` records. Foreign and unknown ids both return 404 (no existence leak).
- **Separation of duties**: maker ≠ checker; nobody reviews their own timesheet, decides their own leave, or changes their own role or access status; managers and seniors decide leave only for their reportees (enforced in the service, not only in the list).
- **Approval grace period**: pending staff and clients get 7 days from account creation; afterwards (or on rejection) the server refuses every page, action, download and export, and `AccessWatcher` signs open pages out at the deadline (checks `/api/session/status` every 30 s and on focus, using the server clock).
- **Identifiers from the URL** (`?client=`, `?employee=`, `[id]`) are validated as UUIDs before use.
- Matrix: [role-permission-matrix.md](role-permission-matrix.md); generated from `src/lib/permissions.ts`.

## 3. Data isolation and sensitive data

| Data | Protection |
|---|---|
| Aadhaar, bank account numbers | AES-256-GCM (`DATA_ENCRYPTION_KEY`); only the last 4 digits are stored in clear and displayed; full value never sent to the browser. Optional fields |
| PAN, GSTIN, TAN | Format-validated; visible to staff with client access; never in client-facing exports beyond the client's own GSTIN |
| Attendance location and photos | Optional; visible to the employee and `attendance.view_all`; not exported |
| Internal remarks | `client_visible = false` by default on task remarks, pending items and follow-ups; client-facing CSV excludes internal notes |
| Logs | No passwords, tokens, PAN/Aadhaar, connection strings or document contents are logged; error pages show no internal details |
| Secrets | Environment variables only (`.env.local` locally, git-ignored; host secret store in production) |

## 4. File uploads and downloads

| Control | Implementation (`src/lib/services/files.ts`, `src/lib/storage/s3.ts`) |
|---|---|
| Size | 10 MB maximum (server-checked; server-action body limit 12 MB) |
| Type | Detected from content (magic bytes: PDF, PNG, JPEG, WEBP, DOCX/XLSX zip containers), not from the extension or the browser's MIME type; images-only where required |
| Filenames | Server-generated object keys `ss-dimri/org/<org>/<area>/<owner>/<random-uuid>.<ext>` (extension from the detected type); the original name is kept only as metadata; no path traversal possible |
| Storage | Private S3 bucket; no public URLs |
| Download | `/api/files/[id]` checks organization and ownership rules (employee HR files: the employee or `employees.manage`; attendance photos: the employee or `attendance.view_all`; task attachments: assignees or `tasks.view_all`; client files: staff with client access, or the client itself for its own files and its own client-visible replies), then redirects to a 5-minute pre-signed URL with `Cache-Control: no-store` |
| Replace/delete | No user-facing delete of stored files; replacing a certificate creates a new file row |
| Malware scanning | **Not implemented** (risk S-2) |

## 5. Web security headers (`next.config.ts`)

Content-Security-Policy (`default-src 'self'`; scripts self + `'unsafe-inline'` required by Next.js without nonces; `'unsafe-eval'` development only; images self, data, blob, `*.amazonaws.com`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `upgrade-insecure-requests` in production), HSTS (2 years, subdomains), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation and camera self only), `poweredByHeader: false`. Server actions are protected by Next.js origin checks; Better Auth checks the origin against `BETTER_AUTH_URL`.

## 6. Integrity, concurrency and audit

- Multi-record operations run in one transaction (registration, approvals, allocation changes, corrections, observations).
- Conditional updates (`WHERE status = expected`) make concurrent approvals, reviews, allocation changes, leave decisions and attendance marks safe: the second actor gets a clear "changed by someone else" message.
- Unique constraints back the rules (one certificate per organization, GSTIN per client, one attendance record per employee per day, permanent employee code per organization, login email and username).
- Submit buttons are disabled while a request is in flight (double-click protection); the server still enforces uniqueness where a duplicate would be wrong.
- `audit_logs` records actor, action, entity and metadata for approvals, role/access changes, corrections (with field diffs), reviews, exports, settings changes, password-link issuance and dues changes.
- CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`, tab, CR).

## 7. Verified by tests

Unauthenticated redirects; clients blocked from `/app`; staff without capability redirected or 404 (report, export); cross-client request returns 404; disabled login loses access; generic invalid-credential message; maker cannot approve; redirect-path validation; CSV injection neutralisation; permission matrix rules. See [testing-strategy.md](testing-strategy.md).

## 8. Remaining risks

| # | Risk | Mitigation / next step |
|---|---|---|
| S-1 | Credentials for Neon and AWS were shared in chat during setup | **Rotate the Neon password and AWS access keys**; update the secret store |
| S-2 | No malware scanning of uploads | Add S3 object scanning (e.g. GuardDuty Malware Protection for S3) before wide client use |
| S-3 | A temporary password travels by email (requested by the owner); anyone reading that mailbox within 7 days could use it before the staff member | Short validity, forced change at first sign-in, resend invalidates; consider a single-use link instead of a password later |
| S-9 | SMTP and other credentials were shared in chat | Rotate the mailbox password, Neon password and AWS keys |
| S-4 | `'unsafe-inline'` scripts in CSP | Move to nonce-based CSP (requires dynamic rendering with a per-request nonce) |
| S-5 | No multi-factor authentication | Better Auth two-factor plugin for owners and administrators |
| S-6 | Session-expiry behaviour is not covered by an automated test | Covered by Better Auth; add an integration test with a shortened expiry |
| S-7 | Background jobs are page-load driven (reminders, overdue notices) | Acceptable for in-app notices; add a scheduler before external channels |
| S-8 | Uploaded test files from end-to-end runs remain in S3 under `ss-dimri/org/<test-org-id>/` | Delete those prefixes, or use a separate bucket for tests |
