import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { addForgottenMarkOut, days, disconnect, expireInvitation, makeRemindersDue, raiseLicenceLimit, relaxAttendanceCutoff, setAccountAge } from "./db";
import { buildXlsx, readFirstSheet } from "../../src/lib/xlsx";

// Full walk-through against the real app and database. Creates an organization
// whose owner email ends in @e2e.invalid; every other login created here also
// uses @e2e.invalid. `npm run test:e2e:cleanup` removes only those records.
// Requires an empty database (no other firm) so public client registration is
// routed to the test firm.
test.describe.configure({ mode: "serial" });
test.afterAll(disconnect);

// E2E_RUN re-targets the data of an earlier run (e.g. to repeat only the last tests with --grep).
const run = process.env.E2E_RUN ?? Date.now().toString(36);
const owner = { email: `owner-${run}@e2e.invalid`, password: "Owner-Pass-12345" };
const secondOwner = { email: `owner2-${run}@e2e.invalid`, password: "Owner2-Pass-12345" };
const staff = { email: `staff-${run}@e2e.invalid`, temp: "", password: "Staff-Pass-12345" };
const senior = { email: `senior-${run}@e2e.invalid`, temp: "", password: "Senior-Pass-12345" };
const ravi = { email: `ravi-${run}@e2e.invalid`, temp: "", password: "Ravi-Pass-12345" };
// Must match CRON_SECRET given to the test server (playwright.config.ts).
const CRON_SECRET = process.env.E2E_CRON_SECRET ?? "e2e-cron-secret-0123456789abcdef";

// Emails to *.invalid addresses are captured by the test server (MAIL_CAPTURE_DIR).
async function mailTo(email: string, template: string, newerThan = 0) {
  const file = path.join("test-results", "mail", `${email.toLowerCase()}--${template}.json`);
  await expect.poll(() => existsSync(file) && statSync(file).mtimeMs > newerThan, { timeout: 20_000, message: `email ${template} to ${email}` }).toBe(true);
  return { ...(JSON.parse(readFileSync(file, "utf8")) as { to: string; subject: string; text: string }), mtime: statSync(file).mtimeMs };
}
const tempPasswordIn = (text: string) => /Temporary password: (\S+)/.exec(text)![1];
const clientName = `E2E Traders ${run}`;
const portalClient = { name: `E2E Portal Co ${run}`, email: `client-${run}@e2e.invalid`, password: "Client-Pass-12345", newPassword: "Client-Pass-67890" };
const wizardClient = { name: `E2E Wizard LLP ${run}`, email: `wizard-${run}@e2e.invalid`, password: "Wizard-Pass-12345" };

async function signIn(page: Page, id: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Login ID or email").fill(id);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/app"); // "/app" redirects on by role
}

/** Search-as-you-type picker: type part of the name, then choose the match. */
async function pick(scope: Page | Locator, label: string, name: string, typed = name) {
  const box = scope.getByRole("combobox", { name: label, exact: true }).last();
  await box.click();
  await box.fill(typed);
  await box.page().getByRole("listbox").getByRole("option", { name }).first().click({ timeout: 20_000 });
}

/** One Team Daily Work Log row: the workbook's mandatory columns, and whatever else is given. */
/** Office rule 2: mark in with the work location; the browser's location is granted by the config. */
async function markIn(page: Page) {
  await page.getByRole("radio", { name: "Office", exact: true }).check();
  await page.getByRole("button", { name: "Mark in" }).click();
}

async function logWork(page: Page, o: { client?: string; ref?: string; type: string; bank?: string; hours?: string; minutes?: string; details?: string; txns?: string; clientPending?: string; teamPending?: string; status?: string }) {
  if (o.ref) await page.getByLabel("Tracker Ref No.").selectOption({ label: o.ref });
  else await pick(page, "Client", o.client!);
  await page.getByLabel("Type of work").selectOption({ label: o.type });
  if (o.bank) await page.getByLabel("Bank name", { exact: true }).fill(o.bank);
  if (!o.ref) {
    await page.getByLabel("Period from").fill("2026-10-01");
    await page.getByLabel("Period to").fill("2026-10-31");
  }
  if (o.txns) await page.getByLabel("No. of transactions / entries").fill(o.txns);
  if (o.hours) await page.getByLabel("Or hours").fill(o.hours);
  if (o.minutes) await page.getByLabel("Minutes").fill(o.minutes);
  if (o.status) await page.getByLabel("Status of work").selectOption({ label: o.status });
  if (o.details) await page.getByLabel("Elaboration / details of work done").fill(o.details);
  if (o.clientPending) {
    await page.getByLabel("Pending item – client").fill(o.clientPending);
    await page.getByLabel("Raised on – client").fill("2026-11-01");
    await page.getByLabel("Due by – client").fill("2026-11-03");
  }
  if (o.teamPending) await page.getByLabel("Pending item – team").fill(o.teamPending);
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByText("Entry added.")).toBeVisible();
}

async function signOut(page: Page) {
  await page.goto("about:blank"); // leave first: an open app page would notice the sign-out and redirect itself
  await page.context().clearCookies();
}

async function setPasswordFromLink(page: Page, url: string, password: string) {
  await page.goto(url);
  await page.getByRole("textbox", { name: "New password", exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Confirm new password" }).fill(password);
  await page.getByRole("button", { name: "Save password" }).click();
  await page.waitForURL(/\/login\?reset=1/);
}

// Minimal real files (type is checked from content on the server).
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") });
const png = (name: string) => ({
  name, mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
});

const linkIn = async (page: Page) => {
  const msg = page.getByText(/reset-password\?token=/);
  await expect(msg).toBeVisible();
  return /(https?:\/\/\S+reset-password\?token=[A-Za-z0-9_-]+)/.exec((await msg.textContent()) ?? "")![1];
};

test("public pages render verified firm content without horizontal overflow", async ({ page }) => {
  for (const path of ["/", "/services", "/pricing", "/help", "/login", "/register", "/forgot-password"]) {
    await page.goto(path);
    await expect(page.locator("footer")).toContainText("Naraina Industrial Area");
  }
  await page.goto("/services");
  await expect(page.getByRole("link", { name: "GST Return Filing" })).toBeVisible();
  await expect(page.getByText("ROC / MCA Compliance")).toHaveCount(0); // "suggested" services are not advertised
  await page.getByRole("link", { name: "GST Return Filing" }).click();
  await expect(page.getByRole("heading", { name: "GST Return Filing" })).toBeVisible();
  await page.goto("/help");
  await page.getByLabel("Search help").fill("GSTIN");
  await expect(page.getByText("Can I add more than one GSTIN?")).toBeVisible();
  await expect(page.getByText("How do I mark attendance?")).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of ["/", "/services", "/pricing", "/help", "/register"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});

test("unauthenticated users cannot reach the app or the client portal", async ({ page }) => {
  await page.goto("/app/clients");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fclients/);
  await page.goto("/client");
  await expect(page).toHaveURL(/\/login\?next=%2Fclient/);
});

/** Firm registration: login, business details and the constitution's person (a proprietor). */
async function registerFirm(page: Page, o: { email: string; password: string }, tradeName: string) {
  await page.goto("/register/firm");
  await page.getByLabel("Your full name").fill("E2E Owner");
  await page.getByLabel("Email").fill(o.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(o.password);
  await page.getByLabel("Confirm password").fill(o.password);
  await page.getByLabel("Trade name").fill(tradeName);
  await page.getByLabel("Constitution").selectOption({ label: "Proprietorship" });
  await page.getByRole("textbox", { name: "Full name", exact: true }).fill("E2E Owner");
}

test("owner registers the firm with its proprietor and lands on the admin dashboard; registration stays open", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("link", { name: /Register your firm/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Register your business/ })).toHaveCount(0);
  await page.goto("/register/firm");
  await page.getByLabel("Your full name").fill("E2E Owner");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(owner.password);
  await page.getByLabel("Confirm password").fill(owner.password);
  await page.getByLabel("Trade name").fill(`E2E Firm ${run}`);
  await page.getByLabel("PAN").first().fill("AGBPD7743C");
  await page.getByLabel("Constitution").selectOption({ label: "Proprietorship" });
  // The proprietor's details are checked as soon as a field is left.
  await page.getByLabel("Aadhaar").fill("1234");
  await page.getByLabel("Aadhaar").blur();
  await expect(page.getByText("Enter a valid 12-digit Aadhaar number")).toBeVisible();
  await page.getByLabel("Aadhaar").fill("");
  await page.getByRole("textbox", { name: "Full name", exact: true }).fill("E2E Owner");
  await page.getByLabel("Number of employees").fill("5");
  await page.getByLabel(/Firm certificate/).setInputFiles(pdf("gst-certificate.pdf"));
  await page.getByLabel("Certificate name").fill("GST registration certificate");
  await page.getByLabel("Firm logo").setInputFiles(png("logo.png"));
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app\/admin/);
  await expect(page.getByText("Firm owner dashboard")).toBeVisible();
  // Charts for the owner (empty firm: charts show their empty states, not errors).
  await expect(page.getByRole("heading", { name: "Your firm at a glance" })).toBeVisible();
  for (const title of ["Hours recorded per day", "Tasks created vs completed", "Clients by status", "Attendance", "Pending items by age"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  // The uploaded certificate is stored privately and listed in Settings.
  await page.goto("/app/settings");
  await expect(page.getByRole("link", { name: "GST registration certificate" })).toBeVisible();
  await expect(page.getByText("E2E Owner · Proprietor")).toBeVisible();
  await signOut(page);
  // Many firms: registration stays open for the next firm.
  await page.goto("/register/firm");
  await expect(page.getByRole("heading", { name: /Register the firm/ })).toBeVisible();
  await page.goto("/register/business");
  await expect(page).toHaveURL(/\/register$/); // clients do not register themselves
});

test("admin invites staff with name, email, mobile and role; each gets an email with a temporary password", async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/employees/new");
  // Validation: nothing is created from bad input, and typed values stay.
  await page.getByLabel("Full name").fill("Sonu Kumar");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Mobile").fill("12345");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Enter a valid email")).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Sonu Kumar");

  for (const [who, name, role] of [[staff, "Sonu Kumar", "Team member"], [senior, "Kamal Rawat", "Senior"], [ravi, "Ravi Negi", "Team member"]] as const) {
    await page.goto("/app/employees/new");
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Mobile").fill("9876543210");
    await page.getByLabel("Role").selectOption({ label: role });
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText(`Invitation created. No email sent to ${who.email} (test address).`)).toBeVisible();
    const m = await mailTo(who.email, "staff.invitation");
    expect(m.text).toContain(`Email: ${who.email}`);
    expect(m.text).toMatch(/\/login/);
    who.temp = tempPasswordIn(m.text);
  }
  // The same email cannot be invited twice.
  await page.goto("/app/employees/new");
  await page.getByLabel("Full name").fill("Someone Else");
  await page.getByLabel("Email").fill(staff.email);
  await page.getByLabel("Mobile").fill("9876543210");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("An account with this email already exists.")).toBeVisible();

  await page.goto("/app/employees?status=invited");
  await expect(page.getByRole("link", { name: /^Invited\s*3$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Staff by stage" })).toBeVisible();
  await expect(page.getByText("Password not set yet")).toHaveCount(3);
});

test("first sign-in forces a new password: nothing else opens, and closing and coming back still lands there", async ({ page }) => {
  await signIn(page, staff.email, staff.temp);
  await expect(page).toHaveURL(/\/account\/set-password/);
  for (const path of ["/app/tasks", "/app/onboarding", "/app/workspace", "/app/profile"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/account\/set-password/);
  }
  // Close the app and come back with the temporary password: same screen.
  await signOut(page);
  await signIn(page, staff.email, staff.temp);
  await expect(page).toHaveURL(/\/account\/set-password/);
  await page.getByRole("textbox", { name: "New password", exact: true }).fill(staff.password);
  await page.getByRole("textbox", { name: "Confirm new password" }).fill("something-else-12345");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("Passwords do not match")).toBeVisible();
  await page.getByRole("textbox", { name: "Confirm new password" }).fill(staff.password);
  await page.getByRole("button", { name: "Save password" }).click();
  await page.waitForURL(/\/app\/onboarding/);
  await expect(page.getByRole("heading", { name: "Complete your details" })).toBeVisible();

  // The temporary password no longer works; the new one does.
  await signOut(page);
  await page.goto("/login");
  await page.getByLabel("Login ID or email").fill(staff.email);
  await page.locator("#password").fill(staff.temp);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect login ID/email or password.")).toBeVisible();
  await signIn(page, staff.email, staff.password);
  await expect(page).toHaveURL(/\/app\/onboarding/);
});

test("until approved, staff see only their details form, then 'under review' on every sign-in", async ({ page }) => {
  await signIn(page, staff.email, staff.password);
  for (const path of ["/app/tasks", "/app/timesheet", "/app/attendance", "/app/notifications", "/app/workspace"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/app\/onboarding/);
  }
  await expect(page.getByRole("link", { name: "Timesheet" })).toHaveCount(0);
  // Required details are enforced on submit.
  await page.getByLabel(/submit for approval/).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Fill in your PAN, Aadhaar, current address before submitting/)).toBeVisible();
  await page.getByLabel("PAN", { exact: true }).fill("FFNPS3234F");
  await page.getByLabel("Aadhaar number").fill("234567890123");
  await page.getByLabel("Account number").fill("3929002100004552");
  await page.getByLabel("IFSC").fill("PUNB0062700");
  await page.getByLabel("Current address").fill("B-139, Aali Vihar, New Delhi");
  await page.getByLabel("Document 1: type").selectOption({ label: "10th marksheet" });
  await page.getByLabel("Document 1: file").setInputFiles(pdf("class-10.pdf"));
  await page.getByLabel(/submit for approval/).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your details are under review" })).toBeVisible();
  // Every later sign-in, and every page, shows the review status only.
  await signOut(page);
  await signIn(page, staff.email, staff.password);
  await expect(page.getByRole("heading", { name: "Your details are under review" })).toBeVisible();
  await page.goto("/app/timesheet");
  await expect(page.getByRole("heading", { name: "Your details are under review" })).toBeVisible();
  await signOut(page);

  // The senior goes through the same steps.
  await signIn(page, senior.email, senior.temp);
  await page.getByRole("textbox", { name: "New password", exact: true }).fill(senior.password);
  await page.getByRole("textbox", { name: "Confirm new password" }).fill(senior.password);
  await page.getByRole("button", { name: "Save password" }).click();
  await page.waitForURL(/\/app\/onboarding/);
  await page.getByLabel("PAN", { exact: true }).fill("AKRPR4455K");
  await page.getByLabel("Aadhaar number").fill("345678901234");
  await page.getByLabel("Current address").fill("Naraina Vihar, New Delhi");
  await page.getByLabel(/submit for approval/).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your details are under review" })).toBeVisible();
  await signOut(page);
});

test("an expired temporary password is refused; the admin resends and only the new one works", async ({ browser }) => {
  await expireInvitation(ravi.email);
  const p = await (await browser.newContext()).newPage();
  await signIn(p, ravi.email, ravi.temp);
  await expect(p.getByRole("heading", { name: "Your temporary password has expired" })).toBeVisible();
  await expect(p.getByRole("textbox", { name: "New password", exact: true })).toHaveCount(0);
  await p.context().clearCookies();

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, owner.email, owner.password);
  await admin.goto("/app/employees?status=invited");
  await admin.getByRole("link", { name: "Ravi Negi" }).click();
  await expect(admin.getByText(/Temporary password not used yet · expired/)).toBeVisible();
  await expect(admin.getByRole("button", { name: "Approve" })).toHaveCount(0); // nothing to review yet
  const before = (await mailTo(ravi.email, "staff.invitation")).mtime;
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Resend invitation" }).click();
  await expect(admin.getByText("New temporary password created (test address: not emailed).")).toBeVisible();
  const fresh = tempPasswordIn((await mailTo(ravi.email, "staff.invitation", before)).text);
  expect(fresh).not.toBe(ravi.temp);

  await p.goto("/login");
  await p.getByLabel("Login ID or email").fill(ravi.email);
  await p.locator("#password").fill(ravi.temp);
  await p.getByRole("button", { name: "Sign in" }).click();
  await expect(p.getByText("Incorrect login ID/email or password.")).toBeVisible();
  await signIn(p, ravi.email, fresh);
  await expect(p.getByRole("heading", { name: "Set your password" })).toBeVisible();
});

test("admin reviews with filters: hold, reject, resubmit, approve; staff are emailed and their open page updates by itself", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, owner.email, owner.password);
  await admin.goto("/app/employees?status=review");
  await expect(admin.getByRole("link", { name: /^Under review\s*2$/ })).toBeVisible();
  await expect(admin.getByRole("link", { name: "Sonu Kumar" })).toBeVisible();
  await expect(admin.getByRole("link", { name: "Kamal Rawat" })).toBeVisible();

  const staffPage = await (await browser.newContext()).newPage();
  await signIn(staffPage, staff.email, staff.password);
  await expect(staffPage.getByRole("heading", { name: "Your details are under review" })).toBeVisible();

  await admin.getByRole("link", { name: "Sonu Kumar" }).click();
  await admin.waitForURL(/\/app\/employees\/[0-9a-f-]{36}$/);
  const sonuUrl = admin.url();
  await expect(admin.getByText("XXXX XXXX 0123")).toBeVisible();
  await expect(admin.getByText(/10th marksheet \(class-10\.pdf\)/)).toBeVisible();

  // Hold → the staff member's open page shows it without a click.
  await admin.getByLabel("Note to the staff member").fill("Please wait for the HR check.");
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Hold" }).click();
  await expect(admin.getByText("Put on hold. No email sent (test address).")).toBeVisible();
  expect((await mailTo(staff.email, "staff.on_hold")).text).toContain("Please wait for the HR check.");
  await expect(staffPage.getByText(/Your details are on hold: Please wait for the HR check/)).toBeVisible({ timeout: 45_000 });

  // Reject (reason required) → the form opens again for corrections.
  await admin.goto(sonuUrl);
  await admin.getByLabel("Note to the staff member").fill("PAN copy unreadable — upload again.");
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Reject" }).click();
  await expect(admin.getByText("Rejected (reason: PAN copy unreadable — upload again). Waiting for the staff member to correct and resubmit.")).toBeVisible();
  await expect(admin.getByText(/Last email: Rejection · not sent \(test address\)/)).toBeVisible();
  expect((await mailTo(staff.email, "staff.rejected")).text).toContain("PAN copy unreadable");
  await expect(staffPage.getByText(/Corrections needed: PAN copy unreadable/)).toBeVisible({ timeout: 45_000 });
  await staffPage.getByLabel("PAN card").setInputFiles(pdf("pan.pdf"));
  await staffPage.getByLabel(/submit for approval/).check();
  await staffPage.getByRole("button", { name: "Save", exact: true }).click();
  await expect(staffPage.getByRole("heading", { name: "Your details are under review" })).toBeVisible();

  // Approve with a permanent ID; designation set by the admin.
  await admin.goto(sonuUrl);
  await admin.getByLabel("Permanent employee ID").fill(`E2E-${run}-1`);
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText(`Approved. Permanent ID E2E-${run}-1.`)).toBeVisible();
  await expect(admin.getByText(/Last email: Approval · not sent \(test address\)/)).toBeVisible();
  const approved = await mailTo(staff.email, "staff.approved");
  expect(approved.text).toContain(`Email: ${staff.email}`);
  expect(approved.text).toMatch(/\/login/);
  expect(approved.text).not.toContain("Temporary password");
  expect(approved.text).not.toContain(staff.password);
  await expect(staffPage.getByText(/Your account is approved/)).toBeVisible({ timeout: 45_000 });
  await staffPage.goto("/app/timesheet");
  await expect(staffPage).toHaveURL(/\/app\/timesheet/);

  const access = admin.locator("form", { has: admin.getByLabel("Designation") });
  await access.getByLabel("Designation").selectOption({ label: "Executive" });
  await access.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText("Saved.")).toBeVisible();

  await admin.goto("/app/employees?status=review");
  await admin.getByRole("link", { name: "Kamal Rawat" }).click();
  await admin.getByLabel("Permanent employee ID").fill(`E2E-${run}-2`);
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText(`Approved. Permanent ID E2E-${run}-2.`)).toBeVisible();
  const kamal = admin.locator("form", { has: admin.getByLabel("Designation") });
  await kamal.getByLabel("Designation").selectOption({ label: "Senior" });
  await kamal.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText("Saved.")).toBeVisible();

  await admin.goto("/app/employees?status=approved");
  await expect(admin.getByRole("link", { name: /^Approved\s*2$/ })).toBeVisible();
});

test("staff quick registration stays pending until an admin approves it; duplicate GSTIN rejected", async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/clients/new/quick");
  await page.getByLabel("Trade name").fill(clientName);
  await page.getByLabel("Constitution").selectOption({ label: "Partnership Firm" });
  await page.getByLabel("GSTIN(s)").fill("07AAACE1234F1Z5\n07AAACE1234F2Z4");
  await page.getByLabel("Point of contact").fill("Mr Gupta");
  await page.getByLabel("GST Return Filing").check();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]+\?registered=1/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Approve & activate" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();
  await page.getByRole("link", { name: "GSTIN, contacts & representatives" }).click();
  await expect(page.getByText("GSTINs (2)")).toBeVisible();
  await page.getByLabel("Add GSTIN").fill("07AAACE1234F1Z5");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/already registered/)).toBeVisible();
});

/** Admin creates the client's portal login from the client page; the client sets a password from the link. */
async function invitePortalLogin(admin: Page, clientUrl: string, browser: Browser, c: { email: string; password: string }, name: string) {
  await admin.goto(`${clientUrl}?tab=portal`);
  await admin.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await admin.getByLabel("Email (used to sign in)").fill(c.email);
  await admin.getByRole("button", { name: "Create login & setup link" }).click();
  const url = await linkIn(admin);
  const page = await (await browser.newContext()).newPage();
  await setPasswordFromLink(page, url, c.password);
  return page;
}

test("staff registers a client and invites it: portal usable while approval is pending; staff pages never", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, owner.email, owner.password);
  await admin.goto("/app/clients/new/quick");
  await admin.getByLabel("Trade name").fill(portalClient.name);
  await admin.getByLabel("Point of contact").fill("Ms Mehta");
  await admin.getByLabel("GST Return Filing").check();
  await admin.getByRole("button", { name: "Submit for approval" }).click();
  await admin.waitForURL(/\/app\/clients\/[0-9a-f-]+\?registered=1/);
  const page = await invitePortalLogin(admin, admin.url().split("?")[0], browser, portalClient, "Ms Mehta");
  await signIn(page, portalClient.email, portalClient.password);
  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByText(/Your registration is awaiting approval\. You can use the portal until/)).toBeVisible();
  await page.goto("/app/clients");
  await expect(page).toHaveURL(/\/client$/); // client logins never reach staff pages
});

test("full client registration by staff: checks on each step, constitution partners, GSTINs, select all, review", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/clients");
  await page.getByRole("link", { name: "Register a client" }).first().click();
  await page.waitForURL(/\/app\/clients\/new$/);
  // Step A: errors show on this step, before moving on
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter the trade name")).toBeVisible();
  await page.getByLabel("Trade name").fill(wizardClient.name);
  await page.getByLabel("PAN", { exact: true }).fill("BADPAN");
  await page.getByLabel("Contact person").fill("Mr Rao");
  await page.getByLabel("Contact mobile").fill("12345");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter a valid PAN, e.g. ABCDE1234F")).toBeVisible();
  await expect(page.getByText("Enter a valid 10-digit mobile number")).toBeVisible();
  await page.getByLabel("PAN", { exact: true }).fill("");
  await page.getByLabel("Contact mobile").fill("9822233344");
  await page.getByRole("button", { name: "Continue" }).click();
  // Step B: constitution and partners
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Select the constitution of the business")).toBeVisible();
  await page.getByRole("radio", { name: "LLP", exact: true }).check();
  await expect(page.locator("legend", { hasText: "Partner 1" })).toHaveClass(/sr-only/); // no visible per-person legend
  await page.getByRole("textbox", { name: "Full name", exact: true }).first().fill("Asha Rao");
  await page.getByLabel("Aadhaar").first().fill("1234");
  await page.getByRole("button", { name: "Add partner" }).click();
  await page.getByRole("textbox", { name: "Full name", exact: true }).nth(1).fill("Vikram Rao");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter a valid 12-digit Aadhaar number")).toBeVisible();
  await page.getByLabel("Aadhaar").first().fill("");
  await page.getByRole("button", { name: "Continue" }).click();
  // Step C: GSTINs
  await page.getByLabel("GSTIN", { exact: true }).fill("07ABCDE1234F1Z5");
  await page.getByRole("button", { name: "Add GSTIN" }).click();
  await page.getByLabel("GSTIN", { exact: true }).fill("07ABCDE1234F1Z5");
  await page.getByRole("button", { name: "Add GSTIN" }).click();
  await expect(page.getByText("This GSTIN is already in the list.")).toBeVisible();
  await page.getByLabel("GSTIN", { exact: true }).fill("NOTAGSTIN");
  await page.getByRole("button", { name: "Add GSTIN" }).click();
  await expect(page.getByText(/Enter a valid 15-character GSTIN/)).toBeVisible();
  await page.getByLabel("GSTIN", { exact: true }).fill("");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel(/Purchase order/)).toHaveCount(0); // purchase orders are not collected
  await page.getByRole("button", { name: "Continue" }).click(); // compliance & documents (optional)
  // Step E: select all services
  await page.getByLabel(/Select all services/).check();
  await expect(page.getByLabel(/GST Return Filing/)).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  // Step F: review
  await expect(page.getByText("Asha Rao (Partner), Vikram Rao (Partner)")).toBeVisible();
  await expect(page.locator("dl").getByText("07ABCDE1234F1Z5")).toBeVisible();
  await page.getByRole("button", { name: "Register client" }).click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]+\?registered=1/);
  const other = await invitePortalLogin(page, page.url().split("?")[0], browser, wizardClient, "Mr Rao");
  await other.close();
});

test("day 8: a business still awaiting approval cannot use any service and is told why", async ({ page }) => {
  await setAccountAge(wizardClient.email, days(8));
  await signIn(page, wizardClient.email, wizardClient.password);
  await expect(page).toHaveURL(/\/account\/pending/);
  await expect(page.getByRole("heading", { name: "Your access period has ended" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the client portal" })).toHaveCount(0);
  for (const path of ["/client", "/client/requests", "/client/work", "/client/documents", "/client/profile", "/client/notifications"]) {
    await page.goto(path);
    await expect(page, `day 8: ${path}`).toHaveURL(/\/account\/pending/);
  }
  const status = await (await page.request.get("/api/session/status")).json();
  expect(status.state).toBe("locked");
});

test("admin approval queue lists pending clients; approving opens the client portal", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, owner.email, owner.password);
  await admin.goto("/app/clients/approvals");
  await expect(admin.getByText(wizardClient.name)).toBeVisible();
  const card = admin.locator("li", { hasText: portalClient.name });
  await expect(card.getByText("Registered by staff")).toBeVisible();
  await expect(card.getByText(/Access until/)).toBeVisible();
  await expect(admin.locator("li", { hasText: wizardClient.name }).getByText(/Access paused since/)).toBeVisible();
  await card.getByRole("link", { name: "Review" }).click();
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Approve & activate" }).click();
  await expect(admin.getByText("Status updated.")).toBeVisible();

  const client = await (await browser.newContext()).newPage();
  await signIn(client, portalClient.email, portalClient.password);
  await expect(client).toHaveURL(/\/client$/);
  await expect(client.getByRole("heading", { name: portalClient.name })).toBeVisible();
  await expect(client.getByText("GST Return Filing")).toBeVisible();
  // Clients can never open staff pages.
  await client.goto("/app/clients");
  await expect(client).toHaveURL(/\/client$/);
});

test("staff request appears in the client portal; the client replies; staff sees the reply", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, owner.email, owner.password);
  await admin.goto("/app/pending?tab=communication");
  const form = admin.locator("form", { has: admin.getByRole("button", { name: "Add pending item" }) });
  await form.getByRole("combobox", { name: "Client", exact: true }).selectOption({ label: portalClient.name });
  await form.getByLabel("What we asked").fill("Bank statements for September");
  await expect(form.getByLabel(/Show this request in the client/)).toBeChecked();
  await form.getByRole("button", { name: "Add pending item" }).click();
  await expect(admin.getByText("Pending item added.")).toBeVisible();

  const client = await (await browser.newContext()).newPage();
  await signIn(client, portalClient.email, portalClient.password);
  await client.getByRole("link", { name: "Bank statements for September" }).first().click();
  await client.getByLabel("Your reply").fill("Uploaded to the shared folder; sending the PDF shortly.");
  await client.getByRole("button", { name: "Send" }).click();
  await expect(client.getByText("Reply sent to our team.")).toBeVisible();

  await admin.goto("/app/pending?tab=communication");
  await expect(admin.getByText("Client reply").first()).toBeVisible();
  await expect(admin.getByText(/Uploaded to the shared folder/)).toBeVisible();
});

test("allocation conflicts are not saved silently", async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/allocations");
  const form = page.locator("form", { has: page.getByRole("button", { name: "Allocate" }) });
  await pick(form, "Client", clientName);
  await pick(form, "Team member", "Sonu Kumar — Executive", "Sonu");
  await form.getByLabel("Role on this client").selectOption("JUNIOR");
  await form.getByRole("button", { name: "Allocate" }).click();
  await expect(page.getByText("Team member allocated.")).toBeVisible();
  await pick(form, "Client", clientName);
  await pick(form, "Team member", "Sonu Kumar — Executive", "Sonu");
  await form.getByRole("button", { name: "Allocate" }).click();
  await expect(page.getByText(/would book the team member for 7 h in the first half and 10 h in the second/)).toBeVisible();
  await page.getByRole("link", { name: "Sonu Kumar" }).first().click();
  await expect(page.getByRole("heading", { name: "Allocation history" })).toBeVisible();
});

test("task: maker/checker cycle with waiting state; team member cannot cancel or open admin pages", async ({ browser }) => {
  const ownerPage = await (await browser.newContext()).newPage();
  await signIn(ownerPage, owner.email, owner.password);
  await ownerPage.goto("/app/tasks/new");
  await ownerPage.getByRole("textbox", { name: "Task", exact: true }).fill(`GSTR-3B September ${run}`);
  await pick(ownerPage, "Client", clientName);
  await ownerPage.getByLabel("Priority").selectOption("HIGH");
  await pick(ownerPage, "Assign to (one or more)", "Sonu Kumar — Executive", "Sonu");
  await pick(ownerPage, "Checker", "Kamal Rawat — Senior", "Kamal");
  await ownerPage.getByLabel(/Share with the client/).check();
  await ownerPage.getByRole("button", { name: "Create task" }).click();
  await ownerPage.waitForURL(/\/app\/tasks\/[0-9a-f-]+$/);
  const taskUrl = ownerPage.url();

  const staffPage = await (await browser.newContext()).newPage();
  await signIn(staffPage, staff.email, staff.password);
  await expect(staffPage).toHaveURL(/\/app\/workspace/);
  await staffPage.goto(taskUrl);
  await expect(staffPage.getByRole("button", { name: "Cancel task" })).toHaveCount(0);
  await staffPage.getByRole("button", { name: "Start / resume work" }).click();
  await expect(staffPage.getByText("Task updated.")).toBeVisible();
  await staffPage.getByLabel("Add a remark").fill("Internal: reconciling ITC first.");
  await staffPage.getByRole("button", { name: "Post" }).click();
  await expect(staffPage.getByText("Internal: reconciling ITC first.")).toBeVisible();
  await staffPage.getByRole("button", { name: "Waiting for client" }).click();
  await expect(staffPage.getByText("Task updated.")).toBeVisible();
  await staffPage.getByRole("button", { name: "Start / resume work" }).click();
  await staffPage.getByRole("button", { name: "Submit for review" }).click();
  await expect(staffPage.getByText("Task updated.")).toBeVisible();
  await staffPage.goto("/app/employees");
  await expect(staffPage).toHaveURL(/\/app\/no-access/);
  await staffPage.goto("/app/reports/clients");
  await expect(staffPage).toHaveURL(/\/app\/no-access/);

  const seniorPage = await (await browser.newContext()).newPage();
  await signIn(seniorPage, senior.email, senior.password);
  await expect(seniorPage).toHaveURL(/\/app\/senior/);
  await seniorPage.goto(taskUrl);
  await seniorPage.getByRole("button", { name: "Approve (checker)" }).click();
  await expect(seniorPage.getByText("Task updated.")).toBeVisible();
});

test("team member: attendance with location, timesheet, pending item and day report", async ({ page }) => {
  // The ERP marks people absent at 12:00 (office rule 3); move the test firm's cut-off so the suite runs at any hour.
  await relaxAttendanceCutoff(owner.email);
  await signIn(page, staff.email, staff.password);
  await page.goto("/app/attendance");
  await markIn(page);
  await expect(page.getByText(/Marked in/)).toBeVisible();

  await page.goto("/app/timesheet");
  // Staff see the Team Daily Work Log's three sheets, not the tracker.
  const sections = page.getByRole("navigation", { name: "Sections" });
  for (const name of ["Plan & EOD report", "Daily Log", "Day Report", "Pending Tracker"]) await expect(sections.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(sections.getByRole("link", { name: "Tracker", exact: true })).toHaveCount(0);
  await page.goto("/app/timesheet?tab=dashboard"); // a staff member asking for a team view gets their own plan & EOD
  await expect(page.getByRole("heading", { name: "Team workload" })).toHaveCount(0);
  await page.goto("/app/timesheet?tab=daily");
  // Bank work needs the bank name.
  await pick(page, "Client", clientName);
  await page.getByLabel("Type of work").selectOption({ label: "Bank Statement Posting" });
  await page.getByLabel("Period from").fill("2026-10-01");
  await page.getByLabel("Period to").fill("2026-10-31");
  await page.getByLabel("Or hours").fill("1");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByText("Bank Name is required for bank and card work.")).toBeVisible();
  await page.goto("/app/timesheet?tab=daily");
  await page.getByLabel("Place of work").selectOption("Client Office");
  await logWork(page, { client: clientName, type: "Bank Statement Posting", bank: "HDFC Bank", txns: "120", hours: "3", minutes: "30" });

  await page.goto("/app/pending?tab=daily");
  await page.getByRole("combobox", { name: "Client", exact: true }).last().selectOption({ label: clientName });
  await page.getByLabel("What we asked").fill("September purchase invoices");
  await page.getByRole("button", { name: "Add pending item" }).click();
  await expect(page.getByText("Pending item added.")).toBeVisible();

  await page.goto("/app/day-reports");
  await expect(page.getByLabel("Work completed")).toHaveValue(/Bank Statement Posting/);
  await page.getByLabel("Kamal Rawat — Senior").check();
  await page.getByRole("button", { name: "Send report" }).click();
  await page.waitForURL(/\/app\/day-reports\/[0-9a-f-]+$/);
  dayReportUrl = page.url();
});

let dayReportUrl = "";

test("senior returns a timesheet entry, the team member corrects it, and the senior reviews it with history", async ({ browser }) => {
  const seniorPage = await (await browser.newContext()).newPage();
  await signIn(seniorPage, senior.email, senior.password);
  // Leads get the three team views; the staff member's entry shows in each.
  await seniorPage.goto("/app/timesheet");
  const sections = seniorPage.getByRole("navigation", { name: "Sections" });
  for (const name of ["Tracker", "Dashboard", "Client Pending Report", "Team daily log", "Hours & reviews", "My daily log"]) await expect(sections.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(sections.getByRole("link", { name: /Communication/ })).toHaveCount(0);
  await seniorPage.goto("/app/timesheet?tab=pending");
  await expect(seniorPage.getByRole("heading", { name: /Waiting for review \([1-9]/ })).toBeVisible();
  await expect(seniorPage.getByText("Within window").first()).toBeVisible();
  await seniorPage.goto("/app/timesheet?tab=hours");
  await expect(seniorPage.getByRole("heading", { name: "Team member scorecard" })).toBeVisible();
  await expect(seniorPage.getByText("3h 30m").first()).toBeVisible();
  await seniorPage.goto("/app/timesheet?tab=log");
  await seniorPage.locator('tbody a[href^="/app/timesheet/0"]').first().click();
  await seniorPage.waitForURL(/\/app\/timesheet\/[0-9a-f-]+$/);
  const entryUrl = seniorPage.url();
  await seniorPage.getByRole("button", { name: "Checked – Needs correction" }).click();
  await expect(seniorPage.getByText("Explain what needs to be corrected.")).toBeVisible(); // a reason is required
  await seniorPage.getByLabel("Review remark").fill("Transaction count looks wrong — please recheck.");
  await seniorPage.getByRole("button", { name: "Checked – Needs correction" }).click();
  await expect(seniorPage.getByText("Returned to the employee for correction.")).toBeVisible();

  const staffPage = await (await browser.newContext()).newPage();
  await signIn(staffPage, staff.email, staff.password);
  await staffPage.goto("/app/notifications");
  await staffPage.getByRole("link", { name: "Your timesheet entry needs correction" }).first().click();
  await expect(staffPage).toHaveURL(entryUrl);
  await expect(staffPage.getByText(/Returned for correction: Transaction count looks wrong/)).toBeVisible();
  await staffPage.getByLabel("No. of transactions / entries").fill("112");
  await staffPage.getByRole("button", { name: "Save correction" }).click();
  await expect(staffPage.getByText(/Entry corrected/)).toBeVisible();
  await expect(staffPage.getByText("transactionCount: 120 → 112")).toBeVisible();

  await seniorPage.goto(entryUrl);
  await seniorPage.getByRole("button", { name: "Checked – OK" }).click();
  await expect(seniorPage.getByText("Marked as reviewed.")).toBeVisible();
  await seniorPage.reload();
  await expect(seniorPage.getByRole("button", { name: "Checked – OK" })).toHaveCount(0);

  // The day report recipient reviews it with a remark; the reporter sees the remark.
  await seniorPage.goto(dayReportUrl);
  await seniorPage.getByLabel("Review remark (optional)").fill("Good progress. Chase the invoices tomorrow.");
  await seniorPage.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(seniorPage.getByText(/^Review recorded/)).toBeVisible();
  await staffPage.goto(dayReportUrl);
  await expect(staffPage.getByText(/Chase the invoices tomorrow/)).toBeVisible();
  await expect(staffPage.getByRole("heading", { name: "Related work records" })).toBeVisible();
});

test("client report shows team-wise hours and pending items from source records", async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/reports/clients");
  await page.getByRole("link", { name: clientName }).click();
  await expect(page.getByText("3h 30m").first()).toBeVisible();
  await expect(page.getByText("September purchase invoices")).toBeVisible();
  await page.getByRole("link", { name: /dues \(13B\)/ }).click();
  await page.getByLabel("Description").fill("Retainer fee — October");
  await page.getByLabel("Amount (₹)").fill("15000");
  await page.getByRole("button", { name: "Record due" }).click();
  await expect(page.getByText("Due recorded.")).toBeVisible();
  exportUrl = new URL(await page.getByRole("link", { name: "Client-facing CSV" }).getAttribute("href") ?? "", page.url()).toString();
  const csv = await page.request.get(exportUrl);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body).toContain(clientName);
  expect(body).toContain("Retainer fee — October");
  expect(body).toContain("3h 30m");
  expect(body).not.toContain("Transaction count looks wrong"); // internal review remarks never leave
});

let exportUrl = "";

test("staff without report rights cannot open the client report or its export", async ({ page }) => {
  await signIn(page, staff.email, staff.password);
  expect((await page.request.get(exportUrl)).status()).toBe(404);
  await page.goto(exportUrl.replace(/\/export\?.*$/, ""));
  await expect(page).toHaveURL(/\/app\/no-access/);
});

test("forgot password never reveals accounts; admin-issued reset link works once", async ({ browser }) => {
  const client = await (await browser.newContext()).newPage();
  await client.goto("/forgot-password");
  await client.getByLabel("Login ID or email").fill("nobody-at-all@e2e.invalid");
  await client.getByRole("button", { name: "Request reset link" }).click();
  const generic = client.getByRole("heading", { name: "Request received." });
  await expect(generic).toBeVisible();
  await client.goto("/forgot-password");
  await client.getByLabel("Login ID or email").fill(portalClient.email);
  await client.getByRole("button", { name: "Request reset link" }).click();
  await expect(generic).toBeVisible(); // identical response for a real account

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, owner.email, owner.password);
  await admin.goto("/app/notifications");
  await admin.getByRole("link", { name: /Password reset requested/ }).first().click();
  await expect(admin).toHaveURL(/tab=portal/);
  admin.once("dialog", (d) => d.accept()); // confirm "Issue a password reset link?"
  await admin.getByRole("button", { name: "Issue reset link" }).click();
  const url = await linkIn(admin);

  await setPasswordFromLink(client, url, portalClient.newPassword);
  await signIn(client, portalClient.email, portalClient.newPassword);
  await expect(client).toHaveURL(/\/client$/);
});

test("wrong passwords get one generic message and never sign in", async ({ page }) => {
  for (const id of [owner.email, "no-such-user@e2e.invalid", staff.email]) {
    await page.goto("/login");
    await page.getByLabel("Login ID or email").fill(id);
    await page.locator("#password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect login ID/email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  }
});

test("a client cannot open another client's request; a disabled login loses access", async ({ browser }) => {
  const portal = await (await browser.newContext()).newPage();
  await signIn(portal, portalClient.email, portalClient.newPassword);
  await portal.goto("/client/requests");
  await portal.getByRole("link", { name: "Bank statements for September" }).first().click();
  await portal.waitForURL(/\/client\/requests\/[0-9a-f-]+$/);
  const requestUrl = portal.url();

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, owner.email, owner.password);
  await admin.goto("/app/clients/approvals");
  await admin.locator("li", { hasText: wizardClient.name }).getByRole("link", { name: "Review" }).click();
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Approve & activate" }).click();
  await expect(admin.getByText("Status updated.")).toBeVisible();
  const wizardClientUrl = admin.url().split("?")[0];

  const other = await (await browser.newContext()).newPage();
  await signIn(other, wizardClient.email, wizardClient.password);
  await expect(other).toHaveURL(/\/client$/);
  const res = await other.goto(requestUrl);
  expect(res?.status()).toBe(404);
  await expect(other.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(other.getByText("Bank statements for September")).toHaveCount(0);

  await other.goto("/client"); // left open while the office disables the login
  await admin.goto(`${wizardClientUrl}?tab=portal`);
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Disable" }).click();
  await expect(admin.getByText("Disabled", { exact: true })).toBeVisible();
  await other.waitForURL(/\/login\?reason=signed-out/, { timeout: 45_000 }); // no click needed
  await other.goto("/client");
  await expect(other).not.toHaveURL(/\/client$/);
  await expect(other.getByRole("heading", { name: /not active|Sign in/ })).toBeVisible();
});

test("a second firm registers separately and never sees the first firm's clients, staff or tasks", async ({ page }) => {
  await registerFirm(page, secondOwner, `E2E Second Firm ${run}`);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app\/admin/);
  await page.goto("/app/clients?status=all");
  await expect(page.getByText(portalClient.name)).toHaveCount(0);
  await expect(page.getByText(wizardClient.name)).toHaveCount(0);
  await page.goto("/app/employees");
  await expect(page.getByText(staff.email)).toHaveCount(0);
  await page.goto(`/app/search?q=${encodeURIComponent("E2E")}`);
  await expect(page.getByText(portalClient.name)).toHaveCount(0);
  await page.goto("/app/tasks?scope=all");
  await expect(page.getByText(clientName)).toHaveCount(0);
});

// ------------------------------------------------------------- client feedback, 5 Nov 2026

let managerUrl = "";
const manager = { email: `manager-${run}@e2e.invalid`, temp: "", password: "Manager-Pass-12345" };
const peon = { email: `peon-${run}@e2e.invalid`, temp: "", password: "Peon-Pass-123456" };

/** Invite → first sign-in → fill details → submit. Returns the person's signed-in page. */
async function inviteAndSubmit(inviter: Page, browser: Browser, who: { email: string; temp: string; password: string }, name: string, role: string, access?: string) {
  await inviter.goto("/app/employees/new");
  await inviter.getByLabel("Full name").fill(name);
  await inviter.getByLabel("Email").fill(who.email);
  await inviter.getByLabel("Mobile").fill("9876543210");
  await inviter.getByLabel("Role").selectOption({ label: role });
  if (access) await inviter.getByLabel("Module access").selectOption({ label: access });
  await inviter.getByRole("button", { name: "Send invitation" }).click();
  await expect(inviter.getByText(/Invitation created/)).toBeVisible();
  who.temp = tempPasswordIn((await mailTo(who.email, "staff.invitation")).text);
  const page = await (await browser.newContext()).newPage();
  await signIn(page, who.email, who.temp);
  await page.getByRole("textbox", { name: "New password", exact: true }).fill(who.password);
  await page.getByRole("textbox", { name: "Confirm new password" }).fill(who.password);
  await page.getByRole("button", { name: /Save/ }).click();
  await page.waitForURL(/\/app\/onboarding/);
  await page.getByLabel("PAN", { exact: true }).fill("FFNPS3234F");
  await page.getByLabel("Aadhaar number").fill("234567890123");
  await page.getByLabel("Current address").fill("B-139, Aali Vihar, New Delhi");
  await page.getByLabel(/submit for approval/).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your details are under review" })).toBeVisible();
  return page;
}

async function approve(approver: Page, name: string, code: string) {
  await approver.goto("/app/employees?status=review");
  await approver.getByRole("link", { name }).first().click();
  await approver.waitForURL(/\/app\/employees\/[0-9a-f-]{36}/);
  const url = approver.url();
  await approver.getByLabel("Permanent employee ID").fill(code);
  approver.once("dialog", (d) => d.accept());
  await approver.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(approver.getByText(`Approved. Permanent ID ${code}.`)).toBeVisible();
  return url;
}

test("point 1 voice notes, several reminders, one person as maker and checker, searching for people", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Permissions Policy|Hydration/i.test(m.text())) problems.push(m.text()); });
  await signIn(page, staff.email, staff.password); // a team member: every role can now create tasks
  await page.goto("/app/tasks");
  await page.getByRole("link", { name: "New task" }).click();
  await page.waitForURL(/\/app\/tasks\/new/);

  // Record a voice note; the title may be left blank.
  await page.getByRole("button", { name: "Record voice note" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator("audio")).toHaveCount(1);

  // Find people by typing.
  await page.getByRole("combobox", { name: "Assign to (one or more)" }).fill("Son");
  await expect(page.getByRole("option", { name: /Sonu Kumar/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Ramu Peon/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /Kamal/ })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Assign to (one or more)" }).press("Enter");
  // Deputed alone: the maker follows, and the same person can check.
  await expect(page.getByRole("combobox", { name: "Maker", exact: true })).toHaveValue(/Sonu Kumar/);
  await pick(page, "Checker", "Sonu Kumar — Executive", "Sonu");

  // Several reminders.
  await page.getByRole("button", { name: "Add a reminder" }).click();
  await page.getByRole("button", { name: "Add another reminder" }).click();
  const future = (d: number) => new Date(Date.now() + d * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 16);
  await page.getByLabel("Reminder 1", { exact: true }).fill(future(2));
  await page.getByLabel("Reminder 2", { exact: true }).fill(future(3));
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForURL(/\/app\/tasks\/[0-9a-f-]{36}$/);
  soloTaskUrl = page.url();

  await expect(page.getByRole("heading", { name: /Voice notes \(1\)/ })).toBeVisible();
  // The stored note really loads and plays through the security policy.
  const audio = page.locator("main audio").first();
  await expect.poll(async () => audio.evaluate((el: HTMLAudioElement) => new Promise<number>((res) => {
    el.addEventListener("loadedmetadata", () => res(el.readyState), { once: true });
    el.addEventListener("error", () => res(-1), { once: true });
    el.preload = "metadata";
    el.load();
  })), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.locator("li").getByText("Everyone on this task")).toHaveCount(2);

  // A remark can be a voice note alone.
  await page.getByRole("button", { name: "Record voice note" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByRole("heading", { name: /Voice notes \(2\)/ })).toBeVisible();

  // Add one more reminder, remove one.
  await page.getByLabel("Reminder 1", { exact: true }).fill(future(5));
  await page.getByRole("button", { name: "Set reminder" }).click();
  await expect(page.getByText("Reminder set.")).toBeVisible();
  await expect(page.locator("li").getByText("Everyone on this task")).toHaveCount(3);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove", exact: true }).first().click();
  await expect(page.getByText("Reminder removed.")).toBeVisible();

  // One person makes and checks the work.
  await page.getByRole("button", { name: "Start / resume work" }).click();
  await expect(page.getByText("Task updated.")).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("button", { name: "Approve (checker)" })).toBeVisible();
  await page.getByRole("button", { name: "Approve (checker)" }).click();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  expect(problems).toEqual([]);
});

let soloTaskUrl = "";

test("point 3 allocation in hours, first half at one client and second half at another", async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/allocations");
  const form = page.locator("form", { has: page.getByRole("button", { name: "Allocate" }) });
  await expect(page.getByLabel("Share of time (%)")).toHaveCount(0);
  await pick(form, "Client", portalClient.name);
  await pick(form, "Team member", "Kamal Rawat — Senior", "Kamal");
  await form.getByRole("button", { name: /^First half \(/ }).click();
  await expect(form.getByLabel("First half (hours)")).toHaveValue("3.5");
  await expect(form.getByLabel("Second half (hours)")).toHaveValue("0");
  await form.getByRole("button", { name: "Allocate" }).click();
  await expect(page.getByText("Team member allocated.")).toBeVisible();

  // The second half is free, so a second client fits without a conflict…
  await pick(form, "Client", clientName);
  await pick(form, "Team member", "Kamal Rawat — Senior", "Kamal");
  await form.getByRole("button", { name: /^Second half \(/ }).click();
  await form.getByRole("button", { name: "Allocate" }).click();
  await expect(page.getByText("Team member allocated.")).toBeVisible();
  await expect(page.getByText("First half 3.5 h", { exact: true })).toBeVisible();
  await expect(page.getByText("Second half 5 h", { exact: true })).toBeVisible();
  await expect(page.getByTitle(/^First half 3\.5 of 3\.5 h, second half 5 of 5 h/).first()).toBeVisible();

  // …but more hours than a half holds are refused.
  await pick(form, "Client", clientName);
  await pick(form, "Team member", "Sonu Kumar — Executive", "Sonu");
  await form.getByLabel("First half (hours)").fill("6");
  await form.getByRole("button", { name: "Allocate" }).click();
  await expect(page.getByText("The first half has only 3.5 working hours.")).toBeVisible();
});

test("point 2 a manager given the right can add, invite and approve staff; without it they cannot", async ({ browser }) => {
  await raiseLicenceLimit(owner.email, 20);
  const owner1 = await (await browser.newContext()).newPage();
  await signIn(owner1, owner.email, owner.password);
  const managerPage = await inviteAndSubmit(owner1, browser, manager, "Sanjay Test", "Manager");
  managerUrl = await approve(owner1, "Sanjay Test", `E2E-${run}-M`);

  // A manager has no such right by default.
  const mgr = await (await browser.newContext()).newPage();
  await signIn(mgr, manager.email, manager.password);
  await mgr.goto("/app/employees");
  await expect(mgr.getByRole("link", { name: "Invite staff member" })).toHaveCount(0);
  await mgr.goto("/app/employees/new");
  await expect(mgr).toHaveURL(/\/app\/no-access/);
  await managerPage.context().close();

  // The owner ticks the boxes on the person's page.
  await owner1.goto(managerUrl);
  await owner1.getByLabel("Add & invite employees").check();
  await owner1.getByLabel("Approve employees").check();
  await owner1.getByRole("button", { name: "Save rights" }).click();
  await expect(owner1.getByText("Rights updated.")).toBeVisible();

  // Now the manager invites someone, and approves them.
  await mgr.goto("/app/employees");
  await mgr.getByRole("link", { name: "Invite staff member" }).click();
  await expect(mgr.getByLabel("Role").locator("option", { hasText: "Administrator" })).toHaveCount(0); // no self-escalation
  const peonPage = await inviteAndSubmit(mgr, browser, peon, "Ramu Peon", "Team member", "Attendance & payroll only");
  await approve(mgr, "Ramu Peon", `E2E-${run}-P`);
  await peonPage.context().close();
  // The right is limited to staff: administration stays with administrators.
  await mgr.goto(managerUrl);
  await expect(mgr.getByRole("button", { name: "Save rights" })).toHaveCount(0);
  await mgr.goto("/app/settings");
  await expect(mgr).toHaveURL(/\/app\/no-access/);
});

test("point 2b a peon or driver reaches only attendance and payroll, in the menu and on the server", async ({ page }) => {
  await signIn(page, peon.email, peon.password);
  await expect(page).toHaveURL(/\/app\/attendance/);
  const menu = page.getByRole("navigation", { name: "Application" }).first();
  await expect(menu.getByRole("link", { name: "Attendance", exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Payroll", exact: true })).toBeVisible();
  for (const name of ["Dashboard", "Tasks", "Timesheet", "Day reports", "Pending tracker", "Clients", "Team allocation", "Compliance"]) {
    await expect(menu.getByRole("link", { name, exact: true }), name).toHaveCount(0);
  }
  for (const path of ["/app/tasks", "/app/tasks/new", "/app/timesheet", "/app/day-reports", "/app/pending", "/app/clients", "/app/allocations", "/app/compliances", "/app/observations"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/app\/no-access/);
  }
  await page.goto("/app/workspace");
  await expect(page).toHaveURL(/\/app\/attendance/); // no dashboard: straight to their module
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/attendance/);
  await page.goto("/app/search?q=GST");
  await expect(page.getByText(clientName)).toHaveCount(0);
  // What they do have works.
  await page.goto("/app/attendance");
  await markIn(page);
  await expect(page.getByText(/Marked in/)).toBeVisible();
  await page.goto("/app/payroll");
  await expect(page.getByRole("heading", { name: /Payslip/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Team payroll" })).toHaveCount(0);
  await page.goto("/app/payroll?tab=team");
  await expect(page.getByRole("heading", { name: "Fix or change a salary" })).toHaveCount(0);
  expect((await page.request.get("/app/payroll/export")).status()).toBe(404);
  expect((await page.request.get("/app/timesheet/export")).status()).toBe(404);
  expect((await page.request.get("/app/attendance/export")).status()).toBe(404);
});

test("point 3b the owner marks their own attendance; points 4 export, filters and clickable counts", async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/attendance");
  await markIn(page);
  await expect(page.getByText(/Marked in/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Mark out" })).toBeVisible();
  await page.goto("/app/admin");
  await expect(page.getByText("My attendance")).toBeVisible();

  await page.goto("/app/attendance?tab=team");
  const list = page.locator("#attendance-list");
  // Present opens the list of those present.
  await page.getByRole("link", { name: /^Present/ }).click();
  await expect(page).toHaveURL(/status=PRESENT/);
  await expect(list.getByRole("heading", { name: /^Present \(/ })).toBeVisible();
  await expect(list.getByText("Ramu Peon")).toBeVisible();
  await expect(list.getByText("Not marked")).toHaveCount(0);
  // Not marked opens the list of those missing.
  await page.getByRole("link", { name: /^Not marked/ }).click();
  await expect(page).toHaveURL(/status=NOT_MARKED/);
  await expect(list.getByRole("heading", { name: /^Not marked \(/ })).toBeVisible();
  await expect(list.getByText("Ramu Peon")).toHaveCount(0);
  await expect(list.getByText("Kamal Rawat")).toBeVisible();
  // Filter by name and status.
  await page.goto("/app/attendance?tab=team");
  await page.getByLabel("Employee name").fill("Ramu");
  await page.locator('form[aria-label="Filter attendance"] select[name="status"]').selectOption("PRESENT");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(list.getByText("Ramu Peon")).toBeVisible();
  await expect(list.getByText("Kamal Rawat")).toHaveCount(0);
  // Export gives a real Excel file with the same filters.
  // A real click downloads the file.
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export to Excel" }).click();
  expect((await downloading).suggestedFilename()).toMatch(/^attendance-.*\.xlsx$/);
  const href = await page.getByRole("link", { name: "Export to Excel" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("spreadsheetml");
  const rows = readFirstSheet(new Uint8Array(await res.body()));
  expect(rows[1]).toContain("Team member");
  expect(rows.slice(2).map((r) => r[2])).toEqual(["Ramu Peon"]);
  // Date range.
  const range = await page.request.get(`/app/attendance/export?from=2026-10-01&to=2026-10-05`);
  expect(readFirstSheet(new Uint8Array(await range.body()))[0][0]).toContain("Attendance");
});

test("point 4 timesheet carries the workbook's fields, review roles, penalties and Excel export", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, staff.email, staff.password);
  await page.goto("/app/timesheet?tab=daily");
  await page.getByText("More (optional)").click();
  await page.getByLabel("Resource type").selectOption("Dedicated");
  await page.getByLabel("Assessment year (AY)").selectOption("AY 2026-27");
  await page.getByLabel("Start time").fill("10:00");
  await page.getByLabel("End time").fill("12:30");
  await expect(page.getByText("Hours invested: 2h 30m")).toBeVisible();
  await logWork(page, { client: clientName, type: "GST Work", details: "GSTR-1 working for September" });

  const lead = await (await browser.newContext()).newPage();
  await signIn(lead, senior.email, senior.password);
  await lead.goto(`/app/timesheet?tab=log`);
  await expect(lead.getByText("GSTR-1 working for September")).toBeVisible();
  await expect(lead.getByRole("columnheader", { name: "Reviewer (auto)" })).toBeVisible();
  await expect(lead.getByRole("columnheader", { name: "Escalate to" })).toBeVisible();
  await expect(lead.getByRole("columnheader", { name: "Late submission" })).toBeVisible();
  await lead.goto("/app/timesheet?tab=hours");
  await expect(lead.getByRole("heading", { name: "Penalty summary" })).toBeVisible();
  await expect(lead.getByRole("heading", { name: "Reviewer performance" })).toBeVisible();
  await expect(lead.getByRole("heading", { name: "Hours by assessment year" })).toBeVisible();
  const href = await lead.getByRole("link", { name: "Export to Excel" }).getAttribute("href");
  const res = await lead.request.get(href!);
  expect(res.status()).toBe(200);
  const rows = readFirstSheet(new Uint8Array(await res.body()));
  for (const col of ["Date of Visit / Work", "Client Name", "Branch", "Tracker Ref No.", "Type of Work", "Approx. Time Taken (Hrs)", "Issue Level", "Pending Item – Client", "Days Pending – Team", "Resource Type", "Assessment Year (AY)", "Start Time", "Reviewer (auto)", "SLA Status", "Escalate To", "Reviewed By (actual)"]) {
    expect(rows[1], col).toContain(col);
  }
  const row = rows.find((r) => r.includes("GSTR-1 working for September"))!;
  expect(row[rows[1].indexOf("Approx. Time Taken (Hrs)")]).toBe("2.5");
  expect(row[rows[1].indexOf("Assessment Year (AY)")]).toBe("AY 2026-27");
});

test("point 5 choosing GST shows its compliances; tracker columns, an added column, mark done and export", async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/compliances?dept=GST");
  const chips = page.getByRole("group", { name: "GST compliances" });
  await expect(chips.getByRole("link", { name: "GSTR-3B (monthly)" })).toBeVisible();
  await expect(chips.getByRole("link", { name: "Director KYC" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: /^ROC/ }).click();
  await expect(page.getByRole("group", { name: "ROC compliances" }).getByRole("link", { name: "Director KYC" })).toBeVisible();
  await page.goto("/app/compliances?dept=GST");
  await chips.getByRole("link", { name: "GSTR-3B (monthly)" }).click();
  await expect(page.getByRole("heading", { name: "GSTR-3B (monthly)" })).toBeVisible();
  await expect(page.getByText("20th of next month").first()).toBeVisible();

  // Add a column of the firm's own.
  await page.getByLabel("New column").fill("Acknowledgement no.");
  await page.getByRole("button", { name: "Add column" }).click();
  await expect(page.getByText("Column added.")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Acknowledgement no." })).toHaveCount(0); // no rows yet

  // In the form, the module narrows the compliance list and fills what it can.
  const form = page.locator("form", { has: page.getByRole("button", { name: "Add to tracker" }) });
  await expect(form.getByLabel("Compliance / licence type")).toHaveValue("GSTR-3B (monthly)");
  await expect(form.getByLabel("Issuing authority")).toHaveValue("GST Dept");
  await form.getByLabel("Module").selectOption("TDS");
  await expect(form.getByLabel("Issuing authority")).toHaveValue("TDS Dept");
  await form.getByLabel("TDS compliance").selectOption({ index: 1 });
  await form.getByLabel("Module").selectOption("GST");
  await form.getByLabel("GST compliance").selectOption({ label: "GSTR-3B (monthly)" });
  await expect(form.getByLabel("Renewal frequency")).toHaveValue("Monthly");
  await pick(form, "Client", clientName);
  await pick(form, "Responsible person", "Sonu Kumar — Executive", "Sonu");
  await form.getByLabel("Due date").fill("2030-03-31");
  await form.getByLabel("Licence / registration no.").fill("07AAAAA0000A1Z5");
  await form.getByLabel("Acknowledgement no.").fill("ACK-991");
  await form.getByRole("button", { name: "Add to tracker" }).click();
  await expect(page.getByText("Added to the tracker.")).toBeVisible();
  for (const name of ["Issuing authority", "Licence / reg. no.", "Renewal frequency", "Responsible person", "Reminder lead days", "Days remaining", "Status", "Action taken", "Action taken date", "Escalated", "Acknowledgement no.", "Remarks"]) {
    await expect(page.getByRole("columnheader", { name, exact: true }), name).toBeVisible();
  }
  await expect(page.getByRole("cell", { name: "ACK-991" })).toBeVisible();

  // Done → the next month's row appears by itself.
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText(/Marked as done\. The next one is added, due 30 Apr 2030/)).toBeVisible();
  await expect(page.getByText("Completed", { exact: true }).last()).toBeVisible();

  const res = await page.request.get("/app/compliances/export?dept=GST");
  expect(res.status()).toBe(200);
  const rows = readFirstSheet(new Uint8Array(await res.body()));
  expect(rows[1]).toEqual(expect.arrayContaining(["Client Name", "Compliance / License Type", "Issuing Authority", "Days Remaining", "Action Taken (Y/N)", "Escalated", "Acknowledgement no.", "Remarks"]));
  expect(rows.flat()).toContain("ACK-991");

  // The Yes/No for the firm itself sits on the due-date calendar.
  await page.goto("/app/compliances?tab=calendar&dept=GST");
  const applies = page.getByLabel("Does GSTR-1 (monthly) apply to our firm?");
  await applies.selectOption("yes");
  await expect.poll(async () => { await page.reload(); return applies.inputValue(); }).toBe("yes");

  // Team members see the calendar and their own rows, and can mark them done.
  const staffPage = await (await page.context().browser()!.newContext()).newPage();
  await signIn(staffPage, staff.email, staff.password);
  await staffPage.goto("/app/compliances?dept=GST");
  await expect(staffPage.getByRole("button", { name: "Add to tracker" })).toHaveCount(0);
  await expect(staffPage.getByRole("button", { name: "Mark done" })).toBeVisible();
  await staffPage.context().close();
});

test("point 6 rights to delete: staff, client, task and other entries, with a clear warning", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, owner.email, owner.password);

  // Task: voice notes go with it.
  await page.goto(soloTaskUrl);
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByRole("heading", { name: /^Delete task/ })).toBeVisible();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL(/\/app\/tasks(\?|$)/);
  await page.goto(soloTaskUrl);
  await expect(page.getByText("This page was never filed.")).toBeVisible();

  // Client: the name must be typed.
  await page.goto("/app/clients/new/quick");
  const doomed = `E2E Delete Me ${run}`;
  await page.getByLabel("Trade name").fill(doomed);
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]{36}/);
  const doomedUrl = page.url().split("?")[0];
  await page.getByRole("button", { name: "Delete" }).first().click();
  const confirm = page.getByRole("button", { name: "Delete permanently" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/to confirm/).fill("wrong name");
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/to confirm/).fill(doomed);
  await confirm.click();
  await page.waitForURL(/\/app\/clients(\?|$)/);
  await page.goto(doomedUrl);
  await expect(page.getByText("This page was never filed.")).toBeVisible();
  // Codes keep moving forward after a deletion, so the next client never collides.
  await page.goto("/app/clients/new/quick");
  await page.getByLabel("Trade name").fill(`E2E After Delete ${run}`);
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]{36}/);

  // Staff member: their login goes too. The owner cannot be deleted, nor oneself.
  await page.goto("/app/employees");
  await page.getByRole("link", { name: "Sanjay Test" }).first().click();
  await page.waitForURL(/\/app\/employees\/[0-9a-f-]{36}/);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  // Without the right, no button and no action.
  const seniorPage = await (await browser.newContext()).newPage();
  await signIn(seniorPage, senior.email, senior.password);
  await seniorPage.goto("/app/clients");
  await seniorPage.getByRole("link", { name: clientName }).first().click();
  await expect(seniorPage.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await seniorPage.context().close();
});

test("point 7 import clients from Excel: template, preview, column matching, duplicates, then import", async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/clients");
  await page.getByRole("link", { name: "Import from Excel" }).click();
  await page.waitForURL(/\/app\/clients\/import/);
  const template = await page.request.get("/app/clients/import/template");
  expect(template.status()).toBe(200);
  expect(readFirstSheet(new Uint8Array(await template.body()))[1]).toEqual(expect.arrayContaining(["Name", "Legal Name (as per PAN)", "GSTIN", "PAN", "Applicable Department", "GST Password"]));

  // A sheet in the firm's own layout, with a title row and columns the import must ignore.
  const gstin = `07AAAAA${String(Date.now()).slice(-4)}A1Z5`;
  const sheet = buildXlsx([{ name: "12. Client Details", title: "12. CLIENT DETAILS", rows: [
    ["S.No.", "Client Code", "Client Name (as used in office)", "Legal Name (as per PAN / GST)", "Visit Days", "Services Taken", "Constitution", "GSTIN", "PAN", "Contact Person", "Mobile", "Email", "Address", "Place of Work", "Billing Basis", "Fee (₹)", "Status"],
    [1, `IMP-${run}-1`, `Bansi Import ${run}`, "Bansi Institutional Supplies", 307, "Internal Audit, GST Return Filing", "Pvt Ltd", gstin, "ABCDE1234F", "Ravi", "+91 98765 43210", "ravi@example.com", "Naraina", "Client Office (Onsite)", "Monthly Retainer", "5,000", "Active"],
    [2, "", `Bad Identifiers ${run}`, "", 1, "", "Partnership", "BADGSTIN", "BADPAN", "", "123", "nope", "", "", "", "abc", "On Hold"],
    [3, "", clientName, "", 1, "", "", "", "", "", "", "", "", "", "", "", ""],
    [4, "", "", "No name here", 1, "", "", "", "", "", "", "", "", "", "", "", ""],
  ] }]);
  const file = { name: "clients.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(sheet) };
  await page.locator('input[type="file"]').setInputFiles(file);

  await expect(page.getByRole("heading", { name: "2. Check the columns" })).toBeVisible();
  await expect(page.getByLabel("Client Name (as used in office)")).toHaveValue("tradeName");
  await expect(page.getByLabel("Visit Days")).toHaveValue("");
  await expect(page.getByText("Already registered: " + clientName)).toBeVisible();
  await expect(page.getByText("Client name is empty")).toBeVisible();
  await expect(page.getByText(/GSTIN BADGSTIN is not valid/)).toBeVisible();
  await page.getByRole("button", { name: "Import 2 clients" }).click();
  await expect(page.getByText(/2 clients imported\. 2 rows were skipped/).first()).toBeVisible();

  // What was imported is complete, and importing again duplicates nothing.
  await page.goto(`/app/clients?q=${encodeURIComponent(`Bansi Import ${run}`)}`);
  await page.getByRole("link", { name: `Bansi Import ${run}` }).first().click();
  await expect(page.getByText(`IMP-${run}-1`).first()).toBeVisible();
  await expect(page.getByText(gstin).first()).toBeVisible();
  await page.goto("/app/clients/import");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText(`Already registered: Bansi Import ${run}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 0 clients" })).toBeDisabled();

  // Not an Excel file.
  await page.locator('input[type="file"]').setInputFiles(pdf("clients.pdf"));
  await expect(page.getByText(/Upload an Excel \.xlsx file/)).toBeVisible();
});

test("payroll: the owner enters a salary; pay follows attendance; the register exports", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/payroll?tab=team");
  await pick(page, "Team member", "Ramu Peon", "Ramu");
  await page.getByLabel("Salary (₹)").fill("15000");
  await page.getByRole("button", { name: "Save salary" }).click();
  await expect(page.getByText("Salary saved.")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Ramu Peon/ })).toBeVisible();
  const res = await page.request.get("/app/payroll/export");
  expect(res.status()).toBe(200);
  const rows = readFirstSheet(new Uint8Array(await res.body()));
  expect(rows.find((r) => r.includes("Ramu Peon"))).toContain("15000");
  const peonPage = await (await browser.newContext()).newPage();
  await signIn(peonPage, peon.email, peon.password);
  await peonPage.goto("/app/payroll");
  await expect(peonPage.getByText("₹ 15,000.00")).toBeVisible();
  await peonPage.context().close();
});

test("the interface switches to Hindi across pages, keeps names as entered, and the public site stays English", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && /hydrat|did not match/i.test(m.text())) problems.push(m.text()); });
  await signIn(page, owner.email, owner.password);
  await page.goto("/app/tasks");
  await page.getByRole("button", { name: "हिन्दी" }).click();
  const menu = page.getByRole("navigation", { name: "एप्लिकेशन" }).first();
  await expect(menu.getByRole("link", { name: "टास्क", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "टास्क", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  // Server pages and interactive (client-rendered) forms alike.
  await page.goto("/app/tasks/new");
  await expect(page.getByRole("button", { name: "वॉइस नोट रिकॉर्ड करें" })).toBeVisible();
  await expect(page.getByRole("button", { name: "टास्क बनाएँ" })).toBeVisible();
  for (const [path, text] of [["/app/attendance?tab=team", "टीम की उपस्थिति"], ["/app/compliances", "अनुपालन"], ["/app/payroll", "पेरोल"], ["/app/employees", "कर्मचारी"], ["/app/clients", "क्लाइंट"], ["/app/allocations", "टीम आवंटन"], ["/app/timesheet", "टाइमशीट"]] as const) {
    await page.goto(path);
    await expect(page.getByText(text, { exact: true }).first(), path).toBeVisible();
  }
  // Client names stay as they were typed.
  await page.goto("/app/clients");
  await expect(page.getByRole("link", { name: clientName }).last()).toBeVisible();
  // The public website stays in English.
  await page.goto("/help");
  await expect(page.getByRole("link", { name: "टास्क" })).toHaveCount(0);
  // Back to English.
  await page.goto("/app/tasks");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});

test("key pages fit a tablet viewport (768px) without horizontal scroll", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 768, height: 1024 } })).newPage();
  await signIn(page, owner.email, owner.password);
  for (const path of ["/app/admin", "/app/clients", "/app/tasks", "/app/timesheet?tab=tracker", "/app/pending", "/app/reports/clients", "/app/dues", "/app/observations", "/app/profile", "/app/settings?tab=lists", "/app/compliances", "/app/payroll?tab=team", "/app/attendance?tab=team", "/app/clients/import", "/app/allocations", "/app/tasks/new"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});

test("app and portal pages are usable at phone width (no horizontal page scroll)", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await signIn(page, owner.email, owner.password);
  for (const path of ["/app/admin", "/app/clients", "/app/clients/approvals", "/app/tasks", "/app/tasks?view=board", "/app/attendance", "/app/attendance?tab=team", "/app/attendance?tab=others", "/app/attendance?tab=photos", "/app/attendance?tab=visits", "/app/attendance?tab=workers", "/app/attendance?tab=workers&view=pay", "/app/compliances", "/app/payroll?tab=team", "/app/clients/import", "/app/tasks/new", "/app/timesheet", "/app/pending", "/app/allocations", "/app/settings?tab=roles", "/app/dues", "/app/observations", "/app/profile"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();

  const client = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await signIn(client, portalClient.email, portalClient.newPassword);
  for (const path of ["/client", "/client/requests", "/client/work", "/client/documents", "/client/profile"]) {
    await client.goto(path);
    const overflow = await client.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});

// Visual check: screenshots for manual review at desktop, tablet and phone
// widths (written to test-results/visual; not compared automatically).
test("visual check screenshots at desktop, tablet and phone widths", async ({ browser, baseURL }) => {
  const sizes = [{ name: "desktop", width: 1366, height: 900 }, { name: "tablet", width: 768, height: 1024 }, { name: "phone", width: 375, height: 812 }];
  const pages = ["/", "/register", "/app/admin", "/app/clients", "/app/tasks?view=board", "/app/timesheet?tab=tracker", "/app/pending", "/app/observations", "/app/dues", "/app/reports/clients", "/app/settings?tab=lists"];
  for (const size of sizes) {
    const page = await (await browser.newContext({ baseURL, viewport: { width: size.width, height: size.height } })).newPage();
    await signIn(page, owner.email, owner.password);
    for (const path of pages) {
      await page.goto(path);
      const file = path.replace(/[/?=&]+/g, "_").replace(/^_|_$/g, "") || "home";
      await page.screenshot({ path: `test-results/visual/${size.name}-${file}.png` });
    }
    await page.context().close();
  }
  const client = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await signIn(client, portalClient.email, portalClient.newPassword);
  for (const path of ["/client", "/client/requests", "/client/profile"]) {
    await client.goto(path);
    await client.screenshot({ path: `test-results/visual/phone-portal${path.replace(/\//g, "_")}.png` });
  }
});


test("round 2: workflow tracker ↔ daily log, client pending report, compliances by department, Client Master import", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, owner.email, owner.password);
  const tag = `${run}.${Date.now().toString(36)}`; // unique per attempt, so a re-run on the same data never matches old rows

  // A manager defines work in the tracker and gives it to Sonu as Maker.
  await page.goto("/app/timesheet?tab=tracker");
  const add = page.locator("form", { has: page.getByRole("button", { name: "Add to tracker" }) });
  await pick(add, "Client", clientName);
  await add.getByLabel("Type of work").selectOption("Bank Reconciliation");
  await add.getByRole("button", { name: "Add to tracker" }).click();
  await expect(page.getByText("Bank Name is required for bank and card work.")).toBeVisible();
  await add.getByLabel("Bank name", { exact: true }).fill("HDFC Bank");
  await add.getByLabel("Period from").fill("2026-10-01");
  await add.getByLabel("Pending item – client").fill(`October bank statement ${tag}`);
  await add.getByLabel("Raised on – client").fill("2026-11-01");
  await add.getByLabel("Due by – client").fill("2026-11-03");
  await add.getByLabel("Remarks (internal)").fill(`Internal note ${tag}`);
  await pick(add, "Maker", "Sonu Kumar — Executive", "Sonu");
  await add.getByRole("button", { name: "Add to tracker" }).click();
  const added = page.getByText(/Added [A-Z0-9]+-\d{3} to the tracker\./);
  await expect(added).toBeVisible();
  const ref = (await added.textContent())!.match(/[A-Z0-9]+-\d{3}/)![0];
  const row = page.locator("tbody tr", { hasText: ref });
  await expect(row.getByText("Awaiting Data")).toBeVisible();
  await expect(row.getByText("CLIENT DELAY")).toBeVisible();

  // Sonu sees it in the timesheet and logs against the Ref No.; the client sent part of it.
  const sonu = await (await browser.newContext()).newPage();
  await signIn(sonu, staff.email, staff.password);
  await sonu.goto("/app/timesheet?tab=daily");
  const given = sonu.locator("tbody tr", { hasText: ref });
  await given.getByRole("link", { name: "Log work on this" }).click();
  await expect(sonu.getByRole("heading", { name: new RegExp(`Log work on ${ref}`) })).toBeVisible();
  await expect(sonu.getByLabel("Bank name", { exact: true })).toHaveValue("HDFC Bank");
  await sonu.getByLabel("Period to").fill("2026-10-31");
  await sonu.getByLabel("Status of work").selectOption({ label: "In Progress" });
  await sonu.getByLabel("Status – client").selectOption("Partial");
  await sonu.getByLabel("Or hours").fill("1");
  await sonu.getByRole("button", { name: "Add entry" }).click();
  await expect(sonu.getByText("Entry added.")).toBeVisible();
  // Work logged without a Ref No. arrives in the tracker as new.
  await sonu.goto("/app/timesheet?tab=daily");
  await logWork(sonu, { client: clientName, type: "GST Work", hours: "1", teamPending: `Reconcile ITC ${tag}` });
  await sonu.goto("/app/timesheet?tab=mine");
  await expect(sonu.getByText(`Reconcile ITC ${tag}`)).toBeVisible();
  await expect(sonu.getByText(`October bank statement ${tag}`)).toBeVisible();
  await sonu.goto("/app/timesheet?tab=day");
  await expect(sonu.getByRole("heading", { name: "DAILY WORK REPORT" })).toBeVisible();
  await expect(sonu.getByRole("cell", { name: "GST Work" }).first()).toBeVisible();
  await sonu.context().close();

  await page.goto(`/app/timesheet?tab=tracker&client=${encodeURIComponent(clientName)}`);
  await expect(row.getByText("Partial Data")).toHaveCount(0);
  await expect(row.getByText("Maker In Progress")).toBeVisible();
  // The work logged without a Ref No. is on a line (new, or matched on client + type + period).
  const logged = page.locator("tbody tr", { hasText: `Reconcile ITC ${tag}` });
  await expect(logged).toHaveCount(1);
  const fresh = logged.filter({ hasText: "New from log" });
  if (await fresh.count()) { // on a re-run with the same data the matched line may already be reviewed
    await fresh.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(fresh).toHaveCount(0);
  }
  const xlsx = await page.request.get(`/app/timesheet/export?sheet=tracker&client=${encodeURIComponent(clientName)}`);
  expect(xlsx.status()).toBe(200);
  const sheet = readFirstSheet(new Uint8Array(await xlsx.body()));
  expect(sheet[1]).toEqual(expect.arrayContaining(["Tracker Ref No.", "Work Status (auto)", "Timeline Flag (auto)", "Days Pending (Due − Raised)"]));
  expect(sheet.find((r) => r.includes(ref))).toEqual(expect.arrayContaining(["Maker In Progress", "2"]));

  // The letter to the client: the open item, no internal remarks.
  await page.goto(`/app/timesheet?tab=report&client=${encodeURIComponent(clientName)}`);
  await expect(page.getByRole("heading", { name: "PENDING INFORMATION / DOCUMENTS LIST" })).toBeVisible();
  await expect(page.getByRole("cell", { name: `October bank statement ${tag}` })).toBeVisible();
  await expect(page.getByText(`Internal note ${tag}`)).toHaveCount(0);
  await page.goto("/app/timesheet?tab=dashboard");
  await expect(page.getByRole("heading", { name: "Team workload" })).toBeVisible();

  // Client registration: picking GST lists every GST compliance, ticked.
  await page.goto("/app/clients/new/quick");
  await page.getByLabel("Trade name").fill(`Compliance Client ${tag}`);
  await page.locator("label", { hasText: /^GST\d*$/ }).click();
  const gst = page.locator("fieldset", { hasText: "GST compliances" });
  await expect(gst.getByRole("checkbox", { name: /GSTR-3B \(monthly\)/ })).toBeChecked();
  const total = await gst.locator('input[name="complianceItemIds[]"]').count();
  expect(total).toBeGreaterThan(5);
  await gst.getByRole("checkbox", { name: /GSTR-3B \(monthly\)/ }).uncheck();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: `Compliances (${total - 1})` })).toBeVisible();

  // Remark (If Date Extend) on the due-date calendar.
  await page.goto("/app/compliances?tab=calendar&dept=GST");
  await expect(page.getByRole("columnheader", { name: "Remark (If Date Extend)" })).toBeVisible();
  const ext = page.getByLabel(/^Extended date for /).first();
  await ext.fill("Extended to 15 Dec 2026");
  await ext.locator("xpath=..").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Extended date saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Extended date for /).first()).toHaveValue("Extended to 15 Dec 2026");

  // Client Master import: one row per GSTIN, same PAN = one client; the firm's own row is skipped.
  const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const pan = () => `${letters(5)}${String(Math.floor(Math.random() * 9000) + 1000)}${letters(1)}`;
  const [p1, p2] = [pan(), pan()];
  const header = ["S.No.", "Name", "Legal Name (as per PAN)", "Address", "GSTIN", "PAN", "Constitution of Business", "GST User ID", "GST Password", "Income Tax User ID", "Income Tax Password", "TRACES User ID", "TRACES Password", "State", "TAN", "Mobile", "Email", "DOB", "IT File No.", "Applicable Department", "Remark"];
  const line = (n: number, name: string, gstin: string, p: string, dept: string, pw = "") => [n, name, "", "Delhi", gstin, p, "Partnership", "", pw, p, "", "", "", "Delhi", "", "9876543210", "", "01/04/2015", `SSDA-${n}`, dept, ""];
  const file = buildXlsx([{ name: "Client Master", rows: [
    ["S S DIMRI & ASSOCIATES – CLIENT MASTER"], ["One row per GSTIN"], [], header,
    line(1, `E2E Firm ${run}`, "", "", "GST"),
    line(2, `Master Two GST ${tag}`, `07${p1}1Z5`, p1, "GST, Income Tax", "Secret-Pw-1"),
    line(3, `Master Two GST ${tag}`, `06${p1}1Z5`, p1, "GST, Day Book"),
    line(4, `Master Other ${tag}`, "", p2, "TDS"),
  ] }]);
  await page.goto("/app/clients/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "SSDA_Client_Master.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(file) });
  await expect(page.getByText(/Same PAN as row [67]: added there/)).toBeVisible();
  await expect(page.getByText("This row is the firm itself, not a client")).toBeVisible();
  await expect(page.getByText("Secret-Pw-1")).toHaveCount(0);
  await page.getByRole("button", { name: "Import 2 clients" }).click();
  await expect(page.getByText(/2 clients imported\. 1 more row was the same PAN and added as GSTINs\./).first()).toBeVisible();
  await page.goto(`/app/clients?q=${encodeURIComponent(`Master Two GST ${tag}`)}`);
  await page.getByRole("link", { name: `Master Two GST ${tag}` }).last().click();
  await expect(page.getByText(`07${p1}1Z5, 06${p1}1Z5`)).toBeVisible();
  await expect(page.getByText("GST, Income Tax, Day Book")).toBeVisible();
  await expect(page.getByText("(password saved)")).toBeVisible();
  await expect(page.getByText("Secret-Pw-1")).toHaveCount(0);
});

// Last, because they remove people and clients the tests above use.
test("point 1 several reminders all fire; compliance reminder and escalation reach the right people", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, owner.email, owner.password);
  const title = `Two reminders ${run}`;
  await page.goto("/app/tasks/new");
  await page.getByRole("textbox", { name: "Task", exact: true }).fill(title);
  await pick(page, "Assign to (one or more)", "Sonu Kumar — Executive", "Sonu");
  await page.getByRole("button", { name: "Add a reminder" }).click();
  await page.getByRole("button", { name: "Add another reminder" }).click();
  const future = (d: number) => new Date(Date.now() + d * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 16);
  await page.getByLabel("Reminder 1", { exact: true }).fill(future(2));
  await page.getByLabel("Reminder 2", { exact: true }).fill(future(3));
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForURL(/\/app\/tasks\/[0-9a-f-]{36}$/);
  await makeRemindersDue(title);

  await page.goto("/app/compliances?dept=GST");
  const form = page.locator("form", { has: page.getByRole("button", { name: "Add to tracker" }) });
  await form.getByLabel("Compliance / licence type").fill(`Due soon ${run}`);
  await pick(form, "Responsible person", "Sonu Kumar — Executive", "Sonu");
  await form.getByLabel("Due date").fill(new Date(Date.now() + 2 * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10));
  await form.getByRole("button", { name: "Add to tracker" }).click();
  await expect(page.getByText("Added to the tracker.")).toBeVisible();

  const sonu = await (await browser.newContext()).newPage();
  await signIn(sonu, staff.email, staff.password);
  await sonu.goto("/app/notifications");
  await sonu.reload();
  await expect(sonu.getByText(`Reminder: ${title}`)).toHaveCount(2);
  await expect(sonu.getByText(new RegExp(`Due soon ${run} for the firm: due in`))).toBeVisible();
  await page.goto("/app/notifications");
  await page.reload();
  await expect(page.getByText(new RegExp(`Escalated: Due soon ${run}`))).toBeVisible();
  await sonu.context().close();
});

test("feedback 12 Nov: photo attendance by a senior, photo check, lunch, client visits, mark-out reminders, daily workers", async ({ browser }) => {
  const acceptDialogs = (p: Page) => p.on("dialog", (d) => d.accept());
  const owner1 = await (await browser.newContext()).newPage();
  acceptDialogs(owner1);
  await signIn(owner1, owner.email, owner.password);

  // Point 6: the owner registers a daily worker with a wage.
  await owner1.goto("/app/attendance?tab=workers&view=list");
  await owner1.getByLabel("Name").fill("Bhola Labour");
  await owner1.getByLabel("Daily wage (₹)").fill("650");
  await owner1.getByLabel("Kind of work").fill("Helper");
  await owner1.getByLabel("Contractor / agency").fill("Shiv Contractors");
  await owner1.getByRole("button", { name: "Add worker" }).click();
  await expect(owner1.getByText("Bhola Labour added to the daily workers.")).toBeVisible();

  // Points 1–2: the senior marks the manager (no phone with them) and the worker, with photos.
  const lead = await (await browser.newContext()).newPage();
  await signIn(lead, senior.email, senior.password);
  await lead.goto("/app/attendance?tab=others");
  await expect(lead.getByRole("heading", { name: "Mark someone in or out" })).toBeVisible();
  await pick(lead, "Person", "Sanjay Test", "Sanjay");
  await expect(lead.getByText("Not marked yet today")).toBeVisible();
  await lead.getByRole("button", { name: "Record time in" }).click();
  await expect(lead.getByText("Take a photo of the person first.")).toBeVisible(); // no photo, nothing saved
  await lead.locator("#proxy-photo").setInputFiles(png("sanjay.png"));
  await lead.getByRole("button", { name: "Record time in" }).click();
  await expect(lead.getByText(/Sanjay Test marked in at/)).toBeVisible();
  await expect(lead.getByRole("heading", { name: /Marked by you today \(1\)/ })).toBeVisible();
  await lead.reload();
  await pick(lead, "Person", "Bhola Labour", "Bhola");
  await lead.locator("#proxy-photo").setInputFiles(png("bhola-in.png"));
  await lead.getByRole("button", { name: "Record time in" }).click();
  await expect(lead.getByText(/Bhola Labour marked in at/)).toBeVisible();
  await lead.reload();
  await pick(lead, "Person", "Bhola Labour", "Bhola");
  await expect(lead.getByText(/In since/)).toBeVisible();
  await lead.locator("#proxy-photo").setInputFiles(png("bhola-out.png"));
  await lead.getByRole("button", { name: "Record time out" }).click();
  await expect(lead.getByText(/Bhola Labour marked out at/)).toBeVisible();
  // The senior marked it, so they do not check it themselves.
  await lead.goto("/app/attendance?tab=photos&show=ALL");
  await expect(lead.locator("li", { hasText: "Sanjay Test" }).getByText("You marked this one")).toBeVisible();

  // A team member has no "Mark for others" tab and cannot use it by URL.
  const member = await (await browser.newContext()).newPage();
  await signIn(member, staff.email, staff.password);
  await member.goto("/app/attendance?tab=others");
  await expect(member.getByRole("link", { name: "Mark for others" })).toHaveCount(0);
  await expect(member.getByRole("heading", { name: "Mark someone in or out" })).toHaveCount(0);
  expect((await member.request.get("/app/attendance/workers-export")).status()).toBe(404);

  // The owner sees the photo to check (menu badge + tab count), marks it absent, then restores it.
  await owner1.goto("/app/attendance?tab=photos");
  await expect(owner1.getByRole("link", { name: /Photo check\s*1/ })).toBeVisible();
  const card = owner1.locator("li", { hasText: "Sanjay Test" }).first();
  await expect(card.getByRole("img", { name: /Sanjay Test – time in/ })).toBeVisible();
  await expect(card.getByText("by Kamal Rawat")).toBeVisible();
  await card.getByRole("button", { name: "Not genuine – mark absent" }).click();
  await expect(owner1.getByText("Say why the photo is not genuine.")).toBeVisible();
  await card.getByLabel(/Note/).fill("Face not visible");
  await card.getByRole("button", { name: "Not genuine – mark absent" }).click();
  await expect(owner1.getByText(/Sanjay Test marked absent for/)).toBeVisible();
  await owner1.goto("/app/attendance?tab=team&status=PROXY");
  const proxyRow = owner1.locator("#attendance-list tbody tr", { hasText: "Sanjay Test" });
  await expect(proxyRow.getByText("Absent", { exact: true })).toBeVisible();
  await expect(proxyRow.getByText("Marked absent")).toBeVisible();
  await owner1.goto("/app/attendance?tab=photos&show=REJECTED");
  await owner1.locator("li", { hasText: "Sanjay Test" }).first().getByRole("button", { name: "Looks genuine" }).click();
  await expect(owner1.getByText("Photo accepted for Sanjay Test.")).toBeVisible();
  await owner1.goto("/app/attendance?tab=team&status=PROXY");
  await expect(proxyRow.getByText("Present", { exact: true })).toBeVisible();
  // One click on a name shows all of that person's attendance.
  await proxyRow.getByRole("link", { name: "Sanjay Test" }).click();
  await expect(owner1.getByText(/Showing only/)).toBeVisible();

  // Points 4–5: the manager sees who marked them, takes lunch and visits two places.
  const mgr = await (await browser.newContext()).newPage();
  await signIn(mgr, manager.email, manager.password);
  await mgr.goto("/app/notifications");
  await expect(mgr.getByText(/Kamal Rawat marked your time in at/).first()).toBeVisible();
  await mgr.goto("/app/attendance");
  await expect(mgr.getByText("Recorded for you by Kamal Rawat with your photo.")).toBeVisible();
  await mgr.getByRole("button", { name: "Start lunch" }).click();
  await expect(mgr.getByText("Lunch started. Enjoy your meal.")).toBeVisible();
  await mgr.getByRole("button", { name: "Back from lunch" }).click();
  await expect(mgr.getByText("Welcome back. Lunch time is recorded.")).toBeVisible();
  await expect(mgr.getByText(/^Lunch \d/)).toBeVisible();
  await pick(mgr, "Client", clientName, clientName.slice(0, 10));
  await mgr.getByLabel("Purpose (optional)").fill("Stock audit");
  await mgr.getByRole("button", { name: "Check in at client" }).click();
  await expect(mgr.getByText(new RegExp(`Checked in at ${clientName}`))).toBeVisible();
  await expect(mgr.getByText("You are here")).toBeVisible();
  await mgr.getByLabel("Or another place").fill("HDFC Bank, Naraina");
  await mgr.getByRole("button", { name: "Move to next client" }).click();
  await expect(mgr.getByText(/Checked in at HDFC Bank, Naraina/)).toBeVisible();
  await expect(mgr.locator("section", { hasText: "Client visits today" }).locator("ol > li")).toHaveCount(2);
  await mgr.getByRole("button", { name: "Check out from client" }).click();
  await expect(mgr.getByText(/Checked out at/)).toBeVisible();

  // The office sees where everyone went, and lunch, in the team view.
  await owner1.goto("/app/attendance?tab=visits");
  const visitCard = owner1.locator("li", { hasText: "Sanjay Test" }).first();
  await expect(visitCard.getByText(clientName)).toBeVisible();
  await expect(visitCard.getByText("HDFC Bank, Naraina")).toBeVisible();
  await expect(visitCard.getByText("Stock audit")).toBeVisible();
  await owner1.goto("/app/attendance?tab=team");
  const teamRow = owner1.locator("#attendance-list tbody tr", { hasText: "Sanjay Test" });
  await expect(teamRow.getByText("HDFC Bank, Naraina")).toBeVisible();
  await expect(teamRow.getByText(/0h 0\dm/).first()).toBeVisible(); // lunch minutes

  // Point 3: reminders. The scheduled call needs its secret.
  expect((await owner1.request.get("/api/cron/attendance")).status()).toBe(404);
  await owner1.goto("/app/settings?tab=policy");
  await owner1.getByLabel("Remind to mark out at").fill("00:00");
  await owner1.getByRole("button", { name: "Save policy" }).click();
  await expect(owner1.getByText("Policy saved.")).toBeVisible();
  await addForgottenMarkOut(peon.email, 2);
  const cron = await owner1.request.get("/api/cron/attendance", { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  expect(cron.status()).toBe(200);
  // Sonu is still marked in from earlier: reminded by email and in the app.
  const mail = await mailTo(staff.email, "attendance-mark-out");
  expect(mail.subject).toContain("mark out");
  await member.goto("/app/notifications");
  await expect(member.getByText("You have not marked out yet").first()).toBeVisible();
  await member.goto("/app/attendance");
  await expect(member.getByText(/Remember to mark out before you leave/)).toBeVisible();
  // The forgotten day is reported to the owner. Attendance is system-driven (office rule 1):
  // nobody can enter the time out by hand, so there is no Fix and no correction form.
  await owner1.goto("/app/notifications");
  await owner1.getByText(/No time out: Ramu Peon/).first().click();
  await expect(owner1).toHaveURL(/status=NO_OUT/);
  const missedRow = owner1.locator("#attendance-list tbody tr", { hasText: "Ramu Peon" });
  await expect(missedRow.getByText("No time out")).toBeVisible();
  await expect(missedRow.getByRole("link", { name: "Fix" })).toHaveCount(0);
  await expect(owner1.getByRole("heading", { name: "Record or correct attendance" })).toHaveCount(0);
  // Back to the default, so later tests are not affected.
  await owner1.goto("/app/settings?tab=policy");
  await owner1.getByLabel("Remind to mark out at").fill("19:00");
  await owner1.getByRole("button", { name: "Save policy" }).click();
  await expect(owner1.getByText("Policy saved.")).toBeVisible();

  // Point 6: the day sheet and pay for daily workers, marked paid and exported.
  await owner1.goto("/app/attendance?tab=workers");
  const workerRow = owner1.getByRole("row", { name: /Bhola Labour/ });
  await expect(workerRow.getByText("₹650")).toBeVisible();
  await expect(workerRow.getByText("Kamal Rawat")).toBeVisible();
  await owner1.goto("/app/attendance?tab=workers&view=pay");
  const payRow = owner1.getByRole("row", { name: /Bhola Labour/ });
  await payRow.getByRole("button", { name: "Mark paid" }).click();
  await expect(owner1.getByText("Bhola Labour: 1 day(s) marked paid.")).toBeVisible();
  const href = await owner1.getByRole("link", { name: "Export to Excel" }).getAttribute("href");
  const xl = await owner1.request.get(href!);
  expect(xl.status()).toBe(200);
  const sheet = readFirstSheet(new Uint8Array(await xl.body()));
  const bhola = sheet.find((r) => r[0] === "Bhola Labour")!;
  expect(bhola).toBeTruthy();
  expect(bhola[9]).toBe("650"); // earned
  expect(bhola[11]).toBe("0"); // nothing left to pay
  // The team export carries the new columns at the end.
  const team = readFirstSheet(new Uint8Array(await (await owner1.request.get("/app/attendance/export")).body()));
  expect(team[1].slice(0, 3)).toEqual(["Date", "Employee ID", "Team member"]);
  expect(team[1]).toContain("Client visits");
  expect(team.find((r) => r[2] === "Sanjay Test")!.join(" ")).toContain("HDFC Bank, Naraina");

  for (const p of [owner1, lead, member, mgr]) await p.context().close();
});

test("point 6 deleting a staff member and clients with real history: nothing breaks, logins stop, hours stay", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, owner.email, owner.password);
  // A senior logs time against the client, to prove hours survive the client's deletion.
  const lead = await (await browser.newContext()).newPage();
  await signIn(lead, senior.email, senior.password);
  await lead.goto("/app/timesheet?tab=daily");
  await logWork(lead, { client: clientName, type: "TDS Work", hours: "2" });

  const remove = async (name: string) => {
    await page.getByRole("button", { name: "Delete", exact: true }).first().click();
    await page.getByLabel(/to confirm/).fill(name);
    await page.getByRole("button", { name: "Delete permanently" }).click();
  };

  // Staff member with attendance, timesheets, tasks as maker, allocations, a day report, compliance rows.
  await page.goto("/app/employees");
  await page.getByRole("link", { name: "Sonu Kumar" }).last().click();
  await page.waitForURL(/\/app\/employees\/[0-9a-f-]{36}/);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await remove("Sonu Kumar");
  await page.waitForURL(/\/app\/employees(\?|$)/);
  await expect(page.getByRole("link", { name: "Sonu Kumar" })).toHaveCount(0);
  await page.goto("/login");
  const gone = await (await browser.newContext()).newPage();
  await gone.goto("/login");
  await gone.getByLabel("Login ID or email").fill(staff.email);
  await gone.locator("#password").fill(staff.password);
  await gone.getByRole("button", { name: "Sign in" }).click();
  await expect(gone).toHaveURL(/\/login/);
  await expect(gone.getByRole("alert").first()).toBeVisible();
  await gone.context().close();
  // Their tasks stay.
  await page.goto("/app/tasks?scope=all&state=all");
  await expect(page.getByRole("link", { name: `Two reminders ${run}` }).last()).toBeVisible();

  // Client with tasks, allocations, pending items, dues, reports and hours.
  await page.goto(`/app/clients?q=${encodeURIComponent(clientName)}`);
  await page.getByRole("link", { name: clientName }).last().click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]{36}/);
  await remove(clientName);
  await page.waitForURL(/\/app\/clients(\?|$)/);
  await page.goto(`/app/clients?q=${encodeURIComponent(clientName)}`);
  await expect(page.getByText("No clients found")).toBeVisible();
  await lead.goto("/app/timesheet?tab=daily");
  await expect(lead.getByText(clientName).first()).toBeVisible();

  // Client with a portal login: the login stops working.
  await page.goto(`/app/clients?q=${encodeURIComponent(portalClient.name)}`);
  await page.getByRole("link", { name: portalClient.name }).last().click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]{36}/);
  await remove(portalClient.name);
  await page.waitForURL(/\/app\/clients(\?|$)/);
  const portal = await (await browser.newContext()).newPage();
  await portal.goto("/login");
  await portal.getByLabel("Login ID or email").fill(portalClient.email);
  await portal.locator("#password").fill(portalClient.newPassword);
  await portal.getByRole("button", { name: "Sign in" }).click();
  await expect(portal).toHaveURL(/\/login/);
  await portal.context().close();

  // The owner has no delete button on their own record; other entries can go too.
  await page.goto("/app/attendance?tab=team");
  const row = page.locator("#attendance-list tbody tr", { hasText: "Ramu Peon" });
  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(row.getByText("Not marked")).toBeVisible();
  await lead.context().close();
});
