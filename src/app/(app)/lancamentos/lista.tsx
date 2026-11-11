"use client";

import { useCallback, useMemo, useState, useTransition, useActionState, useEffect } from "react";
import { ArrowLeftRight, Plus, Repeat, Sparkles, Trash2, Pencil, TrendingUp, Undo2, X } from "lucide-react";
import { Aviso, Botao, Seletor, Selo, cn } from "@/components/ui";
import { Dialogo } from "@/components/dialogo";
import { FormLancamento, type DadosForm } from "./form-lancamento";
import { editarEmMassa, excluirLancamentos, type SugestaoRegra } from "@/app/actions/lancamentos";
import { salvarRegra, type EstadoCadastro } from "@/app/actions/cadastros";
import { CLASSES, ROTULO_NATUREZA, type Lancamento, type Natureza } from "@/lib/dominio";
import { efeitoNoSaldo } from "@/lib/lancamentos/regras-de-negocio";
import { formatBRL, formatData, formatMesCurto } from "@/lib/format";

type Props = DadosForm & {
  lancamentos: Lancamento[];
  mostrarMes: boolean;
  mesPadrao: string;
  hoje: string;
  meses: string[];
};

/** Valor com sinal e cor conforme o efeito no orçamento. */
function Valor({ l }: { l: Lancamento }) {
  if (l.natureza !== "fluxo") {
    const Icone = l.natureza === "transferencia" ? ArrowLeftRight : TrendingUp;
    return (
      <span className="num inline-flex items-center gap-1 text-muted" title={ROTULO_NATUREZA[l.natureza]}>
        <Icone className="size-3.5" aria-hidden />
        {formatBRL(l.valor)}
      </span>
    );
  }
  const efeito = efeitoNoSaldo(l);
  return (
    <span className={cn("num font-semibold", efeito > 0 ? "text-positive" : "text-text")}>
      {efeito > 0 ? "+" : "−"}
      {formatBRL(Math.abs(efeito)).replace("-", "")}
    </span>
  );
}

function Marcadores({ l }: { l: Lancamento }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {l.tipo === "Previsto" && <Selo tom="info">Previsto</Selo>}
      {l.parcela && <Selo tom="info">{l.parcela}</Selo>}
      {l.estorno && (
        <Selo tom="positivo">
          <Undo2 className="mr-0.5 size-3" aria-hidden />
          Estorno
        </Selo>
      )}
      {l.assinatura && (
        <Selo tom="info">
          <Repeat className="mr-0.5 size-3" aria-hidden />
          Assinatura
        </Selo>
      )}
      {(l.origem === "ia" || l.origem === "ia-parcela") && (
        <Selo tom="info">
          <Sparkles className="mr-0.5 size-3" aria-hidden />
          IA
        </Selo>
      )}
    </span>
  );
}

export function ListaLancamentos({ lancamentos, mostrarMes, mesPadrao, hoje, meses, ...dados }: Props) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<Lancamento | "novo" | null>(null);
  const [excluindo, setExcluindo] = useState<string[] | null>(null);
  const [emMassa, setEmMassa] = useState(false);
  const [sugestao, setSugestao] = useState<SugestaoRegra | null>(null);
  const [aviso, setAviso] = useState<{ tom: "positivo" | "negativo"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const nomeConta = useMemo(() => new Map(dados.contas.map((c) => [c.id, c.nome])), [dados.contas]);
  const nomeCategoria = useMemo(() => new Map(dados.categorias.map((c) => [c.id, c.nome])), [dados.categorias]);

  // Seleção só considera o que está na tela.
  const visiveis = useMemo(() => new Set(lancamentos.map((l) => l.id)), [lancamentos]);
  const sel = [...selecionados].filter((id) => visiveis.has(id));
  const todos = lancamentos.length > 0 && sel.length === lancamentos.length;

  function alternar(id: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const aoSalvar = useCallback((r: { ok: string; sugerirRegra?: SugestaoRegra }) => {
    setEditando(null);
    setAviso({ tom: "positivo", texto: r.ok });
    if (r.sugerirRegra) setSugestao(r.sugerirRegra);
  }, []);

  function confirmarExclusao() {
    if (!excluindo) return;
    const ids = excluindo;
    iniciar(async () => {
      const r = await excluirLancamentos(ids);
      setExcluindo(null);
      setSelecionados(new Set());
      setAviso(
        r.erro
          ? { tom: "negativo", texto: r.erro }
          : { tom: "positivo", texto: `${r.excluidos} lançamento(s) excluído(s).` },
      );
    });
  }

  return (
    <>
      {aviso && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md md:bottom-6">
          <Aviso tom={aviso.tom} className="flex items-center justify-between gap-3 shadow-lg">
            {aviso.texto}
            <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso" className="text-muted">
              <X className="size-4" aria-hidden />
            </button>
          </Aviso>
        </div>
      )}

      {/* Barra de ações: novo lançamento ou ações sobre a seleção */}
      <div className="sticky top-[53px] z-10 -mx-4 mb-3 flex min-h-12 items-center justify-between gap-2 border-b border-border bg-bg/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        {sel.length > 0 ? (
          <>
            <p className="text-sm font-medium">
              {sel.length} selecionado{sel.length > 1 ? "s" : ""}
              <button type="button" className="ml-2 text-muted hover:text-text" onClick={() => setSelecionados(new Set())}>
                limpar
              </button>
            </p>
            <div className="flex gap-2">
              <Botao variante="secundario" onClick={() => setEmMassa(true)} className="h-9" aria-label="Editar selecionados">
                <Pencil className="size-4" aria-hidden /> Editar
              </Botao>
              <Botao variante="secundario" onClick={() => setExcluindo(sel)} className="h-9 text-negative" aria-label="Excluir selecionados">
                <Trash2 className="size-4" aria-hidden /> Excluir
              </Botao>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              {lancamentos.length} lançamento{lancamentos.length === 1 ? "" : "s"}
            </p>
            <Botao onClick={() => setEditando("novo")} className="h-9">
              <Plus className="size-4" aria-hidden /> Novo lançamento
            </Botao>
          </>
        )}
      </div>

      {lancamentos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted">
          Nenhum lançamento com esses filtros.
        </div>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={todos}
                      onChange={() => setSelecionados(todos ? new Set() : new Set(lancamentos.map((l) => l.id)))}
                      className="size-4 accent-[var(--brand)]"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Data</th>
                  <th className="px-3 py-2.5 font-medium">Descrição</th>
                  <th className="px-3 py-2.5 font-medium">Categoria · Classe</th>
                  <th className="px-3 py-2.5 font-medium">Conta</th>
                  {mostrarMes && <th className="px-3 py-2.5 font-medium">Comp.</th>}
                  <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                  <th className="w-20 px-3 py-2.5">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lancamentos.map((l) => (
                  <tr key={l.id} className={cn("group hover:bg-surface-2/60", selecionados.has(l.id) && "bg-brand/5")}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${l.descricao}`}
                        checked={selecionados.has(l.id)}
                        onChange={() => alternar(l.id)}
                        className="size-4 accent-[var(--brand)]"
                      />
                    </td>
                    <td className="num px-3 py-2.5 whitespace-nowrap text-muted">{formatData(l.data)}</td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => setEditando(l)} className="text-left font-medium hover:text-brand">
                        {l.descricao}
                      </button>
                      <div className="mt-0.5">
                        <Marcadores l={l} />
                      </div>
                      {l.obs && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{l.obs}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.natureza === "fluxo" ? (
                        <>
                          {nomeCategoria.get(l.categoria_id ?? "") ?? "—"}
                          <span className="block text-xs text-muted">{l.classe}</span>
                        </>
                      ) : (
                        <span className="text-muted">{ROTULO_NATUREZA[l.natureza]}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted">{nomeConta.get(l.conta_id ?? "") ?? "—"}</td>
                    {mostrarMes && <td className="num px-3 py-2.5 text-muted">{formatMesCurto(l.mes_competencia)}</td>}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Valor l={l} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button type="button" onClick={() => setEditando(l)} className="rounded p-1.5 text-muted hover:bg-surface hover:text-text" aria-label={`Editar ${l.descricao}`}>
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button type="button" onClick={() => setExcluindo([l.id])} className="rounded p-1.5 text-muted hover:bg-negative-soft hover:text-negative" aria-label={`Excluir ${l.descricao}`}>
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: cartões */}
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface md:hidden">
            {lancamentos.map((l) => (
              <li key={l.id} className={cn("flex items-start gap-3 px-3 py-3", selecionados.has(l.id) && "bg-brand/5")}>
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${l.descricao}`}
                  checked={selecionados.has(l.id)}
                  onChange={() => alternar(l.id)}
                  className="mt-1 size-4 shrink-0 accent-[var(--brand)]"
                />
                <button type="button" onClick={() => setEditando(l)} className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.descricao}</span>
                    <span className="block text-xs text-muted">
                      {formatData(l.data)} · {l.natureza === "fluxo" ? nomeCategoria.get(l.categoria_id ?? "") : ROTULO_NATUREZA[l.natureza]}
                      {l.conta_id ? ` · ${nomeConta.get(l.conta_id)}` : ""}
                    </span>
                    <span className="mt-1 block">
                      <Marcadores l={l} />
                    </span>
                  </span>
                  <Valor l={l} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialogo aberto={editando !== null} aoFechar={() => setEditando(null)} titulo={editando === "novo" ? "Novo lançamento" : "Editar lançamento"}>
        {editando !== null && (
          <FormLancamento
            key={editando === "novo" ? "novo" : editando.id}
            {...dados}
            lancamento={editando === "novo" ? undefined : editando}
            mesPadrao={mesPadrao}
            hoje={hoje}
            aoSalvar={aoSalvar}
          />
        )}
      </Dialogo>

      <Dialogo aberto={excluindo !== null} aoFechar={() => setExcluindo(null)} titulo="Excluir lançamento" largura="max-w-sm">
        <p className="text-sm">
          {excluindo?.length === 1
            ? "Este lançamento será excluído. Não dá para desfazer."
            : `${excluindo?.length} lançamentos serão excluídos. Não dá para desfazer.`}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setExcluindo(null)}>
            Cancelar
          </Botao>
          <Botao variante="perigo" onClick={confirmarExclusao} disabled={pendente}>
            {pendente ? "Excluindo…" : "Excluir"}
          </Botao>
        </div>
      </Dialogo>

      <Dialogo aberto={emMassa} aoFechar={() => setEmMassa(false)} titulo={`Editar ${sel.length} lançamento(s)`}>
        {emMassa && (
          <FormEmMassa
            ids={sel}
            dados={dados}
            meses={meses}
            aoConcluir={(texto, tom) => {
              setEmMassa(false);
              if (tom === "positivo") setSelecionados(new Set());
              setAviso({ tom, texto });
            }}
          />
        )}
      </Dialogo>

      <Dialogo aberto={sugestao !== null} aoFechar={() => setSugestao(null)} titulo="Criar regra para os próximos?" largura="max-w-md">
        {sugestao && (
          <FormSugestaoRegra
            sugestao={sugestao}
            aoConcluir={(texto) => {
              setSugestao(null);
              if (texto) setAviso({ tom: "positivo", texto });
            }}
          />
        )}
      </Dialogo>
    </>
  );
}

function FormEmMassa({
  ids,
  dados,
  meses,
  aoConcluir,
}: {
  ids: string[];
  dados: DadosForm;
  meses: string[];
  aoConcluir: (texto: string, tom: "positivo" | "negativo") => void;
}) {
  const [natureza, setNatureza] = useState("");
  const [categoria, setCategoria] = useState("");
  const [classe, setClasse] = useState("");
  const [mes, setMes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const viraFluxo = natureza === "fluxo";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        iniciar(async () => {
          const r = await editarEmMassa({
            ids,
            natureza: natureza || undefined,
            categoria_id: categoria || undefined,
            classe: classe || undefined,
            mes_competencia: mes || undefined,
          });
          if (r.erro) setErro(r.erro);
          else aoConcluir(`${r.alterados} lançamento(s) alterado(s).`, "positivo");
        });
      }}
    >
      <p className="text-sm text-muted">Só os campos preenchidos mudam. Os demais ficam como estão.</p>
      {erro && <Aviso tom="negativo">{erro}</Aviso>}
      <Seletor rotulo="Natureza" id="massa-natureza" value={natureza} onChange={(e) => setNatureza(e.target.value)}>
        <option value="">Manter</option>
        {(Object.keys(ROTULO_NATUREZA) as Natureza[]).map((n) => (
          <option key={n} value={n}>
            {ROTULO_NATUREZA[n]}
          </option>
        ))}
      </Seletor>
      {(natureza === "" || viraFluxo) && (
        <div className="grid grid-cols-2 gap-3">
          <Seletor rotulo="Categoria" id="massa-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Manter</option>
            {dados.categorias
              .filter((c) => !c.arquivada)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Seletor>
          <Seletor rotulo="Classe" id="massa-classe" value={classe} onChange={(e) => setClasse(e.target.value)}>
            <option value="">{categoria ? "Padrão da categoria" : "Manter"}</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Seletor>
        </div>
      )}
      <Seletor rotulo="Mês de competência" id="massa-mes" value={mes} onChange={(e) => setMes(e.target.value)}>
        <option value="">Manter</option>
        {meses.map((m) => (
          <option key={m} value={m}>
            {formatMesCurto(m)}
          </option>
        ))}
      </Seletor>
      <Botao type="submit" disabled={pendente || (!natureza && !categoria && !classe && !mes)}>
        {pendente ? "Aplicando…" : "Aplicar"}
      </Botao>
    </form>
  );
}

function FormSugestaoRegra({ sugestao, aoConcluir }: { sugestao: SugestaoRegra; aoConcluir: (texto?: string) => void }) {
  const [estado, acao, salvando] = useActionState<EstadoCadastro, FormData>(salvarRegra, undefined);
  useEffect(() => {
    if (estado?.ok) aoConcluir(estado.ok);
  }, [estado, aoConcluir]);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <p className="text-sm">
        Quando a descrição contiver o texto abaixo, os próximos lançamentos importados vão para{" "}
        <strong>{sugestao.natureza === "fluxo" ? `${sugestao.categoria_nome} · ${sugestao.classe}` : ROTULO_NATUREZA[sugestao.natureza]}</strong>.
      </p>
      {estado?.erro && <Aviso tom="negativo">{estado.erro}</Aviso>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="padrao" className="text-sm font-medium">
          Quando a descrição contiver
        </label>
        <input id="padrao" name="padrao" defaultValue={sugestao.padrao} required minLength={2} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm uppercase focus:border-brand" />
      </div>
      <input type="hidden" name="natureza" value={sugestao.natureza} />
      <input type="hidden" name="categoria_id" value={sugestao.categoria_id ?? ""} />
      <input type="hidden" name="classe" value={sugestao.classe ?? ""} />
      <input type="hidden" name="conta_id" value={sugestao.conta_id ?? ""} />
      {sugestao.assinatura && <input type="hidden" name="assinatura" value="on" />}
      <div className="flex justify-end gap-2">
        <Botao type="button" variante="secundario" onClick={() => aoConcluir()}>
          Agora não
        </Botao>
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Criando…" : "Criar regra"}
        </Botao>
      </div>
    </form>
  );
}
