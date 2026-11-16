/**
 * Etapa 4 — Importação de extratos e faturas.
 * Contra o banco com RLS e o seed da Família Demo, com o app rodando com IA_SIMULADA=1
 * (a leitura de PDF devolve uma fatura fixa; ver src/lib/importacao/ia.ts).
 * Grava em meses de 2027 para não mexer nos números de 2026 que os outros testes conferem.
 */
import { expect, test } from "@playwright/test";
import { backendDisponivel, entrarComo } from "./apoio/sessao";

test.describe.configure({ mode: "serial" });
test.skip(!backendDisponivel, "Precisa do backend local (E2E_JWT_SECRET ou E2E_SENHA).");

test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "membro", baseURL!));

const CSV = [
  "Extrato C6;Agência 0001",
  "Data;Histórico;Valor",
  "05/10/2026;ALUGUEL;-4.200,00",
  "20/06/2027;PETZ PINHEIROS;-150,00",
  "21/06/2027;PADARIA DO ZE;-35,90",
  "22/06/2027;TED RECEBIDA;1.000,00",
].join("\n");

test("CSV sem IA: regra, duplicada, receita e categoria escolhida na revisão", async ({ page }) => {
  await page.goto("/lancamentos/importar");
  await expect(page.getByRole("button", { name: "Autorizo o uso de IA" })).toBeVisible();
  await page.getByLabel("Conta ou cartão do documento").selectOption({ label: "CC - C6" });
  await page.locator("#arquivos").setInputFiles({ name: "extrato.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "latin1") });
  await page.getByRole("button", { name: "Ler arquivo" }).click();

  await expect(page.getByRole("heading", { name: "Revisar importação" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Parece já lançado: Aluguel/)).toBeVisible();
  await expect(page.getByLabel("Incluir ALUGUEL")).not.toBeChecked();
  await expect(page.getByText("regra: PETZ")).toBeVisible();
  await expect(page.getByText("1 sem categoria")).toBeVisible();
  const confirmar = page.getByRole("button", { name: /^Confirmar 3 lançamentos/ });
  await expect(confirmar).toBeDisabled();

  const padaria = page.getByRole("listitem").filter({ hasText: "PADARIA DO ZE" });
  await padaria.getByLabel("Categoria").selectOption({ label: "Alimentação" });
  await padaria.getByLabel(/Criar regra para os próximos: "PADARIA"/).check();
  await confirmar.click();

  await expect(page.getByRole("heading", { name: "Importação confirmada" })).toBeVisible();
  await expect(page.getByText(/3 lançamentos gravados e 1 regra nova/)).toBeVisible();

  await page.goto("/lancamentos?mes=2027-06&tipo=Realizado");
  const lista = page.getByLabel("Lista de lançamentos");
  await expect(lista.locator("tbody").getByText("PETZ PINHEIROS")).toBeVisible();
  await expect(lista.locator("tbody").getByText("TED RECEBIDA")).toBeVisible();
  await page.goto("/lancamentos/regras");
  await expect(page.getByText("PADARIA", { exact: true })).toBeVisible();
});

test("PDF com IA: autorização, fatura conferida, parcela ligada e parcelas futuras", async ({ page }) => {
  await page.goto("/lancamentos/importar");
  await page.getByRole("button", { name: "Autorizo o uso de IA" }).click();
  await expect(page.getByText("Leituras com IA restantes neste mês: 20 de 20.")).toBeVisible();

  await page.getByLabel("Conta ou cartão do documento").selectOption({ label: "Nubank (cartão)" });
  await page.locator("#arquivos").setInputFiles({ name: "fatura-outubro.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%simulado\n") });
  await page.getByRole("button", { name: "Ler arquivo" }).click();

  await expect(page.getByRole("heading", { name: "Revisar importação" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Total da fatura: R\$ 1\.163,40\. A soma das linhas lidas confere/)).toBeVisible();
  await expect(page.getByLabel("Mês da fatura")).toHaveValue("2026-10");
  await expect(page.getByText("Realiza a parcela 3/10 prevista em nov/26.")).toBeVisible();
  await expect(page.getByLabel("Prever as 2 parcelas seguintes")).toBeChecked();
  await expect(page.getByText("regra: NETFLIX")).toBeVisible();
  await expect(page.getByText("Transferências", { exact: true })).toBeVisible();

  // Mês da fatura trocado: todas as linhas acompanham.
  await page.getByLabel("Mês da fatura").fill("2027-07");
  const farmacia = page.getByRole("listitem").filter({ hasText: "FARMACIA CENTRAL" });
  await farmacia.getByLabel("Categoria").selectOption({ label: "Saúde" });
  // O notebook fica de fora para não mexer nas parcelas que lancamentos.spec confere
  // (a ligação no banco é testada em tests/rls/etapa4.test.ts).
  await page.getByLabel("Incluir NOTEBOOK LOJA").uncheck();
  await page.getByRole("button", { name: /^Confirmar 7 lançamentos/ }).click();
  await expect(page.getByText(/7 lançamentos gravados, 2 parcelas futuras previstas/)).toBeVisible();

  await page.goto("/lancamentos?mes=2027-09&tipo=Previsto");
  await expect(page.getByLabel("Lista de lançamentos").locator("tbody").getByText("LOJA DE MOVEIS")).toBeVisible();

  await page.goto("/lancamentos/importar");
  await expect(page.getByText("Leituras com IA restantes neste mês: 19 de 20.")).toBeVisible();
  await expect(page.getByText("Confirmada").first()).toBeVisible();
});

test("descartar uma importação apaga a leitura da fila", async ({ page }) => {
  await page.goto("/lancamentos/importar");
  await page.getByLabel("Conta ou cartão do documento").selectOption({ label: "CC - C6" });
  await page.locator("#arquivos").setInputFiles({ name: "outro.csv", mimeType: "text/csv", buffer: Buffer.from("Data;Descrição;Valor\n01/06/2027;Uber;-20,00\n") });
  await page.getByRole("button", { name: "Ler arquivo" }).click();
  await expect(page.getByRole("heading", { name: "Revisar importação" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Descartar importação" }).click();
  await expect(page).toHaveURL(/\/lancamentos\/importar$/);
  await expect(page.getByText("Descartada").first()).toBeVisible();
});
