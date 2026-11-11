/**
 * Etapa 2 — Lançamentos, de ponta a ponta, contra o banco com RLS e o seed da Família Demo.
 * Os testes alteram dados: rode sempre num banco recém-criado (ver tests/e2e/LEIA-ME.md).
 */
import { expect, test, type Page } from "@playwright/test";
import { backendDisponivel, entrarComo } from "./apoio/sessao";

test.describe.configure({ mode: "serial" });
test.skip(!backendDisponivel, "Precisa do backend local (E2E_JWT_SECRET ou E2E_SENHA).");

test.beforeEach(async ({ context, baseURL }) => {
  await entrarComo(context, "membro", baseURL!);
});

const linha = (page: Page, texto: string) => page.locator("tbody tr").filter({ hasText: texto });

test("outubro mostra realizado e previsto separados, sem somar transferências", async ({ page }) => {
  await page.goto("/lancamentos?mes=2026-10");
  const receitas = page.getByLabel("Totais do filtro").locator("div", { hasText: "Receitas" }).first();
  await expect(receitas).toContainText("R$ 23.500,00");
  await expect(receitas).toContainText("Previsto R$ 23.500,00");
  await expect(page.getByText(/Transferências e pagamentos de fatura somam R\$ 7\.428,75/)).toBeVisible();
});

test("busca e filtros ficam na URL", async ({ page }) => {
  await page.goto("/lancamentos?mes=2026-10");
  await page.getByLabel("Buscar na descrição e na observação").fill("fatura");
  await expect(page).toHaveURL(/q=fatura/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(linha(page, "Pagamento fatura Nubank")).toContainText("Transferência");

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByLabel("Tipo").selectOption("Previsto");
  await expect(page).toHaveURL(/tipo=Previsto/);
  const linhas = page.locator("tbody tr");
  await expect(linhas.first()).toContainText("Previsto");
  // Toda linha listada é prevista: nenhuma fica sem o selo.
  await expect(linhas.filter({ hasNotText: "Previsto" })).toHaveCount(0);
});

test("novo lançamento: regra aprendida e mês sugerido pela fatura", async ({ page }) => {
  await page.goto("/lancamentos?mes=2026-10");
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Descrição").fill("Petz loja Centro");
  await expect(dialogo.getByText("Regra aplicada: contém “PETZ”")).toBeVisible();
  await expect(dialogo.getByLabel("Conta ou cartão")).toHaveValue(/.+/);
  await expect(dialogo.getByRole("combobox", { name: "Categoria" }).locator("option:checked")).toHaveText("Pets");

  await dialogo.getByLabel("Valor (R$)").fill("215,40");
  await dialogo.getByLabel("Data").fill("2026-10-29");
  // Nubank fecha dia 28: compra de 29/10 vai para a fatura de novembro.
  await expect(dialogo.getByLabel("Mês de competência")).toHaveValue("2026-11");
  await expect(dialogo.getByText("Fatura que fecha dia 28: novembro de 2026.")).toBeVisible();
  await dialogo.getByRole("button", { name: "Criar lançamento" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lançamento criado." })).toBeVisible();

  await page.goto("/lancamentos?mes=2026-11&q=petz");
  await expect(linha(page, "Petz loja Centro")).toContainText("−R$ 215,40");
});

test("validação: realizado sem data e sem categoria mostra os erros", async ({ page }) => {
  await page.goto("/lancamentos?mes=2026-10");
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Descrição").fill("Sem dados");
  await dialogo.getByLabel("Valor (R$)").fill("10");
  await dialogo.getByLabel("Data").fill("");
  await dialogo.getByRole("button", { name: "Criar lançamento" }).click();
  await expect(dialogo.getByText("Informe a data do lançamento realizado.")).toBeVisible();
  await expect(dialogo.getByText("Escolha a categoria.")).toBeVisible();
});

test("corrigir a categoria de um lançamento importado oferece criar regra", async ({ page }) => {
  await page.goto("/lancamentos?mes=2026-10");
  await page.getByRole("button", { name: "Editar Compras diversas" }).click({ force: true });
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("combobox", { name: "Categoria" }).selectOption({ label: "Outros" });
  await dialogo.getByRole("button", { name: "Salvar alterações" }).click();

  const sugestao = page.getByRole("dialog", { name: "Criar regra para os próximos?" });
  await expect(sugestao).toBeVisible();
  await expect(sugestao.getByLabel("Quando a descrição contiver")).toHaveValue("COMPRAS");
  await sugestao.getByRole("button", { name: "Criar regra" }).click();
  await expect(page.getByRole("status").filter({ hasText: 'Regra criada: "COMPRAS"' })).toBeVisible();

  await page.goto("/lancamentos/regras");
  await expect(page.getByText("COMPRAS", { exact: true })).toBeVisible();
});

test("edição em massa muda o mês de vários lançamentos", async ({ page }) => {
  await page.goto("/lancamentos?mes=2026-10&q=streaming");
  await page.getByLabel("Selecionar todos").check();
  await page.getByRole("button", { name: "Editar selecionados" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Mês de competência").selectOption("2026-12");
  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 lançamento(s) alterado(s)." })).toBeVisible();
  await page.goto("/lancamentos?mes=2026-12&q=streaming");
  await expect(page.locator("tbody tr")).toHaveCount(3);
});

test("exclusão pede confirmação", async ({ page }) => {
  await page.goto("/lancamentos?mes=2026-10&q=fone");
  // A busca acha a compra e o estorno dela.
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Excluir Loja online - fone" }).click({ force: true });
  await expect(page.getByText("Este lançamento será excluído. Não dá para desfazer.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Estorno loja online - fone");
});

test("compra parcelada: quitar remove as previstas futuras", async ({ page }) => {
  await page.goto("/lancamentos?mes=2026-10");
  const card = page.getByText("Compras parceladas do mês").locator("xpath=ancestor::div[contains(@class,'rounded-xl')]");
  await expect(card).toContainText("faltam 8 previstas (R$ 3.840,00)");
  await card.getByRole("button", { name: "Quitou ou antecipou?" }).click();
  await page.getByRole("button", { name: "Remover parcelas futuras" }).click();
  await expect(card).toContainText("8 parcela(s) futura(s) removida(s) do previsto.");
  await page.goto("/lancamentos?mes=2026-11&q=notebook");
  await expect(page.getByText("Nenhum lançamento com esses filtros.")).toBeVisible();
});

test("contas: cartão exige fechamento e vencimento", async ({ page }) => {
  await page.goto("/lancamentos/contas");
  await page.getByRole("button", { name: "Nova conta" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome").fill("Inter");
  await dialogo.getByLabel("Dia de fechamento").fill("10");
  await dialogo.getByLabel("Dia de vencimento").fill("17");
  await dialogo.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Cartão de crédito · fecha dia 10, vence dia 17")).toBeVisible();

  // Conta com lançamentos não pode ser excluída.
  await page.getByRole("button", { name: "Excluir Nubank" }).click();
  await expect(page.getByText(/Desative-a em vez de excluir/)).toBeVisible();
});

test("categorias: criar e arquivar", async ({ page }) => {
  await page.goto("/lancamentos/categorias");
  await page.getByRole("button", { name: "Nova categoria" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome").fill("Presentes");
  await dialogo.getByLabel("Classe padrão").selectOption("Padrão de vida");
  await dialogo.getByRole("button", { name: "Salvar" }).click();
  const item = page.locator("li", { hasText: "Presentes" });
  await expect(item).toContainText("Padrão de vida");
  await page.getByRole("button", { name: "Arquivar Presentes" }).click();
  await expect(page.getByText("Arquivadas (1)")).toBeVisible();
});
