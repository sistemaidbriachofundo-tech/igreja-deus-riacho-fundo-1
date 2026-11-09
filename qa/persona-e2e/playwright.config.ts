import { defineConfig } from "@playwright/test";

const hml = process.env.QA_HML_BASE_URL ?? "http://127.0.0.1:3000";
const publication = process.env.QA_PUBLIC_BASE_URL ?? "http://127.0.0.1:3010";

export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./src/global-setup.ts",
  globalTeardown: "./src/global-teardown.ts",
  use: {
    channel: "chrome",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    trace: "off",
    video: "off",
    screenshot: "off",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    {
      name: "public",
      testDir: "./tests/public",
      use: { baseURL: publication, viewport: { width: 1440, height: 900 } },
    },
    {
      name: "hml",
      testDir: "./tests/hml",
      use: { baseURL: hml, viewport: { width: 1440, height: 900 } },
    },
  ],
});
