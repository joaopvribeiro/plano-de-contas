import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { Cartao, Selo } from "@/components/ui";
import { TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { situacaoIA } from "@/lib/importacao/consultas";
import { listarRelatorios } from "@/lib/relatorio/consultas";
import { formatData, formatDataHora } from "@/lib/format";
import { ConsentimentoIA } from "@/app/(app)/lancamentos/importar/consentimento";
import { EnviarRelatorio } from "./enviar";

export const metadata = { title: "Importar relatório · Resolutto Family" };
export const maxDuration = 300;

const STATUS = {
  lendo: { rotulo: "Não concluída", tom: "atencao" },
  revisao: { rotulo: "Aguardando revisão", tom: "info" },
  confirmada: { rotulo: "Confirmada", tom: "positivo" },
  descartada: { rotulo: "Descartada", tom: "negativo" },
} as const;

export default async function PaginaImportarRelatorio() {
  const { familia } = await obterFamiliaAtiva();
  const [ia, historico] = await Promise.all([situacaoIA(familia.id), listarRelatorios(familia.id)]);

  return (
    <>
      <Link href="/patrimonio" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Patrimônio
      </Link>
      <TituloPagina titulo="Importar relatório de investimentos" subtitulo={familia.nome} />
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted">
          Envie o PDF do relatório de performance da corretora (XP, BTG e outras). A IA lê as posições na data de referência; você revisa as
          categorias antes de gravar. Os saldos são sempre os brutos.
        </p>
        {!ia.consentimento && <ConsentimentoIA consultor={familia.consultor && familia.papel === "consultor"} />}
        <EnviarRelatorio ia={{ liberada: ia.consentimento && ia.disponivel, configurada: ia.disponivel, restantes: ia.restantes, limite: ia.limite }} />

        <section aria-labelledby="historico" className="flex flex-col gap-2">
          <h2 id="historico" className="text-sm font-semibold">
            Relatórios recentes
          </h2>
          {historico.length === 0 ? (
            <p className="text-sm text-muted">Nenhum relatório importado ainda.</p>
          ) : (
            <Cartao className="p-0">
              <ul className="divide-y divide-border">
                {historico.map((h) => {
                  const s = STATUS[h.status];
                  const aberta = h.status === "lendo" || h.status === "revisao";
                  return (
                    <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                      <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{h.nomes_arquivos.join(", ") || "Relatório"}</span>
                        <span className="block text-xs text-muted">
                          Enviado em {formatDataHora(h.criado_em)}
                          {h.instituicao && ` · ${h.instituicao}`}
                          {h.data_referencia && ` · posição de ${formatData(h.data_referencia)}`}
                          {h.posicoes !== null && ` · ${h.posicoes} posições`}
                          {h.status === "lendo" && h.erro && ` · ${h.erro}`}
                        </span>
                      </span>
                      <Selo tom={s.tom}>{s.rotulo}</Selo>
                      {aberta && (
                        <Link href={`/patrimonio/importar/${h.id}`} className="text-sm font-semibold text-brand hover:underline">
                          {h.status === "revisao" ? "Revisar" : "Abrir"}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Cartao>
          )}
        </section>
      </div>
    </>
  );
}
