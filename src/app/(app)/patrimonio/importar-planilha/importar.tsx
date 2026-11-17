"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Download, FileUp, XCircle } from "lucide-react";
import { Aviso, Botao, Cartao, Selo } from "@/components/ui";
import { importarAtivosPlanilha } from "@/app/actions/patrimonio";
import { lerPlanilhaAtivos, MODELO_CSV_ATIVOS, type AtivoCadastrado, type LeituraAtivos } from "@/lib/planilha/ativos";
import { ROTULO_CATEGORIA } from "@/lib/patrimonio";
import { formatBRL, formatData } from "@/lib/format";

export function ImportarAtivos({ existentes, hoje }: { existentes: AtivoCadastrado[]; hoje: string }) {
  const [texto, setTexto] = useState("");
  const [leitura, setLeitura] = useState<LeituraAtivos | null>(null);
  const [resultado, setResultado] = useState<{ erro?: string; atualizados?: number; criados?: number } | null>(null);
  const [pendente, iniciar] = useTransition();

  function ler(t: string) {
    setTexto(t);
    setResultado(null);
    setLeitura(t.trim() ? lerPlanilhaAtivos(t, existentes, hoje) : null);
  }

  async function aoEscolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    const bytes = await arquivo.arrayBuffer();
    let t = new TextDecoder("utf-8").decode(bytes);
    if (t.includes("�")) t = new TextDecoder("windows-1252").decode(bytes);
    ler(t);
  }

  function baixarModelo() {
    const url = URL.createObjectURL(new Blob(["﻿" + MODELO_CSV_ATIVOS], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-ativos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const validas = useMemo(() => (leitura?.ok ? leitura.linhas.flatMap((l) => (l.ok ? [l] : [])) : []), [leitura]);
  const comErro = useMemo(() => (leitura?.ok ? leitura.linhas.flatMap((l) => (l.ok ? [] : [l])) : []), [leitura]);
  const total = validas.reduce((s, l) => s + l.dados.valor, 0);
  const nomeExistente = new Map(existentes.map((a) => [a.id, a.nome]));

  function importar() {
    iniciar(async () => {
      const r = await importarAtivosPlanilha(validas.map((l) => l.dados));
      setResultado(r);
      if (!r.erro) {
        setTexto("");
        setLeitura(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {resultado && !resultado.erro && (
        <Aviso tom="positivo">
          {resultado.atualizados} ativo(s) atualizado(s) e {resultado.criados} criado(s).{" "}
          <Link href="/patrimonio" className="font-semibold underline">
            Ver o Patrimônio
          </Link>
        </Aviso>
      )}
      {resultado?.erro && <Aviso tom="negativo">{resultado.erro}</Aviso>}

      <Cartao className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="planilha-ativos" className="text-sm font-medium">
            Cole aqui as linhas da planilha, com o cabeçalho
          </label>
          <div className="flex gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2">
              <FileUp className="size-4" aria-hidden /> Enviar CSV
              <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => aoEscolherArquivo(e.target.files?.[0])} />
            </label>
            <button type="button" onClick={baixarModelo} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-brand hover:bg-brand/10">
              <Download className="size-4" aria-hidden /> Baixar modelo
            </button>
          </div>
        </div>
        <textarea
          id="planilha-ativos"
          value={texto}
          onChange={(e) => ler(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={"nome\tcategoria\tinstituição\tproduto\tvalor\tdata\tliquidez\trisco\nCDB Liquidez Diária\tReserva\tBanco Inter\tCDB\t30.000,00\t15/11/2026\tD+0\tbaixo"}
          className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs focus:border-brand"
        />
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-medium">Colunas aceitas</summary>
          <p className="mt-2">
            Obrigatórias: nome, categoria e valor. Opcionais: instituição, produto, data do saldo (vazia = hoje), liquidez e risco (baixo, médio
            ou alto).
          </p>
          <p className="mt-1">
            Categorias: Reserva, Investimentos, Previdência (ou PGBL / VGBL), Fundo fechado, FGTS e bens (Imóvel, Terreno, Veículo ou Bem). Equity
            e consórcios têm campos próprios e são cadastrados direto no Patrimônio.
          </p>
        </details>
      </Cartao>

      {leitura && !leitura.ok && <Aviso tom="negativo">{leitura.erro}</Aviso>}

      {leitura?.ok && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1 text-positive">
              <CheckCircle2 className="size-4" aria-hidden /> {validas.length} linha(s) prontas · {formatBRL(total)}
            </span>
            {comErro.length > 0 && (
              <span className="inline-flex items-center gap-1 text-negative">
                <XCircle className="size-4" aria-hidden /> {comErro.length} com erro (não serão importadas)
              </span>
            )}
            {leitura.ignoradas.length > 0 && <span className="text-muted">Colunas ignoradas: {leitura.ignoradas.join(", ")}</span>}
          </div>

          {comErro.length > 0 && (
            <Cartao className="p-0">
              <h3 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-negative">Linhas com erro</h3>
              <ul className="max-h-64 divide-y divide-border overflow-y-auto text-sm">
                {comErro.map((l) => (
                  <li key={l.linha} className="px-4 py-2">
                    <span className="font-semibold">Linha {l.linha}:</span> {l.erros.join(" ")}
                    <span className="block truncate font-mono text-xs text-muted">{l.bruto.join(" | ")}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          {validas.length > 0 && (
            <Cartao className="overflow-x-auto p-0">
              <table className="num w-full text-sm">
                <caption className="border-b border-border px-4 py-2.5 text-left text-sm font-semibold">Conferência</caption>
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Ativo</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Categoria</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Valor</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Data</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">O que acontece</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {validas.map(({ linha, dados: d }) => (
                    <tr key={linha}>
                      <th scope="row" className="px-4 py-2 text-left font-medium">
                        {d.nome}
                        {d.instituicao && <span className="block text-xs font-normal text-muted">{d.instituicao}</span>}
                      </th>
                      <td className="px-4 py-2">
                        {ROTULO_CATEGORIA[d.categoria]}
                        {d.previdencia_tipo ? ` · ${d.previdencia_tipo}` : d.categoria === "Bem" && d.produto ? ` · ${d.produto}` : ""}
                      </td>
                      <td className="px-4 py-2 text-right">{formatBRL(d.valor)}</td>
                      <td className="px-4 py-2 text-right">{formatData(d.data_saldo)}</td>
                      <td className="px-4 py-2">
                        {d.ativo_id ? <Selo tom="info">Atualiza “{nomeExistente.get(d.ativo_id)}”</Selo> : <Selo tom="positivo">Novo</Selo>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Cartao>
          )}

          <Botao onClick={importar} disabled={pendente || validas.length === 0} className="self-start">
            {pendente ? "Importando…" : `Importar ${validas.length} ativo(s)`}
          </Botao>
        </>
      )}
    </div>
  );
}
