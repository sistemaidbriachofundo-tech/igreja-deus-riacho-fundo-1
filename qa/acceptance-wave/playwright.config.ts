import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    channel: "chrome",
    baseURL: process.env.QA_HML_BASE_URL ?? "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: "off",
    video: "off",
    screenshot: "off",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
});
