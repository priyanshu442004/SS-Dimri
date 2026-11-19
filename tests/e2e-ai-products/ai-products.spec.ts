import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { AI_PRODUCTS } from "../../src/lib/ai-products";

const APPS = path.resolve(__dirname, "../../ai-products/apps");
const DEMO = { email: "demo@gmail.com", password: process.env.AIP_DEMO_PASSWORD ?? "Demo@12345" };
const OTHER = { email: process.env.AIP_OTHER_EMAIL ?? "owner@demo.invalid", password: process.env.AIP_OTHER_PASSWORD ?? "DemoOwner#2026" };

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // hydrated, so the form signs in instead of submitting natively
  await page.getByLabel("Login ID or email").fill(who.email);
  await page.locator("#password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // /app redirects on to the role's dashboard: wait for that before navigating elsewhere
  await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/app", { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
}
async function as(browser: Browser, who: { email: string; password: string }) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, who);
  return page;
}

const sample = (app: string, name: string) => {
  const dir = path.join(APPS, app, "frontend/public/samples");
  return { name, mimeType: mime(name), buffer: readFileSync(path.join(dir, name)) };
};
const mime = (n: string) =>
  n.endsWith(".pdf") ? "application/pdf" : n.endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const api = (slug: string, p: string) => `/ai-products/${slug}/api${p}`;

/** Download a report and check it is a real PDF / XLSX. */
async function download(req: APIRequestContext, url: string, kind: "pdf" | "xlsx") {
  const res = await req.get(url);
  expect(res.status(), url).toBe(200);
  const body = await res.body();
  expect(body.length, url).toBeGreaterThan(1500);
  expect(body.subarray(0, 4).toString("latin1"), url).toBe(kind === "pdf" ? "%PDF" : "PK\u0003\u0004");
}

type Run = { id: string; meta: { mail?: { status: string; to?: string[]; error?: string } } };
async function postRun(req: APIRequestContext, url: string, multipart: Record<string, unknown>) {
  const res = await req.post(url, { multipart: multipart as never, timeout: 540_000 });
  const text = await res.text();
  expect(res.status(), `${url}: ${text.slice(0, 400)}`).toBe(200);
  return JSON.parse(text) as Run;
}
function expectMailed(run: Run, product: string) {
  console.log(`  ${product}: run ${run.id}, mail ${JSON.stringify(run.meta.mail)}`);
  expect(run.meta.mail?.status, `${product} report email`).toBe("sent");
}

test.describe.configure({ mode: "serial" });

test("signed-out visitors cannot reach the AI products", async ({ request }) => {
  const page = await request.get("/ai-products/tds-return/", { maxRedirects: 0 });
  expect(page.status()).toBe(302);
  expect(page.headers().location).toBe("/app/ai-products");
  const apiRes = await request.get(api("tds-return", "/runs"), { maxRedirects: 0 });
  expect(apiRes.status()).toBe(401);
  expect((await request.get("/api/ai-products/auth")).status()).toBe(401);
  const erp = await request.get("/app/ai-products/tds-return", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(erp.status());
});

test("any other login sees no AI products and is refused everywhere", async ({ browser }) => {
  const page = await as(browser, OTHER);
  await page.goto("/app/profile");
  const nav = page.getByRole("navigation", { name: "Application" });
  await expect(nav.getByRole("link", { name: "My profile" })).toBeVisible();
  await expect(nav.getByText("AI products", { exact: true })).toHaveCount(0);
  for (const p of AI_PRODUCTS) await expect(nav.getByRole("link", { name: p.short, exact: true })).toHaveCount(0);

  await page.goto("/app/ai-products/bank-reconciliation");
  await expect(page).toHaveURL(/\/app\/no-access$/);
  await page.goto("/app/ai-products");
  await expect(page).toHaveURL(/\/app\/no-access$/);

  expect((await page.request.get("/api/ai-products/auth")).status()).toBe(403);
  for (const p of AI_PRODUCTS) {
    const site = await page.request.get(`/ai-products/${p.slug}/`, { maxRedirects: 0 });
    expect(site.status(), p.slug).toBe(302);
    const a = await page.request.get(api(p.slug, "/health"), { maxRedirects: 0 });
    expect(a.status(), p.slug).toBe(401);
  }
  await page.context().close();
});

test.describe("demo@gmail.com", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await as(browser, DEMO);
  });
  test.afterAll(async () => page.context().close());

  test("sidebar lists the nine AI products and each one opens inside the ERP", async () => {
    await page.goto("/app/ai-products");
    const nav = page.getByRole("navigation", { name: "Application" });
    await expect(nav.getByText("AI products", { exact: true })).toBeVisible();
    for (const p of AI_PRODUCTS) await expect(nav.getByRole("link", { name: p.short, exact: true })).toBeVisible();
    expect((await page.request.get("/api/ai-products/auth")).status()).toBe(204);

    for (const p of AI_PRODUCTS) {
      await nav.getByRole("link", { name: p.short, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/app/ai-products/${p.slug}$`));
      const frame = page.frameLocator(`iframe[title="${p.name}"]`);
      // every product's own shell has a "back to AI products" link and its own navigation
      await expect(frame.getByRole("link", { name: "AI products" }).first()).toBeAttached({ timeout: 60_000 });
      const health = await page.request.get(api(p.slug, "/health"));
      if (p.slug !== "financial-reporting") expect(health.status(), p.slug).toBe(200);
      await page.screenshot({ path: `test-results/ai-products/${p.slug}.png` });
    }
  });

  test("Invoice Automation: ten invoice PDFs → register, report PDF/XLSX, email", async () => {
    const dir = path.join(APPS, "invoice-automation/frontend/public/samples");
    const files = readdirSync(dir).filter((f) => f.endsWith(".pdf")).map((f) => sample("invoice-automation", f));
    const form = new FormData();
    form.append("batchName", "E2E sample batch");
    for (const f of files) form.append("invoices", new Blob([new Uint8Array(f.buffer)], { type: f.mimeType }), f.name);
    const r = await page.request.fetch(api("invoice-automation", "/batches"), { method: "POST", multipart: form, timeout: 540_000 });
    const text = await r.text();
    expect(r.status(), text.slice(0, 400)).toBe(200);
    const run = JSON.parse(text) as Run & { batch: { invoices?: unknown[] } };
    expectMailed(run, "Invoice Automation");
    await download(page.request, api("invoice-automation", `/runs/${run.id}/pdf`), "pdf");
    await download(page.request, api("invoice-automation", `/runs/${run.id}/xlsx`), "xlsx");
  });

  test("Bank Reconciliation: statement + ledger → reconciliation, report, email", async () => {
    const run = await postRun(page.request, api("bank-reconciliation", "/reconcile"), {
      bank: sample("bank-reconciliation", "sample_bank_statement.csv"),
      books: sample("bank-reconciliation", "sample_books_ledger.csv"),
      tolerance: "3",
      signMode: "auto",
      accountName: "E2E Current Account",
    });
    expectMailed(run, "Bank Reconciliation");
    await download(page.request, api("bank-reconciliation", `/runs/${run.id}/pdf`), "pdf");
    await download(page.request, api("bank-reconciliation", `/runs/${run.id}/xlsx`), "xlsx");
  });

  test("Financial Statement Analysis: four statements → health report, email, AI chat", async () => {
    const run = await postRun(page.request, api("virtual-cfo", "/analyses"), {
      balanceSheet: sample("virtual-cfo", "balance_sheet.pdf"),
      profitLoss: sample("virtual-cfo", "profit_and_loss.pdf"),
      cashFlow: sample("virtual-cfo", "cash_flow.pdf"),
      ratios: sample("virtual-cfo", "ratio_analysis.pdf"),
    });
    expectMailed(run, "Financial Statement Analysis");
    await download(page.request, api("virtual-cfo", `/runs/${run.id}/pdf`), "pdf");
    await chat(page.request, "virtual-cfo", run.id, "In one sentence, what is the overall health score?");
  });

  for (const [slug, label, slots] of [
    ["tds-return", "TDS Returns", { payments: "01_Payment_Ledger.xlsx", vendors: "02_Vendor_Master.xlsx", challans: "03_TDS_Challan_Register.xlsx", notes: "04_TDS_Expected_Test_Notes.csv" }],
    ["vendor-ledger", "Vendor Ledger", { books: "01_Books_Vendor_Ledger.xlsx", statement: "02_Supplier_Statement.xlsx", master: "03_Vendor_Master.xlsx", notes: "04_Test_Scenarios.csv" }],
    ["customer-ledger", "Customer Ledger", { books: "01_Company_Customer_Ledger.xlsx", statement: "02_Customer_Statement.xlsx", master: "03_Customer_Master.xlsx", notes: "04_Test_Scenarios.csv" }],
  ] as const) {
    test(`${label}: sample files → report PDF/XLSX, email, AI chat`, async () => {
      const multipart = Object.fromEntries(Object.entries(slots).map(([k, f]) => [k, sample(slug, f)]));
      const run = await postRun(page.request, api(slug, "/process"), multipart);
      expectMailed(run, label);
      await download(page.request, api(slug, `/runs/${run.id}/pdf`), "pdf");
      await download(page.request, api(slug, `/runs/${run.id}/xlsx`), "xlsx");
      if (slug === "tds-return") await chat(page.request, slug, run.id, "How many exceptions are there? Answer in one sentence.");
    });
  }

  test("Fixed Assets: register, additions, disposals, policy + invoice → rollforward, email", async () => {
    const form = new FormData();
    const add = (k: string, f: string) => {
      const s = sample("fixed-asset-register", f);
      form.append(k, new Blob([new Uint8Array(s.buffer)], { type: s.mimeType }), s.name);
    };
    add("register", "01_Existing_Fixed_Asset_Register.xlsx");
    add("additions", "02_Current_Year_Additions.xlsx");
    add("disposals", "03_Disposals.xlsx");
    add("policy", "04_Depreciation_Policy.xlsx");
    add("invoice", "05_Sample_Capital_Invoice.pdf");
    const r = await page.request.fetch(api("fixed-asset-register", "/process"), { method: "POST", multipart: form, timeout: 540_000 });
    const text = await r.text();
    expect(r.status(), text.slice(0, 400)).toBe(200);
    const run = JSON.parse(text) as Run;
    expectMailed(run, "Fixed Assets");
    await download(page.request, api("fixed-asset-register", `/runs/${run.id}/pdf`), "pdf");
    await download(page.request, api("fixed-asset-register", `/runs/${run.id}/xlsx`), "xlsx");
  });

  test("GST Reconciliation: annual package → GSTR-9 / 9C workings and reports", async () => {
    const req = page.request;
    const created = await req.post(api("gst-reconciliation", "/cases"), {
      data: { legal_name: "E2E Sample Traders", gstin: "09AAACS1234K1Z5", financial_year: "2024-25" },
    });
    expect(created.status(), await created.text()).toBe(200);
    const caseId = (await created.json()).id as string;
    const form = new FormData();
    const dir = path.join(APPS, "gst-reconciliation/frontend/public/samples");
    for (const f of readdirSync(dir)) {
      const s = sample("gst-reconciliation", f);
      form.append("files", new Blob([new Uint8Array(s.buffer)], { type: s.mimeType }), s.name);
    }
    const up = await req.fetch(api("gst-reconciliation", `/cases/${caseId}/files`), { method: "POST", multipart: form });
    expect(up.status(), await up.text()).toBe(200);
    const run = await req.post(api("gst-reconciliation", `/cases/${caseId}/run`), { timeout: 540_000 });
    const text = await run.text();
    expect(run.status(), text.slice(0, 400)).toBe(200);
    const detail = await (await req.get(api("gst-reconciliation", `/cases/${caseId}`))).json();
    console.log(`  GST: case ${caseId}, status ${detail.status}, ${detail.files?.length} files`);
    const result = JSON.parse(text).result as { reports?: Record<string, string> | { filename?: string }[] };
    const names = JSON.stringify(result).match(/[\w .()-]+\.(?:xlsx|pdf)/g) ?? [];
    const report = names.find((n) => !readdirSync(dir).includes(n));
    expect(report, "a generated report file").toBeTruthy();
    const dl = await req.get(api("gst-reconciliation", `/cases/${caseId}/reports/${encodeURIComponent(report!)}`));
    expect(dl.status()).toBe(200);
    expect((await dl.body()).length).toBeGreaterThan(1000);
  });

  test("Trial Balance: upload a trial balance in the app → preview, statements emailed", async () => {
    // the product's own upload page ("Open in new tab" from the ERP)
    await page.goto("/ai-products/financial-reporting/dashboard/trial-balance/summary");
    const mailed = page.waitForResponse((r) => r.url().includes("/ai-products/financial-reporting/api/mail/financial-report"), { timeout: 300_000 });
    await page.locator('input[type="file"]').first().setInputFiles(path.join(APPS, "financial-reporting/public/new_tb.xlsx"));
    await page.getByRole("button", { name: "Start AI Processing" }).click();
    await page.waitForURL(/trial-balance-preview/, { timeout: 300_000 });
    const res = await mailed;
    expect(res.status()).toBe(202); // queued; the backend log shows "Financial report mailed"
    await page.screenshot({ path: "test-results/ai-products/financial-reporting-after-upload.png" });
  });
});

/** Ask the product's AI chat one question; the answer must stream back through nginx (SSE). */
async function chat(req: APIRequestContext, slug: string, runId: string, message: string) {
  const res = await req.post(api(slug, `/runs/${runId}/chat`), { data: { message }, timeout: 180_000 });
  const body = await res.text();
  expect(res.status(), body.slice(0, 300)).toBe(200);
  const deltas = body.split("\n").filter((l) => l.startsWith("data:")).map((l) => { try { return JSON.parse(l.slice(5)); } catch { return {}; } });
  const answer = deltas.map((d) => d.delta ?? "").join("");
  console.log(`  ${slug} chat: ${answer.slice(0, 160).replace(/\s+/g, " ")}`);
  expect(deltas.some((d) => d.error), JSON.stringify(deltas.find((d) => d.error))).toBe(false);
  expect(answer.length).toBeGreaterThan(10);
}
