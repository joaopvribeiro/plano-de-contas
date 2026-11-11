import { defineConfig, devices } from "@playwright/test";

/**
 * Fluxos de ponta a ponta. Nesta etapa cobrem o que não depende de dados:
 * login e proteção das rotas. A partir da Etapa 2, rodam contra o Supabase
 * local (`supabase start`) com o seed da família demo.
 *
 * Use PLAYWRIGHT_CHROME_PATH para apontar um Chrome já instalado, se preferir
 * não baixar o Chromium do Playwright.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
