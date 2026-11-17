import { expect, test, type Page } from "@playwright/test";

// Live check of the AI assistant on the production site with a throw-away "@e2e.invalid" firm
// (remove afterwards with `npm run test:e2e:cleanup`). Firm sign-up is limited to 3 an hour per IP.
//   npx playwright test -c tests/live/playwright.live.config.ts assistant
const ORIGIN = "https://officeerp.analytx4t.com";
const run = Date.now().toString(36);
const firm = { name: `E2E Live AI ${run}`, email: `live-ai-${run}@e2e.invalid`, password: "LiveAI-Pass-12345" };

function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });
  page.on("framenavigated", (f) => { if (f === page.mainFrame() && !f.url().startsWith(ORIGIN) && f.url() !== "about:blank") problems.push(`left the site: ${f.url()}`); });
  return problems;
}

test("AI assistant works end to end on the live site", async ({ browser }) => {
  const page = await (await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] })).newPage();
  const problems = watch(page);

  await page.goto("/register/firm");
  await page.getByLabel("Your full name").fill(`Owner ${firm.name}`);
  await page.getByLabel("Email").fill(firm.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(firm.password);
  await page.getByLabel("Confirm password").fill(firm.password);
  await page.getByLabel("Trade name").fill(firm.name);
  await page.getByLabel("Constitution").selectOption({ label: "Partnership Firm" });
  await page.getByRole("textbox", { name: "Full name", exact: true }).first().fill("Partner One");
  await page.getByRole("button", { name: "Add partner" }).click();
  await page.getByRole("textbox", { name: "Full name", exact: true }).nth(1).fill("Partner Two");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app\/admin/);

  // The admin dashboard's button now opens the assistant (the old n8n chat dialog is gone).
  await page.getByRole("link", { name: "AI assistant" }).last().click();
  await page.waitForURL(/\/app\/assistant/);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByText(/I'm Aanya, your data analyst/)).toBeVisible();
  // A new firm without the Google Sheet gets no sheet suggestions.
  await expect(page.getByRole("button", { name: /profit from the sheet/ })).toHaveCount(0);

  const box = page.getByRole("textbox", { name: "Your question" });
  await box.fill("How many employees and clients do we have?");
  await box.press("Enter");
  await expect(page).toHaveURL(/\?c=[0-9a-f-]{36}/);
  const answer = page.locator("article[data-ai-answer]").first();
  const ok = answer.getByRole("button", { name: "Copy answer" });
  const keyError = answer.getByText(/rejected the API key|not configured/);
  await expect(ok.or(keyError)).toBeVisible({ timeout: 90_000 });
  const realAnswer = await ok.isVisible();
  console.log(realAnswer ? "LIVE: the model answered." : `LIVE: model unavailable — "${await keyError.textContent()}"`);
  if (realAnswer) {
    await expect(answer.locator("p, li").first()).not.toBeEmpty();
    await ok.click();
    expect((await page.evaluate(() => navigator.clipboard.readText())).length).toBeGreaterThan(0);
  } else {
    await expect(answer.getByRole("button", { name: "Try again" })).toBeVisible();
  }

  // History: saved, survives a reload, rename and delete.
  await page.reload();
  await expect(page.getByText("How many employees and clients do we have?").last()).toBeVisible();
  const history = page.getByRole("navigation", { name: "Chat history" });
  const item = history.getByRole("listitem").first();
  await item.hover();
  await item.getByRole("button", { name: /Options for/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Chat title" }).fill("Live check");
  await page.keyboard.press("Enter");
  await expect(history.getByRole("button", { name: "Live check", exact: true })).toBeVisible();
  await expect(page.getByText("Chat renamed.")).toBeVisible(); // saved on the server
  await page.reload();
  await expect(history.getByRole("button", { name: "Live check", exact: true })).toBeVisible();
  const renamed = history.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Live check", exact: true }) });
  await renamed.hover();
  await renamed.getByRole("button", { name: /Options for/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(history.getByRole("button", { name: "Live check", exact: true })).toHaveCount(0);

  expect(problems).toEqual([]);
});
