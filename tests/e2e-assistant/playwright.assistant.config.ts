import { defineConfig, devices } from "@playwright/test";

// AI assistant browser tests. Run against an already started server (port 3100) that uses the
// local test database, the demo firm (scripts/ai/seed-demo.ts) and the scripted model
// (tests/fixtures/mock-deepseek.mjs, DEEPSEEK_BASE_URL=http://localhost:4555, DEEPSEEK_API_KEY=mock-key).
export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
    timezoneId: "Asia/Kolkata",
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
