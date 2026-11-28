import { expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";
import nodemailer from "nodemailer";
import { loadEnvConfig } from "@next/env";
import { applyLocalNeonProxy } from "../../src/lib/neon-local";

// Careers (28 Nov 2026), end to end against the real app:
//  · a team member uploads resumes (one at a time), chooses the right address when a resume has
//    several, and sees their own uploads with the time; they cannot see the admin view;
//  · the administrator sees every resume, who uploaded and who referred it;
//  · REAL MAIL ROUND TRIP (when CAREERS_E2E_MAILBOX=1): a resume whose address is the firm's own
//    careers mailbox is uploaded, the email really goes out, a reply is sent back in the same thread,
//    and the open admin page shows the reply and its details BY ITSELF — nobody clicks Refresh.
// Every other address used is @e2e.invalid (never sent). Run against the local test database only.
test.describe.configure({ mode: "serial" });

loadEnvConfig(process.cwd());
applyLocalNeonProxy();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.afterAll(() => pool.end());

const run = process.env.E2E_RUN ?? Date.now().toString(36);
const owner = { email: `cv-owner-${run}@e2e.invalid`, password: "Owner-Pass-12345" };
const staff = { email: `cv-staff-${run}@e2e.invalid`, temp: "", password: "Staff-Pass-12345" };
const MAILBOX = (process.env.IMAP_USER || process.env.SMTP_USER || "").toLowerCase();
const REAL_MAIL = process.env.CAREERS_E2E_MAILBOX === "1" && !!MAILBOX;

async function signIn(page: Page, id: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Login ID or email").fill(id);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/app");
}

async function mailTo(email: string, template: string) {
  const file = path.join("test-results", "mail", `${email.toLowerCase()}--${template}.json`);
  await expect.poll(() => existsSync(file), { timeout: 20_000 }).toBe(true);
  return JSON.parse(readFileSync(file, "utf8")) as { to: string; subject: string; text: string };
}

/** A resume as a real PDF, printed by the browser. */
async function resumePdf(browser: Browser, html: string) {
  const p = await (await browser.newContext()).newPage();
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;font-size:11pt;margin:30px} h1{font-size:26pt}</style></head><body>${html}</body></html>`);
  const buf = await p.pdf({ format: "A4" });
  await p.context().close();
  return buf;
}

const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/visual/careers-${name}.png`, fullPage: true });

let staffPage: Page;
let adminPage: Page;

test("set up: a firm, its owner and a team member", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/register/firm");
  await page.getByLabel("Your full name").fill("E2E Owner");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(owner.password);
  await page.getByLabel("Confirm password").fill(owner.password);
  await page.getByLabel("Trade name").fill(`CAREERS TEST FIRM ${run}`);
  await page.getByLabel("PAN").first().fill("AGBPD7743C");
  await page.getByLabel("Constitution").selectOption({ label: "Proprietorship" });
  await page.getByRole("textbox", { name: "Full name", exact: true }).fill("E2E Owner");
  await page.getByLabel("Number of employees").fill("5");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app\/admin/);
  adminPage = page;

  await page.goto("/app/employees/new");
  await page.getByLabel("Full name").fill("Sonu Kumar");
  await page.getByLabel("Email").fill(staff.email);
  await page.getByLabel("Mobile").fill("9876543210");
  await page.getByLabel("Role").selectOption({ label: "Team member" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Invitation created/)).toBeVisible();
  staff.temp = /Temporary password: (\S+)/.exec((await mailTo(staff.email, "staff.invitation")).text)![1];

  staffPage = await (await browser.newContext()).newPage();
  await signIn(staffPage, staff.email, staff.temp);
  await staffPage.getByRole("textbox", { name: "New password", exact: true }).fill(staff.password);
  await staffPage.getByRole("textbox", { name: "Confirm new password" }).fill(staff.password);
  await staffPage.getByRole("button", { name: /Save/ }).click();
  await staffPage.waitForURL(/\/app\/onboarding/);
  await staffPage.getByLabel("PAN", { exact: true }).fill("FFNPS3234F");
  await staffPage.getByLabel("Aadhaar number").fill("234567890123");
  await staffPage.getByLabel("Current address").fill("B-139, Aali Vihar, New Delhi");
  await staffPage.getByLabel(/submit for approval/).check();
  await staffPage.getByRole("button", { name: "Save", exact: true }).click();
  await expect(staffPage.getByRole("heading", { name: "Your details are under review" })).toBeVisible();
  await page.goto("/app/employees?status=review");
  await page.getByRole("link", { name: "Sonu Kumar" }).first().click();
  await page.waitForURL(/\/app\/employees\/[0-9a-f-]{36}/);
  await page.getByLabel("Permanent employee ID").fill(`CV-${run}`.slice(0, 12).toUpperCase());
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/Approved\. Permanent ID/)).toBeVisible();
});

test("a team member uploads a resume: the address is read from it, and their history shows it with the time", async ({ browser }) => {
  const page = staffPage;
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto("/app/careers");
  await expect(page.getByRole("heading", { name: "Careers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Careers" }).first()).toBeVisible(); // in the sidebar
  await expect(page.getByText("You have not uploaded a resume yet")).toBeVisible();

  const email = `asha.rawat-${run}@e2e.invalid`;
  const buf = await resumePdf(browser, `<h1>Asha Rawat</h1><p>${email} · +91 98111 22334</p><h2>Experience</h2><p>GST returns.</p>`);
  await page.locator("#resume").setInputFiles({ name: "Asha Rawat CV.pdf", mimeType: "application/pdf", buffer: buf });
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Found in the resume", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Candidate's name")).toHaveValue("Asha Rawat");
  await expect(page.getByText("+919811122334")).toBeVisible();
  await expect(page.getByText(/Saved as referred by/)).toBeVisible();
  await page.getByRole("button", { name: "Upload & email candidate" }).click();
  await expect(page.getByText(/Resume saved/).first()).toBeVisible();
  // History: the upload with its time, the address the email went to, and "Self".
  const item = page.locator("li").filter({ hasText: "Asha Rawat" });
  await expect(item).toBeVisible();
  await expect(item).toContainText(email);
  await expect(item).toContainText("(self)");
  await expect(item).toContainText(/Uploaded\d{1,2} \w{3}, \d{2}:\d{2} [ap]m/);
  await expect(item.getByText("Test address (not sent)")).toBeVisible();
  await shot(page, "0-staff-history");
  await expect(item.getByText("Already emailed")).toHaveCount(0);
  const mail = await mailTo(email, "careers.resume_ack");
  expect(mail.text).toContain("Dear Asha Rawat,");
  expect(mail.text).toContain("Recruitment Team!");
  expect(mail.subject).toMatch(/\[Ref CV-[A-Z0-9]{6}\]/);
  expect(problems).toEqual([]);
});

test("several addresses: nothing is chosen for them; the referee's is marked; referred by someone else", async ({ browser }) => {
  const page = staffPage;
  const own = `meera-${run}@e2e.invalid`;
  const referee = `rk.arora-${run}@e2e.invalid`;
  const buf = await resumePdf(browser, `<h1>Meera Iyer</h1><p>${own}</p><h2>Experience</h2><p>Audit.</p><h2>References</h2><p>Mr R K Arora — ${referee}</p>`);
  await page.locator("#resume").setInputFiles({ name: "meera.pdf", mimeType: "application/pdf", buffer: buf });
  await expect(page.getByText("This resume has 2 addresses")).toBeVisible();
  await shot(page, "1-staff-choose-address");
  await expect(page.getByText(/References section/)).toBeVisible();
  await page.getByRole("radio", { name: "Someone else" }).check({ force: true });
  await page.getByLabel("Referred by").fill("Deepak Bisht");
  await page.getByRole("button", { name: "Upload & email candidate" }).click();
  await expect(page.getByText("Choose the candidate's email address").first()).toBeVisible(); // not sent without a choice
  await page.getByRole("radio", { name: new RegExp(own.replace(/[.]/g, "\\.")) }).check();
  await page.getByRole("button", { name: "Upload & email candidate" }).click();
  await expect(page.getByText(/Resume saved/).first()).toBeVisible();
  await mailTo(own, "careers.resume_ack");
  expect(existsSync(path.join("test-results", "mail", `${referee}--careers.resume_ack.json`))).toBe(false);

  // Uploading the same person again asks first, and does not email them twice.
  await page.locator("#resume").setInputFiles({ name: "meera-again.pdf", mimeType: "application/pdf", buffer: buf });
  await page.getByRole("radio", { name: new RegExp(own.replace(/[.]/g, "\\.")) }).check();
  await expect(page.getByText(/Already uploaded on/)).toBeVisible();
  page.once("dialog", (d) => { expect(d.message()).toContain("already uploaded"); void d.accept(); });
  await page.getByRole("button", { name: "Upload & email candidate" }).click();
  await expect(page.getByText(/Resume saved/).first()).toBeVisible();
});

test("a team member cannot open the admin view or the export", async () => {
  const page = staffPage;
  const res = await page.request.get("/app/careers/export");
  expect(res.status()).toBe(404);
  await page.goto("/app/careers?tab=all");
  await expect(page.getByRole("link", { name: "All resumes" })).toHaveCount(0);
  await expect(page.getByText("Uploaded by")).toHaveCount(0);
});

test("the administrator sees every resume, who uploaded and who referred it, and the email sent", async () => {
  const page = adminPage;
  await page.goto("/app/careers");
  await expect(page.getByRole("link", { name: /All resumes/ })).toBeVisible();
  const row = page.locator("tr").filter({ hasText: "Meera Iyer" }).filter({ hasText: "Deepak Bisht" });
  await expect(row).toContainText("Deepak Bisht");
  await expect(row).toContainText("Referred by someone else");
  await expect(row).toContainText("Sonu Kumar"); // uploaded by
  await expect(page.locator("tr").filter({ hasText: "Asha Rawat" })).toContainText("Self");
  await shot(page, "2-admin-list");
  await page.setViewportSize({ width: 375, height: 800 });
  await shot(page, "2b-admin-list-phone");
  await page.setViewportSize({ width: 1440, height: 900 });
  await row.getByRole("link", { name: "Open" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText(/Email to meera-/)).toBeVisible();
  await panel.getByText("Show the email that was sent").click();
  await expect(panel.getByText("Dear Meera Iyer,")).toBeVisible();
  await panel.getByLabel("Status").selectOption({ label: "Shortlisted" });
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  const xlsx = await page.request.get("/app/careers/export");
  expect(xlsx.status()).toBe(200);
});

test("real email round trip: the reply appears on the open admin page by itself", async ({ browser }) => {
  test.skip(!REAL_MAIL, "Set CAREERS_E2E_MAILBOX=1 (uses the firm's own mailbox, nothing else).");
  test.setTimeout(420_000);
  const page = staffPage;
  // The candidate's address is the careers mailbox itself, so the email stays in the firm's own mailbox.
  const buf = await resumePdf(browser, `<h1>Mailbox Test Candidate</h1><p>${MAILBOX}</p><h2>Experience</h2><p>Test resume (${run}).</p>`);
  await page.locator("#resume").setInputFiles({ name: "mailbox-test.pdf", mimeType: "application/pdf", buffer: buf });
  await expect(page.getByText(MAILBOX, { exact: true }).first()).toBeVisible();
  await page.getByLabel("Candidate's name").fill(`Mailbox Test ${run}`);
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Upload & email candidate" }).click();
  await expect(page.getByText(`Resume saved and the email is on its way to ${MAILBOX}.`).first()).toBeVisible({ timeout: 60_000 });

  const { rows } = await pool.query<{ id: string; ref: string; mail_status: string; mail_message_ids: string[] }>(
    "SELECT id, ref, mail_status, mail_message_ids FROM resume_submissions WHERE candidate_name = $1", [`Mailbox Test ${run}`]);
  expect(rows[0].mail_status).toBe("SENT");
  const sentId = rows[0].mail_message_ids[0];
  expect(sentId).toMatch(/^careers\.cv-/);

  // The admin opens Careers and leaves it open. Nobody clicks anything from here on.
  await adminPage.goto("/app/careers");
  const row = adminPage.locator("tr").filter({ hasText: `Mailbox Test ${run}` });
  await expect(row).toContainText("Waiting for reply");

  // The candidate replies in the same thread.
  const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 465), secure: Number(process.env.SMTP_PORT ?? 465) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await t.sendMail({
    from: MAILBOX, to: MAILBOX, subject: `Re: Thank you for sharing your resume [Ref ${rows[0].ref}]`,
    inReplyTo: `<${sentId}>`, references: `<${sentId}>`,
    text: `Hello,\n\nCurrent/Last Drawn CTC: 4.2 LPA\nExpected CTC: 6 LPA\nNotice Period / Earliest Joining Date: 30 days\nPreferred Time Slots for an Interview: Weekdays after 4 pm\nCurrent Location: Noida\n\nRegards\n\nOn Fri, 28 Nov 2026, Recruitment wrote:\n> Current/Last Drawn CTC\n> Expected CTC\n`,
  });
  // The open page picks it up on its own.
  await expect(row).toContainText("Replied", { timeout: 300_000 });
  await expect(row).toContainText("4.2 LPA");
  await row.getByRole("link", { name: "Open" }).click();
  const panel = adminPage.getByRole("dialog");
  for (const v of ["4.2 LPA", "6 LPA", "30 days", "Weekdays after 4 pm", "Noida"]) await expect(panel.getByText(v, { exact: true }).first()).toBeVisible();
  await expect(panel.getByText(/Reply from/)).toBeVisible();
  // Exactly one reply stored, even though several checks ran; the copy of our own email was not taken for a reply.
  const replies = await pool.query("SELECT count(*)::int n FROM candidate_replies WHERE submission_id = $1 AND kind = 'REPLY'", [rows[0].id]);
  expect(replies.rows[0].n).toBe(1);
  const saved = await pool.query("SELECT current_ctc, expected_ctc, notice_period, interview_slots, current_location, reply_count FROM resume_submissions WHERE id = $1", [rows[0].id]);
  expect(saved.rows[0]).toEqual({ current_ctc: "4.2 LPA", expected_ctc: "6 LPA", notice_period: "30 days", interview_slots: "Weekdays after 4 pm", current_location: "Noida", reply_count: 1 });

  // The administrator writes back from the panel: a real email in the same conversation.
  await panel.getByLabel("Message to the candidate").fill(`Thank you. Could you confirm your expected CTC once more? (${run})`);
  await panel.getByRole("button", { name: "Send to the candidate" }).click();
  await expect(adminPage.getByText("Sent to the candidate. Their answer will appear here.").first()).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByText(/Follow-up by/)).toBeVisible();
  const fu = await pool.query<{ message_id: string; status: string; subject: string }>("SELECT message_id, status, subject FROM candidate_replies WHERE submission_id = $1 AND kind = 'FOLLOW_UP'", [rows[0].id]);
  expect(fu.rows[0].status).toBe("SENT");
  expect(fu.rows[0].subject.match(/\[Ref CV-/g)?.length).toBe(1);

  // The candidate answers the follow-up: matched through the follow-up's own Message-ID, newer value replaces the old one.
  await t.sendMail({
    from: MAILBOX, to: MAILBOX, subject: `Re: Re: Thank you for sharing your resume [Ref ${rows[0].ref}]`,
    inReplyTo: `<${fu.rows[0].message_id}>`, references: `<${sentId}> <${fu.rows[0].message_id}>`,
    text: `Sure — Expected CTC: 6.5 LPA\n\nThanks`,
  });
  await expect(panel.getByText("6.5 LPA", { exact: true }).first()).toBeVisible({ timeout: 300_000 });
  await expect(panel.getByText("Noida", { exact: true }).first()).toBeVisible(); // a field the new reply did not mention is kept
  await adminPage.setViewportSize({ width: 1440, height: 1000 });
  await shot(adminPage, "3-admin-panel-conversation");
  await panel.evaluate((el) => el.querySelector(".overflow-y-auto")?.scrollTo(0, 99999));
  await adminPage.screenshot({ path: "test-results/visual/careers-4-admin-panel-bottom.png" });
  await adminPage.keyboard.press("Escape");
  await shot(adminPage, "5-admin-list-replied");
  const after = await pool.query("SELECT expected_ctc, reply_count FROM resume_submissions WHERE id = $1", [rows[0].id]);
  expect(after.rows[0]).toEqual({ expected_ctc: "6.5 LPA", reply_count: 2 });
});
