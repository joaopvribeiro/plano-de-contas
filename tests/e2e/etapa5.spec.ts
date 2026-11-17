/**
 * Etapa 5 — Patrimônio e leitura de relatório de investimentos.
 * App com IA_SIMULADA=1: a leitura devolve o relatório de exemplo (src/lib/relatorio/exemplo.ts).
 */
import { expect, test } from "@playwright/test";
import { backendDisponivel, entrarComo } from "./apoio/sessao";

test.describe.configure({ mode: "serial" });
test.skip(!backendDisponivel, "Precisa do backend local (E2E_JWT_SECRET ou E2E_SENHA).");
test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "membro", baseURL!));

const cartao = (page: import("@playwright/test").Page, rotulo: string) =>
  page.getByRole("region", { name: "Resumo do patrimônio" }).locator("div").filter({ has: page.getByText(rotulo, { exact: true }) }).first();

test("resumo, balanço e saldo desatualizado", async ({ page }) => {
  await page.goto("/patrimonio");
  await expect(cartao(page, "Carteira investida")).toContainText("R$ 231.800,00");
  await expect(cartao(page, "Carteira investida")).toContainText("6 ativos em 3 instituições");
  await expect(cartao(page, "Patrimônio líquido")).toContainText("R$ 1.036.600,00");
  await expect(cartao(page, "Patrimônio com direitos")).toContainText("R$ 1.085.800,00");
  await expect(page.getByText(/Atualizado em 30\/06\/2026, há \d+ dias/)).toBeVisible();
  await expect(page.getByText("24 de 180 parcelas")).toBeVisible();
});

test("atualizar saldo, adicionar ativo e dívida", async ({ page }) => {
  await page.goto("/patrimonio");
  await page.getByRole("button", { name: "Atualizar saldo de CDB liquidez diária" }).click();
  await page.getByLabel("Novo saldo (R$)").fill("40.000,00");
  await page.getByRole("button", { name: "Salvar saldo" }).click();
  await expect(cartao(page, "Carteira investida")).toContainText("R$ 233.800,00");

  await page.getByRole("button", { name: "Adicionar ativo" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome").fill("Tesouro Prefixado 2029");
  await dialogo.getByLabel("Instituição").fill("XP");
  await dialogo.getByLabel("Saldo bruto (R$)").fill("10000");
  await dialogo.getByRole("button", { name: "Adicionar ativo" }).click();
  await expect(page.getByText("Tesouro Prefixado 2029")).toBeVisible();
  await expect(cartao(page, "Carteira investida")).toContainText("R$ 243.800,00");

  await page.getByRole("button", { name: "Adicionar dívida" }).click();
  await dialogo.getByLabel("Nome").fill("Empréstimo pessoal");
  await dialogo.getByLabel("Saldo devedor (R$)").fill("abc");
  await dialogo.getByRole("button", { name: "Adicionar dívida" }).click();
  await expect(dialogo.getByText("Valor inválido para saldo devedor (ex.: 1.234,56).")).toBeVisible();
  await dialogo.getByLabel("Saldo devedor (R$)").fill("5.000");
  await dialogo.getByRole("button", { name: "Adicionar dívida" }).click();
  await expect(page.getByText("Empréstimo pessoal")).toBeVisible();
  await expect(cartao(page, "Patrimônio líquido")).toContainText("R$ 1.043.600,00");
});

test("campos por categoria: FGTS, bem, previdência e equity", async ({ page }) => {
  await page.goto("/patrimonio");
  await page.getByRole("button", { name: "Adicionar ativo" }).click();
  const d = page.getByRole("dialog");
  const categoria = d.getByLabel("Categoria");

  await categoria.selectOption("FGTS");
  await expect(d.getByLabel("Nome")).toHaveCount(0);
  await expect(d.getByLabel("Liquidez")).toHaveCount(0);
  await expect(d.getByLabel("Conta para a liberdade financeira")).toHaveCount(0);

  await categoria.selectOption("Bem");
  await expect(d.getByLabel("Valor de mercado (R$)")).toBeVisible();
  await expect(d.getByLabel("Tipo do bem")).toBeVisible();
  await expect(d.getByLabel("Risco")).toHaveCount(0);
  await expect(d.getByLabel("Instituição")).toHaveCount(0);

  await categoria.selectOption("Previdência");
  await expect(d.getByLabel("Tipo do plano")).toBeVisible();

  await categoria.selectOption("Consórcio");
  await expect(d.getByLabel("Liquidez")).toHaveCount(0);
  await expect(d.getByLabel("Administradora")).toBeVisible();

  await categoria.selectOption("Equity");
  await d.getByLabel("Empresa", { exact: true }).fill("Padaria Bom Dia Ltda.");
  await d.getByLabel("Participação da família (%)").fill("50");
  await d.getByLabel("Como estimar").selectOption("lucro");
  await d.getByLabel("Lucro anual (R$)").fill("400.000");
  await d.getByLabel(/Múltiplo/).fill("5");
  await expect(d.getByRole("status")).toContainText("R$ 1.000.000,00");
  await d.getByRole("button", { name: "Adicionar ativo" }).click();

  const linha = page.getByRole("listitem").filter({ hasText: "Padaria Bom Dia Ltda." });
  await expect(linha).toContainText("50% da empresa · estimado: 5× o lucro anual de R$ 400.000,00");
  await expect(page.getByRole("heading", { name: "Participações em empresas" })).toBeVisible();
  await expect(cartao(page, "Patrimônio líquido")).toContainText("empresas R$ 1.000.000,00");
});

test("relatório: conferência, reserva até a meta, confirmação e mês seguinte atualizando", async ({ page }) => {
  await page.goto("/patrimonio/importar", { waitUntil: "networkidle" });
  // A autorização pode já ter sido dada nos testes da Etapa 4 (é por família).
  const autorizar = page.getByRole("button", { name: "Autorizo o uso de IA" });
  if (await autorizar.isVisible()) await autorizar.click();
  await page.locator("#relatorio").setInputFiles({ name: "relatorio-btg.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await page.getByRole("button", { name: "Ler relatório" }).click();

  await expect(page.getByRole("heading", { name: "Revisar relatório" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Patrimônio bruto do relatório: R\$ 896\.746,97\. A soma das posições lidas confere/)).toBeVisible();
  await expect(page.getByLabel("Data de referência")).toHaveValue("2026-11-02");
  // Meta 98.880; fora do relatório já há 62.500 em Reserva: a LFT completa.
  const lft = page.getByRole("listitem").filter({ hasText: "Tesouro Selic · SELIC + 0,07%" });
  await expect(lft.getByLabel("Categoria")).toHaveValue("Reserva");
  await expect(page.getByLabel("Zerar PGBL titular 1")).not.toBeChecked();
  await page.getByRole("button", { name: "Confirmar 14 posições" }).click();
  await expect(page.getByText("14 ativos novos.", { exact: false })).toBeVisible();

  await page.goto("/patrimonio");
  const btg = page.getByRole("listitem").filter({ hasText: "BTG Tesouro Selic FIRF Ref DI" });
  await expect(btg).toContainText("via relatório");
  await expect(btg).toContainText("Em 02/11/2026");
  await expect(btg).toContainText("líquido R$ 156.313,96");

  // Mesmo relatório de novo: tudo atualiza o que já existe.
  await page.goto("/patrimonio/importar", { waitUntil: "networkidle" });
  await page.locator("#relatorio").setInputFiles({ name: "relatorio-btg-2.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await page.getByRole("button", { name: "Ler relatório" }).click();
  await expect(page.getByRole("heading", { name: "Revisar relatório" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("atualiza ativo já cadastrado")).toHaveCount(14);
  await page.getByRole("button", { name: "Confirmar 14 posições" }).click();
  await expect(page.getByText("14 ativos atualizados.", { exact: false })).toBeVisible();
});
