"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Wand2 } from "lucide-react";
import { Aviso, Botao, Caixa, CampoValidado, Seletor, cn } from "@/components/ui";
import { salvarLancamento, type EstadoLancamento, type SugestaoRegra } from "@/app/actions/lancamentos";
import {
  CLASSES,
  CLASSES_DESPESA,
  ROTULO_NATUREZA,
  SUBTIPOS_RECEITA,
  type Categoria,
  type Classe,
  type Conta,
  type Lancamento,
  type Natureza,
  type Regra,
} from "@/lib/dominio";
import { regraParaDescricao, sugerirCompetencia } from "@/lib/lancamentos/regras-de-negocio";
import { formatMesLongo } from "@/lib/format";

export type DadosForm = {
  contas: Conta[];
  categorias: Categoria[];
  regras: Regra[];
  ativos: { id: string; nome: string }[];
};

type Props = DadosForm & {
  lancamento?: Lancamento;
  mesPadrao: string;
  hoje: string;
  aoSalvar: (r: { ok: string; sugerirRegra?: SugestaoRegra }) => void;
};

function valorParaTexto(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FormLancamento({ contas, categorias, regras, ativos, lancamento: l, mesPadrao, hoje, aoSalvar }: Props) {
  const [estado, acao, salvando] = useActionState<EstadoLancamento, FormData>(salvarLancamento, undefined);

  const [tipo, setTipo] = useState(l?.tipo ?? "Realizado");
  const [natureza, setNatureza] = useState<Natureza>(l?.natureza ?? "fluxo");
  const [descricao, setDescricao] = useState(l?.descricao ?? "");
  const [data, setData] = useState(l?.data ?? (l ? "" : hoje));
  const [contaId, setContaId] = useState(l?.conta_id ?? "");
  // null = segue a sugestão da fatura; texto = o usuário escolheu o mês.
  const [mesManual, setMesManual] = useState<string | null>(l?.mes_competencia ?? null);
  const [categoriaId, setCategoriaId] = useState(l?.categoria_id ?? "");
  const [classe, setClasse] = useState<Classe | "">(l?.classe ?? "");
  const [assinatura, setAssinatura] = useState(l?.assinatura ?? false);
  const [regraAplicada, setRegraAplicada] = useState<string | null>(null);

  // O que o usuário mexeu à mão não é sobrescrito por sugestões automáticas.
  const tocados = useRef(new Set<string>(l ? ["categoria", "classe", "conta", "natureza"] : []));
  const tocar = (campo: string) => tocados.current.add(campo);

  const conta = contas.find((c) => c.id === contaId);
  const ehCartao = conta?.tipo === "cartao_credito";
  const mesSugerido = data ? sugerirCompetencia(data, conta) : null;
  const mes = mesManual ?? mesSugerido ?? mesPadrao;

  // Aplica a regra aprendida ao digitar a descrição (só nos campos não tocados).
  function aoMudarDescricao(texto: string) {
    setDescricao(texto);
    const r = regraParaDescricao(texto, regras);
    if (!r) {
      setRegraAplicada(null);
      return;
    }
    setRegraAplicada(r.padrao);
    if (!tocados.current.has("natureza")) setNatureza(r.natureza);
    if (r.categoria_id && !tocados.current.has("categoria")) setCategoriaId(r.categoria_id);
    if (r.classe && !tocados.current.has("classe")) setClasse(r.classe);
    if (r.conta_id && !tocados.current.has("conta")) setContaId(r.conta_id);
    if (r.assinatura) setAssinatura(true);
  }

  function aoMudarCategoria(id: string) {
    tocar("categoria");
    setCategoriaId(id);
    const cat = categorias.find((c) => c.id === id);
    if (cat && !tocados.current.has("classe")) setClasse(cat.classe_padrao);
  }

  // Avisa a lista quando salvar deu certo.
  const ultimoSalvo = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (estado?.ok && estado.salvoEm && estado.salvoEm !== ultimoSalvo.current) {
      ultimoSalvo.current = estado.salvoEm;
      aoSalvar({ ok: estado.ok, sugerirRegra: estado.sugerirRegra });
    }
  }, [estado, aoSalvar]);

  const categoriasVisiveis = useMemo(
    () => categorias.filter((c) => !c.arquivada || c.id === l?.categoria_id),
    [categorias, l?.categoria_id],
  );
  const contasVisiveis = contas.filter((c) => c.ativa || c.id === l?.conta_id);
  const erros = estado?.erros ?? {};
  const fluxo = natureza === "fluxo";
  const receita = fluxo && classe === "Receita";

  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      {l && <input type="hidden" name="id" value={l.id} />}
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="natureza" value={natureza} />

      {estado?.erro && <Aviso tom="negativo">{estado.erro}</Aviso>}

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-1 text-sm" role="radiogroup" aria-label="Tipo">
        {(["Realizado", "Previsto"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            onClick={() => setTipo(t)}
            className={cn("rounded-md py-1.5 font-medium", tipo === t ? "bg-surface shadow-sm" : "text-muted")}
          >
            {t}
          </button>
        ))}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Natureza</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ROTULO_NATUREZA) as Natureza[]).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={natureza === n}
              onClick={() => {
                tocar("natureza");
                setNatureza(n);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                natureza === n ? "border-brand bg-brand/10 font-semibold text-brand" : "border-border text-muted hover:text-text",
              )}
            >
              {ROTULO_NATUREZA[n]}
            </button>
          ))}
        </div>
        {natureza === "transferencia" && (
          <p className="mt-1.5 text-xs text-muted">
            Pagamento de fatura ou transferência entre contas da família. Fica fora da DFC.
          </p>
        )}
      </fieldset>

      <div>
        <CampoValidado
          rotulo="Descrição"
          id="descricao"
          value={descricao}
          onChange={(e) => aoMudarDescricao(e.target.value)}
          erro={erros.descricao}
          autoComplete="off"
          required
          autoFocus={!l}
        />
        {regraAplicada && (
          <p className="mt-1 flex items-center gap-1 text-xs text-brand">
            <Wand2 className="size-3.5" aria-hidden /> Regra aplicada: contém “{regraAplicada}”
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CampoValidado
          rotulo="Valor (R$)"
          id="valor"
          inputMode="decimal"
          placeholder="0,00"
          defaultValue={l ? valorParaTexto(l.valor) : ""}
          erro={erros.valor}
          required
          className="num"
        />
        <CampoValidado
          rotulo="Data"
          id="data"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          erro={erros.data}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Seletor
          rotulo={receita ? "Conta (opcional)" : "Conta ou cartão"}
          id="conta_id"
          value={contaId}
          onChange={(e) => {
            tocar("conta");
            setContaId(e.target.value);
          }}
        >
          <option value="">Sem conta</option>
          {contasVisiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Seletor>
        <div>
          <CampoValidado
            rotulo="Mês de competência"
            id="mes_competencia"
            type="month"
            value={mes}
            onChange={(e) => setMesManual(e.target.value)}
            erro={erros.mes_competencia}
            required
          />
          {ehCartao && mesSugerido && (
            <p className="mt-1 text-xs text-muted">
              Fatura que fecha dia {conta?.dia_fechamento}: {formatMesLongo(mesSugerido)}.
              {mes !== mesSugerido && (
                <button
                  type="button"
                  className="ml-1 font-semibold text-brand hover:underline"
                  onClick={() => setMesManual(null)}
                >
                  Usar
                </button>
              )}
            </p>
          )}
        </div>
      </div>

      {fluxo && (
        <div className="grid grid-cols-2 gap-3">
          <Seletor
            rotulo="Categoria"
            id="categoria_id"
            value={categoriaId}
            onChange={(e) => aoMudarCategoria(e.target.value)}
            erro={erros.categoria_id}
          >
            <option value="">Escolha…</option>
            {categoriasVisiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.arquivada ? " (arquivada)" : ""}
              </option>
            ))}
          </Seletor>
          <Seletor
            rotulo="Classe"
            id="classe"
            value={classe}
            onChange={(e) => {
              tocar("classe");
              setClasse(e.target.value as Classe);
            }}
            erro={erros.classe}
          >
            <option value="">Escolha…</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Seletor>
        </div>
      )}

      {receita && (
        <Seletor rotulo="Tipo de receita" id="subtipo_receita" defaultValue={l?.subtipo_receita ?? "Salário"}>
          {SUBTIPOS_RECEITA.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Seletor>
      )}

      {(natureza === "aporte" || natureza === "resgate") && (
        <Seletor rotulo="Investimento (opcional)" id="ativo_id" defaultValue={l?.ativo_id ?? ""}>
          <option value="">Não vincular</option>
          {ativos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </Seletor>
      )}

      {fluxo && (
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
          <Caixa
            rotulo="Estorno ou reembolso"
            id="estorno"
            defaultChecked={l?.estorno}
            dica="Abate o valor da categoria em vez de somar."
          />
          {classe && (CLASSES_DESPESA as readonly string[]).includes(classe) && (
            <Caixa
              rotulo="Assinatura"
              id="assinatura"
              checked={assinatura}
              onChange={(e) => setAssinatura(e.target.checked)}
              dica="Cobrança recorrente fixa."
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="obs" className="text-sm font-medium">
          Observação
        </label>
        <textarea
          id="obs"
          name="obs"
          rows={2}
          maxLength={500}
          defaultValue={l?.obs ?? ""}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-brand"
        />
      </div>

      {l?.parcela && (
        <p className="text-xs text-muted">
          Parcela {l.parcela}. Para quitar ou antecipar, use “Compras parceladas do mês”.
        </p>
      )}

      <Botao type="submit" disabled={salvando} className="mt-1">
        {salvando ? "Salvando…" : l ? "Salvar alterações" : "Criar lançamento"}
      </Botao>
    </form>
  );
}
