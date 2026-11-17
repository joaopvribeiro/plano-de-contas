/**
 * Resumo de gastos e relatório da fatura (Família Demo, outubro/2026).
 */
import { expect, test } from "@playwright/test";
import { backendDisponivel, entrarComo } from "./apoio/sessao";

test.skip(!backendDisponivel, "Precisa do backend local (E2E_JWT_SECRET ou E2E_SENHA).");
test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "membro", baseURL!));

test("resumo do mês com filtro por conta", async ({ page }) => {
  await page.goto("/lancamentos/gastos?mes=2026-10");
  const resumo = page.getByRole("region", { name: "Resumo do mês" });
  await expect(resumo).toContainText("R$ 21.725,63"); // igual às despesas realizadas da DFC
  await expect(resumo).toContainText("Moradia");
  await expect(page.getByText("Notebook loja online")).toBeVisible();
  await expect(page.getByText("Estorno loja online - fone")).toBeVisible();

  await page.getByRole("link", { name: "Só cartões" }).click();
  await expect(resumo).toContainText("R$ 6.879,82");
  await page.getByRole("link", { name: "Só contas correntes" }).click();
  await expect(resumo).toContainText("R$ 14.845,81");
  await page.getByRole("link", { name: "Nubank", exact: true }).click();
  await expect(resumo).toContainText("Total da fatura");
  await expect(resumo).toContainText("Alimentação");
});

test("relatório da fatura do cartão", async ({ page }) => {
  await page.goto("/lancamentos/gastos?mes=2026-10");
  await page.getByRole("link", { name: "Relatório" }).click();
  await expect(page.getByText("Relatório de fatura e consumo")).toBeVisible();
  await expect(page.getByText("Mês de referência: Outubro de 2026")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resumo executivo de categorias" })).toBeVisible();
  await expect(page.getByText("Total geral da fatura")).toBeVisible();
  await expect(page.getByRole("button", { name: "Baixar PDF" })).toBeVisible();
});
