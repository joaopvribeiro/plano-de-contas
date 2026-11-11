/** Vocabulário fixo do sistema. Espelha os checks do banco. */

export const CLASSES_DESPESA = ["Despesa básica", "Padrão de vida", "Doações", "Sonhos"] as const;
export const CLASSES = ["Receita", ...CLASSES_DESPESA] as const;
export type Classe = (typeof CLASSES)[number];

export const NATUREZAS = ["fluxo", "transferencia", "aporte", "resgate"] as const;
export type Natureza = (typeof NATUREZAS)[number];
export const ROTULO_NATUREZA: Record<Natureza, string> = {
  fluxo: "Receita ou despesa",
  transferencia: "Transferência",
  aporte: "Aporte",
  resgate: "Resgate",
};

export const TIPOS = ["Previsto", "Realizado"] as const;
export type TipoLancamento = (typeof TIPOS)[number];

export const SUBTIPOS_RECEITA = ["Salário", "Pró-labore/distribuição", "Outras receitas"] as const;
export type SubtipoReceita = (typeof SUBTIPOS_RECEITA)[number];

export const TIPOS_CONTA = ["cartao_credito", "conta_corrente", "dinheiro", "outro"] as const;
export type TipoConta = (typeof TIPOS_CONTA)[number];
export const ROTULO_TIPO_CONTA: Record<TipoConta, string> = {
  cartao_credito: "Cartão de crédito",
  conta_corrente: "Conta corrente",
  dinheiro: "Dinheiro",
  outro: "Outro",
};

export const ORIGENS = ["manual", "ia", "ia-parcela", "planilha"] as const;
export type Origem = (typeof ORIGENS)[number];

export type Conta = {
  id: string;
  nome: string;
  tipo: TipoConta;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  ativa: boolean;
};

export type Categoria = {
  id: string;
  nome: string;
  classe_padrao: Classe;
  ordem: number;
  arquivada: boolean;
};

export type Regra = {
  id: string;
  padrao: string;
  natureza: Natureza;
  categoria_id: string | null;
  classe: Classe | null;
  conta_id: string | null;
  assinatura: boolean;
};

export type Lancamento = {
  id: string;
  tipo: TipoLancamento;
  natureza: Natureza;
  mes_competencia: string;
  data: string | null;
  descricao: string;
  valor: number;
  estorno: boolean;
  conta_id: string | null;
  categoria_id: string | null;
  classe: Classe | null;
  subtipo_receita: SubtipoReceita | null;
  parcela: string | null;
  grupo_parcela: string | null;
  realizado_id: string | null;
  ativo_id: string | null;
  assinatura: boolean;
  obs: string | null;
  origem: Origem;
};
