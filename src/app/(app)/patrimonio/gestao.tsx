"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, Plus, RefreshCw } from "lucide-react";
import { Dialogo } from "@/components/dialogo";
import { Aviso, Botao, Caixa, Campo, Cartao, Seletor, Selo, cn } from "@/components/ui";
import { atualizarSaldoAtivo, excluirAtivo, excluirPassivo, salvarAtivo, salvarPassivo, type Resultado } from "@/app/actions/patrimonio";
import { formatBRL, formatData, hojeISO } from "@/lib/format";
import {
  CATEGORIAS_ATIVO,
  DIAS_DESATUALIZADO,
  RISCOS,
  ROTULO_PASSIVO,
  TIPOS_PASSIVO,
  consorcio,
  diasDesde,
  type Ativo,
  type CategoriaAtivo,
  type Passivo,
} from "@/lib/patrimonio";

const brl = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// ---------------------------------------------------------------------------
// Botões "Adicionar"
// ---------------------------------------------------------------------------

export function BotoesNovo() {
  const [aberto, setAberto] = useState<"ativo" | "passivo" | null>(null);
  return (
    <>
      <Botao variante="secundario" onClick={() => setAberto("passivo")}>
        <Plus className="size-4" aria-hidden /> Adicionar dívida
      </Botao>
      <Botao onClick={() => setAberto("ativo")}>
        <Plus className="size-4" aria-hidden /> Adicionar ativo
      </Botao>
      <Dialogo aberto={aberto === "ativo"} aoFechar={() => setAberto(null)} titulo="Adicionar ativo">
        <FormAtivo aoTerminar={() => setAberto(null)} />
      </Dialogo>
      <Dialogo aberto={aberto === "passivo"} aoFechar={() => setAberto(null)} titulo="Adicionar dívida">
        <FormPassivo aoTerminar={() => setAberto(null)} />
      </Dialogo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Balanço
// ---------------------------------------------------------------------------

type Grupo = { categoria: CategoriaAtivo; titulo: string; subtitulo: string; itens: Ativo[]; subtotal: number };
type Acao = { tipo: "saldo" | "editar"; ativo: Ativo } | { tipo: "passivo"; passivo: Passivo } | null;

export function Balanco({ grupos, passivos, hoje, totalDividas }: { grupos: Grupo[]; passivos: Passivo[]; hoje: string; totalDividas: number }) {
  const [acao, setAcao] = useState<Acao>(null);
  const fechar = () => setAcao(null);

  return (
    <section aria-labelledby="balanco" className="flex flex-col gap-3">
      <h2 id="balanco" className="text-lg font-semibold">
        Balanço patrimonial
      </h2>
      {grupos.length === 0 && (
        <Cartao className="p-6 text-center text-sm text-muted">
          Nenhum ativo cadastrado. Use &ldquo;Adicionar ativo&rdquo; ou importe um relatório de investimentos.
        </Cartao>
      )}
      {grupos.map((g) => (
        <Cartao key={g.categoria} className="p-0">
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">{g.titulo}</h3>
              <p className="text-xs text-muted">{g.subtitulo}</p>
            </div>
            <p className="num text-sm font-semibold whitespace-nowrap">{formatBRL(g.subtotal)}</p>
          </div>
          <ul className="divide-y divide-border">
            {g.itens.map((a) => (
              <LinhaAtivo key={a.id} a={a} hoje={hoje} onSaldo={() => setAcao({ tipo: "saldo", ativo: a })} onEditar={() => setAcao({ tipo: "editar", ativo: a })} />
            ))}
          </ul>
        </Cartao>
      ))}

      <Cartao className="p-0">
        <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Dívidas</h3>
            <p className="text-xs text-muted">Saem do patrimônio líquido</p>
          </div>
          <p className="num text-sm font-semibold whitespace-nowrap">{totalDividas > 0 ? `− ${formatBRL(totalDividas)}` : formatBRL(0)}</p>
        </div>
        {passivos.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">Nenhuma dívida cadastrada.</p>
        ) : (
          <ul className="divide-y divide-border">
            {passivos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.nome}</p>
                  <p className="text-xs text-muted">
                    {[ROTULO_PASSIVO[p.tipo], p.instituicao, p.parcela_mensal ? `parcela ${formatBRL(p.parcela_mensal)}` : null, p.parcelas_restantes != null ? `${p.parcelas_restantes} restantes` : null, p.taxa_am != null ? `${p.taxa_am.toLocaleString("pt-BR")}% a.m.` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex-1 sm:flex-none sm:text-right">
                  <p className="num font-semibold">{formatBRL(p.saldo_devedor)}</p>
                  <DataSaldo data={p.data_saldo} hoje={hoje} />
                </div>
                <Botao variante="fantasma" onClick={() => setAcao({ tipo: "passivo", passivo: p })} aria-label={`Editar ${p.nome}`}>
                  <Pencil className="size-4" aria-hidden />
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Dialogo aberto={acao?.tipo === "saldo"} aoFechar={fechar} titulo={acao?.tipo === "saldo" ? `Atualizar saldo · ${acao.ativo.nome}` : ""} largura="max-w-sm">
        {acao?.tipo === "saldo" && <FormSaldo ativo={acao.ativo} aoTerminar={fechar} />}
      </Dialogo>
      <Dialogo aberto={acao?.tipo === "editar"} aoFechar={fechar} titulo="Editar ativo">
        {acao?.tipo === "editar" && <FormAtivo ativo={acao.ativo} aoTerminar={fechar} />}
      </Dialogo>
      <Dialogo aberto={acao?.tipo === "passivo"} aoFechar={fechar} titulo="Editar dívida">
        {acao?.tipo === "passivo" && <FormPassivo passivo={acao.passivo} aoTerminar={fechar} />}
      </Dialogo>
    </section>
  );
}

function DataSaldo({ data, hoje }: { data: string; hoje: string }) {
  const velho = diasDesde(data, hoje) > DIAS_DESATUALIZADO;
  return (
    <p className={cn("flex items-center gap-1 text-xs sm:justify-end", velho ? "font-medium text-warning" : "text-muted")}>
      {velho && <AlertTriangle className="size-3.5" aria-hidden />}
      {velho ? `Atualizado em ${formatData(data)}, há ${diasDesde(data, hoje)} dias` : `Em ${formatData(data)}`}
    </p>
  );
}

function LinhaAtivo({ a, hoje, onSaldo, onEditar }: { a: Ativo; hoje: string; onSaldo: () => void; onEditar: () => void }) {
  const c = a.categoria === "Consórcio" ? consorcio(a) : null;
  const detalhes = [a.instituicao, a.produto, a.liquidez ? `liquidez ${a.liquidez}` : null].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {a.nome}
          {a.risco && <Selo tom={a.risco === "alto" ? "atencao" : "info"}>risco {a.risco}</Selo>}
          {a.origem === "relatorio" && <span className="text-xs font-normal text-muted">via relatório</span>}
        </p>
        {detalhes && <p className="text-xs text-muted">{detalhes}</p>}
        {c && (
          <div className="mt-1.5 max-w-md">
            <div className="h-1.5 rounded-full bg-surface-2" aria-hidden>
              <div className="h-1.5 rounded-full bg-serie-1" style={{ width: `${c.progresso * 100}%` }} />
            </div>
            <p className="num mt-1 text-xs text-muted">
              {a.consorcio_parcelas_pagas} de {a.consorcio_prazo_meses} parcelas · pago {formatBRL(c.pago)} · falta {formatBRL(c.aPagar)}
              {a.consorcio_contemplado ? " · contemplado" : ""}
            </p>
          </div>
        )}
      </div>
      <div className="flex-1 sm:flex-none sm:text-right">
        <p className="num font-semibold">{formatBRL(a.valor)}</p>
        {a.valor_liquido !== null && <p className="num text-xs text-muted">líquido {formatBRL(a.valor_liquido)}</p>}
        <DataSaldo data={a.data_saldo} hoje={hoje} />
      </div>
      <div className="flex gap-1">
        <Botao variante="fantasma" onClick={onSaldo} aria-label={`Atualizar saldo de ${a.nome}`} title="Atualizar saldo">
          <RefreshCw className="size-4" aria-hidden />
        </Botao>
        <Botao variante="fantasma" onClick={onEditar} aria-label={`Editar ${a.nome}`} title="Editar">
          <Pencil className="size-4" aria-hidden />
        </Botao>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Formulários
// ---------------------------------------------------------------------------

function useEnvio(aoTerminar: () => void) {
  const router = useRouter();
  const [res, setRes] = useState<Resultado>({});
  const [pendente, iniciar] = useTransition();
  const enviar = (fn: () => Promise<Resultado>) =>
    iniciar(async () => {
      const r = await fn();
      setRes(r);
      if (!r.erro && !r.erros) {
        aoTerminar();
        router.refresh();
      }
    });
  return { res, pendente, enviar };
}

function FormSaldo({ ativo, aoTerminar }: { ativo: Ativo; aoTerminar: () => void }) {
  const { res, pendente, enviar } = useEnvio(aoTerminar);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        enviar(() => atualizarSaldoAtivo({ id: ativo.id, valor: String(f.get("valor")), data_saldo: String(f.get("data_saldo")) }));
      }}
    >
      <p className="text-sm text-muted">Saldo atual: {formatBRL(ativo.valor)} em {formatData(ativo.data_saldo)}.</p>
      <Campo rotulo="Novo saldo (R$)" id="valor" inputMode="decimal" defaultValue={brl(ativo.valor)} autoFocus required />
      {res.erros?.valor && <p className="-mt-3 text-xs text-negative">{res.erros.valor}</p>}
      <Campo rotulo="Data do saldo" id="data_saldo" type="date" defaultValue={hojeISO()} max={hojeISO()} required />
      {res.erros?.data_saldo && <p className="-mt-3 text-xs text-negative">{res.erros.data_saldo}</p>}
      {res.erro && !res.erros && <Aviso tom="negativo">{res.erro}</Aviso>}
      <Botao type="submit" disabled={pendente}>
        Salvar saldo
      </Botao>
    </form>
  );
}

function Erro({ res, campo }: { res: Resultado; campo: string }) {
  return res.erros?.[campo] ? <p className="-mt-2 text-xs text-negative">{res.erros[campo]}</p> : null;
}

function FormAtivo({ ativo, aoTerminar }: { ativo?: Ativo; aoTerminar: () => void }) {
  const { res, pendente, enviar } = useEnvio(aoTerminar);
  const [categoria, setCategoria] = useState<CategoriaAtivo>(ativo?.categoria ?? "Investimentos");
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const ehConsorcio = categoria === "Consórcio";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const s = (k: string) => String(f.get(k) ?? "");
        enviar(() =>
          salvarAtivo({
            id: ativo?.id,
            nome: s("nome"),
            categoria,
            instituicao: s("instituicao"),
            produto: s("produto"),
            valor: s("valor"),
            liquidez: s("liquidez"),
            risco: (s("risco") || null) as (typeof RISCOS)[number] | null,
            data_saldo: s("data_saldo"),
            consorcio_prazo_meses: s("consorcio_prazo_meses"),
            consorcio_parcelas_pagas: s("consorcio_parcelas_pagas"),
            consorcio_parcela_mensal: s("consorcio_parcela_mensal"),
            consorcio_contemplado: f.get("consorcio_contemplado") === "on",
            conta_liberdade: f.get("conta_liberdade") === "on",
          }),
        );
      }}
    >
      <Campo rotulo="Nome" id="nome" defaultValue={ativo?.nome} placeholder="Ex.: CDB liquidez diária" required />
      <Erro res={res} campo="nome" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Seletor rotulo="Categoria" id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaAtivo)}>
          {CATEGORIAS_ATIVO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Seletor>
        <Campo rotulo="Instituição" id="instituicao" defaultValue={ativo?.instituicao ?? ""} placeholder="Ex.: XP" />
      </div>
      <Campo rotulo="Produto ou indexador" id="produto" defaultValue={ativo?.produto ?? ""} placeholder="Ex.: CDB 100% CDI" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Campo rotulo={ehConsorcio ? "Valor da carta (R$)" : "Saldo bruto (R$)"} id="valor" inputMode="decimal" defaultValue={brl(ativo?.valor)} required />
          <Erro res={res} campo="valor" />
        </div>
        <div className="flex flex-col gap-4">
          <Campo rotulo="Data do saldo" id="data_saldo" type="date" defaultValue={ativo?.data_saldo ?? hojeISO()} max={hojeISO()} required />
          <Erro res={res} campo="data_saldo" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Liquidez" id="liquidez" defaultValue={ativo?.liquidez ?? ""} placeholder="Ex.: D+0, D+30, No vencimento" />
        <Seletor rotulo="Risco" id="risco" defaultValue={ativo?.risco ?? ""}>
          <option value="">—</option>
          {RISCOS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Seletor>
      </div>
      {["Investimentos", "Previdência", "Fundo Fechado", "Reserva", "FGTS"].includes(categoria) && (
        <Caixa
          key={categoria}
          id="conta_liberdade"
          rotulo="Conta para a liberdade financeira"
          dica="Soma no objetivo de liberdade financeira (aba Objetivos)."
          defaultChecked={ativo && ativo.categoria === categoria ? Boolean(ativo.conta_liberdade) : ["Investimentos", "Previdência", "Fundo Fechado"].includes(categoria)}
        />
      )}
      {ehConsorcio && (
        <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">Consórcio</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Prazo total (meses)" id="consorcio_prazo_meses" inputMode="numeric" defaultValue={ativo?.consorcio_prazo_meses ?? ""} />
            <Campo rotulo="Parcelas pagas" id="consorcio_parcelas_pagas" inputMode="numeric" defaultValue={ativo?.consorcio_parcelas_pagas ?? ""} />
            <Campo rotulo="Parcela mensal (R$)" id="consorcio_parcela_mensal" inputMode="decimal" defaultValue={brl(ativo?.consorcio_parcela_mensal)} />
          </div>
          <Erro res={res} campo="consorcio_prazo_meses" />
          <Erro res={res} campo="consorcio_parcelas_pagas" />
          <Erro res={res} campo="consorcio_parcela_mensal" />
          <Caixa id="consorcio_contemplado" rotulo="Já contemplado" defaultChecked={Boolean(ativo?.consorcio_contemplado)} />
        </fieldset>
      )}
      {res.erro && <Aviso tom="negativo">{res.erro}</Aviso>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Botao type="submit" disabled={pendente}>
          {ativo ? "Salvar alterações" : "Adicionar ativo"}
        </Botao>
        {ativo &&
          (confirmarExclusao ? (
            <span className="flex items-center gap-2 text-sm">
              Excluir com o histórico?
              <Botao type="button" variante="perigo" disabled={pendente} onClick={() => enviar(() => excluirAtivo(ativo.id))}>
                Excluir
              </Botao>
              <Botao type="button" variante="fantasma" onClick={() => setConfirmarExclusao(false)}>
                Cancelar
              </Botao>
            </span>
          ) : (
            <Botao type="button" variante="fantasma" onClick={() => setConfirmarExclusao(true)}>
              Excluir ativo
            </Botao>
          ))}
      </div>
    </form>
  );
}

function FormPassivo({ passivo, aoTerminar }: { passivo?: Passivo; aoTerminar: () => void }) {
  const { res, pendente, enviar } = useEnvio(aoTerminar);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const s = (k: string) => String(f.get(k) ?? "");
        enviar(() =>
          salvarPassivo({
            id: passivo?.id,
            nome: s("nome"),
            tipo: s("tipo") as (typeof TIPOS_PASSIVO)[number],
            instituicao: s("instituicao"),
            saldo_devedor: s("saldo_devedor"),
            parcela_mensal: s("parcela_mensal"),
            taxa_am: s("taxa_am"),
            parcelas_restantes: s("parcelas_restantes"),
            data_saldo: s("data_saldo"),
          }),
        );
      }}
    >
      <Campo rotulo="Nome" id="nome" defaultValue={passivo?.nome} placeholder="Ex.: Financiamento do apartamento" required />
      <Erro res={res} campo="nome" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Seletor rotulo="Tipo" id="tipo" defaultValue={passivo?.tipo ?? "emprestimo"}>
          {TIPOS_PASSIVO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_PASSIVO[t]}
            </option>
          ))}
        </Seletor>
        <Campo rotulo="Instituição" id="instituicao" defaultValue={passivo?.instituicao ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Campo rotulo="Saldo devedor (R$)" id="saldo_devedor" inputMode="decimal" defaultValue={brl(passivo?.saldo_devedor)} required />
          <Erro res={res} campo="saldo_devedor" />
        </div>
        <div className="flex flex-col gap-4">
          <Campo rotulo="Data do saldo" id="data_saldo" type="date" defaultValue={hojeISO()} max={hojeISO()} required />
          <Erro res={res} campo="data_saldo" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Parcela (R$)" id="parcela_mensal" inputMode="decimal" defaultValue={brl(passivo?.parcela_mensal)} />
        <Campo rotulo="Taxa (% a.m.)" id="taxa_am" inputMode="decimal" defaultValue={passivo?.taxa_am?.toLocaleString("pt-BR") ?? ""} />
        <Campo rotulo="Parcelas restantes" id="parcelas_restantes" inputMode="numeric" defaultValue={passivo?.parcelas_restantes ?? ""} />
      </div>
      <Erro res={res} campo="taxa_am" />
      {res.erro && <Aviso tom="negativo">{res.erro}</Aviso>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Botao type="submit" disabled={pendente}>
          {passivo ? "Salvar alterações" : "Adicionar dívida"}
        </Botao>
        {passivo &&
          (confirmarExclusao ? (
            <span className="flex items-center gap-2 text-sm">
              Excluir a dívida?
              <Botao type="button" variante="perigo" disabled={pendente} onClick={() => enviar(() => excluirPassivo(passivo.id))}>
                Excluir
              </Botao>
              <Botao type="button" variante="fantasma" onClick={() => setConfirmarExclusao(false)}>
                Cancelar
              </Botao>
            </span>
          ) : (
            <Botao type="button" variante="fantasma" onClick={() => setConfirmarExclusao(true)}>
              Excluir dívida
            </Botao>
          ))}
      </div>
    </form>
  );
}
