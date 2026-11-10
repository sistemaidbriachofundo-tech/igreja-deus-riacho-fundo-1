import { defineConfig } from "@playwright/test";

const external = process.env.QA_RUN_EXTERNAL === "1";

export default defineConfig({
  testDir: "tests",
  timeout: 15 * 60 * 1000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    },
  },
  grep: external ? undefined : /@unit/,
});
