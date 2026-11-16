/**
 * Etapa 3 — Dashboard & DFC e ferramentas do consultor.
 * Contra o banco com RLS e o seed da Família Demo (rode num banco recém-criado).
 */
import { expect, test } from "@playwright/test";
import { backendDisponivel, entrarComo } from "./apoio/sessao";

test.describe.configure({ mode: "serial" });
test.skip(!backendDisponivel, "Precisa do backend local (E2E_JWT_SECRET ou E2E_SENHA).");

test.describe("como membro", () => {
  test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "membro", baseURL!));

  test("dashboard de outubro bate com os lançamentos", async ({ page }) => {
    await page.goto("/dashboard?mes=2026-10");
    const resumo = page.getByLabel("Resumo de outubro de 2026");
    await expect(resumo).toContainText("R$ 23.500,00");
    await expect(resumo).toContainText("R$ 21.725,63");
    await expect(resumo).toContainText("99,8% do previsto");
    await expect(resumo).toContainText("R$ 774,37");
    await expect(resumo).toContainText("Meta R$ 98.880,00");

    const matriz = page.getByRole("table", { name: /Demonstração de fluxo de caixa/ });
    const caixa = matriz.getByRole("row", { name: /Caixa acumulado/ });
    await expect(caixa).toContainText("17.463");
    await page.getByRole("tab", { name: "Divergência" }).click();
    await expect(matriz.getByRole("row", { name: /Total de receitas/ })).toContainText("+1.800");
  });

  test("clicar numa célula abre os lançamentos dela", async ({ page }) => {
    await page.goto("/dashboard?mes=2026-10");
    await page.getByRole("link", { name: /Doações, out\/26: R\$ 300,00/ }).click();
    await expect(page).toHaveURL(/lancamentos\?mes=2026-10&classe=Doa/);
    const lista = page.getByLabel("Lista de lançamentos");
    await expect(lista.getByText("1 lançamento", { exact: true })).toBeVisible();
    await expect(lista.locator("tbody tr")).toHaveCount(1);
  });

  test("membro não vê a opção de criar previsto nem a importação", async ({ page }) => {
    await page.goto("/lancamentos");
    await expect(page.getByRole("link", { name: "Importar previsto" })).toHaveCount(0);
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await expect(page.getByRole("dialog").getByRole("radio", { name: "Previsto" })).toHaveCount(0);
    await page.goto("/lancamentos/importar-previsto");
    await expect(page.getByText("O orçamento previsto é montado pelo seu consultor.")).toBeVisible();
  });

  test("seletor de mês troca o mês na URL", async ({ page }) => {
    await page.goto("/dashboard?mes=2026-10");
    await page.getByRole("button", { name: "Próximo mês" }).click();
    await expect(page).toHaveURL(/mes=2026-11/);
    await expect(page.getByText("Mês sem realizado")).toBeVisible();
  });
});

test.describe("como consultor", () => {
  test.beforeEach(async ({ context, baseURL }) => entrarComo(context, "consultor", baseURL!));

  test("importa o previsto colado do Excel, com prévia e erros por linha", async ({ page }) => {
    await page.goto("/lancamentos/importar-previsto");
    const planilha = [
      "mês\tdescrição\tvalor\tconta\tcategoria\tclasse\tnatureza",
      "2027-02\tCurso de inglês\t650,00\tCC - C6\tEducação\t\t",
      "2027-03\tCurso de inglês\t650,00\tCC - C6\tEducação\t\t",
      "2027-03\tViagem Páscoa\t3.000,00\tNubank\tViagens\tSonhos\t",
      "2027-03\tCategoria errada\t10\t\tLazer\t\t",
    ].join("\n");
    await page.getByLabel("Cole aqui as linhas da planilha, com o cabeçalho").fill(planilha);
    await expect(page.getByText("3 linha(s) prontas")).toBeVisible();
    await expect(page.getByText("Linha 5:")).toBeVisible();
    await expect(page.getByText('Categoria "Lazer" não cadastrada.')).toBeVisible();
    await page.getByRole("button", { name: "Importar 3 linha(s)" }).click();
    await expect(page.getByText("3 linhas importadas")).toBeVisible();

    await page.goto("/lancamentos?mes=2027-03&q=inglês");
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });

  test("cria um previsto repetido por 3 meses", async ({ page }) => {
    await page.goto("/lancamentos?mes=2026-11");
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("radio", { name: "Previsto" }).click();
    await d.getByLabel("Descrição").fill("Mesada filhos");
    await d.getByLabel("Valor (R$)").fill("300");
    await d.getByLabel("Data").fill("");
    await d.getByRole("combobox", { name: "Categoria" }).selectOption({ label: "Filhos" });
    await d.getByLabel("Mês de competência").fill("2026-11");
    await d.getByLabel("Repetir nos meses seguintes").fill("2");
    await d.getByRole("button", { name: "Criar lançamento" }).click();
    await expect(page.getByRole("status").filter({ hasText: "3 lançamentos previstos criados" })).toBeVisible();
    await page.goto("/lancamentos?mes=todos&q=mesada");
    await expect(page.locator("tbody tr")).toHaveCount(3);
  });

  test("biblioteca de regras padrão e aplicação na família", async ({ page }) => {
    await page.goto("/consultor/regras-padrao");
    await expect(page.getByText("IFOOD", { exact: true })).toBeVisible();
    await page.goto("/consultor/familias/0d0d0d0d-0000-4000-8000-000000000001");
    await page.getByRole("button", { name: "Aplicar regras padrão" }).click();
    await expect(page.getByText("A família já tem todas as regras padrão.")).toBeVisible();
  });
});
