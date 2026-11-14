import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { allocate, allocationStatus, disconnectRules, seedClient, seedService, seedTeam, setPolicy, startedMinutesAgo, type Person } from "./rules-db";

// Requirements tracker, 14 Nov 2026 (open points), through each role: team member, Team Lead,
// manager and owner. A firm of its own (@e2e.invalid).
test.describe.configure({ mode: "serial" });
test.afterAll(disconnectRules);

const run = process.env.E2E_RUN ?? Date.now().toString(36);
const password = "Tracker-Owner-Pass-123";
const owner = `trk-owner-${run}@e2e.invalid`;
const mail = (k: string) => `trk-${k}-${run}@e2e.invalid`;
const people: Person[] = [
  { key: "meena", name: "Meena Manager", email: mail("meena"), role: "MANAGER", salary: 60000 },
  { key: "tarun", name: "Tarun Lead", email: mail("tarun"), role: "SENIOR", reportsTo: "meena", salary: 50000 },
  { key: "asha", name: "Asha Member", email: mail("asha"), role: "STAFF", reportsTo: "tarun", salary: 30000 },
  { key: "ravi", name: "Ravi Member", email: mail("ravi"), role: "STAFF", reportsTo: "tarun", salary: 30000 },
];
const alpha = `Alpha Traders ${run}`;
const beta = `Beta Steels ${run}`;
let org = "";
let ids: Record<string, string> = {};
const clientIds: Record<string, string> = {};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") });

async function signIn(page: Page, id: string) {
  await page.goto("/login");
  await page.getByLabel("Login ID or email").fill(id);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/app");
}
async function as(browser: Browser, id: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, id);
  return page;
}
async function pick(page: Page, label: string, name: string, typed = name) {
  const box = page.getByRole("combobox", { name: label, exact: true }).last();
  await box.click();
  await box.fill(typed);
  await page.getByRole("listbox").getByRole("option", { name }).first().click();
}
const accept = (page: Page) => page.once("dialog", (d) => d.accept());

test("setup: firm, team, two clients, each allocated to one team member", async ({ page }) => {
  await page.goto("/register/firm");
  await page.getByLabel("Your full name").fill("Tracker Owner");
  await page.getByLabel("Email").fill(owner);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel("Trade name").fill(`Tracker Firm ${run}`);
  await page.getByLabel("Constitution").selectOption({ label: "Proprietorship" });
  await page.getByRole("textbox", { name: "Full name", exact: true }).fill("Tracker Owner");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app\/admin/);
  await page.goto("/app/settings?tab=policy");
  await expect(page.getByLabel("Office name")).toBeVisible();
  await setPolicy(owner, { autoAbsentAt: "23:59" });
  ({ org, ids } = await seedTeam(owner, people));
  clientIds.alpha = await seedClient(org, alpha);
  clientIds.beta = await seedClient(org, beta);
  await allocate(org, clientIds.alpha, ids.asha, "2026-11-01");
  await allocate(org, clientIds.beta, ids.ravi, "2026-11-01");
  await seedService(org, `GST Returns ${run}`);
  await seedService(org, `Audit ${run}`);
});

test("team member: timesheet shows only her allocated clients + Office / Other; tasks company-wise", async ({ browser }) => {
  const asha = await as(browser, mail("asha"));
  await asha.goto(`/app/timesheet?tab=daily&date=${today}`);
  const mine = asha.getByRole("heading", { name: /My clients on/ });
  await expect(mine).toBeVisible();
  await expect(asha.getByText(alpha).first()).toBeVisible();
  await expect(asha.getByText(beta)).toHaveCount(0);
  // The client picker of the log form offers Alpha, not Beta.
  const box = asha.getByRole("combobox", { name: "Client", exact: true });
  await box.click();
  await box.fill("Beta");
  await expect(asha.getByRole("listbox").getByRole("option", { name: beta })).toHaveCount(0);
  await box.fill("Alpha");
  await expect(asha.getByRole("listbox").getByRole("option", { name: alpha })).toBeVisible();
  // Company-wise: "+ Add task" opens a new task for that client.
  await asha.goto(`/app/timesheet?tab=daily&date=${today}`);
  await asha.getByRole("link", { name: "+ Add task" }).click();
  await expect(asha).toHaveURL(new RegExp(`client=${clientIds.alpha}`));
  await expect(asha.getByText(alpha).first()).toBeVisible();
  // A team member's new-task client list is her own clients only.
  const clients = asha.getByRole("combobox", { name: "Client(s)", exact: true });
  await clients.click();
  await clients.fill("Beta");
  await expect(asha.getByRole("listbox").getByRole("option", { name: beta })).toHaveCount(0);
  await asha.context().close();
});

const taskTitle = `Bank reconciliation ${run}`;

test("owner: one task for several clients; can correct it until work starts", async ({ browser }) => {
  const own = await as(browser, owner);
  await own.goto("/app/tasks/new");
  await own.getByRole("textbox", { name: "Task", exact: true }).fill(taskTitle);
  await pick(own, "Client(s)", alpha, "Alpha");
  await pick(own, "Client(s)", beta, "Beta");
  await pick(own, "Assign to (one or more)", "Asha Member", "Asha");
  await own.getByRole("button", { name: "Create task" }).click();
  await expect(own.getByText("2 tasks created, one for each client.")).toBeVisible();
  await expect(own.getByRole("link", { name: taskTitle })).toHaveCount(2);
  // Correct the Alpha task before it is started.
  await own.goto(`/app/tasks?client=${clientIds.alpha}`);
  await own.getByRole("link", { name: taskTitle }).first().click();
  await own.getByText("Entered something wrong?").click();
  await own.getByRole("textbox", { name: "Task", exact: true }).fill(`${taskTitle} (Alpha)`);
  await own.getByRole("button", { name: "Save changes" }).click();
  await expect(own.getByText("Task updated. The people on it were told.")).toBeVisible();
  await expect(own.getByRole("heading", { name: `${taskTitle} (Alpha)` })).toBeVisible();
  await expect(own.getByText("Details corrected: title")).toBeVisible();
  await own.context().close();
});

test("team member: time on the task goes to the timesheet when sent for review; then the task can't be edited", async ({ browser }) => {
  const asha = await as(browser, mail("asha"));
  await asha.goto(`/app/tasks?client=${clientIds.alpha}`);
  await asha.getByRole("link", { name: `${taskTitle} (Alpha)` }).click();
  await asha.getByRole("button", { name: "Start / resume work" }).click();
  await expect(asha.getByRole("button", { name: "Submit for review" })).toBeVisible();
  await startedMinutesAgo(`${taskTitle} (Alpha)`, 125);
  await expect(asha.getByText(/time you worked on this task .* is added to your timesheet/)).toBeVisible();
  await asha.getByRole("button", { name: "Submit for review" }).click();
  await expect(asha.getByText(/Sent for review\. 2h 0[45]m added to your timesheet\./)).toBeVisible();
  // The work date is the day the work started (IST).
  await asha.goto(`/app/timesheet?tab=daily&date=${today}`);
  await expect(asha.getByText(/sent for review \(time recorded from the task\)/).first()).toBeVisible();
  await asha.context().close();
  const own = await as(browser, owner);
  await own.goto(`/app/tasks?client=${clientIds.alpha}`);
  await own.getByRole("link", { name: `${taskTitle} (Alpha)` }).click();
  await expect(own.getByText("Entered something wrong?")).toHaveCount(0);
  await own.context().close();
});

test("Team Lead: My team and All attendance; manager too; a team member sees neither", async ({ browser }) => {
  const tarun = await as(browser, mail("tarun"));
  await tarun.goto("/app/attendance");
  await expect(tarun.getByRole("link", { name: "My team" })).toBeVisible();
  await expect(tarun.getByRole("link", { name: "All attendance" })).toBeVisible();
  await tarun.getByRole("link", { name: "My team" }).click();
  const list = tarun.locator("#attendance-list");
  await expect(list.getByText("Asha Member").first()).toBeVisible();
  await expect(list.getByText("Ravi Member").first()).toBeVisible();
  await expect(list.getByText("Meena Manager")).toHaveCount(0);
  expect((await tarun.request.get("/app/attendance/export?scope=mine")).status()).toBe(200);
  await tarun.getByRole("link", { name: "All attendance" }).click();
  await expect(tarun.locator("#attendance-list").getByText("Meena Manager").first()).toBeVisible();
  await tarun.context().close();

  const asha = await as(browser, mail("asha"));
  await asha.goto("/app/attendance");
  await expect(asha.getByRole("link", { name: "My team" })).toHaveCount(0);
  await expect(asha.getByRole("link", { name: "All attendance" })).toHaveCount(0);
  expect((await asha.request.get("/app/attendance/export?scope=mine")).status()).toBe(404);
  await asha.context().close();
});

test("owner: Ex-Employee — sign-in stops, allocations end, listed apart, can be brought back", async ({ browser }) => {
  const own = await as(browser, owner);
  await own.goto(`/app/employees/${ids.ravi}`);
  await own.getByLabel("Reason for leaving").selectOption("RESIGNED");
  await own.getByLabel("Note (optional)").fill("Moved to another city");
  accept(own);
  await own.getByRole("button", { name: "Move to Ex-Employee" }).click();
  await expect(own.getByText(/moved to Ex-Employees\. Sign-in is disabled and 1 client allocation ended/)).toBeVisible();
  await expect(own.getByText(/Ex-Employee — Resigned, last working day/)).toBeVisible();
  expect(await allocationStatus(clientIds.beta, ids.ravi)).toEqual({ status: "ENDED", end_date: today });
  await own.goto("/app/employees");
  await expect(own.getByRole("link", { name: "Ravi Member" })).toHaveCount(0);
  await own.getByRole("link", { name: /Ex-employees/ }).click();
  await expect(own.getByRole("link", { name: "Ravi Member" }).first()).toBeVisible();

  // Ravi can no longer sign in.
  const r = await (await browser.newContext()).newPage();
  await r.goto("/login");
  await r.getByLabel("Login ID or email").fill(mail("ravi"));
  await r.locator("#password").fill(password);
  await r.getByRole("button", { name: "Sign in" }).click();
  await expect(r).toHaveURL(/\/login/);
  await r.context().close();

  await own.goto(`/app/employees/${ids.ravi}`);
  accept(own);
  await own.getByRole("button", { name: "Bring back as active" }).click();
  await expect(own.getByText("Brought back as an active employee. Sign-in is allowed again.")).toBeVisible();
  await own.context().close();
});

test("clients: contact person required in quick registration; documents upload; Client Master fields; edit services", async ({ browser }) => {
  const own = await as(browser, owner);
  await own.goto("/app/clients/new/quick");
  await own.getByLabel("Trade name").fill(`Gamma Foods ${run}`);
  await own.getByRole("button", { name: "Submit for approval" }).click();
  await expect(own.getByText("Enter the contact person's name").first()).toBeVisible();
  // A file the ERP does not keep is refused at once, with a clear message.
  await own.getByLabel(/^Documents/).setInputFiles({ name: "photo.heic", mimeType: "image/heic", buffer: Buffer.from("not a pdf") });
  await expect(own.getByText(/“photo\.heic” cannot be uploaded/)).toBeVisible();
  await own.getByLabel("Contact person").fill("Gopal Gamma");
  await own.getByLabel(/^Documents/).setInputFiles(pdf("gst-certificate.pdf"));
  await own.getByRole("button", { name: "Submit for approval" }).click();
  await own.waitForURL(/\/app\/clients\/[0-9a-f-]{36}\?registered=1/);
  await own.getByRole("link", { name: "Documents" }).click();
  await expect(own.getByText(/gst-certificate\.pdf/)).toBeVisible();

  // Full registration carries the Client Master columns.
  await own.goto("/app/clients/new");
  await expect(own.getByLabel("State", { exact: true })).toBeVisible();
  await expect(own.getByLabel("IT file no.", { exact: true })).toBeVisible();
  await expect(own.getByLabel("Date of birth / incorporation")).toBeVisible();
  await expect(own.getByLabel("GST user ID")).toBeAttached();
  await expect(own.getByLabel("TRACES password")).toBeAttached();

  // Edit a service already chosen for a client.
  await own.goto(`/app/clients/${clientIds.alpha}?tab=services`);
  await own.getByLabel("Service").selectOption({ label: `GST Returns ${run}` });
  await own.getByRole("button", { name: "Add service" }).click();
  await expect(own.getByText("Service added.")).toBeVisible();
  await own.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(own.getByRole("heading", { name: `Edit service · GST Returns ${run}` })).toBeVisible();
  const editCard = own.locator("#edit-service");
  await editCard.getByLabel("Service").selectOption({ label: `Audit ${run}` });
  await editCard.getByLabel("Agreed fee (₹)").fill("15000");
  await editCard.getByRole("button", { name: "Save changes" }).click();
  await expect(own.getByText("Service updated.")).toBeVisible();
  await own.goto(`/app/clients/${clientIds.alpha}?tab=services`);
  await expect(own.getByRole("cell", { name: /Audit/ }).first()).toBeVisible();
  await expect(own.getByText("₹ 15,000")).toBeVisible();
  await own.context().close();
});

test("owner uploads the holiday list; it replaces the list from the chosen date; staff see it", async ({ browser }) => {
  const own = await as(browser, owner);
  await own.goto("/app/settings?tab=policy");
  // An old holiday before the new list's date stays; one after it is replaced.
  await own.getByRole("textbox", { name: "Date", exact: true }).fill("2026-03-10");
  await own.getByRole("textbox", { name: "Holiday", exact: true }).fill("Old list day");
  await own.getByRole("button", { name: "Add", exact: true }).click();
  await expect(own.getByText("Old list day added.")).toBeVisible();
  // The form clears itself after saving; wait for that before typing the next one.
  await expect(own.getByRole("textbox", { name: "Holiday", exact: true })).toHaveValue("");
  await own.waitForLoadState("networkidle");
  await own.getByRole("textbox", { name: "Date", exact: true }).fill("2026-12-01");
  await own.getByRole("textbox", { name: "Holiday", exact: true }).fill("Old December day");
  await own.getByRole("button", { name: "Add", exact: true }).click();
  await expect(own.getByText("Old December day added.")).toBeVisible();

  const fileInput = own.getByLabel("Holiday list (Excel or CSV)");
  if (!(await fileInput.isVisible())) await own.getByText("Upload the holiday list").click();
  await fileInput.setInputFiles({ name: "List_of_Holiday_2026-27.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: readFileSync("tests/fixtures/List_of_Holiday_2026-27.xlsx") });
  await own.getByLabel("New list applies from").fill("2026-06-01");
  accept(own);
  await own.getByRole("button", { name: "Upload holiday list" }).click();
  await expect(own.getByText(/Holiday list updated from 01 Jun 2026: 17 holidays \(replacing 1 from the old list\)\. 3 earlier dates were left as before\. 3 falling on a Sunday were not added/)).toBeVisible();
  await own.reload();
  await expect(own.getByText("Old list day")).toBeVisible();
  await expect(own.getByText("Old December day")).toHaveCount(0);
  await expect(own.getByText("Govardhan Puja").first()).toBeVisible();
  await own.context().close();

  const asha = await as(browser, mail("asha"));
  await asha.goto("/app/rules");
  await expect(asha.getByRole("heading", { name: /Office holidays 2026/ })).toBeVisible();
  await expect(asha.getByText("Bhai Duj")).toBeVisible();
  await asha.context().close();
});
