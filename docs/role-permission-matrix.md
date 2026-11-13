# Permission Matrix

Source of truth: [`src/lib/permissions.ts`](../src/lib/permissions.ts). Every page calls `requireCapability(...)` and every server action calls `actionContext(...)`; hiding a button is never the only control. Unit-tested in `tests/domain.test.ts`.

Roles: **Owner**, **Admin** (administrator), **Manager**, **Senior**, **Team member** (`STAFF`). Job designation (Manager, Executive, …) grants nothing; only the system role does.

| Capability | Owner | Admin | Manager | Senior | Team member |
|---|:-:|:-:|:-:|:-:|:-:|
| Organization settings, policy, audit log | ✔ | ✔ | | | |
| Change roles, reset passwords, edit employee details | ✔ | ✔ | | | |
| Add & invite employees (`employees.invite`) | ✔ | ✔ | grant⁴ | grant⁴ | grant⁴ |
| Approve, hold or reject onboarding (`employees.approve`) | ✔ | ✔ | grant⁴ | grant⁴ | grant⁴ |
| Give a person extra rights or limit their modules (`access.manage`) | ✔ | ✔ | | | |
| Payroll — own payslip | ✔ | ✔ | ✔ | ✔ | ✔ |
| Payroll — team register, salaries, export (`payroll.manage`) | ✔ | ✔ | grant⁴ | grant⁴ | grant⁴ |
| Compliance — calendar, own tracker rows, mark own done | ✔ | ✔ | ✔ | ✔ | ✔ |
| Compliance — all rows, add columns, export all (`compliance.manage`) | ✔ | ✔ | ✔ | ✔ | grant⁴ |
| Import clients from Excel (`clients.import`) | ✔ | ✔ | ✔ | grant⁴ | grant⁴ |
| Delete clients / staff / tasks / other entries (`clients.delete`, `employees.delete`, `tasks.delete`, `records.delete`) | ✔ | ✔ | grant⁴ | grant⁴ | grant⁴ |
| View employee list / profiles | ✔ | ✔ | ✔ | ✔ | |
| View all clients | ✔ | ✔ | ✔ | ✔ | own¹ |
| Quick-register / edit clients, GSTINs, contacts, representatives, services | ✔ | ✔ | ✔ | | |
| Approve / reject / hold / discontinue clients | ✔ | ✔ | | | |
| Manage services & departments | ✔ | ✔ | | | |
| Team allocation — view all | ✔ | ✔ | ✔ | ✔ | own |
| Team allocation — create / change / end | ✔ | ✔ | ✔ | | |
| Tasks — view all | ✔ | ✔ | ✔ | ✔ | own² |
| Tasks — create and depute people | ✔ | ✔ | ✔ | ✔ | ✔ |
| Tasks — review any task, reopen | ✔ | ✔ | ✔ | ✔ | named checker |
| Tasks — cancel | ✔ | ✔ | ✔ | | |
| Tasks — start / hold / submit / remarks / attachments on assigned work | ✔ | ✔ | ✔ | ✔ | ✔ |
| Attendance — mark own | ✔ | ✔ | ✔ | ✔ | ✔ |
| Attendance — team view | ✔ | ✔ | ✔ | ✔ | |
| Attendance — record / correct for others (audited) | ✔ | ✔ | | | |
| Attendance — mark a colleague or daily worker in/out with their photo (`attendance.mark_others`) | ✔ | ✔ | ✔ | ✔ | grant⁴ |
| Attendance — check photo attendance, mark absent if not genuine (`attendance.review_photos`) | ✔ (all) | ✔ (all) | reportees, grant⁴ | reportees, grant⁴ | grant⁴ |
| Attendance — daily workers: register, wages, pay sheet (`attendance.workers`) | ✔ | ✔ | ✔ | grant⁴ | grant⁴ |
| Attendance — lunch in/out, client visits (own) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Attendance — client visits board (team) | ✔ | ✔ | ✔ | ✔ | |
| Leave — request | ✔ | ✔ | ✔ | ✔ | ✔ |
| Leave — decide | ✔ (all) | ✔ (all) | reportees | reportees | |
| Timesheet — fill own | ✔ | ✔ | ✔ | ✔ | ✔ |
| Timesheet — collective view & review | ✔ | ✔ | ✔ | ✔ | |
| Day report — submit / read received | ✔ | ✔ | ✔ | ✔ | ✔ |
| Day report — read all | ✔ | ✔ | | | |
| Pending tracker — own items | ✔ | ✔ | ✔ | ✔ | ✔ |
| Pending tracker — all items | ✔ | ✔ | ✔ | ✔ | |
| Client report (13A) & dues (13B), print and CSV export | ✔ | ✔ | ✔ | | |
| Fees & dues overview | ✔ | ✔ | ✔ | | |
| Client observations — log, reassign, close, view all | ✔ | ✔ | ✔ | ✔ | assigned³ |
| Lists & preferences (designations, work types, pending-days basis) | ✔ | ✔ | | | |
| Own profile: display name and password | ✔ | ✔ | ✔ | ✔ | ✔ |

¹ Clients they are allocated to or have tasks for. ² Tasks they created, or assigned to them, or where they are maker/checker. ⁴ Off by default; an administrator ticks it on the person's page (Employees → person → Module access & extra rights). ³ Team members see and update observations assigned to them but cannot close or reassign them.

Additional rules enforced in services:

- When a checker is named, only that checker (or an administrator) can approve; the same person may be both maker and checker (client feedback, 5 Nov 2026). With no checker named, a lead approves, and a maker cannot approve their own work.
- Team members can re-assign only tasks they created. Sharing a task with a client stays a review-level decision.
- Only an administrator can invite, approve or delete another administrator. Nobody can change their own rights or delete their own record; the owner cannot be deleted.
- Nobody changes their own role or access status (another administrator must); the owner's role cannot be changed.
- Managers and seniors decide leave only for people who report to them. This is enforced in the service, not just by filtering the list.
- Nobody decides their own leave request or reviews their own timesheet entries. A returned entry needs a remark; reviewed entries can be corrected only by administrators, with a reason.
- Report exports are checked with the same capability as the report page; foreign or unknown ids return 404.
- Staff whose onboarding is not approved can only use their onboarding page.
- All queries are filtered by the caller's organization, taken from the session — never from request data.
- Personal identity documents are downloadable only by the employee themself and administrators; Aadhaar and bank numbers are shown as last four digits.

## Per-person rights and module access (client feedback, 5 Nov 2026)

Stored on the membership (`granted_capabilities`, `module_restricted`, `allowed_modules`) and checked by `can(ctx, capability)` everywhere: menus, pages, server actions, exports and search.

- **Extra rights** add to the role, from the fixed list in `GRANTABLE_RIGHTS`. Administration itself (`org.manage`, `access.manage`, `audit.view`) can never be granted.
- **Module access** limits a person to chosen modules, and always wins over role and grants. The "Attendance & payroll only" preset is for a peon, driver or other support staff; it can also be chosen when inviting. They land on Attendance instead of a dashboard. Owners and administrators can never be restricted, so a firm cannot lock itself out.
- Pages that belong to no module (profile, notifications, own employee record) stay open.

## Client role (`CLIENT`)

Client logins are created only by the firm's staff ("Invite a client user" on the client's Portal access tab); there is no public client registration. They hold **no internal capability** — every `/app` page and staff action rejects them — and use the separate portal at `/client`:

| Client can | Scope |
|---|---|
| See registration status (`/account/pending`) | Own client only, any status |
| Use the portal (`/client/*`) | Only while the client is ACTIVE or ON_HOLD |
| See requests from the firm and reply / upload documents | Pending items *pending with client* that staff marked visible |
| See work items, add remarks, accept or raise observations | Tasks staff shared; only client-visible remarks |
| See dues, services, assigned team names | Own client |
| Download files | Only files belonging to their own business |
| Change own display name and password | Own login |
| Raise observations on shared work | Registered in the observation register as *from client* |

Clients cannot change their approval status, see internal remarks, staff HR data, other clients, internal reports or fees beyond their own dues.
