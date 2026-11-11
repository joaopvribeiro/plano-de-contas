import { z } from "zod";
import { CLASSES, NATUREZAS, SUBTIPOS_RECEITA, TIPOS } from "@/lib/dominio";
import { lerValorBRL, normalizarCampos } from "./regras-de-negocio";

const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês de competência.");
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const idOpcional = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());
const textoOpcional = (max: number) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v?.trim() ? v.trim() : null))
    .pipe(z.string().max(max).nullable());

/**
 * Lançamento vindo de formulário (strings) → objeto pronto para gravar.
 * Repete as regras do banco com mensagens em português e normaliza os campos
 * dependentes (natureza, classe, subtipo).
 */
export const esquemaLancamento = z
  .object({
    tipo: z.enum(TIPOS),
    natureza: z.enum(NATUREZAS),
    mes_competencia: mes,
    data: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .pipe(dataISO.nullable()),
    descricao: z.string().trim().min(1, "Informe a descrição.").max(200),
    valor: z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === "number" ? v : lerValorBRL(v)))
      .refine((v): v is number => v !== null, "Valor inválido.")
      .refine((v) => (v as number) > 0, "O valor precisa ser maior que zero.")
      .transform((v) => v as number),
    estorno: z.boolean().default(false),
    conta_id: idOpcional,
    categoria_id: idOpcional,
    classe: z
      .enum(CLASSES)
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    subtipo_receita: z
      .enum(SUBTIPOS_RECEITA)
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    ativo_id: idOpcional,
    assinatura: z.boolean().default(false),
    obs: textoOpcional(500),
  })
  .superRefine((l, ctx) => {
    if (l.natureza === "fluxo" && !l.classe) {
      ctx.addIssue({ code: "custom", path: ["classe"], message: "Escolha a classe." });
    }
    if (l.natureza === "fluxo" && !l.categoria_id) {
      ctx.addIssue({ code: "custom", path: ["categoria_id"], message: "Escolha a categoria." });
    }
    if (l.tipo === "Realizado" && !l.data) {
      ctx.addIssue({ code: "custom", path: ["data"], message: "Informe a data do lançamento realizado." });
    }
  })
  .transform((l) => normalizarCampos(l));

export type LancamentoEntrada = z.input<typeof esquemaLancamento>;
export type LancamentoValido = z.output<typeof esquemaLancamento>;

/** Edição em massa: só os campos marcados mudam. */
export const esquemaEdicaoEmMassa = z
  .object({
    ids: z.array(z.uuid()).min(1, "Selecione ao menos um lançamento.").max(500),
    natureza: z.enum(NATUREZAS).optional(),
    categoria_id: z.uuid().optional(),
    classe: z.enum(CLASSES).optional(),
    mes_competencia: mes.optional(),
  })
  .refine((d) => d.natureza || d.categoria_id || d.classe || d.mes_competencia, "Escolha o que alterar.");

/** Filtros da lista, lidos da URL. Valores inválidos são ignorados. */
export const esquemaFiltros = z.object({
  mes: z.union([mes, z.literal("todos")]).optional().catch(undefined),
  tipo: z.enum(TIPOS).optional().catch(undefined),
  natureza: z.enum(NATUREZAS).optional().catch(undefined),
  classe: z.enum(CLASSES).optional().catch(undefined),
  categoria: z.uuid().optional().catch(undefined),
  conta: z.union([z.uuid(), z.literal("sem")]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type Filtros = z.output<typeof esquemaFiltros>;
