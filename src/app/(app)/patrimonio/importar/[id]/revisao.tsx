"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Botao, Caixa, Cartao, Selo, cn } from "@/components/ui";
import { confirmarRelatorio } from "@/app/actions/relatorio";
import { descartarImportacao } from "@/app/actions/importacao";
import { formatBRL, formatData } from "@/lib/format";
import { CATEGORIAS_ATIVO, type CategoriaAtivo } from "@/lib/patrimonio";
import { ROTULO_ESTRATEGIA, type RelatorioLido } from "@/lib/relatorio/esquema";
import type { ConferenciaRelatorio, LinhaRelatorio, Sumido } from "@/lib/relatorio/revisao";

type Existente = { id: string; nome: string; categoria: CategoriaAtivo; instituicao: string | null; valor: number };
const CATEGORIAS_RELATORIO = CATEGORIAS_ATIVO.filter((c) => c !== "Consórcio" && c !== "Equity" && c !== "Bem");

const MOTIVO: Record<LinhaRelatorio["motivo"], string> = {
  existente: "atualiza ativo já cadastrado",
  previdencia: "previdência",
  reserva: "sugerida para a reserva (liquidez D+0/D+1, até a meta)",
  investimentos: "",
};

export function RevisaoRelatorio({
  id,
  nomes,
  relatorio,
  conferencia,
  linhasIniciais,
  sumidosIniciais,
  existentes,
  reserva,
  hoje,
}: {
  id: string;
  nomes: string[];
  relatorio: RelatorioLido;
  conferencia: ConferenciaRelatorio | null;
  linhasIniciais: LinhaRelatorio[];
  sumidosIniciais: Sumido[];
  existentes: Existente[];
  reserva: { meta: number; foraDoRelatorio: number };
  hoje: string;
}) {
  const router = useRouter();
  const [linhas, setLinhas] = useState(linhasIniciais);
  const [sumidos, setSumidos] = useState(sumidosIniciais);
  const [data, setData] = useState(relatorio.data_referencia && relatorio.data_referencia <= hoje ? relatorio.data_referencia : hoje);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const mudar = (idx: number, m: Partial<LinhaRelatorio>) => {
    setErro(null);
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.idx !== idx) return l;
        const nova = { ...l, ...m };
        // Ao escolher um ativo existente, a categoria passa a ser a dele.
        if ("ativo_id" in m && m.ativo_id) nova.categoria = existentes.find((a) => a.id === m.ativo_id)?.categoria ?? nova.categoria;
        return nova;
      }),
    );
  };

  const resumo = useMemo(() => {
    const marcadas = linhas.filter((l) => l.incluir);
    const porCategoria = new Map<CategoriaAtivo, number>();
    for (const l of marcadas) porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + l.valor);
    const contagem = new Map<string, number>();
    for (const l of marcadas) if (l.ativo_id) contagem.set(l.ativo_id, (contagem.get(l.ativo_id) ?? 0) + 1);
    const repetidos = [...contagem.values()].some((n) => n > 1);
    const reservaFinal = reserva.foraDoRelatorio + (porCategoria.get("Reserva") ?? 0);
    return { marcadas: marcadas.length, porCategoria, repetidos, reservaFinal, total: marcadas.reduce((s, l) => s + l.valor, 0) };
  }, [linhas, reserva.foraDoRelatorio]);

  function confirmar() {
    iniciar(async () => {
      const r = await confirmarRelatorio({
        id,
        data_referencia: data,
        linhas: linhas.map((l) => ({ idx: l.idx, incluir: l.incluir, ativo_id: l.ativo_id, categoria: l.categoria, nome: l.nome })),
        zerar: sumidos.filter((s) => s.zerar).map((s) => s.ativo.id),
      });
      if (r.erro) setErro(r.erro);
      else router.replace(`/patrimonio/importar/${id}?atualizados=${r.atualizados ?? 0}&criados=${r.criados ?? 0}&zerados=${r.zerados ?? 0}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Revisar relatório</h1>
        <p className="text-sm text-muted">
          {[relatorio.instituicao, relatorio.conta && `conta ${relatorio.conta}`, nomes.join(", ")].filter(Boolean).join(" · ")}
        </p>
      </div>

      {relatorio.avisos.length > 0 && (
        <Aviso tom="atencao">
          <ul className="list-disc pl-4">
            {relatorio.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {conferencia ? (
        <Aviso tom={conferencia.confere ? "positivo" : "atencao"}>
          Patrimônio bruto do relatório: {formatBRL(conferencia.esperado)}.{" "}
          {conferencia.confere
            ? "A soma das posições lidas confere."
            : `A soma das posições lidas dá ${formatBRL(conferencia.lido)} (diferença de ${formatBRL(conferencia.diferenca)}). Confira com o PDF antes de confirmar.`}
        </Aviso>
      ) : (
        <Aviso tom="atencao">O relatório não trouxe o patrimônio bruto total; confira a soma das posições ({formatBRL(resumo.total)}) com o PDF.</Aviso>
      )}

      <Cartao className="flex flex-wrap items-end gap-x-6 gap-y-3 p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="data_referencia" className="text-sm font-medium">
            Data de referência
          </label>
          <input
            id="data_referencia"
            type="date"
            value={data}
            max={hoje}
            onChange={(e) => setData(e.target.value)}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            aria-describedby="data-dica"
          />
        </div>
        <p id="data-dica" className="max-w-md text-xs text-muted">
          Os saldos entram no histórico nesta data{relatorio.data_referencia ? ` (lida do relatório: ${formatData(relatorio.data_referencia)})` : ""}.
        </p>
        <p className="text-xs text-muted">
          Meta da reserva: <span className="num font-medium text-text">{formatBRL(reserva.meta)}</span>
          <br />
          Reserva depois de confirmar: <span className={cn("num font-medium", resumo.reservaFinal >= reserva.meta ? "text-positive" : "text-warning")}>{formatBRL(resumo.reservaFinal)}</span>
          {reserva.foraDoRelatorio > 0 && ` (inclui ${formatBRL(reserva.foraDoRelatorio)} em outras instituições)`}
        </p>
      </Cartao>

      <Cartao className="p-0">
        <ul className="divide-y divide-border">
          {linhas.map((l) => (
            <li key={l.idx} className={cn("flex flex-col gap-2 px-4 py-3", !l.incluir && "bg-surface-2/60")}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={l.incluir}
                  onChange={(e) => mudar(l.idx, { incluir: e.target.checked })}
                  className="mt-1 size-4 accent-[var(--brand)]"
                  aria-label={`Incluir ${l.nome}${l.produto ? ` (${l.produto})` : ""}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium break-words">{l.nome}</span>
                    <Selo tom="info">{ROTULO_ESTRATEGIA[l.estrategia]}</Selo>
                    {MOTIVO[l.motivo] && <span className="text-xs text-muted">{MOTIVO[l.motivo]}</span>}
                  </p>
                  <p className="text-xs text-muted">{[l.produto, l.liquidez && `liquidez ${l.liquidez}`, `risco ${l.risco}`].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="num text-sm font-semibold whitespace-nowrap">{formatBRL(l.valor)}</p>
                  {l.valor_liquido !== null && <p className="num text-xs text-muted">líquido {formatBRL(l.valor_liquido)}</p>}
                </div>
              </div>
              {l.incluir && (
                <div className="flex flex-wrap items-end gap-2 pl-7">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`a${l.idx}-ativo`} className="text-xs text-muted">
                      Ativo
                    </label>
                    <select
                      id={`a${l.idx}-ativo`}
                      value={l.ativo_id ?? ""}
                      onChange={(e) => mudar(l.idx, { ativo_id: e.target.value || null })}
                      className="h-9 max-w-[16rem] rounded-lg border border-border bg-surface px-2 text-sm"
                    >
                      <option value="">Novo ativo</option>
                      {existentes.map((a) => (
                        <option key={a.id} value={a.id}>
                          Atualizar: {a.nome}
                          {a.instituicao ? ` (${a.instituicao})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`a${l.idx}-categoria`} className="text-xs text-muted">
                      Categoria
                    </label>
                    <select
                      id={`a${l.idx}-categoria`}
                      value={l.categoria}
                      onChange={(e) => mudar(l.idx, { categoria: e.target.value as CategoriaAtivo })}
                      className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
                    >
                      {CATEGORIAS_RELATORIO.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Cartao>

      {sumidos.length > 0 && (
        <Cartao className="flex flex-col gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">Ativos desta instituição que não estão no relatório</h2>
            <p className="text-xs text-muted">Se foram resgatados, marque para zerar o saldo (o histórico é mantido).</p>
          </div>
          {sumidos.map((s, i) => (
            <Caixa
              key={s.ativo.id}
              id={`zerar-${s.ativo.id}`}
              rotulo={`Zerar ${s.ativo.nome}`}
              dica={`${s.ativo.categoria} · saldo atual ${formatBRL(s.ativo.valor)}`}
              checked={s.zerar}
              onChange={(e) => setSumidos((xs) => xs.map((x, j) => (j === i ? { ...x, zerar: e.target.checked } : x)))}
            />
          ))}
        </Cartao>
      )}

      <Cartao className="flex flex-col gap-3 p-4 sm:sticky sm:bottom-4 sm:z-10 sm:shadow-lg">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>
            <strong>{resumo.marcadas}</strong> de {linhas.length} posições · {formatBRL(resumo.total)}
          </span>
          {[...resumo.porCategoria.entries()].map(([c, v]) => (
            <span key={c} className="text-muted">
              {c} {formatBRL(v)}
            </span>
          ))}
          {resumo.repetidos && <span className="font-semibold text-warning">Duas posições atualizam o mesmo ativo</span>}
        </div>
        {erro && <Aviso tom="negativo">{erro}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Botao onClick={confirmar} disabled={pendente || resumo.marcadas === 0 || resumo.repetidos || !data}>
            {pendente ? "Gravando…" : `Confirmar ${resumo.marcadas} posiç${resumo.marcadas === 1 ? "ão" : "ões"}`}
          </Botao>
          <Botao
            variante="secundario"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await descartarImportacao(id);
                if (r.erro) setErro(r.erro);
                else router.push("/patrimonio/importar");
              })
            }
          >
            Descartar relatório
          </Botao>
        </div>
      </Cartao>
    </div>
  );
}
