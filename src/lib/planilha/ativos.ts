/**
 * Importação de ativos por planilha (CSV ou colado do Excel/Sheets). Puro, testado.
 *
 * Cada linha atualiza o ativo da família com o mesmo nome e a mesma instituição,
 * ou vira um ativo novo. Equity e Consórcio ficam de fora: têm campos próprios
 * (participação, parcelas) que só fazem sentido no cadastro.
 */
import { lerValorBRL, normalizarDescricao } from "@/lib/lancamentos/regras-de-negocio";
import { parseData } from "@/lib/format";
import type { CategoriaAtivo, Risco } from "@/lib/patrimonio";
import { dividir } from "./previsto";

export const COLUNAS_ATIVOS = ["nome", "categoria", "instituicao", "produto", "valor", "data", "liquidez", "risco"] as const;
type Coluna = (typeof COLUNAS_ATIVOS)[number];

const SINONIMOS: Record<Coluna, string[]> = {
  nome: ["NOME", "ATIVO", "DESCRICAO", "PRODUTO NOME", "APLICACAO"],
  categoria: ["CATEGORIA", "TIPO", "CLASSE"],
  instituicao: ["INSTITUICAO", "BANCO", "CORRETORA", "INSTITUICAO FINANCEIRA"],
  produto: ["PRODUTO", "TIPO DE PRODUTO"],
  valor: ["VALOR", "SALDO", "SALDO BRUTO", "VALOR R", "VALOR ATUAL"],
  data: ["DATA", "DATA DO SALDO", "DATA SALDO", "POSICAO EM", "REFERENCIA"],
  liquidez: ["LIQUIDEZ", "RESGATE"],
  risco: ["RISCO"],
};

export type CategoriaPlanilha = Exclude<CategoriaAtivo, "Equity" | "Consórcio">;

/** Texto da coluna categoria → categoria (+ o detalhe que a palavra já diz). */
const CATEGORIAS: Record<string, { categoria: CategoriaPlanilha; previdencia_tipo?: "PGBL" | "VGBL"; produto?: string }> = {
  RESERVA: { categoria: "Reserva" },
  "RESERVA DE EMERGENCIA": { categoria: "Reserva" },
  INVESTIMENTO: { categoria: "Investimentos" },
  INVESTIMENTOS: { categoria: "Investimentos" },
  PREVIDENCIA: { categoria: "Previdência" },
  "PREVIDENCIA PRIVADA": { categoria: "Previdência" },
  PGBL: { categoria: "Previdência", previdencia_tipo: "PGBL" },
  VGBL: { categoria: "Previdência", previdencia_tipo: "VGBL" },
  "FUNDO FECHADO": { categoria: "Fundo Fechado" },
  FGTS: { categoria: "FGTS" },
  BEM: { categoria: "Bem" },
  BENS: { categoria: "Bem" },
  IMOVEL: { categoria: "Bem", produto: "Imóvel" },
  TERRENO: { categoria: "Bem", produto: "Terreno" },
  VEICULO: { categoria: "Bem", produto: "Veículo" },
  CARRO: { categoria: "Bem", produto: "Veículo" },
};
const RISCOS: Record<string, Risco> = { BAIXO: "baixo", MEDIO: "médio", ALTO: "alto" };

export const MODELO_CSV_ATIVOS =
  "nome;categoria;instituição;produto;valor;data;liquidez;risco\n" +
  "CDB Liquidez Diária;Reserva;Banco Inter;CDB;30.000,00;15/11/2026;D+0;baixo\n" +
  "Tesouro IPCA+ 2035;Investimentos;XP;Tesouro Direto;85.400,00;15/11/2026;No vencimento;médio\n" +
  "Previdência titular;VGBL;Icatu;;120.000,00;31/10/2026;;\n" +
  "FGTS;FGTS;;;18.300,00;01/11/2026;;\n" +
  "Apartamento;Imóvel;;;950.000,00;01/11/2026;;\n";

export type AtivoCadastrado = { id: string; nome: string; instituicao: string | null; categoria: CategoriaAtivo };

export type LinhaAtivo = {
  nome: string;
  categoria: CategoriaPlanilha;
  instituicao: string | null;
  produto: string | null;
  previdencia_tipo: "PGBL" | "VGBL" | null;
  valor: number;
  data_saldo: string;
  liquidez: string | null;
  risco: Risco | null;
  /** Ativo que esta linha atualiza; null = novo. */
  ativo_id: string | null;
};

export type ResultadoLinhaAtivo = { linha: number; ok: true; dados: LinhaAtivo } | { linha: number; ok: false; erros: string[]; bruto: string[] };
export type LeituraAtivos = { ok: false; erro: string } | { ok: true; linhas: ResultadoLinhaAtivo[]; ignoradas: string[] };

const chave = (nome: string, inst: string | null) => `${normalizarDescricao(nome)}|${normalizarDescricao(inst ?? "")}`;

function lerData(t: string, hoje: string): string | null {
  if (!t) return hoje;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return parseData(t.split("-").reverse().join("/"));
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return parseData(`${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${ano}`);
}

export function lerPlanilhaAtivos(texto: string, existentes: AtivoCadastrado[], hoje: string, limite = 500): LeituraAtivos {
  const linhas = dividir(texto);
  if (linhas.length < 2) return { ok: false, erro: "A planilha precisa de um cabeçalho e ao menos uma linha." };

  const indice = new Map<Coluna, number>();
  const ignoradas: string[] = [];
  linhas[0].forEach((h, i) => {
    const n = normalizarDescricao(h);
    const col = COLUNAS_ATIVOS.find((c) => SINONIMOS[c].includes(n));
    if (col && !indice.has(col)) indice.set(col, i);
    else if (h.trim()) ignoradas.push(h.trim());
  });
  const faltando = (["nome", "categoria", "valor"] as const).filter((c) => !indice.has(c));
  if (faltando.length) return { ok: false, erro: `Não encontrei a(s) coluna(s) ${faltando.map((c) => `"${c}"`).join(", ")} no cabeçalho.` };
  if (linhas.length - 1 > limite) return { ok: false, erro: `A planilha tem ${linhas.length - 1} linhas; o limite é ${limite} por importação.` };

  const porChave = new Map(existentes.map((a) => [chave(a.nome, a.instituicao), a]));
  const vistas = new Set<string>();

  const resultado = linhas.slice(1).map((celulas, i): ResultadoLinhaAtivo => {
    const v = (c: Coluna) => (indice.has(c) ? (celulas[indice.get(c)!] ?? "").trim() : "");
    const erros: string[] = [];

    const cat = CATEGORIAS[normalizarDescricao(v("categoria"))];
    if (!cat) {
      const n = normalizarDescricao(v("categoria"));
      erros.push(
        n === "EQUITY" || n === "CONSORCIO" || n === "EMPRESA"
          ? `"${v("categoria")}" tem campos próprios: cadastre direto no Patrimônio.`
          : `Categoria inválida: "${v("categoria")}" (use Reserva, Investimentos, Previdência, PGBL, VGBL, Fundo fechado, FGTS, Imóvel, Veículo ou Bem).`,
      );
    }
    const nome = v("nome") || (cat?.categoria === "FGTS" ? "FGTS" : "");
    if (!nome) erros.push("Nome vazio.");
    else if (nome.length > 120) erros.push("Nome com mais de 120 caracteres.");

    const valor = lerValorBRL(v("valor"));
    if (valor === null) erros.push(`Valor inválido: "${v("valor")}".`);
    else if (valor < 0) erros.push("O valor não pode ser negativo (dívidas são cadastradas em Dívidas).");

    const data = lerData(v("data"), hoje);
    if (!data) erros.push(`Data inválida: "${v("data")}" (use 15/11/2026).`);
    else if (data > hoje) erros.push("A data do saldo não pode estar no futuro.");

    let risco: Risco | null = null;
    if (v("risco")) {
      risco = RISCOS[normalizarDescricao(v("risco"))] ?? null;
      if (!risco) erros.push(`Risco inválido: "${v("risco")}" (use baixo, médio ou alto).`);
    }

    // Bem e FGTS: só valor e data (o tipo do bem vai em produto). Sem instituição em Bem.
    const categoria = cat?.categoria;
    const instituicao = categoria === "Bem" ? null : v("instituicao").slice(0, 80) || null;
    const k = chave(nome, instituicao);
    if (nome && vistas.has(k)) erros.push("Ativo repetido na planilha (mesmo nome e instituição).");
    vistas.add(k);

    const existente = porChave.get(k);
    if (existente && (existente.categoria === "Equity" || existente.categoria === "Consórcio"))
      erros.push(`"${existente.nome}" é ${existente.categoria}: atualize direto no Patrimônio.`);

    if (erros.length) return { linha: i + 2, ok: false, erros, bruto: celulas };
    const comMercado = categoria !== "Bem" && categoria !== "FGTS";
    return {
      linha: i + 2,
      ok: true,
      dados: {
        nome,
        categoria: categoria!,
        instituicao: categoria === "FGTS" ? null : instituicao,
        produto: categoria === "Bem" ? cat!.produto ?? (v("produto").slice(0, 80) || null) : comMercado ? v("produto").slice(0, 80) || null : null,
        previdencia_tipo: categoria === "Previdência" ? (cat!.previdencia_tipo ?? null) : null,
        valor: valor!,
        data_saldo: data!,
        liquidez: comMercado ? v("liquidez").slice(0, 40) || null : null,
        risco: comMercado ? risco : null,
        ativo_id: existente?.id ?? null,
      },
    };
  });
  return { ok: true, linhas: resultado, ignoradas };
}
