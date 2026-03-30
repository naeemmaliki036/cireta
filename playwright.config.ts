import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-tests/playwright",
  timeout: 60_000,
  retries: 0,
  workers: 1, // Sequential — tests depend on each other in flow tests
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3010/api/v1",
    extraHTTPHeaders: { "Content-Type": "application/json" },
  },
  projects: [
    {
      name: "api-flow",
      testMatch: /.*\.flow\.ts/,
    },
    {
      name: "ui-launchpad",
      testMatch: /.*launchpad.*\.spec\.ts/,
      use: { baseURL: "http://localhost:4010" },
    },
    {
      name: "ui-admin",
      testMatch: /.*admin.*\.spec\.ts/,
      use: { baseURL: "http://localhost:5010" },
    },
  ],
});
