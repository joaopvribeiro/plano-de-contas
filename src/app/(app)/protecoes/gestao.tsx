"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ExternalLink, FileUp, LoaderCircle, Pencil, Plus } from "lucide-react";
import { Dialogo } from "@/components/dialogo";
import { Aviso, Botao, Campo, Cartao, Seletor, Selo, cn } from "@/components/ui";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { criarImportacaoApolice, excluirApolice, incluirPremioNoOrcamento, linkDoArquivo, processarApolice, salvarApolice, type Resultado } from "@/app/actions/protecoes";
import { descartarImportacao } from "@/app/actions/importacao";
import { formatBRL, formatData } from "@/lib/format";
import { DESTAQUES, PERIODICIDADES, ROTULO_PERIODICIDADE, ROTULO_TIPO, TIPOS_APOLICE, type Apolice, type DadosApolice, type TipoApolice } from "@/lib/apolices/modelo";

const brl = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function vigencia(a: Pick<Apolice, "vigencia_inicio" | "vigencia_fim">) {
  if (!a.vigencia_inicio && !a.vigencia_fim) return "Vigência não informada";
  if (!a.vigencia_fim) return `Desde ${formatData(a.vigencia_inicio)} · sem data de fim`;
  return `${a.vigencia_inicio ? `${formatData(a.vigencia_inicio)} a ` : "Até "}${formatData(a.vigencia_fim)}`;
}

// ---------------------------------------------------------------------------
// Formulário (manual, edição e revisão da leitura)
// ---------------------------------------------------------------------------

export function FormApolice({
  inicial,
  id,
  importacaoId,
  aoSalvar,
}: {
  inicial?: Partial<DadosApolice>;
  id?: string;
  importacaoId?: string;
  aoSalvar: (id: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoApolice>(inicial?.tipo ?? "vida");
  const [res, setRes] = useState<Resultado>({});
  const [pendente, iniciar] = useTransition();
  const linhas = (xs?: string[]) => (xs ?? []).join("\n");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const s = (k: string) => String(f.get(k) ?? "");
        const lista = (k: string) => s(k).split("\n").map((x) => x.trim()).filter(Boolean);
        iniciar(async () => {
          const r = await salvarApolice({
            id,
            importacao_id: importacaoId,
            tipo,
            seguradora: s("seguradora"),
            produto: s("produto"),
            segurado: s("segurado"),
            premio: s("premio"),
            periodicidade: s("periodicidade") as (typeof PERIODICIDADES)[number],
            vigencia_inicio: s("vigencia_inicio"),
            vigencia_fim: s("vigencia_fim"),
            destaques: Object.fromEntries(DESTAQUES[tipo].map((k) => [k, s(`d-${k}`)])),
            carencias: lista("carencias"),
            exclusoes: lista("exclusoes"),
            como_acionar: s("como_acionar"),
            resumo: s("resumo"),
          });
          setRes(r);
          if (r.id) aoSalvar(r.id);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Seletor rotulo="Tipo" id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoApolice)}>
          {TIPOS_APOLICE.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO[t]}
            </option>
          ))}
        </Seletor>
        <Campo rotulo="Seguradora" id="seguradora" defaultValue={inicial?.seguradora ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Produto" id="produto" defaultValue={inicial?.produto ?? ""} />
        <Campo rotulo="Segurado" id="segurado" defaultValue={inicial?.segurado ?? ""} dica="Só o nome, sem documentos." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Campo rotulo="Prêmio (R$)" id="premio" inputMode="decimal" defaultValue={brl(inicial?.premio)} />
          {res.erros?.premio && <p className="text-xs text-negative">{res.erros.premio}</p>}
        </div>
        <Seletor rotulo="Periodicidade" id="periodicidade" defaultValue={inicial?.periodicidade ?? "mensal"}>
          {PERIODICIDADES.map((p) => (
            <option key={p} value={p}>
              {ROTULO_PERIODICIDADE[p]}
            </option>
          ))}
        </Seletor>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Início da vigência" id="vigencia_inicio" type="date" defaultValue={inicial?.vigencia_inicio ?? ""} />
        <div className="flex flex-col gap-1">
          <Campo rotulo="Fim da vigência" id="vigencia_fim" type="date" defaultValue={inicial?.vigencia_fim ?? ""} dica="Vazio = sem data de fim (vitalício)." />
          {res.erros?.vigencia_fim && <p className="text-xs text-negative">{res.erros.vigencia_fim}</p>}
        </div>
      </div>
      <fieldset className="grid gap-4 rounded-lg border border-border p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">Destaques · {ROTULO_TIPO[tipo]}</legend>
        {DESTAQUES[tipo].map((k) => (
          <Campo key={`${tipo}-${k}`} rotulo={k} id={`d-${k}`} defaultValue={inicial?.destaques?.[k] ?? ""} />
        ))}
      </fieldset>
      <AreaTexto rotulo="Resumo em linguagem simples" id="resumo" valor={inicial?.resumo ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AreaTexto rotulo="Carências (uma por linha)" id="carencias" valor={linhas(inicial?.carencias)} />
        <AreaTexto rotulo="Exclusões (uma por linha)" id="exclusoes" valor={linhas(inicial?.exclusoes)} />
      </div>
      <AreaTexto rotulo="Como acionar o sinistro" id="como_acionar" valor={inicial?.como_acionar ?? ""} />
      {res.erro && <Aviso tom="negativo">{res.erro}</Aviso>}
      <div>
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : id ? "Salvar alterações" : "Salvar apólice"}
        </Botao>
      </div>
    </form>
  );
}

function AreaTexto({ rotulo, id, valor }: { rotulo: string; id: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <textarea id={id} name={id} defaultValue={valor} rows={3} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-brand" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Envio para leitura e cadastro manual
// ---------------------------------------------------------------------------

export function EnviarApolice({ ia }: { ia: { liberada: boolean; consentimento: boolean; configurada: boolean; restantes: number; limite: number } }) {
  const router = useRouter();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [etapa, setEtapa] = useState<"parado" | "enviando" | "lendo">("parado");
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(0);
  const [manual, setManual] = useState(false);
  const [, iniciar] = useTransition();

  function enviar() {
    setErro(null);
    iniciar(async () => {
      setEtapa("enviando");
      const nova = await criarImportacaoApolice(arquivos.map((a) => ({ nome: a.name, tamanho: a.size, tipo: a.type })));
      if (nova.erro || !nova.id || !nova.caminhos) {
        setErro(nova.erro ?? "Não foi possível iniciar a leitura.");
        setEtapa("parado");
        return;
      }
      const sb = criarClienteNavegador();
      for (const [i, a] of arquivos.entries()) {
        const { error } = await sb.storage.from("familias").upload(nova.caminhos[i], a, { contentType: a.type || "application/pdf", upsert: true });
        if (error) {
          await descartarImportacao(nova.id);
          setErro(`Não foi possível enviar "${a.name}".`);
          setEtapa("parado");
          return;
        }
      }
      setEtapa("lendo");
      const r = await processarApolice(nova.id);
      if (r.erro) {
        setErro(r.erro);
        setEtapa("parado");
        router.refresh();
        return;
      }
      setArquivos([]);
      setEtapa("parado");
      setChave((k) => k + 1);
      router.push(`/protecoes/importar/${nova.id}`);
    });
  }

  const ocupado = etapa !== "parado";
  return (
    <Cartao className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Enviar apólice para leitura</h2>
          <p className="text-xs text-muted">PDF da apólice ou até 3 fotos das páginas. Você revisa antes de salvar.</p>
        </div>
        <Botao variante="secundario" onClick={() => setManual(true)}>
          <Plus className="size-4" aria-hidden /> Cadastrar à mão
        </Botao>
      </div>
      <label htmlFor="apolice" className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm hover:bg-surface-2">
        <FileUp className="size-6 text-muted" aria-hidden />
        <span className="font-medium">{arquivos.length ? arquivos.map((a) => a.name).join(", ") : "Escolher arquivos"}</span>
      </label>
      <input
        key={chave}
        id="apolice"
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="sr-only"
        aria-label="Arquivos da apólice"
        disabled={ocupado}
        onChange={(e) => {
          setErro(null);
          setArquivos(Array.from(e.target.files ?? []).slice(0, 3));
        }}
      />
      {!ia.consentimento && <Aviso tom="atencao">A leitura com IA precisa da autorização acima. O cadastro à mão funciona sem ela.</Aviso>}
      {ia.consentimento && !ia.configurada && <Aviso tom="atencao">A leitura com IA ainda não foi configurada.</Aviso>}
      {ia.liberada && <p className="text-xs text-muted">Leituras de apólice restantes neste mês: {ia.restantes} de {ia.limite}.</p>}
      {erro && <Aviso tom="negativo">{erro}</Aviso>}
      {ocupado && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin text-brand" aria-hidden />
          {etapa === "enviando" ? "Enviando…" : "Lendo a apólice com IA. Pode levar até um minuto…"}
        </p>
      )}
      <div>
        <Botao onClick={enviar} disabled={ocupado || !arquivos.length || !ia.liberada}>
          Ler apólice
        </Botao>
      </div>
      <Dialogo aberto={manual} aoFechar={() => setManual(false)} titulo="Cadastrar apólice" largura="max-w-2xl">
        <FormApolice
          aoSalvar={() => {
            setManual(false);
            router.refresh();
          }}
        />
      </Dialogo>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Card e detalhe
// ---------------------------------------------------------------------------

export function CardApolice({ a, consultor, hoje }: { a: Apolice; consultor: boolean; hoje: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [msg, setMsg] = useState<Resultado>({});
  const [confirmar, setConfirmar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const vencida = a.vigencia_fim !== null && a.vigencia_fim < hoje;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-brand/50"
        aria-label={`${ROTULO_TIPO[a.tipo]}: ${a.seguradora ?? "seguradora não informada"}. Ver detalhes`}
      >
        <div className="flex w-full items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{a.seguradora ?? "Seguradora não informada"}</p>
            <p className="text-xs text-muted">{[a.produto, a.segurado].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            {a.origem === "ia" && <Selo tom="info">lida pela IA</Selo>}
            {vencida && <Selo tom="negativo">vencida</Selo>}
          </div>
        </div>
        <p className="num text-sm">
          {a.premio_mensal !== null ? (
            <>
              <strong>{formatBRL(a.premio_mensal)}</strong> por mês
              {a.periodicidade !== "mensal" && <span className="text-muted"> ({formatBRL(a.premio ?? 0)} {ROTULO_PERIODICIDADE[a.periodicidade].toLowerCase()})</span>}
            </>
          ) : a.premio !== null ? (
            <>
              <strong>{formatBRL(a.premio)}</strong> <span className="text-muted">pagamento único</span>
            </>
          ) : (
            <span className="text-muted">Prêmio não informado</span>
          )}
        </p>
        <p className="text-xs text-muted">{vigencia(a)}</p>
        {Object.keys(a.destaques).length > 0 && (
          <dl className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-2 text-xs">
            {DESTAQUES[a.tipo]
              .filter((k) => a.destaques[k])
              .map((k) => (
                <div key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium">{a.destaques[k]}</dd>
                </div>
              ))}
          </dl>
        )}
      </button>

      <Dialogo aberto={aberto} aoFechar={() => { setAberto(false); setEditando(false); setMsg({}); setConfirmar(false); }} titulo={editando ? "Editar apólice" : `${ROTULO_TIPO[a.tipo]} · ${a.seguradora ?? ""}`} largura="max-w-2xl">
        {editando ? (
          <FormApolice
            inicial={a}
            id={a.id}
            aoSalvar={() => {
              setEditando(false);
              router.refresh();
            }}
          />
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-muted">
              {[a.produto, a.segurado].filter(Boolean).join(" · ")}
              {" · "}
              {vigencia(a)}
            </p>
            {a.resumo && <p className="rounded-lg bg-surface-2 p-3">{a.resumo}</p>}
            {Object.keys(a.destaques).length > 0 && (
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {DESTAQUES[a.tipo]
                  .filter((k) => a.destaques[k])
                  .map((k) => (
                    <div key={k}>
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="font-medium">{a.destaques[k]}</dd>
                    </div>
                  ))}
              </dl>
            )}
            <Lista titulo="Carências" itens={a.carencias} vazio="Nenhuma carência informada." />
            <Lista titulo="Exclusões" itens={a.exclusoes} vazio="Nenhuma exclusão informada." />
            <div>
              <h3 className="mb-1 font-semibold">Como acionar o sinistro</h3>
              <p className={cn(!a.como_acionar && "text-muted")}>{a.como_acionar ?? "Não informado."}</p>
            </div>
            {msg.ok && <Aviso tom="positivo">{msg.ok}</Aviso>}
            {msg.erro && <Aviso tom="negativo">{msg.erro}</Aviso>}
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {a.arquivo && (
                <Botao
                  variante="secundario"
                  disabled={pendente}
                  onClick={() => {
                    // A janela abre no clique (senão o navegador bloqueia) e recebe o link temporário depois.
                    const janela = window.open("", "_blank");
                    if (janela) janela.opener = null;
                    iniciar(async () => {
                      const r = await linkDoArquivo(a.id);
                      if (r.url && janela) janela.location.href = r.url;
                      else if (r.url) window.location.href = r.url;
                      else {
                        janela?.close();
                        setMsg({ erro: r.erro });
                      }
                    });
                  }}
                >
                  <ExternalLink className="size-4" aria-hidden /> Abrir arquivo original
                </Botao>
              )}
              <Botao variante="secundario" onClick={() => setEditando(true)}>
                <Pencil className="size-4" aria-hidden /> Editar
              </Botao>
              {consultor && a.premio_mensal !== null && (
                <Botao variante="secundario" disabled={pendente} onClick={() => iniciar(async () => setMsg(await incluirPremioNoOrcamento(a.id)))}>
                  <CalendarPlus className="size-4" aria-hidden /> Incluir prêmio no orçamento
                </Botao>
              )}
              {confirmar ? (
                <span className="flex items-center gap-2">
                  Excluir a apólice{a.arquivo ? " e o arquivo" : ""}?
                  <Botao
                    variante="perigo"
                    disabled={pendente}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await excluirApolice(a.id);
                        if (r.erro) setMsg(r);
                        else {
                          setAberto(false);
                          router.refresh();
                        }
                      })
                    }
                  >
                    Excluir
                  </Botao>
                  <Botao variante="fantasma" onClick={() => setConfirmar(false)}>
                    Cancelar
                  </Botao>
                </span>
              ) : (
                <Botao variante="fantasma" onClick={() => setConfirmar(true)}>
                  Excluir
                </Botao>
              )}
            </div>
          </div>
        )}
      </Dialogo>
    </>
  );
}

function Lista({ titulo, itens, vazio }: { titulo: string; itens: string[]; vazio: string }) {
  return (
    <div>
      <h3 className="mb-1 font-semibold">{titulo}</h3>
      {itens.length ? (
        <ul className="list-disc space-y-0.5 pl-5">
          {itens.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">{vazio}</p>
      )}
    </div>
  );
}

