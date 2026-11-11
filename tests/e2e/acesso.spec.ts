import { expect, test } from "@playwright/test";

test("rotas da família exigem login", async ({ page }) => {
  for (const aba of ["/dashboard", "/lancamentos", "/patrimonio", "/objetivos", "/protecoes", "/consultor"]) {
    await page.goto(aba);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("login oferece link por e-mail e senha", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Enviar link de acesso" })).toBeVisible();
  await page.getByRole("tab", { name: "E-mail e senha" }).click();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("login guarda o destino original em ?next", async ({ page }) => {
  await page.goto("/patrimonio");
  await expect(page).toHaveURL(/next=%2Fpatrimonio/);
});
