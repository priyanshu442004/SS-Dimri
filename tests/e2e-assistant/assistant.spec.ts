import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Login ID or email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const composer = (page: Page) => page.getByRole("textbox", { name: "Your question" });
async function ask(page: Page, q: string) {
  await expect(page.getByRole("button", { name: "Send", exact: true }).last()).toBeVisible(); // idle (not streaming)
  await composer(page).fill(q);
  await composer(page).press("Enter");
}
const answers = (page: Page) => page.locator("article[data-ai-answer]");

test.describe.configure({ mode: "serial" });

test("owner: ask, visuals, follow-up, select-to-ask, copy, regenerate, edit, stop, history", async ({ page }) => {
  await signIn(page, "owner@demo.invalid", "DemoOwner#2026");
  await page.getByRole("link", { name: "AI assistant" }).first().click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Demo/ })).toBeVisible();
  // Start from an empty history (also exercises "Clear all chats").
  const clearAll = page.getByRole("button", { name: "Clear all chats" });
  if (await clearAll.isVisible()) {
    await clearAll.click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Your chats will appear here.")).toBeVisible();
  }

  // 1. Suggestion → tool step, KPI cards, table, follow-up, saved chat with a title.
  await page.getByRole("button", { name: /Who was late yesterday\?/ }).click();
  const first = answers(page).first();
  await expect(first.getByText(/Checked 1 source · ERP database/)).toBeVisible();
  await expect(first.getByText("Late", { exact: true }).first()).toBeVisible();
  await expect(first.getByRole("heading", { name: "Late arrivals" })).toBeVisible();
  await expect(first.getByText(/people\*?\*? were late|were late on/)).toBeVisible();
  await expect(page).toHaveURL(/\?c=[0-9a-f-]{36}/);
  await expect(page.getByRole("navigation", { name: "Chat history" }).getByText("Late Arrivals Review")).toBeVisible();
  const followUp = first.getByRole("button", { name: /Who was late most often this month\?/ });
  await expect(followUp).toBeVisible();

  // 1b. "Ask AI" on a KPI card quotes that card into the composer.
  await first.getByText("Late", { exact: true }).first().hover();
  await first.getByRole("button", { name: "Ask AI about Late" }).click();
  await expect(page.getByText(/Asking about: KPI "Late"/)).toBeVisible();
  await page.getByRole("button", { name: "Remove selected text" }).click();

  // 2. Copy the whole answer: Markdown with the KPI list and the table.
  await first.getByRole("button", { name: "Copy answer" }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("**Late:**");
  expect(clip).toContain("| Name | In | Minutes late | Reason |");

  // 3. Follow-up chip sends the suggested question.
  await followUp.click();
  await expect(answers(page)).toHaveCount(2);
  await expect(answers(page).nth(1).getByRole("button", { name: "Copy answer" })).toBeVisible();

  // 4. Select one late reason in the table → Ask AI → the question carries only that excerpt.
  const reasonCell = answers(page).nth(1).locator("tbody tr").first().locator("td").nth(3);
  const reason = (await reasonCell.innerText()).trim();
  await reasonCell.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(page.getByText(`Asking about: ${reason}`)).toBeVisible();
  await ask(page, "Who else was late for this reason?");
  await expect(answers(page)).toHaveCount(3);
  await expect(answers(page).nth(2).getByText(/Found \d+ late arrivals for that reason/)).toBeVisible();
  await expect(page.locator("div").filter({ hasText: reason }).first()).toBeVisible(); // quote shown above the question

  // 5. Regenerate the last answer: same number of answers, fresh text.
  await answers(page).nth(2).getByRole("button", { name: "Regenerate answer" }).click();
  await expect(answers(page)).toHaveCount(3);
  await expect(answers(page).nth(2).getByText(/Found \d+ late arrivals/)).toBeVisible();

  // 6. Stop mid-answer: the button turns into Stop, the partial answer stays.
  await ask(page, "Please stream slowly");
  await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible();
  await expect(answers(page).nth(3).getByText(/This is a long answer/)).toBeVisible();
  await page.getByRole("button", { name: "Stop generating" }).click();
  await expect(answers(page).nth(3).getByText("Stopped.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true }).last()).toBeVisible();

  // 7. Edit an earlier question: later messages are replaced.
  const firstQuestion = page.getByText("Please stream slowly", { exact: true });
  await firstQuestion.hover();
  await page.getByRole("button", { name: "Edit and resend" }).last().click();
  await page.getByRole("textbox", { name: "Edit your question" }).fill("Which tasks are overdue?");
  await page.getByRole("button", { name: "Send", exact: true }).first().click();
  await expect(answers(page)).toHaveCount(4);
  await expect(answers(page).nth(3).getByText("Overdue tasks").first()).toBeVisible();
  // Names, not ids, label the chart (groupBy ids are resolved to people).
  await expect(answers(page).nth(3).getByText(/Kirpal Singh|Gaurav Sharma|Ginesh Rawat|Neha Kapoor|Ravi Kumar|Pooja Mehta|Amit Joshi|Sunita Negi/).first()).toBeVisible();

  // 8. Feedback.
  await answers(page).nth(3).getByRole("button", { name: "Helpful", exact: true }).click();
  await expect(answers(page).nth(3).getByRole("button", { name: "Helpful", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Thanks for the feedback.")).toBeVisible(); // saved on the server

  // 9. Reload: the whole chat comes back from the database, visuals included.
  await page.reload();
  await expect(answers(page)).toHaveCount(4);
  await expect(answers(page).first().getByRole("heading", { name: "Late arrivals" })).toBeVisible();
  await expect(answers(page).nth(3).getByRole("button", { name: "Helpful", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("owner: live sheet chart, rename, pin, search, delete", async ({ page }) => {
  await signIn(page, "owner@demo.invalid", "DemoOwner#2026");
  await page.getByRole("link", { name: "AI assistant" }).first().click();
  await expect(composer(page)).toBeVisible();
  await ask(page, "Which team members are loss-making? Show profit");
  const a = answers(page).first();
  await expect(a.getByText(/Checked 1 source · Google Sheet/)).toBeVisible();
  await expect(a.getByRole("heading", { name: "Team profit (₹)" })).toBeVisible();
  await expect(a.getByText(/is loss-making/)).toBeVisible();

  const history = page.getByRole("navigation", { name: "Chat history" });
  const item = history.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Late Arrivals Review", exact: true }) }).first();
  await item.hover();
  await item.getByRole("button", { name: /Options for/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Chat title" }).fill("Profit check");
  await page.keyboard.press("Enter");
  await expect(history.getByRole("button", { name: "Profit check", exact: true })).toBeVisible();

  const renamed = history.getByRole("listitem").filter({ has: page.getByRole("button", { name: /^(Pinned )?Profit check$/ }) });
  await renamed.hover();
  await renamed.getByRole("button", { name: /Options for/ }).click();
  await page.getByRole("menuitem", { name: "Pin" }).click();
  await expect(history.getByText("Pinned")).toBeVisible();

  await page.getByRole("textbox", { name: "Search chats" }).fill("profit");
  await expect(history.getByRole("button", { name: /^(Pinned )?Profit check$/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();

  await renamed.hover();
  await renamed.getByRole("button", { name: /Options for/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(history.getByRole("button", { name: /^(Pinned )?Profit check$/ })).toHaveCount(0);
});

test("manager: no company-wide payroll, but the finance sheet", async ({ page }) => {
  await signIn(page, "manager@demo.invalid", "DemoManager#2026");
  await page.getByRole("link", { name: "AI assistant" }).first().click();
  await expect(composer(page)).toBeVisible();
  // Payroll for everyone is for owners / administrators only; managers do see the finance sheet.
  await expect(page.getByRole("button", { name: /Total net payroll/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /profit from the sheet/ })).toHaveCount(1);
  await ask(page, "What is the team profit?");
  await expect(answers(page).first().getByText(/is loss-making/)).toBeVisible();
});
