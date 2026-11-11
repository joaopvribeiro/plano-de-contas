import { Construction } from "lucide-react";
import { Cartao } from "@/components/ui";

export function TituloPagina({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-navy sm:text-3xl">{titulo}</h1>
      {subtitulo && <p className="mt-1 text-sm text-muted">{subtitulo}</p>}
    </div>
  );
}

/** Marcador das abas que ganham conteúdo nas próximas etapas. */
export function EmConstrucao({ etapa, itens }: { etapa: number; itens: string[] }) {
  return (
    <Cartao className="border-dashed">
      <div className="flex items-start gap-3">
        <Construction className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="font-semibold">Esta aba chega na Etapa {etapa}.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {itens.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      </div>
    </Cartao>
  );
}
