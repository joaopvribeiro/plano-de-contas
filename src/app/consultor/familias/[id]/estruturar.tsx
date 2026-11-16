"use client";

import { useState, useTransition } from "react";
import { FileUp, Wand2 } from "lucide-react";
import { Aviso } from "@/components/ui";
import { aplicarRegrasPadrao } from "@/app/actions/consultor";
import { entrarNaFamilia } from "@/app/actions/sessao";

/** Passos para estruturar o planejamento antes de convidar a família. */
export function EstruturarFamilia({ familiaId }: { familiaId: string }) {
  const [msg, setMsg] = useState<{ tom: "positivo" | "negativo"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <form action={entrarNaFamilia}>
          <input type="hidden" name="familia_id" value={familiaId} />
          <input type="hidden" name="destino" value="/lancamentos/importar-previsto" />
          <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-contrast hover:bg-brand-mid">
            <FileUp className="size-4" aria-hidden /> Importar orçamento previsto
          </button>
        </form>
        <form action={entrarNaFamilia}>
          <input type="hidden" name="familia_id" value={familiaId} />
          <input type="hidden" name="destino" value="/lancamentos/regras" />
          <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2">
            Ver regras da família
          </button>
        </form>
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await aplicarRegrasPadrao(familiaId);
              setMsg(
                r.erro
                  ? { tom: "negativo", texto: r.erro }
                  : { tom: "positivo", texto: r.criadas ? `${r.criadas} regra(s) padrão adicionada(s).` : "A família já tem todas as regras padrão." },
              );
            })
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
        >
          <Wand2 className="size-4" aria-hidden /> {pendente ? "Aplicando…" : "Aplicar regras padrão"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Famílias novas já nascem com as regras padrão. “Aplicar” adiciona só as que faltam, sem alterar as que a família já
        tem.
      </p>
    </div>
  );
}
