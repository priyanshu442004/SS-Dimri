import { defineConfig, devices } from "@playwright/test";

// AI products, end to end, through nginx exactly as in production (the auth_request gate, static
// sites, API proxies). Locally: nginx in Docker on :8088 in front of `next dev` (test database) and the
// product backends on 8100–8109. Live: AIP_BASE=https://officeerp.analytx4t.com.
// Runs real files through every product: real DeepSeek calls and real report emails (MAIL_TO).
//   AIP_BASE, AIP_DEMO_PASSWORD, AIP_OTHER_EMAIL, AIP_OTHER_PASSWORD
export default defineConfig({
  testDir: ".",
  timeout: 600_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.AIP_BASE ?? "http://localhost:8088",
    channel: "chrome",
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } }],
});
