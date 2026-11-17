/**
 * Etapa 7 — Proteções. App com IA_SIMULADA=1 (a leitura devolve a apólice de exemplo).
 */
import { expect, test } from "@playwright/test";
import { backendDisponivel, entrarComo } from "./apoio/sessao";

test.describe.configure({ mode: "serial" });
test.skip(!backendDisponivel, "Precisa do backend local (E2E_JWT_SECRET ou E2E_SENHA).");

test.describe("como membro", () => {
  test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "membro", baseURL!));

  test("cartões, cards por tipo e detalhe da apólice", async ({ page }) => {
    await page.goto("/protecoes");
    const resumo = page.getByRole("region", { name: "Resumo das proteções" });
    await expect(resumo).toContainText("0 de 3");
    await expect(resumo).toContainText(/proteç(ão|ões) ativas? no orçamento/);
    await expect(page.getByText("Nenhuma apólice cadastrada. Envie o PDF abaixo.")).toHaveCount(2); // residencial e outro

    await page.getByRole("button", { name: /Seguro de vida: Prudential/ }).click();
    const d = page.getByRole("dialog");
    await expect(d.getByRole("heading", { name: "Carências" })).toBeVisible();
    await expect(d.getByText("Suicídio: 24 meses a partir do início da vigência")).toBeVisible();
    await expect(d.getByText(/Ligar para a central da seguradora/)).toBeVisible();
    await expect(d.getByRole("button", { name: "Incluir prêmio no orçamento" })).toHaveCount(0);
  });

  test("leitura com IA: revisão, salvar e abrir o arquivo original", async ({ page }) => {
    await page.goto("/protecoes", { waitUntil: "networkidle" });
    const autorizar = page.getByRole("button", { name: "Autorizo o uso de IA" });
    if (await autorizar.isVisible()) await autorizar.click();
    await page.locator("#apolice").setInputFiles({ name: "apolice-residencial.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 apolice") });
    await page.getByRole("button", { name: "Ler apólice" }).click();

    await expect(page.getByRole("heading", { name: "Revisar apólice" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Seguradora", { exact: true })).toHaveValue("Seguradora Exemplo");
    await expect(page.getByLabel("Tipo")).toHaveValue("residencial");
    await expect(page.getByLabel("Incêndio")).toHaveValue("R$ 800.000");
    await page.getByLabel("Segurado", { exact: true }).fill("Titular 1 e Titular 2");
    await page.getByRole("button", { name: "Salvar apólice" }).click();

    await expect(page).toHaveURL(/\/protecoes$/);
    await expect(page.getByRole("region", { name: "Resumo das proteções" })).toContainText("1 de 4");
    const card = page.getByRole("button", { name: /Seguro residencial: Seguradora Exemplo/ });
    await expect(card).toContainText("lida pela IA");
    await expect(card).toContainText("R$ 80,00 por mês");
    await card.click();
    // O PDF abre numa aba nova pelo link temporário (no Chrome sem tela vira download).
    const pedido = page.context().waitForEvent("request", (r) => r.url().includes("/object/sign/"));
    await page.getByRole("button", { name: "Abrir arquivo original" }).click();
    expect((await pedido).url()).toContain("apolices");
  });

  test("cadastro à mão com pagamento único", async ({ page }) => {
    await page.goto("/protecoes");
    await page.getByRole("button", { name: "Cadastrar à mão" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Tipo").selectOption("outro");
    await d.getByLabel("Seguradora", { exact: true }).fill("Garantia Loja");
    await d.getByLabel("Prêmio (R$)").fill("300");
    await d.getByLabel("Periodicidade").selectOption("unico");
    await d.getByLabel("Cobertura principal").fill("Geladeira, 2 anos");
    await d.getByLabel("Início da vigência").fill("2026-11-01");
    await d.getByLabel("Fim da vigência").fill("2026-10-01");
    await d.getByRole("button", { name: "Salvar apólice" }).click();
    await expect(d.getByText("O fim da vigência vem antes do início.")).toBeVisible();
    await d.getByLabel("Fim da vigência").fill("2028-11-01");
    await d.getByRole("button", { name: "Salvar apólice" }).click();
    await expect(page.getByRole("button", { name: /Outra proteção: Garantia Loja/ })).toContainText("pagamento único");
  });
});

test.describe("como consultor", () => {
  test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "consultor", baseURL!));

  test("incluir prêmio no orçamento sem duplicar", async ({ page }) => {
    await page.goto("/protecoes");
    await page.getByRole("button", { name: /Plano de saúde: Bradesco Saúde/ }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("button", { name: "Incluir prêmio no orçamento" }).click();
    await expect(d.getByText(/Prêmio de R\$\s1\.450,00 incluído em \d+ mês\(es\) do orçamento \(Saúde\)/)).toBeVisible();
    await d.getByRole("button", { name: "Incluir prêmio no orçamento" }).click();
    await expect(d.getByText("O prêmio já estava no orçamento em todos os meses.")).toBeVisible();
  });
});
