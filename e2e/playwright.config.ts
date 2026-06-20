import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.e2e before reading process.env, then override with local values
config({ path: resolve(__dirname, "../.env.e2e") });
config({ path: resolve(__dirname, "../.env.e2e.local"), override: true });

const ROOT_URL = process.env.E2E_ROOT_URL || "http://localhost:3000";
// Ensure trailing slash so relative URL resolution works when sub-path is set
const rawSubpathUrl = process.env.E2E_SUBPATH_URL || "http://localhost:3000";
const SUBPATH_URL = rawSubpathUrl.endsWith("/")
  ? rawSubpathUrl
  : `${rawSubpathUrl}/`;
export default defineConfig({
  testDir: "./specs",

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e/reports", open: "never" }],
  ],

  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium-root",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: ROOT_URL,
      },
    },
    {
      name: "chromium-subpath",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: SUBPATH_URL,
      },
    },
  ],
});
