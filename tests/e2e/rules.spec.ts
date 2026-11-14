import { expect, test, type Browser, type Page } from "@playwright/test";
import { addHolidayRow, approvedLeave, approvedOvertime, disconnectRules, missedEodDay, seedTeam, setPolicy, workedDay, type Person } from "./rules-db";

// Leave, Timing and Office Decorum Rules (client PDF, 14 Nov 2026), through every role's eyes:
// team member, Team Lead (Senior), manager and owner. A firm of its own (@e2e.invalid); the
// people are seeded with the owner's password. September 2026 is a fixed, complete month whose
// pay is checked to the rupee; today's flows (mark in, plan, EOD, requests, leave) use real dates.
test.describe.configure({ mode: "serial" });
test.afterAll(disconnectRules);

const run = process.env.E2E_RUN ?? Date.now().toString(36);
const password = "Rules-Owner-Pass-123";
const owner = `rules-owner-${run}@e2e.invalid`;
const mail = (k: string) => `rules-${k}-${run}@e2e.invalid`;
const people: Person[] = [
  { key: "meena", name: "Meena Manager", email: mail("meena"), role: "MANAGER", salary: 60000 },
  { key: "tarun", name: "Tarun Lead", email: mail("tarun"), role: "SENIOR", reportsTo: "meena", salary: 50000 },
  { key: "asha", name: "Asha Member", email: mail("asha"), role: "STAFF", reportsTo: "tarun", salary: 30000 },
  { key: "ravi", name: "Ravi Member", email: mail("ravi"), role: "STAFF", reportsTo: "tarun", salary: 30000 },
  { key: "peon", name: "Pappu Peon", email: mail("peon"), role: "STAFF", reportsTo: "tarun", restricted: true, salary: 12000 },
];
const CRON_SECRET = process.env.E2E_CRON_SECRET ?? "e2e-cron-secret-0123456789abcdef";
let org = "";
let ids: Record<string, string> = {};

const ist = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const nextWorking = (iso: string) => {
  let d = addDaysIso(iso, 1);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() === 0) d = addDaysIso(d, 1);
  return d;
};
const today = ist();
const isSunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;

async function signIn(page: Page, id: string) {
  await page.goto("/login");
  await page.getByLabel("Login ID or email").fill(id);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/app");
}
async function as(browser: Browser, id: string, opts: { location?: boolean } = {}) {
  const ctx = await browser.newContext(opts.location === false ? { permissions: [] } : {});
  const page = await ctx.newPage();
  await signIn(page, id);
  return page;
}
const accept = (page: Page) => page.once("dialog", (d) => d.accept());

test("setup: the firm, its team and a complete September", async ({ page }) => {
  await page.goto("/register/firm");
  await page.getByLabel("Your full name").fill("Rules Owner");
  await page.getByLabel("Email").fill(owner);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel("Trade name").fill(`Rules Firm ${run}`);
  await page.getByLabel("Constitution").selectOption({ label: "Proprietorship" });
  await page.getByRole("textbox", { name: "Full name", exact: true }).fill("Rules Owner");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app\/admin/);
  // The policy row exists once a page has read it; the suite runs at any hour, so the 12:00 cut-off moves.
  await page.goto("/app/settings?tab=policy");
  await expect(page.getByLabel("Office name")).toBeVisible();
  await setPolicy(owner, { autoAbsentAt: "23:59" });

  ({ org, ids } = await seedTeam(owner, people));
  await addHolidayRow(org, "2026-09-24", "Test holiday");
  const asha: Record<string, [string, string | null, boolean?] | "leave" | "none" | "ot"> = {
    "01": ["10:00", "18:30"], "02": ["10:05", "18:30"], "03": ["09:50", "18:30"], // three lates of 15 min – 1 h = ½ day
    "04": ["11:00", "18:30"], // over an hour late = ½ day
    "05": ["09:30", "17:00"], // left before 17:30 = ½ day
    "12": "leave", "14": "leave", // Saturday + Monday leave: Sunday 13 counts too; the second leave is beyond the 1 a month
    "16": "none", // absent, no request = double
    "17": "ot", // 90 minutes of approved overtime
    "18": ["09:30", "18:30", false], // EOD never filed: ₹100, and ₹200 for Tarun who did not escalate
  };
  for (let d = 1; d <= 30; d++) {
    const iso = `2026-09-${String(d).padStart(2, "0")}`;
    if (new Date(`${iso}T00:00:00Z`).getUTCDay() === 0 || iso === "2026-09-24") continue;
    for (const k of ["meena", "tarun", "ravi"]) await workedDay(org, ids[k], iso, k === "ravi" ? "09:25" : "09:30", "18:35");
    await workedDay(org, ids.peon, iso, "09:30", "18:30", { eod: false });
    const s = asha[iso.slice(8)];
    if (s === "none") continue;
    if (s === "leave") await approvedLeave(org, ids.asha, iso);
    else if (s === "ot") {
      await workedDay(org, ids.asha, iso, "09:30", "20:15");
      await approvedOvertime(org, ids.asha, iso);
    } else if (s) await workedDay(org, ids.asha, iso, s[0], s[1], { eod: s[2] !== false });
    else await workedDay(org, ids.asha, iso, "09:30", "18:30");
  }
});

test("everyone reads the rules (all 11 sections) and accepts the declaration", async ({ browser }) => {
  const asha = await as(browser, mail("asha"));
  await expect(asha.getByText(/read and accept the/)).toBeVisible(); // dashboard banner
  await asha.goto("/app/rules");
  for (const h of ["1. Attendance", "2. Daily ERP updates", "3. Reporting on time", "4. Team Lead reporting", "5. Office timings", "6. Late arrival", "7. Lunch", "8. Leaving early and staying late", "9. Overtime (starts from 6:46 PM)", "10. Leave", "11. Declaration"]) {
    await expect(asha.getByRole("heading", { name: h })).toBeVisible();
  }
  await expect(asha.getByText(/No human intervention is allowed/)).toBeVisible();
  await expect(asha.getByText(/fined Rs. 100/)).toBeVisible();
  await asha.getByRole("button", { name: "I have read and accept these rules" }).click();
  await expect(asha.getByText(/You accepted these rules on/)).toBeVisible();
  await asha.goto("/app/workspace");
  await expect(asha.getByText(/read and accept the/)).toHaveCount(0);
  await asha.context().close();
});

test("mark in needs the map location and a work location", async ({ browser }) => {
  // Without location permission the ERP explains how to allow it and records nothing.
  const blocked = await as(browser, mail("asha"), { location: false });
  await blocked.goto("/app/attendance");
  await blocked.getByRole("radio", { name: "Office", exact: true }).check();
  await blocked.getByRole("button", { name: "Mark in" }).click();
  await expect(blocked.getByText(/Location is blocked for this site/)).toBeVisible();
  await blocked.context().close();

  const asha = await as(browser, mail("asha"));
  await asha.goto("/app/attendance");
  await expect(asha.getByText(/9:30–18:30|09:30–18:30/).first()).toBeVisible(); // the day's schedule
  await asha.getByRole("button", { name: "Mark in" }).click();
  await expect(asha.getByText("Choose where you are working today.")).toBeVisible();
  await asha.getByRole("radio", { name: "Client office" }).check();
  await asha.getByRole("button", { name: "Mark in" }).click();
  await expect(asha.getByText("Enter the client whose office you are at.")).toBeVisible();
  await asha.getByRole("radio", { name: "Office", exact: true }).check();
  await asha.getByRole("button", { name: "Mark in" }).click();
  await expect(asha.getByText(/^Marked in/).first()).toBeVisible();
  await asha.reload();
  await expect(asha.getByText(/Marked in at/)).toBeVisible();
  await expect(asha.getByRole("button", { name: "Mark out" })).toBeVisible();
  const nowMin = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(new Date())) * 60;
  if (nowMin < 18 * 60) await expect(asha.getByRole("link", { name: /Need to stay after/ })).toBeVisible(); // the overtime form is offered before 18:45
  await asha.context().close();
});

test("morning plan → Team Lead edits and approves → EOD with reasons → unfinished work comes back as old work", async ({ browser }) => {
  const asha = await as(browser, mail("asha"));
  await asha.goto("/app/timesheet");
  await expect(asha.getByRole("link", { name: "Plan & EOD report" })).toHaveAttribute("aria-current", "page"); // the default tab
  await expect(asha.getByText(/Your Team Lead:/)).toContainText("Tarun Lead");
  const plan = asha.locator("form").filter({ has: asha.getByRole("button", { name: "Send plan to my Team Lead" }) });
  for (const [client, task] of [["Internal", "Prepare GST return for ABC"], ["Internal", `Bank reconciliation ${run}`]]) {
    await plan.getByRole("button", { name: "Add a task" }).click();
    const line = plan.locator("ol > li").last();
    await line.getByLabel("Client").fill(client);
    await line.getByLabel("Task").fill(task);
  }
  await plan.getByRole("button", { name: "Send plan to my Team Lead" }).click();
  await expect(asha.getByText("Morning plan sent to your Team Lead.")).toBeVisible();

  const tarun = await as(browser, mail("tarun"));
  await tarun.goto("/app/timesheet");
  await expect(tarun.getByRole("link", { name: "Team plans & EOD" })).toHaveAttribute("aria-current", "page");
  const row = tarun.locator("tr", { hasText: "Asha Member" });
  await row.getByRole("link", { name: "Open plan" }).click();
  const edit = tarun.locator("form").filter({ has: tarun.getByRole("button", { name: "Save changes & approve" }) });
  await edit.locator("ol > li").first().getByLabel("Task").fill("Prepare and file GST return for ABC");
  await edit.getByRole("button", { name: "Save changes & approve" }).click();
  await expect(tarun.getByText(/Changes saved and approved; Asha is notified/)).toBeVisible();

  await asha.reload();
  await expect(asha.getByText(/Your Team Lead edited this plan/)).toBeVisible();
  const eod = asha.locator("form").filter({ has: asha.getByRole("button", { name: "File EOD report" }) });
  await expect(eod.locator("ol > li").first().getByLabel("Task")).toHaveValue("Prepare and file GST return for ABC");
  await eod.locator("ol > li").nth(0).getByText("Done", { exact: true }).click();
  await eod.locator("ol > li").nth(1).getByText("Pending", { exact: true }).click();
  await eod.getByRole("button", { name: "File EOD report" }).click();
  await expect(asha.getByText(/Give the reason/)).toBeVisible(); // a reason for each pending item
  await eod.locator("ol > li").nth(1).getByLabel("Reason it is not done").fill("Bank statement awaited from client");
  await eod.getByRole("button", { name: "Add work not in the plan" }).click();
  const extra = eod.locator("ol > li").last();
  await extra.getByLabel("Client").fill("Internal");
  await extra.getByLabel("Task").fill("Client call on TDS notice");
  await extra.getByText("Done", { exact: true }).click();
  await eod.getByRole("button", { name: "File EOD report" }).click();
  await expect(asha.getByText(/EOD report filed/)).toBeVisible();
  await asha.reload();
  await expect(asha.getByRole("heading", { name: /EOD report · filed/ })).toBeVisible();
  await expect(asha.getByText("Bank statement awaited from client")).toBeVisible();

  // The next working day's plan starts with the pending line as old work.
  await asha.goto(`/app/timesheet?tab=plan&date=${nextWorking(today)}`);
  const next = asha.locator("ol > li", { hasText: "Old work" });
  await expect(next.getByLabel("Task")).toHaveValue(`Bank reconciliation ${run}`);
  await expect(next.getByText(/Pending: Bank statement awaited from client/)).toBeVisible();
  await asha.context().close();
  await tarun.context().close();
});

test("forms in the ERP: late intimation and overtime, decided by the Team Lead", async ({ browser }) => {
  const day = nextWorking(today);
  const asha = await as(browser, mail("asha"));
  await asha.goto("/app/attendance?tab=requests&kind=OVERTIME");
  await asha.getByLabel("Date").fill(day);
  await asha.getByLabel("What task will you be doing?").fill("Year-end closing for ABC");
  await asha.getByLabel("Why can it not wait till tomorrow?").fill("Audit team arrives next morning");
  await asha.getByRole("button", { name: "Ask my Team Lead" }).click();
  await expect(asha.getByText(/Only approved overtime is counted/)).toBeVisible();
  await asha.getByRole("radio", { name: "I'll be late" }).check();
  await asha.getByLabel("Date").fill(day);
  await asha.getByLabel("Expected arrival").fill("10:15");
  await asha.getByLabel("Reason").fill("Bank visit for client KYC");
  await asha.getByRole("button", { name: "Inform my Team Lead" }).click();
  await expect(asha.getByText(/One late arrival a month informed in advance is a warning only/)).toBeVisible();

  const tarun = await as(browser, mail("tarun"));
  await tarun.goto("/app/notifications");
  await expect(tarun.getByText(/Asha asks to stay late/).first()).toBeVisible();
  await tarun.goto("/app/attendance?tab=requests");
  const card = tarun.locator("li", { hasText: "Year-end closing for ABC" });
  await expect(card.getByText(/Audit team arrives next morning/)).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(tarun.getByText("Saved. Asha is notified.")).toBeVisible();
  await expect(tarun.locator("li", { hasText: "Bank visit for client KYC" }).getByRole("button", { name: "Not genuine" })).toBeVisible();

  await asha.goto("/app/attendance?tab=requests");
  await expect(asha.locator("li", { hasText: "Year-end closing for ABC" }).getByText("Approved").first()).toBeVisible();
  // A team member cannot decide anything.
  await expect(asha.getByRole("heading", { name: /Waiting for your decision/ })).toHaveCount(0);
  await asha.context().close();
  await tarun.context().close();
});

test("leave: 15-day rule for planned leave, Sunday inside a leave, Team Lead approves", async ({ browser }) => {
  const asha = await as(browser, mail("asha"));
  await asha.goto("/app/attendance?tab=leave");
  await expect(asha.getByText(/One leave a month is paid when asked for before your reporting time/)).toBeVisible();
  await asha.getByLabel("Type").selectOption("PLANNED");
  await asha.locator('input[name="fromDate"]').fill(addDaysIso(today, 5));
  await asha.locator('input[name="toDate"]').fill(addDaysIso(today, 5));
  await asha.getByRole("button", { name: "Request leave" }).click();
  await expect(asha.getByText(/Planned leave must be requested at least 15 days in advance/)).toBeVisible();
  // Saturday + Monday a fortnight ahead: the Sunday between counts as leave.
  let sat = addDaysIso(today, 8);
  while (new Date(`${sat}T00:00:00Z`).getUTCDay() !== 6) sat = addDaysIso(sat, 1);
  await asha.getByLabel("Type").selectOption("CASUAL");
  await asha.locator('input[name="fromDate"]').fill(sat);
  await asha.locator('input[name="toDate"]').fill(sat);
  await asha.getByRole("button", { name: "Request leave" }).click();
  await expect(asha.getByText(/Leave requested; your Team Lead is informed\./)).toBeVisible();
  await asha.getByLabel("Type").selectOption("CASUAL");
  await asha.locator('input[name="fromDate"]').fill(addDaysIso(sat, 2));
  await asha.locator('input[name="toDate"]').fill(addDaysIso(sat, 2));
  await asha.getByRole("button", { name: "Request leave" }).click();
  await expect(asha.getByText(/will also count as leave \(Sundays and holidays inside a continuous leave\)/)).toBeVisible();

  const tarun = await as(browser, mail("tarun"));
  await tarun.goto("/app/attendance?tab=leave");
  const req = tarun.locator("li", { hasText: "Asha Member" }).first();
  await req.getByRole("button", { name: "Approve" }).click();
  await expect(tarun.getByText("Decision saved.")).toBeVisible();
  await asha.context().close();
  await tarun.context().close();
});

test("a missing EOD is flagged to the Team Lead, who escalates it", async ({ browser }) => {
  const day = await missedEodDay(org, ids.ravi);
  const tarun = await as(browser, mail("tarun"));
  await tarun.goto("/app/senior");
  await expect(tarun.getByRole("heading", { name: /My team today/ })).toBeVisible();
  await expect(tarun.getByText(/EOD reports? not filed/).first()).toBeVisible();
  await tarun.goto("/app/timesheet?tab=team-plans");
  const item = tarun.locator("li", { hasText: "Ravi Member" }).filter({ has: tarun.getByRole("button", { name: "Escalate" }) });
  await expect(item).toBeVisible();
  accept(tarun);
  await item.getByRole("button", { name: "Escalate" }).click();
  await expect(tarun.getByText(/Escalated\. Ravi Member is told to update the timesheet/)).toBeVisible();

  const ravi = await as(browser, mail("ravi"));
  await ravi.goto("/app/notifications");
  await expect(ravi.getByText(/Update your timesheet for/).first()).toBeVisible();
  await ravi.goto(`/app/timesheet?tab=plan&date=${day}`);
  await expect(ravi.getByText(/a fine of ₹100 applies/)).toBeVisible();
  await expect(ravi.getByText(/Your Team Lead escalated this missing EOD/)).toBeVisible();
  await ravi.context().close();
  await tarun.context().close();
});

test("salaries: the manager fixes and increases them for her team; a senior and a team member cannot", async ({ browser }) => {
  const tarun = await as(browser, mail("tarun"));
  await tarun.goto("/app/payroll");
  await expect(tarun.getByRole("link", { name: "Salaries" })).toHaveCount(0);
  await tarun.goto("/app/payroll?tab=salaries");
  await expect(tarun.getByRole("heading", { name: "Fix or change a salary" })).toHaveCount(0);
  await tarun.context().close();

  const meena = await as(browser, mail("meena"));
  await meena.goto("/app/payroll?tab=salaries");
  const table = meena.locator("table");
  for (const n of ["Tarun Lead", "Asha Member", "Ravi Member", "Pappu Peon"]) await expect(table.getByText(n)).toBeVisible();
  await expect(table.getByText("Meena Manager")).toHaveCount(0); // not her own salary
  await meena.locator("tr", { hasText: "Asha Member" }).getByRole("link", { name: "Change / history" }).click();
  await expect(meena.getByText("Current salary:")).toContainText("30,000");
  await meena.getByLabel("Increase (%)").fill("10");
  await expect(meena.getByText(/New salary: ₹ 33,000 a month/)).toBeVisible();
  const firstOfNext = `${addDaysIso(`${today.slice(0, 7)}-28`, 7).slice(0, 7)}-01`;
  await meena.getByLabel("Effective from").fill(firstOfNext);
  await meena.getByLabel("Note (reason, appraisal…)").fill("Annual appraisal");
  await meena.getByRole("button", { name: "Save salary" }).click();
  await expect(meena.getByText(/Asha Member: salary ₹33,000 a month/)).toBeVisible();
  await meena.reload();
  await expect(meena.getByText(/\+₹ 3,000\.00 \(10%\)/)).toBeVisible();
  await expect(meena.getByText(/₹ 33,000\.00 from/)).toBeVisible(); // upcoming change
  await meena.context().close();

  const asha = await as(browser, mail("asha"));
  await asha.goto("/app/notifications");
  await expect(asha.getByText("Your salary has been revised").first()).toBeVisible();
  await asha.goto("/app/payroll");
  await expect(asha.getByRole("heading", { name: "My salary history" })).toBeVisible();
  await expect(asha.getByText("Upcoming")).toBeVisible();
  await expect(asha.getByRole("link", { name: "Salaries" })).toHaveCount(0);
  await asha.context().close();
});

test("September payroll applies every rule, to the rupee", async ({ browser }) => {
  const own = await as(browser, owner);
  await own.goto("/app/payroll?tab=team&month=2026-09");
  const row = (n: string) => own.locator("tbody tr", { hasText: n });
  // Asha: 5.5 days deducted, 90 min approved overtime, ₹100 EOD fine → 24,500 + 166.67 − 100.
  await expect(row("Asha Member")).toContainText("₹ 24,566.67");
  // Perfect months earn two extra days; Tarun also pays ₹200 for not escalating Asha's EOD.
  await expect(row("Ravi Member")).toContainText("₹ 32,000.00");
  await expect(row("Tarun Lead")).toContainText("₹ 53,133.33");
  await expect(row("Pappu Peon")).toContainText("₹ 12,800.00"); // no timesheet, so no EOD fines
  await expect(own.locator("tbody tr", { hasText: "Rules Owner" })).toHaveCount(0); // the owner is not on the payroll
  await row("Asha Member").getByRole("link", { name: "Asha Member" }).click();
  const b = own.locator("section", { hasText: "Asha Member · September 2026" });
  await expect(b.locator("tr", { hasText: "Absent without any request (counts double)" })).toContainText("−2 days");
  await expect(b.locator("tr", { hasText: "Sundays / holidays inside a leave" })).toContainText("−1 day");
  await expect(b.locator("tr", { hasText: "Leave beyond the 1 a month" })).toContainText("−1 day");
  await expect(b.locator("tr", { hasText: "Late over 1 hour" })).toContainText("−0.5 days");
  await expect(b.locator("tr", { hasText: "Left before the half-day time" })).toContainText("−0.5 days");
  await expect(b.locator("tr", { hasText: "Days deducted" })).toContainText("5.5 days");
  const xl = await own.request.get("/app/payroll/export?month=2026-09");
  expect(xl.status()).toBe(200);
  await own.context().close();

  const asha = await as(browser, mail("asha"));
  await asha.goto("/app/payroll?month=2026-09");
  await expect(asha.getByText("₹ 24,566.67").first()).toBeVisible();
  await asha.goto("/app/attendance?month=2026-09");
  await expect(asha.getByText("Late 1h 30m · ½ day")).toBeVisible();
  await expect(asha.getByText(/Overtime 1h 30m/)).toBeVisible();
  await expect(asha.getByText(/16 Sept 2026 not marked \(no request: counts double\)|16 Sep 2026 not marked \(no request: counts double\)/)).toBeVisible();
  await asha.context().close();
});

test("12:00: the ERP marks those not in Absent, and nobody can change attendance by hand", async ({ browser, request }) => {
  test.skip(isSunday, "Sundays are off: nobody is marked absent");
  await setPolicy(owner, { autoAbsentAt: "00:01" });
  const cron = await request.get("/api/cron/attendance", { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  expect(cron.status()).toBe(200);
  expect((await cron.json()).absent).toBeGreaterThan(0);

  const peon = await as(browser, mail("peon"));
  await expect(peon).toHaveURL(/\/app\/attendance/);
  await expect(peon.getByText(/marked .*Absent.* by the ERP/i).first()).toBeVisible();
  await expect(peon.getByRole("button", { name: "Mark in" })).toHaveCount(0);
  await peon.context().close();

  const own = await as(browser, owner);
  await own.goto(`/app/attendance?tab=team&status=ABSENT`);
  const r = own.locator("#attendance-list tbody tr", { hasText: "Pappu Peon" });
  await expect(r.getByText("by the ERP")).toBeVisible();
  await expect(r.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  await expect(own.getByRole("heading", { name: "Record or correct attendance" })).toHaveCount(0);
  // Asha marked in earlier and stays present.
  await own.goto(`/app/attendance?tab=team&status=PRESENT`);
  await expect(own.locator("#attendance-list tbody tr", { hasText: "Asha Member" })).toBeVisible();
  await own.context().close();
  await setPolicy(owner, { autoAbsentAt: "23:59" });
});

test("owner: policy values, office holidays and who has accepted the rules", async ({ browser }) => {
  const own = await as(browser, owner);
  await own.goto("/app/settings?tab=policy");
  await expect(own.getByText(/Rules accepted: 1 of 5/)).toBeVisible(); // only Asha so far
  await own.getByLabel("Office name").fill("Naraina Office");
  await own.getByRole("button", { name: "Save policy" }).click();
  await expect(own.getByText(/Policy saved/)).toBeVisible();
  await expect(own.getByText(/Rules accepted: 0 of 5/)).toBeVisible(); // a change asks everyone again
  const holiday = addDaysIso(today, new Date(`${addDaysIso(today, 20)}T00:00:00Z`).getUTCDay() === 0 ? 21 : 20);
  await own.getByLabel("Date").fill(holiday);
  await own.getByLabel("Holiday").fill("Test festival");
  await own.getByRole("button", { name: "Add" }).click();
  await expect(own.getByText("Test festival added.")).toBeVisible();
  await own.goto("/app/attendance");
  await expect(own.getByRole("radio", { name: "Naraina Office" })).toBeVisible();
  await own.goto("/app/admin");
  await expect(own.getByRole("heading", { name: /Firm today/ }).first()).toBeVisible();
  await own.context().close();
});
