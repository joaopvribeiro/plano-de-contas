"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Download, FileUp, XCircle } from "lucide-react";
import { Aviso, Botao, Caixa, Cartao, cn } from "@/components/ui";
import { importarPrevisto } from "@/app/actions/lancamentos";
import { lerPlanilhaPrevisto, MODELO_CSV, type Cadastro, type CategoriaCadastro, type ResultadoLeitura } from "@/lib/planilha/previsto";
import { ROTULO_NATUREZA } from "@/lib/dominio";
import { formatBRL, formatMesCurto } from "@/lib/format";

export function ImportarPrevisto({
  contas,
  categorias,
  horizonte,
}: {
  contas: Cadastro[];
  categorias: CategoriaCadastro[];
  horizonte: { de: string; ate: string };
}) {
  const [texto, setTexto] = useState("");
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null);
  const [substituir, setSubstituir] = useState(false);
  const [resultado, setResultado] = useState<{ erro?: string; importadas?: number; removidas?: number } | null>(null);
  const [pendente, iniciar] = useTransition();

  function ler(t: string) {
    setTexto(t);
    setResultado(null);
    setLeitura(t.trim() ? lerPlanilhaPrevisto(t, { contas, categorias }) : null);
  }

  async function aoEscolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    // Planilhas brasileiras salvas pelo Excel costumam vir em Latin-1; tenta UTF-8 e cai para Windows-1252.
    const bytes = await arquivo.arrayBuffer();
    let t = new TextDecoder("utf-8").decode(bytes);
    if (t.includes("�")) t = new TextDecoder("windows-1252").decode(bytes);
    ler(t);
  }

  function baixarModelo() {
    const blob = new Blob(["﻿" + MODELO_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-orcamento-previsto.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const validas = useMemo(() => (leitura?.ok ? leitura.linhas.filter((l) => l.ok) : []), [leitura]);
  const comErro = useMemo(() => (leitura?.ok ? leitura.linhas.filter((l) => !l.ok) : []), [leitura]);
  const foraDoHorizonte = validas.filter((l) => l.ok && (l.dados.mes_competencia < horizonte.de || l.dados.mes_competencia > horizonte.ate)).length;

  // Resumo por mês para conferência rápida.
  const porMes = useMemo(() => {
    const m = new Map<string, { receitas: number; despesas: number; n: number }>();
    for (const l of validas) {
      if (!l.ok) continue;
      const item = m.get(l.dados.mes_competencia) ?? { receitas: 0, despesas: 0, n: 0 };
      if (l.dados.natureza === "fluxo") {
        if (l.dados.classe === "Receita") item.receitas += l.dados.valor;
        else item.despesas += l.dados.valor;
      }
      item.n++;
      m.set(l.dados.mes_competencia, item);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [validas]);

  function importar() {
    iniciar(async () => {
      const r = await importarPrevisto({ linhas: validas.flatMap((l) => (l.ok ? [l.dados] : [])), substituir });
      setResultado(r);
      if (!r.erro) {
        setTexto("");
        setLeitura(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {resultado?.importadas !== undefined && !resultado.erro && (
        <Aviso tom="positivo">
          {resultado.importadas} linhas importadas
          {resultado.removidas ? `; ${resultado.removidas} previstas antigas substituídas` : ""}.{" "}
          <Link href="/dashboard" className="font-semibold underline">
            Ver no Dashboard
          </Link>
        </Aviso>
      )}
      {resultado?.erro && <Aviso tom="negativo">{resultado.erro}</Aviso>}

      <Cartao className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="planilha" className="text-sm font-medium">
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
          id="planilha"
          value={texto}
          onChange={(e) => ler(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={"mês\tdescrição\tvalor\tconta\tcategoria\tclasse\tnatureza\tobs\n2026-12\tAluguel\t4.200,00\tCC - C6\tMoradia\t\t\t"}
          className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs focus:border-brand"
        />
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-medium">Colunas aceitas e cadastros desta família</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="font-semibold text-text">Colunas</p>
              <p>
                Obrigatórias: mês, descrição, valor. Opcionais: conta, categoria (obrigatória em receitas e despesas), classe
                (vazia = padrão da categoria), natureza (vazia, transferência, aporte ou resgate), obs.
              </p>
              <p className="mt-1">Mês: 2026-11, 11/2026 ou nov/26. Valor: 1.234,56 ou 1234.56, sempre positivo.</p>
            </div>
            <div>
              <p className="font-semibold text-text">Categorias</p>
              <p>{categorias.map((c) => c.nome).join(" · ")}</p>
            </div>
            <div>
              <p className="font-semibold text-text">Contas</p>
              <p>{contas.length ? contas.map((c) => c.nome).join(" · ") : "Nenhuma conta ativa. Cadastre em Contas e cartões."}</p>
            </div>
          </div>
        </details>
      </Cartao>

      {leitura && !leitura.ok && <Aviso tom="negativo">{leitura.erro}</Aviso>}

      {leitura?.ok && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1 text-positive">
              <CheckCircle2 className="size-4" aria-hidden /> {validas.length} linha(s) prontas
            </span>
            {comErro.length > 0 && (
              <span className="inline-flex items-center gap-1 text-negative">
                <XCircle className="size-4" aria-hidden /> {comErro.length} com erro (não serão importadas)
              </span>
            )}
            {leitura.ignoradas.length > 0 && <span className="text-muted">Colunas ignoradas: {leitura.ignoradas.join(", ")}</span>}
            {foraDoHorizonte > 0 && <span className="text-warning">{foraDoHorizonte} fora do horizonte</span>}
          </div>

          {comErro.length > 0 && (
            <Cartao className="p-0">
              <h3 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-negative">Linhas com erro</h3>
              <ul className="max-h-64 divide-y divide-border overflow-y-auto text-sm">
                {comErro.map((l) =>
                  l.ok ? null : (
                    <li key={l.linha} className="px-4 py-2">
                      <span className="font-semibold">Linha {l.linha}:</span> {l.erros.join(" ")}
                      <span className="block truncate font-mono text-xs text-muted">{l.bruto.join(" | ")}</span>
                    </li>
                  ),
                )}
              </ul>
            </Cartao>
          )}

          {porMes.length > 0 && (
            <Cartao className="overflow-x-auto p-0">
              <table className="num w-full text-sm">
                <caption className="border-b border-border px-4 py-2.5 text-left text-sm font-semibold">Conferência por mês</caption>
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Mês</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Linhas</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Receitas</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Despesas</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {porMes.map(([mes, v]) => (
                    <tr key={mes}>
                      <th scope="row" className={cn("px-4 py-2 text-left font-medium", (mes < horizonte.de || mes > horizonte.ate) && "text-warning")}>
                        {formatMesCurto(mes)}
                      </th>
                      <td className="px-4 py-2 text-right">{v.n}</td>
                      <td className="px-4 py-2 text-right">{formatBRL(v.receitas)}</td>
                      <td className="px-4 py-2 text-right">{formatBRL(v.despesas)}</td>
                      <td className={cn("px-4 py-2 text-right font-semibold", v.receitas - v.despesas < 0 && "text-negative")}>
                        {formatBRL(v.receitas - v.despesas)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-xs text-muted">
                Estornos, transferências, aportes e resgates não entram nesta soma. Primeiras linhas:{" "}
                {validas
                  .slice(0, 3)
                  .map((l) => (l.ok ? `${l.dados.descricao} (${l.dados.natureza === "fluxo" ? l.rotulos.categoria : ROTULO_NATUREZA[l.dados.natureza]})` : ""))
                  .join(", ")}
                {validas.length > 3 ? "…" : ""}
              </p>
            </Cartao>
          )}

          <Cartao className="flex flex-col gap-3">
            <Caixa
              rotulo="Substituir o previsto já importado por planilha nesses meses"
              id="substituir"
              checked={substituir}
              onChange={(e) => setSubstituir(e.target.checked)}
              dica="Use para corrigir uma importação. Previstos criados à mão e parcelas futuras não são apagados."
            />
            <Botao onClick={importar} disabled={pendente || validas.length === 0} className="self-start">
              {pendente ? "Importando…" : `Importar ${validas.length} linha(s)`}
            </Botao>
          </Cartao>
        </>
      )}
    </div>
  );
}
