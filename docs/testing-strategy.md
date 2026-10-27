# Testing Strategy

Three layers are in place: unit tests for pure business rules, end-to-end tests that drive the real application against a real database, and static checks. This document says what each layer covers, what is **not** covered, and the results of the runs actually performed. A test is reported as passing only if it was run and passed.

## 1. Commands

| Command | What it runs |
|---|---|
| `npm run verify` | Prisma validate, route types + `tsc --noEmit`, ESLint, unit tests |
| `npm test` | Unit tests (Vitest): `tests/domain.test.ts`, `tests/rules.test.ts` |
| `npm run build` | Production build (required before end-to-end tests) |
| `npm run test:e2e` | Playwright, installed Chrome, production server on port 3000, serial, one worker, 180 s per test |
| `npm run test:e2e:cleanup` | Deletes only organizations whose owner email ends in `@e2e.invalid` (run before and after) |
| `npm run db:drift` | Database matches the migration history |

## 2. Unit tests (pure rules, no database)

| Area | Covered |
|---|---|
| Task workflow | Every transition; maker cannot approve own work; named checker; cancel/reopen rights |
| Client workflow | Allowed transitions per role |
| Attendance policy | Day evaluation in both overtime modes, half day, late counting, month summary |
| Allocation | Conflict detection (over 100 %, overlap), availability levels |
| Derived values | Days pending (calendar and business days, IST "today", closed items), overdue, work hours |
| Permissions | Capability matrix, landing pages, observations / reports / dues rights |
| Validation | PAN, GSTIN formats |
| Dates | IST date and minute conversion |
| Observation lifecycle | Allowed and refused transitions |
| Redirect safety | `safeAppPath` rejects off-site, protocol-relative, backslash and cross-area paths |
| CSV export | Quoting and formula neutralisation |
| Constitution representatives | Role allowed per constitution; single-holder constitutions |

## 3. End-to-end tests (`tests/e2e/workflow.spec.ts`)

Run serially as one connected story; later tests depend on the records created earlier.

| Journey / role | Tests |
|---|---|
| Public visitor | Public pages render verified firm content; no horizontal overflow at 360 px; unauthenticated users are redirected from `/app` and `/client` |
| Owner / administrator | Registers the firm (registration then closes); creates staff logins with setup links; approves onboarding (temporary → permanent ID, Aadhaar masked); approval queue; client approval; allocation conflicts; client report, dues and CSV export; issues a reset link from a notification |
| Team member | Sets a password from the link, onboarding, blocked until approved; attendance with location, timesheet, pending item, day report; corrects a returned timesheet entry; cannot cancel tasks or open admin pages, the client report or its export |
| Senior | Checker approval; returns, then reviews, a timesheet entry; reviews a day report with a remark |
| Client | Quick registration (pending, blocked); full wizard; portal after approval; replies to a request; cannot open staff pages; cannot open another client's request (404); disabled login loses access |
| Security | Generic invalid-credential message for real and unknown accounts; forgot-password gives identical responses; staff export request returns 404 |
| Layout | Phone width (375 px) app and portal pages; tablet width (768 px) key pages; screenshots at 1366 / 768 / 375 px for manual review (`test-results/visual/`) |

## 4. Not covered by automated tests (gaps)

| Gap | Why / mitigation |
|---|---|
| Session expiry (12 h) | Handled by Better Auth; needs an integration test with a shortened lifetime |
| Concurrent approvals / allocation changes / attendance double-submit | Protected by conditional updates and unique constraints; no parallel-request test |
| Notification failure | Notifications share the transaction (both succeed or neither); no fault-injection test |
| File uploads (unsafe types, oversize) and unauthorized downloads | Code paths exist; no automated upload test |
| Leave decisions (reportee rule), attendance corrections | Implemented; not exercised end-to-end |
| Self role-change refusal, staff deactivation | Implemented; client-login disabling is tested, staff disabling is not |
| Observations, fees & dues overview, settings lists, profile name change | Only page-load and layout checks |
| Security headers, print view | Not asserted |
| Integration tests against the database outside the browser | Not written; the E2E suite exercises the database through the UI |
| Regression on pre-existing production data | No production data exists yet; migrations are additive and checked with drift detection |

## 5. Results of runs actually performed

All runs on 26 Oct 2026, Windows, Chrome, production build, Neon development database.

| Check | Result |
|---|---|
| Unit tests | **41 / 41 passed** (`tests/domain.test.ts`, `tests/rules.test.ts`) |
| Type check (`tsc --noEmit`), ESLint | Clean |
| Production build | Succeeded |
| Database drift (`migrate diff` live database vs schema) | None; all 5 migrations applied |
| Secret scan of repository files (excluding the git-ignored `.env.local`) | No credentials found |
| End-to-end, final run | **23 / 23 passed** (12.8 min), including the 36 visual screenshots |

End-to-end history in this round, kept for honesty:

| Run | Result | Cause and fix |
|---|---|---|
| 1 | 14 passed, 1 failed, 7 not run | After a timesheet entry was returned, the reviewer saw no confirmation (the form unmounts). Fixed with a status notice on the entry |
| 2 | 14 passed, 1 failed, 7 not run | Same issue on the day-report review. Fixed with a "Review recorded" notice |
| 3 | 12 passed, 1 failed, 9 not run | A previously passing test exceeded the 120 s per-test limit on a slow run. Limit raised to 180 s |
| 4 | 22 / 22 passed | Before the addendum fixes |
| 5 | 23 / 23 passed | After the addendum fixes, migration 5 and the visual-check test |

Changes made **after** run 5 (typechecked, linted and built, but not re-run end-to-end): the breadcrumb label "Client reports", the hours format on the client-reports list, and possibly the file-download hardening that also requires the follow-up itself to be client-visible (it was edited while the run 5 build was starting, so it may not be in that build). None of these changes behaviour on any path the tests use.

**Approval grace period (owner decision, 26 Oct 2026), run 7: 24 / 24 passed (14.4 min)**, after migration 6 and the access-state changes. Unit tests 47 / 47. Drift: none. New end-to-end coverage:

- pending staff member: full role access with the deadline banner during the 7 days; on day 8 every service (tasks, timesheet, attendance, notifications, dashboard) redirects to onboarding with the reason; signing in on day 8 shows the same;
- a page left open 40 seconds before the deadline signs itself out without any click, and the session is really ended;
- pending business: portal usable during the 7 days; on day 8 every portal page redirects to "Your access period has ended"; the status endpoint reports `locked`;
- approvers see "Access until …" and "Access paused since …" in the approval queue;
- an open portal page signs out within 30 seconds when the office disables that login.

Day 8 is reached by moving the test account's creation time back in the database (`tests/e2e/db.ts`, refuses anything outside an e2e test organization); the real clock and real server checks are used throughout.

Visual check: screenshots at desktop (1366 px), tablet (768 px) and phone (375 px) of the public home, registration, admin dashboard, clients, task board, collective timesheet, pending tracker, observations, dues, client reports, settings lists and the client portal were reviewed. Found and fixed: hours shown as "3.5" instead of "3h 30m" on the client-reports list; breadcrumb read "Clients" on that page.
