# Permission Matrix

Source of truth: [`src/lib/permissions.ts`](../src/lib/permissions.ts). Every page calls `requireCapability(...)` and every server action calls `actionContext(...)`; hiding a button is never the only control. Unit-tested in `tests/domain.test.ts`.

Roles: **Owner**, **Admin** (administrator), **Manager**, **Senior**, **Team member** (`STAFF`). Job designation (Manager, Executive, …) grants nothing; only the system role does.

| Capability | Owner | Admin | Manager | Senior | Team member |
|---|:-:|:-:|:-:|:-:|:-:|
| Organization settings, policy, audit log | ✔ | ✔ | | | |
| Create employee logins, approve onboarding, change roles, reset passwords | ✔ | ✔ | | | |
| View employee list / profiles | ✔ | ✔ | ✔ | ✔ | |
| View all clients | ✔ | ✔ | ✔ | ✔ | own¹ |
| Quick-register / edit clients, GSTINs, contacts, representatives, services | ✔ | ✔ | ✔ | | |
| Approve / reject / hold / discontinue clients | ✔ | ✔ | | | |
| Manage services & departments | ✔ | ✔ | | | |
| Team allocation — view all | ✔ | ✔ | ✔ | ✔ | own |
| Team allocation — create / change / end | ✔ | ✔ | ✔ | | |
| Tasks — view all | ✔ | ✔ | ✔ | ✔ | own² |
| Tasks — create, assign, review (checker), reopen | ✔ | ✔ | ✔ | ✔ | |
| Tasks — cancel | ✔ | ✔ | ✔ | | |
| Tasks — start / hold / submit / remarks / attachments on assigned work | ✔ | ✔ | ✔ | ✔ | ✔ |
| Tasks — delete | — | — | — | — | — (no one; cancel keeps history) |
| Attendance — mark own | ✔ | ✔ | ✔ | ✔ | ✔ |
| Attendance — team view | ✔ | ✔ | ✔ | ✔ | |
| Attendance — record / correct for others (audited) | ✔ | ✔ | | | |
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

¹ Clients they are allocated to or have tasks for. ² Tasks assigned to them, or where they are maker/checker. ³ Team members see and update observations assigned to them but cannot close or reassign them.

Additional rules enforced in services:

- A maker can never approve their own task; when a checker is named, only that checker (or an administrator) can approve.
- Nobody changes their own role or access status (another administrator must); the owner's role cannot be changed.
- Managers and seniors decide leave only for people who report to them. This is enforced in the service, not just by filtering the list.
- Nobody decides their own leave request or reviews their own timesheet entries. A returned entry needs a remark; reviewed entries can be corrected only by administrators, with a reason.
- Report exports are checked with the same capability as the report page; foreign or unknown ids return 404.
- Staff whose onboarding is not approved can only use their onboarding page.
- All queries are filtered by the caller's organization, taken from the session — never from request data.
- Personal identity documents are downloadable only by the employee themself and administrators; Aadhaar and bank numbers are shown as last four digits.

## Client role (`CLIENT`)

Client logins are created by public registration (`/register/quick`, `/register/business`) or by staff ("Invite a client user" on the client's Portal access tab). They hold **no internal capability** — every `/app` page and staff action rejects them — and use the separate portal at `/client`:

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
