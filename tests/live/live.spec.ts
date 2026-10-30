import { expect, test, type Browser, type Page } from "@playwright/test";

const ORIGIN = "https://officeerp.analytx4t.com";
// LIVE_RUN reuses firm A of an earlier run (skipping its setup steps); LIVE_CLIENT_URL is that run's client page.
const reuse = process.env.LIVE_RUN;
const run = reuse ?? Date.now().toString(36);
const firmA = { name: `E2E Live Firm A ${run}`, email: `live-a-${run}@e2e.invalid`, password: "LiveA-Pass-12345" };
const firmB = { name: `E2E Live Firm B ${run}`, email: `live-b-${run}@e2e.invalid`, password: "LiveB-Pass-12345" };
const client = { name: `E2E Live Client ${run}`, email: `live-client-${run}@e2e.invalid`, password: "LiveC-Pass-12345" };
const staffEmail = `live-staff-${run}@e2e.invalid`;

test.describe.configure({ mode: "serial" });

/** Collects page errors, failed responses (5xx) and any request to localhost. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });
  page.on("request", (r) => { if (/localhost|127\.0\.0\.1/.test(r.url())) problems.push(`localhost request: ${r.url()}`); });
  page.on("framenavigated", (f) => { if (f === page.mainFrame() && !f.url().startsWith(ORIGIN) && f.url() !== "about:blank") problems.push(`left the site: ${f.url()}`); });
  return problems;
}

async function newPage(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  return { page, problems: watch(page) };
}

async function signIn(page: Page, id: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Login ID or email").fill(id);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function registerFirm(page: Page, f: typeof firmA) {
  await page.goto("/register");
  await page.getByRole("link", { name: /Register your firm/ }).click();
  await page.waitForURL(/\/register\/firm$/);
  await page.getByLabel("Your full name").fill(`Owner ${f.name}`);
  await page.getByLabel("Email").fill(f.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(f.password);
  // Eye toggle on the password field.
  await page.getByRole("button", { name: "Show password" }).first().click();
  await expect(page.getByRole("textbox", { name: "Password", exact: true })).toHaveAttribute("type", "text");
  await page.getByLabel("Confirm password").fill(f.password);
  await page.getByLabel("Trade name").fill(f.name);
  await page.getByLabel("Constitution").selectOption({ label: "Partnership Firm" });
  await page.getByRole("textbox", { name: "Full name", exact: true }).first().fill("Partner One");
  await page.getByRole("button", { name: "Add partner" }).click();
  await page.getByRole("textbox", { name: "Full name", exact: true }).nth(1).fill("Partner Two");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app\/admin/);
}

const linkIn = async (page: Page) => {
  const msg = page.getByText(/reset-password\?token=/);
  await expect(msg).toBeVisible();
  return /(https?:\/\/\S+reset-password\?token=[A-Za-z0-9_-]+)/.exec((await msg.textContent()) ?? "")![1];
};

let clientUrl = process.env.LIVE_CLIENT_URL ?? "";

test("firm A registers with its partners and lands on its admin portal", async ({ browser }) => {
  test.skip(!!reuse, "already checked in the reused run");
  const { page, problems } = await newPage(browser);
  await registerFirm(page, firmA);
  await expect(page.getByText("Firm owner dashboard")).toBeVisible();
  await page.goto("/app/settings");
  await expect(page.getByText("Partner One · Partner")).toBeVisible();
  await expect(page.getByText("Partner Two · Partner")).toBeVisible();
  // Sidebar scrollbar class is applied.
  await expect(page.locator(".app-sidebar-scroll").first()).toBeAttached();
  expect(problems).toEqual([]);
});

test("firm A invites staff (email logged, not sent to .invalid) and registers a client with the wizard", async ({ browser }) => {
  test.skip(!!reuse, "already checked in the reused run");
  const { page, problems } = await newPage(browser);
  await signIn(page, firmA.email, firmA.password);
  await expect(page).toHaveURL(/\/app\/admin$/);

  await page.goto("/app/employees/new");
  await page.getByLabel("Full name").fill("Live Staff");
  await page.getByLabel("Email").fill(staffEmail);
  await page.getByLabel("Mobile").fill("9811100011");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Invitation created\./).first()).toBeVisible();

  await page.goto("/app/clients");
  await page.getByRole("link", { name: "Register a client" }).first().click();
  await page.waitForURL(/\/app\/clients\/new$/);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter the trade name")).toBeVisible();
  await page.getByLabel("Trade name").fill(client.name);
  await page.getByLabel("PAN", { exact: true }).fill("BADPAN");
  await page.getByLabel("Contact person").fill("Ms Live");
  await page.getByLabel("Contact mobile").fill("9822233355");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter a valid PAN, e.g. ABCDE1234F")).toBeVisible();
  await page.getByLabel("PAN", { exact: true }).fill("AAKFL1234C");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: "Proprietorship", exact: true }).check();
  await page.getByRole("textbox", { name: "Full name", exact: true }).first().fill("Live Proprietor");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // GST
  await expect(page.getByLabel(/Purchase order/)).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click(); // compliance
  await page.getByLabel(/Select all services/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Live Proprietor (Proprietor)")).toBeVisible();
  await page.getByRole("button", { name: "Register client" }).click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]+\?registered=1/);
  clientUrl = page.url().split("?")[0];

  // Portal invite: the one-time link must be on the live domain, never localhost.
  await page.goto(`${clientUrl}?tab=portal`);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Ms Live");
  await page.getByLabel("Email (used to sign in)").fill(client.email);
  await page.getByRole("button", { name: "Create login & setup link" }).click();
  const url = await linkIn(page);
  expect(url.startsWith(`${ORIGIN}/reset-password?token=`)).toBe(true);

  const c = await newPage(browser);
  await c.page.goto(url);
  await c.page.getByRole("textbox", { name: "New password", exact: true }).fill(client.password);
  await c.page.getByRole("textbox", { name: "Confirm new password" }).fill(client.password);
  await c.page.getByRole("button", { name: "Save password" }).click();
  await c.page.waitForURL(/\/login\?reset=1/);
  await signIn(c.page, client.email, client.password);
  await expect(c.page).toHaveURL(/\/client$/);
  await expect(c.page.getByText(`Your team at ${firmA.name}`).or(c.page.getByText(`Work being done by ${firmA.name}`)).first()).toBeVisible();
  await c.page.goto("/app/admin");
  await expect(c.page).toHaveURL(/\/client$/); // a client never reaches staff pages
  expect([...problems, ...c.problems]).toEqual([]);
});

test("task start defaults to now; a start in the past is refused", async ({ browser }) => {
  test.skip(!!reuse, "already checked in the reused run");
  const { page, problems } = await newPage(browser);
  await signIn(page, firmA.email, firmA.password);
  await page.goto("/app/tasks/new");
  const start = page.getByLabel("Start");
  const value = await start.inputValue();
  const now = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16);
  expect(Math.abs(new Date(`${value}:00Z`).getTime() - new Date(`${now}:00Z`).getTime())).toBeLessThanOrEqual(2 * 60_000);
  await start.fill("2020-01-01T10:00");
  await expect(page.getByText(/The start cannot be earlier than now/)).toBeVisible();
  expect(problems).toEqual([]);
});

test("admin timesheet shows Tracker, Pending and Dashboard", async ({ browser }) => {
  const { page, problems } = await newPage(browser);
  await signIn(page, firmA.email, firmA.password);
  await page.goto("/app/timesheet");
  const sections = page.getByRole("navigation", { name: "Sections" });
  for (const name of ["Tracker", "Pending", "Dashboard"]) await expect(sections.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(sections.getByRole("link", { name: /Communication/ })).toHaveCount(0);
  await expect(page.getByText("No entries for this period")).toBeVisible();
  await page.goto("/app/timesheet?tab=pending");
  await expect(page.getByRole("heading", { name: "Pending by team member" })).toBeVisible();
  await page.goto("/app/timesheet?tab=dashboard");
  await expect(page.getByRole("heading", { name: "Team member scorecard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hours by client" })).toBeVisible();
  await page.goto("/app/timesheet?tab=collective"); // old links open the tracker
  await expect(sections.getByRole("link", { name: "Tracker", exact: true })).toHaveAttribute("aria-current", "page");
  expect(problems).toEqual([]);
});

test("home page shows the new headline and Sunil Dimri's number", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Simplify daily operations, empower your team, and keep everything organized with one integrated ERP solution\./);
  await expect(page.locator('a[href="tel:+919312254545"]').filter({ visible: true }).first()).toBeVisible(); // the header's copy sits in the closed mobile menu
  await expect(page.locator('a[href*="47094120"]')).toHaveCount(0);
  await expect(page.getByText("+91 93122 54545").filter({ visible: true }).first()).toBeVisible();
});

test("notification link stays on the live site", async ({ browser }) => {
  test.skip(!!process.env.LIVE_FIRM_B_EXISTS, "already checked");
  // The client asks for a password reset; the owner is notified and opens it.
  const c = await newPage(browser);
  await c.page.goto("/forgot-password");
  await c.page.getByLabel("Login ID or email").fill(client.email);
  await c.page.getByRole("button", { name: "Request reset link" }).click();
  await expect(c.page.getByText("Request received.").first()).toBeVisible();
  const { page, problems } = await newPage(browser);
  await signIn(page, firmA.email, firmA.password);
  await page.goto("/app/notifications");
  const link = page.getByRole("link", { name: /Password reset requested/ }).first();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]+\?tab=portal/);
  problems.push(...c.problems);
  expect(page.url().startsWith(ORIGIN)).toBe(true);
  expect(problems).toEqual([]);
});

test("firm B registers separately and sees none of firm A's clients, staff or people", async ({ browser }) => {
  const { page, problems } = await newPage(browser);
  if (process.env.LIVE_FIRM_B_EXISTS) await signIn(page, firmB.email, firmB.password);
  else await registerFirm(page, firmB);
  await page.goto("/app/clients?status=all");
  await expect(page.getByText(client.name)).toHaveCount(0);
  await page.goto("/app/employees");
  await expect(page.getByText(staffEmail)).toHaveCount(0);
  await page.goto(`/app/search?q=${encodeURIComponent("E2E Live")}`);
  await expect(page.getByText(client.name)).toHaveCount(0);
  // Opening firm A's client directly is not found for firm B.
  await page.goto(clientUrl);
  await expect(page.getByRole("heading", { name: /Page not found/ })).toBeVisible();
  await expect(page.getByText(client.name)).toHaveCount(0);
  await page.goto("/app/settings");
  await expect(page.getByText(firmA.name)).toHaveCount(0);
  expect(problems.filter((p) => !p.includes(clientUrl))).toEqual([]);
});

test("signed-out visitors are sent to the live sign-in page; public sign-up is firm-only", async ({ page }) => {
  for (const p of ["/app/admin", "/client"]) {
    await page.goto(p);
    await expect(page).toHaveURL(new RegExp(`^${ORIGIN}/login\\?next=`));
  }
  await page.goto("/register/business");
  await expect(page).toHaveURL(`${ORIGIN}/register`);
  // No sideways scrolling at phone width.
  await page.setViewportSize({ width: 360, height: 800 });
  for (const p of ["/", "/services", "/register", "/register/firm", "/login"]) {
    await page.goto(p);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${p}`).toBeLessThanOrEqual(0);
  }
});
