import { defineConfig, devices } from "@playwright/test";

// One-off smoke test against the LIVE site. Uses only "@e2e.invalid" owners;
// remove the data afterwards with `npm run test:e2e:cleanup`.
export default defineConfig({
  testDir: ".",
  timeout: 240_000,
  expect: { timeout: 25_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "https://officeerp.analytx4t.com",
    channel: "chrome",
    timezoneId: "Asia/Kolkata",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "live", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
