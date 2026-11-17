import { expect, test } from "@playwright/test";

// Screenshots of the assistant for a visual review (not an assertion suite). Run on demand:
//   npx playwright test -c tests/e2e-assistant/playwright.assistant.config.ts screens
const OUT = process.env.SCREENS_DIR ?? "test-results/assistant-screens";

for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`screens ${name}`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport })).newPage();
    await page.goto("/login");
    await page.getByLabel("Login ID or email").fill("owner@demo.invalid");
    await page.locator("#password").fill("DemoOwner#2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/app");
    await page.goto("/app/assistant");
    await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();
    await page.screenshot({ path: `${OUT}/${name}-1-empty.png` });
    const box = page.getByRole("textbox", { name: "Your question" });
    await box.fill("Who was late yesterday?");
    await box.press("Enter");
    await expect(page.getByRole("button", { name: "Copy answer" }).last()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${OUT}/${name}-2-late.png` });
    await box.fill("Which team members are loss-making? Show profit");
    await box.press("Enter");
    await expect(page.getByRole("heading", { name: "Team profit (₹)" })).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1200); // let the chart animation finish
    await page.screenshot({ path: `${OUT}/${name}-3-chart.png` });
  });
}
