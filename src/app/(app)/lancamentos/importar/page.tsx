import Link from "next/link";
import { FileText } from "lucide-react";
import { Aviso, Cartao, Selo } from "@/components/ui";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarCadastros } from "@/lib/lancamentos/consultas";
import { listarImportacoes, situacaoIA } from "@/lib/importacao/consultas";
import { formatDataHora } from "@/lib/format";
import { EnviarExtrato } from "./enviar";
import { ConsentimentoIA } from "./consentimento";

export const metadata = { title: "Importar extrato · Resolutto Family" };
// A leitura com IA roda dentro da ação desta página e pode levar alguns minutos.
export const maxDuration = 300;

const STATUS = {
  lendo: { rotulo: "Não concluída", tom: "atencao" },
  revisao: { rotulo: "Aguardando revisão", tom: "info" },
  confirmada: { rotulo: "Confirmada", tom: "positivo" },
  descartada: { rotulo: "Descartada", tom: "negativo" },
} as const;

export default async function PaginaImportar() {
  const { familia } = await obterFamiliaAtiva();
  const [cadastros, ia, historico] = await Promise.all([carregarCadastros(familia.id), situacaoIA(familia.id), listarImportacoes(familia.id)]);
  const contas = cadastros.contas.filter((c) => c.ativa);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Importar extrato ou fatura</h2>
        <p className="text-sm text-muted">
          Envie o extrato da conta ou a fatura do cartão. Você revisa tudo antes de gravar: nada entra nos lançamentos sem a sua
          confirmação.
        </p>
      </div>

      {!ia.consentimento && <ConsentimentoIA consultor={familia.consultor && familia.papel === "consultor"} />}

      {contas.length === 0 ? (
        <Aviso tom="atencao">
          Cadastre antes a conta ou o cartão em <Link href="/lancamentos/contas" className="font-semibold underline">Contas e cartões</Link>.
        </Aviso>
      ) : (
        <EnviarExtrato
          contas={contas.map(({ id, nome, tipo }) => ({ id, nome, tipo }))}
          ia={{ liberada: ia.consentimento && ia.disponivel, configurada: ia.disponivel, consentimento: ia.consentimento, restantes: ia.restantes, limite: ia.limite }}
        />
      )}

      <section aria-labelledby="historico" className="flex flex-col gap-2">
        <h3 id="historico" className="text-sm font-semibold">
          Importações recentes
        </h3>
        {historico.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma importação ainda.</p>
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
                      <span className="block truncate font-medium">{h.nomes_arquivos.join(", ") || "Arquivo"}</span>
                      <span className="block text-xs text-muted">
                        {formatDataHora(h.criado_em)} · {h.conta ?? "conta removida"}
                        {h.status === "confirmada" && ` · ${h.gravados} lançamento${h.gravados === 1 ? "" : "s"}`}
                        {h.status !== "confirmada" && h.itens !== null && ` · ${h.itens} lido${h.itens === 1 ? "" : "s"}`}
                        {h.status === "lendo" && h.erro && ` · ${h.erro}`}
                      </span>
                    </span>
                    <Selo tom={s.tom}>{s.rotulo}</Selo>
                    {aberta && (
                      <Link href={`/lancamentos/importar/${h.id}`} className="text-sm font-semibold text-brand hover:underline">
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
  );
}
