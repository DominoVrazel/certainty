import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the local emulator stack.
 *
 * They drive the real UI, so they cover what the rules tests cannot: that the
 * components actually work under the tightened security rules. Run `npm run dev`
 * first, or let the config start it.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // The suite mutates shared emulator data (reservations, accounts), so running
  // files in parallel would make tests fight over the same calendar slots.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],

  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:5174",
    // Emulators plus Vite take a while on a cold start.
    timeout: 180_000,
    reuseExistingServer: true,
    stdout: "pipe",
    stderr: "pipe",
  },
});
