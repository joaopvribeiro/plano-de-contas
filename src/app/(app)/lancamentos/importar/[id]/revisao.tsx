"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Link2 } from "lucide-react";
import { Aviso, Botao, Caixa, Cartao, Selo, cn } from "@/components/ui";
import { confirmarImportacao, descartarImportacao } from "@/app/actions/importacao";
import { CLASSES, NATUREZAS, ROTULO_NATUREZA, type Classe, type Natureza } from "@/lib/dominio";
import { formatBRL, formatData, formatMesCurto } from "@/lib/format";
import { normalizarDescricao, sugerirPadrao } from "@/lib/lancamentos/regras-de-negocio";
import { conferirTotal, editarLinha, parcelasFuturas, pendenciaDaLinha, type LinhaRevisao } from "@/lib/importacao/revisao";
import type { DocumentoLido } from "@/lib/importacao/tipos";

type Categoria = { id: string; nome: string; classe_padrao: Classe };
type LinhaTela = LinhaRevisao & { criar_regra: boolean; padrao_regra: string };
type Mudanca = Parameters<typeof editarLinha>[1] & { criar_regra?: boolean; padrao_regra?: string };

const ROTULO_SUGESTAO = { regra: "regra", ia: "sugestão da IA", padrao: "padrão", manual: "ajustada" } as const;
const ORIGEM = { ofx: "OFX", csv: "CSV", ia: "leitura com IA" } as const;

export function RevisaoImportacao({
  id,
  conta,
  documento,
  origem,
  nomes,
  categorias,
  linhasIniciais,
  mesFatura: mesFaturaInicial,
}: {
  id: string;
  conta: { nome: string; cartao: boolean };
  documento: Pick<DocumentoLido, "tipo" | "banco" | "fechamento" | "vencimento" | "avisos" | "total_fatura" | "saldo_inicial" | "saldo_final">;
  origem: "ofx" | "csv" | "ia";
  nomes: string[];
  categorias: Categoria[];
  linhasIniciais: LinhaRevisao[];
  mesFatura: string | null;
}) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<LinhaTela[]>(() => linhasIniciais.map((l) => ({ ...l, criar_regra: false, padrao_regra: sugerirPadrao(l.descricao) })));
  const [mesFatura, setMesFatura] = useState(mesFaturaInicial ?? linhasIniciais[0]?.mes_competencia ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function mudar(idx: number, m: Mudanca) {
    setErro(null);
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.idx !== idx) return l;
        const { criar_regra, padrao_regra, ...resto } = m;
        const nova = Object.keys(resto).length ? editarLinha(l, resto, categorias) : l;
        return { ...nova, criar_regra: criar_regra ?? l.criar_regra, padrao_regra: padrao_regra ?? l.padrao_regra };
      }),
    );
  }

  function mudarMesFatura(mes: string) {
    setMesFatura(mes);
    if (/^\d{4}-\d{2}$/.test(mes)) setLinhas((ls) => ls.map((l) => ({ ...l, mes_competencia: mes })));
  }

  const resumo = useMemo(() => {
    const marcadas = linhas.filter((l) => l.incluir);
    const pendentes = marcadas.filter((l) => pendenciaDaLinha(l)).length;
    const regras = marcadas.filter((l) => l.criar_regra && l.sugestao !== "regra");
    const regrasInvalidas = regras.filter((l) => !padraoValido(l)).length;
    let receitas = 0;
    let despesas = 0;
    for (const l of marcadas) {
      if (l.natureza !== "fluxo") continue;
      const v = l.estorno ? -l.valor : l.valor;
      if (l.classe === "Receita") receitas += v;
      else despesas += v;
    }
    const futuras = marcadas.filter((l) => l.criar_futuras && !l.vinculo).reduce((s, l) => s + parcelasFuturas(l).length, 0);
    return { marcadas: marcadas.length, pendentes, receitas, despesas, futuras, regras: regras.length, regrasInvalidas };
  }, [linhas]);

  const conferencia = useMemo(() => conferirTotal({ ...documento, itens: [] } as DocumentoLido, linhas), [documento, linhas]);

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const r = await confirmarImportacao({
        id,
        linhas: linhas.map((l) => ({
          idx: l.idx,
          incluir: l.incluir,
          natureza: l.natureza,
          categoria_id: l.categoria_id,
          classe: l.classe,
          mes_competencia: l.mes_competencia,
          criar_futuras: l.criar_futuras,
          criar_regra: l.criar_regra,
          padrao_regra: l.padrao_regra,
        })),
      });
      if (r.erro) setErro(r.erro);
      // A página passa a mostrar o resumo da importação confirmada.
      else router.replace(`/lancamentos/importar/${id}${r.regras ? `?regras=${r.regras}` : ""}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Revisar importação</h2>
        <p className="text-sm text-muted">
          {conta.nome} · {nomes.join(", ")} · {ORIGEM[origem]}
          {documento.banco ? ` · ${documento.banco}` : ""}
          {documento.vencimento ? ` · vence ${formatData(documento.vencimento)}` : ""}
        </p>
      </div>

      {documento.avisos.length > 0 && (
        <Aviso tom="atencao">
          <ul className="list-disc pl-4">
            {documento.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {conferencia && (
        <Aviso tom={conferencia.confere ? "positivo" : "atencao"}>
          {conferencia.confere ? (
            <>
              {conferencia.rotulo}: {formatBRL(conferencia.esperado)}. A soma das linhas lidas confere.
            </>
          ) : (
            <>
              {conferencia.rotulo}: {formatBRL(conferencia.esperado)}. A soma das linhas lidas dá {formatBRL(conferencia.lido)} (diferença de{" "}
              {formatBRL(conferencia.diferenca)}). Pode ser saldo anterior, encargo ou linha que a leitura não pegou: confira com o documento.
            </>
          )}
        </Aviso>
      )}

      {conta.cartao && (
        <Cartao className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mes_fatura" className="text-sm font-medium">
              Mês da fatura
            </label>
            <input
              id="mes_fatura"
              type="month"
              value={mesFatura}
              onChange={(e) => mudarMesFatura(e.target.value)}
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              aria-describedby="mes_fatura-dica"
            />
          </div>
          <p id="mes_fatura-dica" className="max-w-xl text-xs text-muted">
            Competência de todas as linhas desta fatura, inclusive parcelas de compras feitas em meses anteriores. Padrão: o mês do
            fechamento{documento.fechamento ? ` (fechamento lido: ${formatData(documento.fechamento)})` : documento.vencimento ? ` (estimado pelo vencimento em ${formatData(documento.vencimento)})` : ""}.
          </p>
        </Cartao>
      )}

      <Cartao className="p-0">
        <ul className="divide-y divide-border">
          {linhas.map((l, i) => (
            <Linha
              key={l.idx}
              l={l}
              primeiraTransferencia={l.natureza === "transferencia" && linhas[i - 1]?.natureza !== "transferencia"}
              categorias={categorias}
              cartao={conta.cartao}
              onMudar={(m) => mudar(l.idx, m)}
            />
          ))}
        </ul>
      </Cartao>

      <Cartao className="flex flex-col gap-3 p-4 sm:sticky sm:bottom-4 sm:z-10 sm:shadow-lg">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>
            <strong>{resumo.marcadas}</strong> de {linhas.length} marcados
          </span>
          {resumo.receitas !== 0 && <span>Receitas {formatBRL(resumo.receitas)}</span>}
          {resumo.despesas !== 0 && <span>Despesas {formatBRL(resumo.despesas)}</span>}
          {resumo.futuras > 0 && <span>{resumo.futuras} parcelas futuras</span>}
          {resumo.regras > 0 && <span>{resumo.regras} regra{resumo.regras === 1 ? "" : "s"} nova{resumo.regras === 1 ? "" : "s"}</span>}
          {resumo.regrasInvalidas > 0 && (
            <span className="font-semibold text-warning">
              {resumo.regrasInvalidas} regra{resumo.regrasInvalidas === 1 ? "" : "s"} com texto que não aparece na descrição
            </span>
          )}
          {resumo.pendentes > 0 && (
            <span className="font-semibold text-warning">
              {resumo.pendentes} sem categoria
            </span>
          )}
        </div>
        {erro && <Aviso tom="negativo">{erro}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Botao onClick={confirmar} disabled={pendente || resumo.marcadas === 0 || resumo.pendentes > 0 || resumo.regrasInvalidas > 0}>
            {pendente ? "Gravando…" : `Confirmar ${resumo.marcadas} lançamento${resumo.marcadas === 1 ? "" : "s"}`}
          </Botao>
          <Botao
            variante="secundario"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await descartarImportacao(id);
                if (r.erro) setErro(r.erro);
                else router.push("/lancamentos/importar");
              })
            }
          >
            Descartar importação
          </Botao>
        </div>
      </Cartao>
    </div>
  );
}

function Linha({
  l,
  primeiraTransferencia,
  categorias,
  cartao,
  onMudar,
}: {
  l: LinhaTela;
  primeiraTransferencia: boolean;
  categorias: Categoria[];
  cartao: boolean;
  onMudar: (m: Mudanca) => void;
}) {
  const pend = pendenciaDaLinha(l);
  const base = `l${l.idx}`;
  const futuras = l.parcela && !l.vinculo ? parcelasFuturas(l) : [];
  return (
    <li className={cn("flex flex-col gap-2 px-4 py-3", !l.incluir && "bg-surface-2/60")}>
      {primeiraTransferencia && <p className="text-xs font-semibold tracking-wide text-muted uppercase">Transferências</p>}
      <div className="flex items-start gap-3">
        <input
          id={`${base}-incluir`}
          type="checkbox"
          checked={l.incluir}
          onChange={(e) => onMudar({ incluir: e.target.checked })}
          className="mt-1 size-4 accent-[var(--brand)]"
          aria-label={`Incluir ${l.descricao}`}
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-muted tabular-nums">{formatData(l.data).slice(0, 5)}</span>
            <span className="font-medium break-words">{l.descricao}</span>
            {l.parcela && <Selo tom="info">parcela {l.parcela}</Selo>}
            {l.estorno && <Selo tom="positivo">estorno</Selo>}
            {l.assinatura && <Selo tom="info">assinatura</Selo>}
            {l.sugestao && (
              <span className="text-xs text-muted">
                {ROTULO_SUGESTAO[l.sugestao]}
                {l.sugestao === "regra" && l.regra ? `: ${l.regra}` : ""}
              </span>
            )}
          </p>
          {l.duplicada && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Parece já lançado: {l.duplicada.descricao}, {formatData(l.duplicada.data)}, {formatBRL(l.duplicada.valor)}. Marque só se for outra
              transação.
            </p>
          )}
        </div>
        <span className={cn("text-sm font-semibold whitespace-nowrap tabular-nums", l.sentido === "entrada" ? "text-positive" : "text-text")}>
          {l.sentido === "entrada" ? "+" : "−"} {formatBRL(l.valor)}
        </span>
      </div>

      {l.incluir && (
        <div className="flex flex-wrap items-end gap-2 pl-7">
          <SeletorPequeno rotulo="Natureza" id={`${base}-natureza`} value={l.natureza} onChange={(v) => onMudar({ natureza: v as Natureza })}>
            {NATUREZAS.map((n) => (
              <option key={n} value={n}>
                {ROTULO_NATUREZA[n]}
              </option>
            ))}
          </SeletorPequeno>
          {l.natureza === "fluxo" && (
            <>
              <SeletorPequeno
                rotulo="Categoria"
                id={`${base}-categoria`}
                value={l.categoria_id ?? ""}
                invalido={Boolean(pend)}
                onChange={(v) => onMudar({ categoria_id: v || null })}
              >
                <option value="">Escolha…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </SeletorPequeno>
              <SeletorPequeno rotulo="Classe" id={`${base}-classe`} value={l.classe ?? ""} onChange={(v) => onMudar({ classe: (v || null) as Classe | null })}>
                <option value="">—</option>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SeletorPequeno>
            </>
          )}
          {!cartao && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${base}-mes`} className="text-xs text-muted">
                Competência
              </label>
              <input
                id={`${base}-mes`}
                type="month"
                value={l.mes_competencia}
                onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && onMudar({ mes_competencia: e.target.value })}
                className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {l.incluir && (l.vinculo || futuras.length > 0 || l.sugestao !== "regra") && (
        <div className="flex flex-col gap-1.5 pl-7">
          {l.vinculo && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Link2 className="size-3.5" aria-hidden /> Realiza a parcela {l.parcela} prevista em {formatMesCurto(l.vinculo.mes_competencia)}.
            </p>
          )}
          {futuras.length > 0 && (
            <Caixa
              id={`${base}-futuras`}
              rotulo={`Prever as ${futuras.length} parcela${futuras.length === 1 ? "" : "s"} seguinte${futuras.length === 1 ? "" : "s"}`}
              dica={`${formatMesCurto(futuras[0].mes_competencia)} a ${formatMesCurto(futuras[futuras.length - 1].mes_competencia)}, ${formatBRL(l.valor)} por mês`}
              checked={l.criar_futuras}
              onChange={(e) => onMudar({ criar_futuras: e.target.checked })}
            />
          )}
          {l.sugestao !== "regra" && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Caixa
                id={`${base}-regra`}
                rotulo="Criar regra para os próximos meses"
                checked={l.criar_regra}
                onChange={(e) => onMudar({ criar_regra: e.target.checked })}
              />
              {l.criar_regra && (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <label htmlFor={`${base}-padrao`}>quando a descrição contiver</label>
                  <input
                    id={`${base}-padrao`}
                    value={l.padrao_regra}
                    maxLength={60}
                    onChange={(e) => onMudar({ padrao_regra: e.target.value })}
                    aria-invalid={!padraoValido(l) || undefined}
                    className={cn(
                      "h-8 w-44 rounded-md border bg-surface px-2 text-sm text-text uppercase",
                      padraoValido(l) ? "border-border" : "border-warning",
                    )}
                  />
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** O padrão precisa ter 2 caracteres e aparecer na descrição desta linha. */
function padraoValido(l: Pick<LinhaTela, "padrao_regra" | "descricao">) {
  const p = normalizarDescricao(l.padrao_regra);
  return p.length >= 2 && normalizarDescricao(l.descricao).includes(p);
}

function SeletorPequeno({
  rotulo,
  id,
  value,
  onChange,
  invalido,
  children,
}: {
  rotulo: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalido?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted">
        {rotulo}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalido || undefined}
        className={cn("h-9 max-w-[12rem] rounded-lg border bg-surface px-2 text-sm", invalido ? "border-warning" : "border-border")}
      >
        {children}
      </select>
    </div>
  );
}
