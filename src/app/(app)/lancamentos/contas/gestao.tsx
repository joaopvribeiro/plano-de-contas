"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CreditCard, Landmark, Pencil, Plus, Wallet } from "lucide-react";
import { Aviso, Botao, CampoValidado, Seletor, Selo } from "@/components/ui";
import { Dialogo } from "@/components/dialogo";
import { alternarConta, excluirConta, salvarConta, type EstadoCadastro } from "@/app/actions/cadastros";
import { ROTULO_TIPO_CONTA, TIPOS_CONTA, type Conta, type TipoConta } from "@/lib/dominio";

const ICONE: Record<TipoConta, typeof Wallet> = {
  cartao_credito: CreditCard,
  conta_corrente: Landmark,
  dinheiro: Wallet,
  outro: Wallet,
};

export function GestaoContas({ contas }: { contas: Conta[] }) {
  const [editando, setEditando] = useState<Conta | "nova" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Cartões precisam do dia de fechamento: ele define o mês de competência das compras.
        </p>
        <Botao onClick={() => setEditando("nova")} className="h-9 shrink-0">
          <Plus className="size-4" aria-hidden /> Nova conta
        </Botao>
      </div>
      {erro && <Aviso tom="negativo">{erro}</Aviso>}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {contas.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">Nenhuma conta cadastrada.</li>}
        {contas.map((c) => {
          const Icone = ICONE[c.tipo];
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-surface-2 p-2 text-brand">
                  <Icone className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="font-medium">
                    {c.nome} {!c.ativa && <Selo tom="atencao">inativa</Selo>}
                  </p>
                  <p className="text-xs text-muted">
                    {ROTULO_TIPO_CONTA[c.tipo]}
                    {c.tipo === "cartao_credito" && ` · fecha dia ${c.dia_fechamento}, vence dia ${c.dia_vencimento}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setEditando(c)} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label={`Editar ${c.nome}`}>
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => iniciar(() => alternarConta(c.id, !c.ativa))}
                  aria-label={`${c.ativa ? "Desativar" : "Reativar"} ${c.nome}`}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text"
                >
                  {c.ativa ? "Desativar" : "Reativar"}
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() =>
                    iniciar(async () => {
                      setErro(null);
                      const r = await excluirConta(c.id);
                      if (r.erro) setErro(r.erro);
                    })
                  }
                  aria-label={`Excluir ${c.nome}`}
                  className="rounded-md px-2 py-1 text-xs font-medium text-negative hover:bg-negative-soft"
                >
                  Excluir
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialogo aberto={editando !== null} aoFechar={() => setEditando(null)} titulo={editando === "nova" ? "Nova conta" : "Editar conta"} largura="max-w-md">
        {editando !== null && (
          <FormConta key={editando === "nova" ? "nova" : editando.id} conta={editando === "nova" ? undefined : editando} aoSalvar={() => setEditando(null)} />
        )}
      </Dialogo>
    </div>
  );
}

function FormConta({ conta, aoSalvar }: { conta?: Conta; aoSalvar: () => void }) {
  const [estado, acao, salvando] = useActionState<EstadoCadastro, FormData>(salvarConta, undefined);
  const [tipo, setTipo] = useState<TipoConta>(conta?.tipo ?? "cartao_credito");
  useEffect(() => {
    if (estado?.salvoEm) aoSalvar();
  }, [estado?.salvoEm, aoSalvar]);

  return (
    <form action={acao} className="flex flex-col gap-4">
      {conta && <input type="hidden" name="id" value={conta.id} />}
      {estado?.erro && <Aviso tom="negativo">{estado.erro}</Aviso>}
      <CampoValidado rotulo="Nome" id="nome" defaultValue={conta?.nome} placeholder="Ex.: Nubank, CC - C6" required maxLength={60} />
      <Seletor rotulo="Tipo" id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoConta)}>
        {TIPOS_CONTA.map((t) => (
          <option key={t} value={t}>
            {ROTULO_TIPO_CONTA[t]}
          </option>
        ))}
      </Seletor>
      {tipo === "cartao_credito" && (
        <div className="grid grid-cols-2 gap-3">
          <CampoValidado rotulo="Dia de fechamento" id="dia_fechamento" type="number" min={1} max={31} defaultValue={conta?.dia_fechamento ?? ""} required />
          <CampoValidado rotulo="Dia de vencimento" id="dia_vencimento" type="number" min={1} max={31} defaultValue={conta?.dia_vencimento ?? ""} required />
        </div>
      )}
      <Botao type="submit" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar"}
      </Botao>
    </form>
  );
}
