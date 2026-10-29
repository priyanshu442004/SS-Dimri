import { expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { days, disconnect, expireInvitation, setAccountAge } from "./db";

// Full walk-through against the real app and database. Creates an organization
// whose owner email ends in @e2e.invalid; every other login created here also
// uses @e2e.invalid. `npm run test:e2e:cleanup` removes only those records.
// Requires an empty database (no other firm) so public client registration is
// routed to the test firm.
test.describe.configure({ mode: "serial" });
test.afterAll(disconnect);

const run = Date.now().toString(36);
const owner = { email: `owner-${run}@e2e.invalid`, password: "Owner-Pass-12345" };
const secondOwner = { email: `owner2-${run}@e2e.invalid`, password: "Owner2-Pass-12345" };
const staff = { email: `staff-${run}@e2e.invalid`, temp: "", password: "Staff-Pass-12345" };
const senior = { email: `senior-${run}@e2e.invalid`, temp: "", password: "Senior-Pass-12345" };
const ravi = { email: `ravi-${run}@e2e.invalid`, temp: "", password: "Ravi-Pass-12345" };

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
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
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
  await admin.getByLabel("Name", { exact: true }).fill(name);
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
  await expect(page.getByText("Partner 1")).toBeHidden(); // no visible per-person legend
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
  await form.getByRole("combobox", { name: "Client", exact: true }).selectOption({ label: clientName });
  await form.getByLabel("Team member").selectOption({ label: "Sonu Kumar — Executive" });
  await form.getByLabel("Role on this client").selectOption("JUNIOR");
  await form.getByRole("button", { name: "Allocate" }).click();
  await expect(page.getByText("Team member allocated.")).toBeVisible();
  await form.getByRole("combobox", { name: "Client", exact: true }).selectOption({ label: clientName });
  await form.getByLabel("Team member").selectOption({ label: "Sonu Kumar — Executive" });
  await form.getByRole("button", { name: "Allocate" }).click();
  await expect(page.getByText(/would allocate the team member at 200%/)).toBeVisible();
  await page.getByRole("link", { name: "Sonu Kumar" }).first().click();
  await expect(page.getByRole("heading", { name: "Allocation history" })).toBeVisible();
});

test("task: maker/checker cycle with waiting state; team member cannot cancel or open admin pages", async ({ browser }) => {
  const ownerPage = await (await browser.newContext()).newPage();
  await signIn(ownerPage, owner.email, owner.password);
  await ownerPage.goto("/app/tasks/new");
  await ownerPage.getByRole("textbox", { name: "Task", exact: true }).fill(`GSTR-3B September ${run}`);
  await ownerPage.getByRole("combobox", { name: "Client", exact: true }).selectOption({ label: clientName });
  await ownerPage.getByLabel("Priority").selectOption("HIGH");
  await ownerPage.getByLabel("Sonu Kumar — Executive · Junior").check();
  await ownerPage.getByLabel("Checker").selectOption({ label: "Kamal Rawat — Senior" });
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
  await signIn(page, staff.email, staff.password);
  await page.goto("/app/attendance");
  await page.getByRole("button", { name: "Mark in" }).click();
  await expect(page.getByText(/Marked in/)).toBeVisible();

  await page.goto("/app/timesheet");
  await page.getByRole("combobox", { name: "Client", exact: true }).first().selectOption({ label: clientName });
  await page.getByLabel("Place of work").fill("Client Office (Onsite)");
  await page.getByLabel("Type of work").selectOption({ label: "Bank Statement Posting" });
  await page.getByLabel("Bank name (bank / card work)").fill("HDFC Bank");
  await page.getByLabel("No. of transactions / entries").fill("120");
  await page.getByLabel("Time — hours").fill("3");
  await page.getByLabel("Minutes").fill("30");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByText("Entry added.")).toBeVisible();

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
  await seniorPage.goto("/app/timesheet?tab=collective");
  await seniorPage.locator('a[href^="/app/timesheet/"]').first().click();
  await seniorPage.waitForURL(/\/app\/timesheet\/[0-9a-f-]+$/);
  const entryUrl = seniorPage.url();
  await seniorPage.getByRole("button", { name: "Return for correction" }).click();
  await expect(seniorPage.getByText("Explain what needs to be corrected.")).toBeVisible(); // a reason is required
  await seniorPage.getByLabel("Review remark").fill("Transaction count looks wrong — please recheck.");
  await seniorPage.getByRole("button", { name: "Return for correction" }).click();
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
  await seniorPage.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(seniorPage.getByText("Marked as reviewed.")).toBeVisible();
  await seniorPage.reload();
  await expect(seniorPage.getByRole("button", { name: "Mark reviewed" })).toHaveCount(0);

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
  const generic = client.getByText("Request received.");
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

test("key pages fit a tablet viewport (768px) without horizontal scroll", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 768, height: 1024 } })).newPage();
  await signIn(page, owner.email, owner.password);
  for (const path of ["/app/admin", "/app/clients", "/app/tasks", "/app/timesheet?tab=collective", "/app/pending", "/app/reports/clients", "/app/dues", "/app/observations", "/app/profile", "/app/settings?tab=lists"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});

test("app and portal pages are usable at phone width (no horizontal page scroll)", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await signIn(page, owner.email, owner.password);
  for (const path of ["/app/admin", "/app/clients", "/app/clients/approvals", "/app/tasks", "/app/tasks?view=board", "/app/attendance", "/app/timesheet", "/app/pending", "/app/allocations", "/app/settings?tab=roles", "/app/dues", "/app/observations", "/app/profile"]) {
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
test("visual check screenshots at desktop, tablet and phone widths", async ({ browser }) => {
  const sizes = [{ name: "desktop", width: 1366, height: 900 }, { name: "tablet", width: 768, height: 1024 }, { name: "phone", width: 375, height: 812 }];
  const pages = ["/", "/register", "/app/admin", "/app/clients", "/app/tasks?view=board", "/app/timesheet?tab=collective", "/app/pending", "/app/observations", "/app/dues", "/app/reports/clients", "/app/settings?tab=lists"];
  for (const size of sizes) {
    const page = await (await browser.newContext({ viewport: { width: size.width, height: size.height } })).newPage();
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
