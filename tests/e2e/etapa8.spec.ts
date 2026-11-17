/**
 * Etapa 8 — análise da IA no Dashboard, painel do consultor e ativos por planilha.
 * A IA roda simulada (IA_SIMULADA=1) no servidor de testes.
 */
import { expect, test } from "@playwright/test";
import { backendDisponivel, entrarComo } from "./apoio/sessao";

test.skip(!backendDisponivel, "Precisa do backend local (E2E_JWT_SECRET ou E2E_SENHA).");

test.describe("como membro", () => {
  test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "membro", baseURL!));

  test("gera a análise do mês no Dashboard", async ({ page }) => {
    await page.goto("/lancamentos/importar", { waitUntil: "networkidle" });
    const autorizar = page.getByRole("button", { name: "Autorizo o uso de IA" });
    if (await autorizar.isVisible()) {
      await autorizar.click();
      await expect(autorizar).toBeHidden();
    }

    await page.goto("/dashboard?mes=2026-10", { waitUntil: "networkidle" });
    const card = page.getByRole("region", { name: "O que os gastos estão dizendo" });
    await expect(card).toContainText("análises restantes neste mês");
    await card.getByRole("button", { name: /Gerar (análise|de novo)/ }).click();
    await expect(card.getByRole("listitem").first()).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole("button", { name: "Gerar de novo" })).toBeVisible();
  });

  test("importa ativos colados do Excel, atualizando o que já existe", async ({ page }) => {
    await page.goto("/patrimonio/importar-planilha", { waitUntil: "networkidle" });
    const planilha = [
      "nome\tcategoria\tinstituição\tvalor\tdata",
      "Tesouro Selic 2031\tInvestimentos\tTesouro Direto\t12.345,67\t10/11/2026",
      "Moto\tVeículo\t\t18.000,00\t",
      "Empresa\tEquity\t\t1\t",
    ].join("\n");
    await page.getByLabel("Cole aqui as linhas da planilha, com o cabeçalho").fill(planilha);
    await expect(page.getByText("2 linha(s) prontas")).toBeVisible();
    await expect(page.getByText("Linha 4:")).toBeVisible();
    await page.getByRole("button", { name: "Importar 2 ativo(s)" }).click();
    await expect(page.getByText(/ativo\(s\) atualizado\(s\) e \d criado\(s\)/)).toBeVisible();

    await page.goto("/patrimonio", { waitUntil: "networkidle" });
    await expect(page.getByText("Tesouro Selic 2031").first()).toBeVisible();
    await expect(page.getByText("Moto").first()).toBeVisible();

    // Segunda vez: as mesmas linhas atualizam em vez de duplicar.
    await page.goto("/patrimonio/importar-planilha", { waitUntil: "networkidle" });
    await page.getByLabel("Cole aqui as linhas da planilha, com o cabeçalho").fill(planilha);
    await expect(page.getByText("Atualiza “Moto”")).toBeVisible();
  });
});

test.describe("como consultor", () => {
  test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "consultor", baseURL!));

  test("painel mostra indicadores e salva limites de IA", async ({ page }) => {
    await page.goto("/consultor", { waitUntil: "networkidle" });
    const demo = page.getByRole("region", { name: /Família Demo/ }).first();
    await expect(demo).toContainText("Patrimônio líquido");
    await expect(demo).toContainText("Saldo do mês");
    await expect(demo).toContainText(/IA: \d+ de \d+ leituras/);

    await demo.getByRole("link", { name: /Configurar e convidar/ }).click();
    await page.getByLabel("Análises do mês").fill("6");
    await page.getByRole("button", { name: "Salvar limites" }).click();
    await expect(page.getByText("Limites salvos.")).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByLabel("Análises do mês")).toHaveValue("6");
    await page.getByLabel("Análises do mês").fill("4");
    await page.getByRole("button", { name: "Salvar limites" }).click();
    await expect(page.getByText("Limites salvos.")).toBeVisible();
  });
});
