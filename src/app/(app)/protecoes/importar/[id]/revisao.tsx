"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Aviso, Botao } from "@/components/ui";
import { processarApolice } from "@/app/actions/protecoes";
import { descartarImportacao } from "@/app/actions/importacao";
import type { DadosApolice } from "@/lib/apolices/modelo";
import { FormApolice } from "../../gestao";

export function RevisaoApolice({ id, apolice, erro: erroInicial }: { id: string; apolice?: DadosApolice; erro?: string }) {
  const router = useRouter();
  const [erro, setErro] = useState(erroInicial ?? null);
  const [pendente, iniciar] = useTransition();
  const descartar = (
    <Botao
      variante="secundario"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          await descartarImportacao(id);
          router.push("/protecoes");
        })
      }
    >
      Descartar leitura
    </Botao>
  );

  if (apolice)
    return (
      <div className="flex flex-col gap-4">
        <FormApolice inicial={apolice} importacaoId={id} aoSalvar={() => router.push("/protecoes")} />
        <div className="border-t border-border pt-3">{descartar}</div>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {erro && <Aviso tom="atencao">{erro}</Aviso>}
      {pendente && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin text-brand" aria-hidden /> Lendo de novo…
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Botao
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await processarApolice(id);
              if (r.erro) setErro(r.erro);
              else router.refresh();
            })
          }
        >
          Tentar de novo
        </Botao>
        {descartar}
      </div>
    </div>
  );
}
