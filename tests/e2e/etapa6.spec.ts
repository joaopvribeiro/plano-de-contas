/**
 * Etapa 6 — Objetivos.
 */
import { expect, test } from "@playwright/test";
import { backendDisponivel, entrarComo } from "./apoio/sessao";
import { situacaoProjeto } from "../../src/lib/objetivos";
import { mesAtual } from "../../src/lib/format";

test.describe.configure({ mode: "serial" });
test.skip(!backendDisponivel, "Precisa do backend local (E2E_JWT_SECRET ou E2E_SENHA).");

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

test.describe("como membro", () => {
  test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "membro", baseURL!));

  test("blocos fixos, sem premissas para editar", async ({ page }) => {
    await page.goto("/objetivos");
    await expect(page.getByRole("heading", { name: "Liberdade financeira" })).toBeVisible();
    await expect(page.getByText("de R$ 3.000.000,00")).toBeVisible();
    await expect(page.getByText("Aporte mensal necessário")).toBeVisible();
    await expect(page.getByText(/meses de despesa básica/)).toBeVisible();
    await expect(page.getByText("24 de 180 parcelas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Premissas" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Prever no orçamento" })).toHaveCount(0);
  });

  test("projeto: quanto guardar por mês, nova meta e atualizar o guardado", async ({ page }) => {
    await page.goto("/objetivos");
    const viagem = page.getByRole("group", { name: "Viagem em família 2027" });
    const s = situacaoProjeto({ valor_alvo: 30000, ja_guardado: 8500, prazo_mes: "2027-07" }, mesAtual());
    await expect(viagem).toContainText(`Guardar ${brl(s.porMes)} por mês`);

    await page.getByRole("button", { name: "Nova meta" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Nome").fill("Reforma da cozinha");
    await d.getByLabel("Valor-alvo (R$)").fill("24.000");
    await d.getByLabel("Prazo (mês)").fill("2027-11");
    await d.getByRole("button", { name: "Criar meta" }).click();
    const reforma = page.getByRole("group", { name: "Reforma da cozinha" });
    await expect(reforma).toContainText("R$ 0,00 de R$ 24.000,00");

    await reforma.getByRole("button", { name: "Atualizar meta" }).click();
    await d.getByLabel("Quanto já está guardado (R$)").fill("24000");
    await d.getByRole("button", { name: "Salvar" }).click();
    await expect(reforma).toContainText("Meta atingida");
  });
});

test.describe("como consultor", () => {
  test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "consultor", baseURL!));

  test("premissas e previsto do projeto", async ({ page }) => {
    await page.goto("/objetivos");
    await page.getByRole("button", { name: "Premissas" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Retorno real (% a.m.)").fill("9");
    await d.getByRole("button", { name: "Salvar premissas" }).click();
    await expect(d.getByText("Use um retorno real entre 0 e 3% a.m. (ex.: 0,40).")).toBeVisible();
    await d.getByLabel("Retorno real (% a.m.)").fill("0,35");
    await d.getByLabel("Meta da liberdade financeira (R$)").fill("2.000.000");
    await d.getByRole("button", { name: "Salvar premissas" }).click();
    await expect(page.getByText("de R$ 2.000.000,00")).toBeVisible();
    await expect(page.getByText(/retorno real de 0,35% a\.m\./)).toBeVisible();

    const carro = page.getByRole("group", { name: "Troca do carro" });
    await carro.getByRole("button", { name: "Prever no orçamento" }).click();
    await expect(carro.getByText(/mês\(es\) previsto\(s\)/)).toBeVisible();
    await carro.getByRole("button", { name: "Prever no orçamento" }).click();
    await expect(carro.getByText("O aporte já estava previsto em todos os meses.")).toBeVisible();
  });
});
