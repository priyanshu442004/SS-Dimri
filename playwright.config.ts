import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real app (installed Chrome, no browser download).
// They create a throw-away organization whose owner email ends in
// "@e2e.invalid"; `npm run test:e2e:cleanup` removes only those organizations.
// The suite starts its own production server on E2E_PORT (default 3100, so a
// developer's `npm run dev` on 3000 is never reused) with BETTER_AUTH_URL set
// to that origin. Emails to *.invalid test addresses are captured to
// test-results/mail instead of being sent.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000, // several browser contexts per test against a remote database
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: ORIGIN,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Attendance uses geolocation; grant a fixed location (Naraina, New Delhi).
    permissions: ["geolocation"],
    geolocation: { latitude: 28.6304, longitude: 77.1425 },
    timezoneId: "Asia/Kolkata",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    // The suite signs in many times from one IP; lift the per-minute sign-in limit for the test server only.
    env: { AUTH_SIGNIN_LIMIT_PER_MINUTE: "200", BETTER_AUTH_URL: ORIGIN, MAIL_CAPTURE_DIR: "test-results/mail" },
    url: `${ORIGIN}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000, // several browser contexts per test against a remote database
  },
});
