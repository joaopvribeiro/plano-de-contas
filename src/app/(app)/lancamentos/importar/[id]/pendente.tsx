"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Aviso, Botao, Cartao } from "@/components/ui";
import { descartarImportacao, processarImportacao } from "@/app/actions/importacao";

/** Importação cuja leitura falhou ou foi interrompida. */
export function LeituraPendente({ id, erro: erroInicial }: { id: string; erro: string | null }) {
  const router = useRouter();
  const [erro, setErro] = useState(erroInicial);
  const [pendente, iniciar] = useTransition();
  return (
    <Cartao className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Leitura não concluída</h2>
      <Aviso tom="atencao">{erro ?? "A leitura foi interrompida antes de terminar."}</Aviso>
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
              const r = await processarImportacao(id);
              if (r.erro) setErro(r.erro);
              else router.refresh();
            })
          }
        >
          Tentar de novo
        </Botao>
        <Botao
          variante="secundario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              await descartarImportacao(id);
              router.push("/lancamentos/importar");
            })
          }
        >
          Descartar
        </Botao>
      </div>
    </Cartao>
  );
}
