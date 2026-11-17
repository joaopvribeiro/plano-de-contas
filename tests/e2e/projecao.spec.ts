/**
 * Projeção do orçamento previsto (consultor).
 */
import { expect, test } from "@playwright/test";
import { backendDisponivel, entrarComo } from "./apoio/sessao";

test.skip(!backendDisponivel, "Precisa do backend local (E2E_JWT_SECRET ou E2E_SENHA).");

test("membro não vê a projeção", async ({ context, baseURL, page }) => {
  await entrarComo(context, "membro", baseURL!);
  await page.goto("/lancamentos");
  await expect(page.getByRole("link", { name: "Projetar orçamento" })).toHaveCount(0);
});

test("consultor projeta sem duplicar o que já existe", async ({ context, baseURL, page }) => {
  await entrarComo(context, "consultor", baseURL!);
  await page.goto("/lancamentos/projetar?de=2027-06");
  await expect(page.getByRole("link", { name: /junho\/2027/i })).toHaveAttribute("aria-current", "page");
  const primeira = page.getByRole("listitem").filter({ has: page.getByLabel("Repetição") }).first();
  await primeira.getByLabel("Repetição").selectOption("meses");
  await expect(primeira.getByText("jul/27")).toBeVisible();
  await primeira.getByLabel("Repetição").selectOption("todos");
  await page.getByRole("button", { name: "Projetar orçamento" }).click();
  await expect(page.getByText(/0 lançamentos previstos criados; \d+ já existiam e não foram duplicados/)).toBeVisible();
});
