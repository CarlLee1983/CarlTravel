import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4321);

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    // WebKit 只跑標示 @smoke 的冒煙組：瀏覽、搜尋、篩選、景點頁
    {
      name: "webkit",
      use: devices["Desktop Safari"],
      grep: /@smoke/,
    },
  ],
  webServer: {
    command: `pnpm preview:fixture --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
  },
});
