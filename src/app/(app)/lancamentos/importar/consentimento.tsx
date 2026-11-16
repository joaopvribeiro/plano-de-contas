"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Aviso, Botao, Cartao } from "@/components/ui";
import { consentirIA } from "@/app/actions/importacao";

/** Autorização para enviar documentos à IA. O consultor registra em nome da família, declarando que ela autorizou. */
export function ConsentimentoIA({ consultor }: { consultor: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <Cartao className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-brand" aria-hidden /> Leitura com IA
      </h3>
      <div className="flex flex-col gap-2 text-sm text-muted">
        <p>
          Para ler PDFs e fotos, o arquivo é enviado à Anthropic, empresa responsável pela IA Claude, que devolve as transações. Os
          dados enviados por esse canal não são usados para treinar modelos.
        </p>
        <p>
          O arquivo original é apagado daqui assim que a importação é confirmada ou descartada. Em OFX e CSV, só a descrição, o sentido e
          o valor das linhas sem regra vão para a IA, para sugerir a categoria.
        </p>
        <p>Sem esta autorização, você ainda pode importar OFX e CSV, sem sugestões da IA.</p>
      </div>
      {erro && <Aviso tom="negativo">{erro}</Aviso>}
      <div>
        <Botao
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await consentirIA();
              setErro(r.erro ?? null);
            })
          }
        >
          {consultor ? "Declaro que a família autorizou" : "Autorizo o uso de IA"}
        </Botao>
      </div>
    </Cartao>
  );
}
