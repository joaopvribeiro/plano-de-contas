"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { Aviso, Botao, CampoValidado, Seletor, Selo } from "@/components/ui";
import { Dialogo } from "@/components/dialogo";
import { arquivarCategoria, moverCategoria, salvarCategoria, type EstadoCadastro } from "@/app/actions/cadastros";
import { CLASSES, type Categoria } from "@/lib/dominio";

export function GestaoCategorias({ categorias }: { categorias: Categoria[] }) {
  const [editando, setEditando] = useState<Categoria | "nova" | null>(null);
  const [pendente, iniciar] = useTransition();
  const ativas = categorias.filter((c) => !c.arquivada);
  const arquivadas = categorias.filter((c) => c.arquivada);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">A classe padrão é sugerida ao escolher a categoria num lançamento.</p>
        <Botao onClick={() => setEditando("nova")} className="h-9 shrink-0">
          <Plus className="size-4" aria-hidden /> Nova categoria
        </Botao>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {ativas.map((c, i) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div>
              <p className="font-medium">{c.nome}</p>
              <p className="text-xs text-muted">{c.classe_padrao}</p>
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" disabled={pendente || i === 0} onClick={() => iniciar(() => moverCategoria(c.id, "cima"))} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30" aria-label={`Subir ${c.nome}`}>
                <ArrowUp className="size-4" aria-hidden />
              </button>
              <button type="button" disabled={pendente || i === ativas.length - 1} onClick={() => iniciar(() => moverCategoria(c.id, "baixo"))} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30" aria-label={`Descer ${c.nome}`}>
                <ArrowDown className="size-4" aria-hidden />
              </button>
              <button type="button" onClick={() => setEditando(c)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label={`Editar ${c.nome}`}>
                <Pencil className="size-4" aria-hidden />
              </button>
              <button type="button" disabled={pendente} onClick={() => iniciar(() => arquivarCategoria(c.id, true))} aria-label={`Arquivar ${c.nome}`} className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text">
                Arquivar
              </button>
            </div>
          </li>
        ))}
      </ul>

      {arquivadas.length > 0 && (
        <details className="rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium">Arquivadas ({arquivadas.length})</summary>
          <ul className="divide-y divide-border border-t border-border">
            {arquivadas.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>
                  {c.nome} <Selo tom="atencao">arquivada</Selo>
                </span>
                <button type="button" disabled={pendente} onClick={() => iniciar(() => arquivarCategoria(c.id, false))} aria-label={`Restaurar ${c.nome}`} className="rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10">
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialogo aberto={editando !== null} aoFechar={() => setEditando(null)} titulo={editando === "nova" ? "Nova categoria" : "Editar categoria"} largura="max-w-md">
        {editando !== null && (
          <FormCategoria key={editando === "nova" ? "nova" : editando.id} categoria={editando === "nova" ? undefined : editando} aoSalvar={() => setEditando(null)} />
        )}
      </Dialogo>
    </div>
  );
}

function FormCategoria({ categoria, aoSalvar }: { categoria?: Categoria; aoSalvar: () => void }) {
  const [estado, acao, salvando] = useActionState<EstadoCadastro, FormData>(salvarCategoria, undefined);
  useEffect(() => {
    if (estado?.salvoEm) aoSalvar();
  }, [estado?.salvoEm, aoSalvar]);

  return (
    <form action={acao} className="flex flex-col gap-4">
      {categoria && <input type="hidden" name="id" value={categoria.id} />}
      {estado?.erro && <Aviso tom="negativo">{estado.erro}</Aviso>}
      <CampoValidado rotulo="Nome" id="nome" defaultValue={categoria?.nome} required maxLength={40} />
      <Seletor rotulo="Classe padrão" id="classe_padrao" defaultValue={categoria?.classe_padrao ?? "Despesa básica"}>
        {CLASSES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Seletor>
      {categoria && (
        <p className="text-xs text-muted">Mudar a classe padrão não altera os lançamentos já feitos.</p>
      )}
      <Botao type="submit" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar"}
      </Botao>
    </form>
  );
}
