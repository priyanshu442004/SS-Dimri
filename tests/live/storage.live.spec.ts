import { test, expect } from "@playwright/test";

// Live document storage check (DigitalOcean Spaces since 24 Nov 2026). Run AFTER live.spec.ts with the
// same LIVE_RUN so firm A and its client exist:  LIVE_RUN=<run> npx playwright test -c tests/live/playwright.live.config.ts storage
const run = process.env.LIVE_RUN;
const firmA = { email: `live-a-${run}@e2e.invalid`, password: "LiveA-Pass-12345" };
const clientName = `E2E Live Client ${run}`;

// A minimal valid one-page PDF.
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj " +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test("a client document uploads to private storage and downloads through a short-lived link", async ({ page }) => {
  test.skip(!run, "set LIVE_RUN to the run id used by live.spec.ts");
  await page.goto("/login");
  await page.getByLabel("Login ID or email").fill(firmA.email);
  await page.locator("#password").fill(firmA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  await page.goto("/app/clients");
  await page.getByRole("link", { name: clientName }).first().click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]+/);
  await page.goto(`${page.url().split("?")[0]}?tab=documents`);
  await page.getByLabel("Title").fill(`Storage check ${run}`);
  await page.getByLabel(/^File/).setInputFiles({ name: "storage-check.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Upload" }).click();
  const link = page.getByRole("link", { name: "View / download" }).first();
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;

  const res = await page.request.get(href, { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(res.status());
  const location = res.headers()["location"];
  expect(location).toMatch(/^https:\/\/[^/]*digitaloceanspaces\.com\//);
  expect(location).toContain("X-Amz-Signature=");

  const file = await page.request.get(location);
  expect(file.status()).toBe(200);
  expect(Buffer.from(await file.body()).equals(pdf)).toBe(true);

  // The same object without a signature is refused (bucket is private).
  const unsigned = await page.request.get(location.split("?")[0]);
  expect(unsigned.status()).toBe(403);
});
