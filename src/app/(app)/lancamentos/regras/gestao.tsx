"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Repeat, Trash2, Wand2 } from "lucide-react";
import { Aviso, Botao, Caixa, CampoValidado, Seletor, Selo } from "@/components/ui";
import { Dialogo } from "@/components/dialogo";
import { excluirRegra, salvarRegra, type EstadoCadastro } from "@/app/actions/cadastros";
import { CLASSES, ROTULO_NATUREZA, type Categoria, type Conta, type Natureza, type Regra } from "@/lib/dominio";

export function GestaoRegras({ regras, categorias, contas }: { regras: Regra[]; categorias: Categoria[]; contas: Conta[] }) {
  const [editando, setEditando] = useState<Regra | "nova" | null>(null);
  const [excluindo, setExcluindo] = useState<Regra | null>(null);
  const [pendente, iniciar] = useTransition();
  const cat = new Map(categorias.map((c) => [c.id, c.nome]));
  const conta = new Map(contas.map((c) => [c.id, c.nome]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Quando a descrição contiver o texto da regra, o lançamento já vem preenchido. Vale ao digitar e ao importar.
        </p>
        <Botao onClick={() => setEditando("nova")} className="h-9 shrink-0">
          <Plus className="size-4" aria-hidden /> Nova regra
        </Botao>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {regras.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-muted">
            Nenhuma regra ainda. Ao corrigir um lançamento importado, você poderá criar uma.
          </li>
        )}
        {regras.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <Wand2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <p className="text-sm">
                Contém <strong className="font-mono">{r.padrao}</strong>
                <span className="text-muted"> → </span>
                {r.natureza === "fluxo" ? (
                  <>
                    {cat.get(r.categoria_id ?? "") ?? "?"} <span className="text-muted">· {r.classe}</span>
                  </>
                ) : (
                  ROTULO_NATUREZA[r.natureza]
                )}
                {r.conta_id && <span className="text-muted"> · {conta.get(r.conta_id)}</span>}{" "}
                {r.assinatura && (
                  <Selo tom="info">
                    <Repeat className="mr-0.5 size-3" aria-hidden /> assinatura
                  </Selo>
                )}
              </p>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => setEditando(r)} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label={`Editar regra ${r.padrao}`}>
                <Pencil className="size-4" aria-hidden />
              </button>
              <button type="button" onClick={() => setExcluindo(r)} className="rounded-md p-2 text-muted hover:bg-negative-soft hover:text-negative" aria-label={`Excluir regra ${r.padrao}`}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Dialogo aberto={editando !== null} aoFechar={() => setEditando(null)} titulo={editando === "nova" ? "Nova regra" : "Editar regra"} largura="max-w-md">
        {editando !== null && (
          <FormRegra
            key={editando === "nova" ? "nova" : editando.id}
            regra={editando === "nova" ? undefined : editando}
            categorias={categorias}
            contas={contas}
            aoSalvar={() => setEditando(null)}
          />
        )}
      </Dialogo>

      <Dialogo aberto={excluindo !== null} aoFechar={() => setExcluindo(null)} titulo="Excluir regra" largura="max-w-sm">
        <p className="text-sm">
          A regra “{excluindo?.padrao}” deixa de valer. Lançamentos já feitos não mudam.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setExcluindo(null)}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                if (excluindo) await excluirRegra(excluindo.id);
                setExcluindo(null);
              })
            }
          >
            Excluir
          </Botao>
        </div>
      </Dialogo>
    </div>
  );
}

function FormRegra({
  regra,
  categorias,
  contas,
  aoSalvar,
}: {
  regra?: Regra;
  categorias: Categoria[];
  contas: Conta[];
  aoSalvar: () => void;
}) {
  const [estado, acao, salvando] = useActionState<EstadoCadastro, FormData>(salvarRegra, undefined);
  const [natureza, setNatureza] = useState<Natureza>(regra?.natureza ?? "fluxo");
  useEffect(() => {
    if (estado?.salvoEm) aoSalvar();
  }, [estado?.salvoEm, aoSalvar]);

  return (
    <form action={acao} className="flex flex-col gap-4">
      {regra && <input type="hidden" name="id" value={regra.id} />}
      {estado?.erro && <Aviso tom="negativo">{estado.erro}</Aviso>}
      <CampoValidado rotulo="Quando a descrição contiver" id="padrao" defaultValue={regra?.padrao} placeholder="Ex.: PETZ" required minLength={2} className="uppercase" />
      <Seletor rotulo="Natureza" id="natureza" value={natureza} onChange={(e) => setNatureza(e.target.value as Natureza)}>
        {(Object.keys(ROTULO_NATUREZA) as Natureza[]).map((n) => (
          <option key={n} value={n}>
            {ROTULO_NATUREZA[n]}
          </option>
        ))}
      </Seletor>
      {natureza === "fluxo" && (
        <div className="grid grid-cols-2 gap-3">
          <Seletor rotulo="Categoria" id="categoria_id" defaultValue={regra?.categoria_id ?? ""} required>
            <option value="">Escolha…</option>
            {categorias
              .filter((c) => !c.arquivada || c.id === regra?.categoria_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Seletor>
          <Seletor rotulo="Classe" id="classe" defaultValue={regra?.classe ?? ""}>
            <option value="">Padrão da categoria</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Seletor>
        </div>
      )}
      <Seletor rotulo="Conta (opcional)" id="conta_id" defaultValue={regra?.conta_id ?? ""}>
        <option value="">Não definir</option>
        {contas
          .filter((c) => c.ativa || c.id === regra?.conta_id)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
      </Seletor>
      {natureza === "fluxo" && <Caixa rotulo="Marcar como assinatura" id="assinatura" defaultChecked={regra?.assinatura} />}
      <Botao type="submit" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar regra"}
      </Botao>
    </form>
  );
}
