"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, Plus, Settings2 } from "lucide-react";
import { Dialogo } from "@/components/dialogo";
import { Aviso, Botao, Caixa, Campo, Cartao, Seletor, Selo } from "@/components/ui";
import { atualizarConsorcio, atualizarGuardado, excluirProjeto, preverAporteProjeto, salvarPremissas, salvarProjeto, type Resultado } from "@/app/actions/objetivos";
import { formatBRL, formatMesLongo, mesAtual, somarMeses } from "@/lib/format";
import type { Projeto, SituacaoProjeto } from "@/lib/objetivos";
import { Barra } from "./barra";

const brl = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function useEnvio(aoTerminar?: () => void) {
  const router = useRouter();
  const [res, setRes] = useState<Resultado>({});
  const [pendente, iniciar] = useTransition();
  const enviar = (fn: () => Promise<Resultado>) =>
    iniciar(async () => {
      const r = await fn();
      setRes(r);
      if (!r.erro && !r.erros) {
        aoTerminar?.();
        router.refresh();
      }
    });
  return { res, pendente, enviar };
}

function Erro({ res, campo }: { res: Resultado; campo: string }) {
  return res.erros?.[campo] ? <p className="-mt-2 text-xs text-negative">{res.erros[campo]}</p> : null;
}

// ---------------------------------------------------------------------------
// Premissas
// ---------------------------------------------------------------------------

type Premissas = { liberdade_meta: number | null; liberdade_retorno_real_am: number; liberdade_prazo_anos: number; reserva_meses: number };

export function BotaoPremissas({ premissas }: { premissas: Premissas }) {
  const [aberto, setAberto] = useState(false);
  const { res, pendente, enviar } = useEnvio(() => setAberto(false));
  return (
    <>
      <Botao variante="secundario" onClick={() => setAberto(true)}>
        <Settings2 className="size-4" aria-hidden /> Premissas
      </Botao>
      <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo="Premissas dos objetivos">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const s = (k: string) => String(f.get(k) ?? "");
            enviar(() =>
              salvarPremissas({
                liberdade_meta: s("liberdade_meta"),
                liberdade_retorno_real_am: s("liberdade_retorno_real_am"),
                liberdade_prazo_anos: s("liberdade_prazo_anos"),
                reserva_meses: s("reserva_meses"),
              }),
            );
          }}
        >
          <p className="text-sm text-muted">Só o consultor altera. Valores em reais de hoje; o retorno é real (acima da inflação).</p>
          <Campo rotulo="Meta da liberdade financeira (R$)" id="liberdade_meta" inputMode="decimal" defaultValue={brl(premissas.liberdade_meta)} />
          <Erro res={res} campo="liberdade_meta" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-4">
              <Campo
                rotulo="Retorno real (% a.m.)"
                id="liberdade_retorno_real_am"
                inputMode="decimal"
                defaultValue={premissas.liberdade_retorno_real_am.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              />
              <Erro res={res} campo="liberdade_retorno_real_am" />
            </div>
            <div className="flex flex-col gap-4">
              <Campo rotulo="Prazo (anos)" id="liberdade_prazo_anos" inputMode="numeric" defaultValue={premissas.liberdade_prazo_anos} />
              <Erro res={res} campo="liberdade_prazo_anos" />
            </div>
          </div>
          <Campo rotulo="Reserva de emergência (meses de despesa básica)" id="reserva_meses" inputMode="numeric" defaultValue={premissas.reserva_meses} />
          <Erro res={res} campo="reserva_meses" />
          {res.erro && <Aviso tom="negativo">{res.erro}</Aviso>}
          <Botao type="submit" disabled={pendente}>
            Salvar premissas
          </Botao>
        </form>
      </Dialogo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Consórcio
// ---------------------------------------------------------------------------

type Consorcio = {
  id: string;
  nome: string;
  consorcio_prazo_meses: number | null;
  consorcio_parcelas_pagas: number | null;
  consorcio_parcela_mensal: number | null;
  consorcio_contemplado: boolean | null;
};

export function BotaoConsorcio({ ativo }: { ativo: Consorcio }) {
  const [aberto, setAberto] = useState(false);
  const { res, pendente, enviar } = useEnvio(() => setAberto(false));
  return (
    <>
      <Botao variante="fantasma" className="h-8 px-2 text-xs" onClick={() => setAberto(true)} aria-label={`Atualizar consórcio ${ativo.nome}`}>
        Atualizar
      </Botao>
      <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo={`Consórcio · ${ativo.nome}`} largura="max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            enviar(() =>
              atualizarConsorcio({
                id: ativo.id,
                prazo: String(f.get("prazo")),
                pagas: String(f.get("pagas")),
                parcela: String(f.get("parcela")),
                contemplado: f.get("contemplado") === "on",
              }),
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Prazo total (meses)" id="prazo" inputMode="numeric" defaultValue={ativo.consorcio_prazo_meses ?? ""} required />
            <Campo rotulo="Parcelas pagas" id="pagas" inputMode="numeric" defaultValue={ativo.consorcio_parcelas_pagas ?? ""} required />
          </div>
          <Erro res={res} campo="prazo" />
          <Erro res={res} campo="pagas" />
          <Campo rotulo="Parcela mensal (R$)" id="parcela" inputMode="decimal" defaultValue={brl(ativo.consorcio_parcela_mensal)} required />
          <Erro res={res} campo="parcela" />
          <Caixa id="contemplado" rotulo="Já contemplado" defaultChecked={Boolean(ativo.consorcio_contemplado)} />
          {res.erro && <Aviso tom="negativo">{res.erro}</Aviso>}
          <Botao type="submit" disabled={pendente}>
            Salvar
          </Botao>
        </form>
      </Dialogo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

type OpcaoAtivo = { id: string; nome: string };

export function NovoProjeto({ ativos }: { ativos: OpcaoAtivo[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Botao onClick={() => setAberto(true)}>
        <Plus className="size-4" aria-hidden /> Nova meta
      </Botao>
      <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo="Nova meta">
        <FormProjeto ativos={ativos} aoTerminar={() => setAberto(false)} />
      </Dialogo>
    </>
  );
}

function FormProjeto({ projeto, ativos, aoTerminar }: { projeto?: Projeto; ativos: OpcaoAtivo[]; aoTerminar: () => void }) {
  const { res, pendente, enviar } = useEnvio(aoTerminar);
  const [confirmar, setConfirmar] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const s = (k: string) => String(f.get(k) ?? "");
        enviar(() =>
          salvarProjeto({ id: projeto?.id, nome: s("nome"), valor_alvo: s("valor_alvo"), ja_guardado: s("ja_guardado"), prazo_mes: s("prazo_mes"), ativo_id: s("ativo_id") || null }),
        );
      }}
    >
      <Campo rotulo="Nome" id="nome" defaultValue={projeto?.nome} placeholder="Ex.: Viagem em família" required />
      <Erro res={res} campo="nome" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Campo rotulo="Valor-alvo (R$)" id="valor_alvo" inputMode="decimal" defaultValue={brl(projeto?.valor_alvo)} required />
          <Erro res={res} campo="valor_alvo" />
        </div>
        <div className="flex flex-col gap-4">
          <Campo rotulo="Já guardado (R$)" id="ja_guardado" inputMode="decimal" defaultValue={brl(projeto?.ja_guardado ?? 0)} />
          <Erro res={res} campo="ja_guardado" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Campo rotulo="Prazo (mês)" id="prazo_mes" type="month" defaultValue={projeto?.prazo_mes ?? somarMeses(mesAtual(), 12)} min={somarMeses(mesAtual(), 1)} required />
          <Erro res={res} campo="prazo_mes" />
        </div>
        <Seletor rotulo="Guardado em (opcional)" id="ativo_id" defaultValue={projeto?.ativo_id ?? ""}>
          <option value="">—</option>
          {ativos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </Seletor>
      </div>
      {res.erro && <Aviso tom="negativo">{res.erro}</Aviso>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Botao type="submit" disabled={pendente}>
          {projeto ? "Salvar alterações" : "Criar meta"}
        </Botao>
        {projeto &&
          (confirmar ? (
            <span className="flex items-center gap-2 text-sm">
              Excluir a meta?
              <Botao type="button" variante="perigo" disabled={pendente} onClick={() => enviar(() => excluirProjeto(projeto.id))}>
                Excluir
              </Botao>
              <Botao type="button" variante="fantasma" onClick={() => setConfirmar(false)}>
                Cancelar
              </Botao>
            </span>
          ) : (
            <Botao type="button" variante="fantasma" onClick={() => setConfirmar(true)}>
              Excluir meta
            </Botao>
          ))}
      </div>
    </form>
  );
}

type ProjetoTela = Projeto & { situacao: SituacaoProjeto };

export function Projetos({ projetos, ativos, consultor }: { projetos: ProjetoTela[]; ativos: OpcaoAtivo[]; consultor: boolean }) {
  const [acao, setAcao] = useState<{ tipo: "guardado" | "editar"; p: ProjetoTela } | null>(null);
  const fechar = () => setAcao(null);
  const nomeAtivo = new Map(ativos.map((a) => [a.id, a.nome]));
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projetos.map((p) => (
          <CardProjeto
            key={p.id}
            p={p}
            ativo={p.ativo_id ? nomeAtivo.get(p.ativo_id) : undefined}
            consultor={consultor}
            onGuardado={() => setAcao({ tipo: "guardado", p })}
            onEditar={() => setAcao({ tipo: "editar", p })}
          />
        ))}
      </div>
      <Dialogo aberto={acao?.tipo === "guardado"} aoFechar={fechar} titulo={acao ? `Atualizar meta · ${acao.p.nome}` : ""} largura="max-w-sm">
        {acao?.tipo === "guardado" && <FormGuardado p={acao.p} aoTerminar={fechar} />}
      </Dialogo>
      <Dialogo aberto={acao?.tipo === "editar"} aoFechar={fechar} titulo="Editar meta">
        {acao?.tipo === "editar" && <FormProjeto projeto={acao.p} ativos={ativos} aoTerminar={fechar} />}
      </Dialogo>
    </>
  );
}

function CardProjeto({
  p,
  ativo,
  consultor,
  onGuardado,
  onEditar,
}: {
  p: ProjetoTela;
  ativo?: string;
  consultor: boolean;
  onGuardado: () => void;
  onEditar: () => void;
}) {
  const s = p.situacao;
  const { res, pendente, enviar } = useEnvio();
  return (
    <Cartao className="flex flex-col gap-3 p-4" role="group" aria-label={p.nome}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{p.nome}</h3>
          <p className="text-xs text-muted">
            Prazo {formatMesLongo(p.prazo_mes)}
            {ativo && ` · guardado em ${ativo}`}
          </p>
        </div>
        <Botao variante="fantasma" className="h-8 px-2" onClick={onEditar} aria-label={`Editar ${p.nome}`}>
          <Pencil className="size-4" aria-hidden />
        </Botao>
      </div>
      <div>
        <p className="num text-sm">
          <span className="font-semibold">{formatBRL(p.ja_guardado)}</span> <span className="text-muted">de {formatBRL(p.valor_alvo)}</span>
        </p>
        <div className="mt-1.5">
          <Barra valor={s.percentual} rotulo={`${p.nome}: atingido`} cheia={s.status === "concluido"} />
        </div>
      </div>
      {s.status === "concluido" ? (
        <Selo tom="positivo">Meta atingida</Selo>
      ) : s.status === "vencido" ? (
        <p className="text-sm text-warning">Prazo encerrado · faltam {formatBRL(s.falta)}</p>
      ) : (
        <p className="num text-sm">
          Guardar <strong>{formatBRL(s.porMes)}</strong> por mês
          <span className="text-muted">
            {" "}
            · {s.mesesRestantes} {s.mesesRestantes === 1 ? "mês" : "meses"} · {Math.round(s.percentual * 100)}%
          </span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Botao variante="secundario" className="h-9" onClick={onGuardado}>
          Atualizar meta
        </Botao>
        {consultor && s.status === "andamento" && (
          <Botao variante="fantasma" className="h-9" disabled={pendente} onClick={() => enviar(() => preverAporteProjeto(p.id))} title="Cria o aporte mensal no orçamento previsto (classe Sonhos)">
            <CalendarPlus className="size-4" aria-hidden /> Prever no orçamento
          </Botao>
        )}
      </div>
      {res.ok && <p className="text-xs text-positive" role="status">{res.ok}</p>}
      {res.erro && <p className="text-xs text-negative" role="status">{res.erro}</p>}
    </Cartao>
  );
}

function FormGuardado({ p, aoTerminar }: { p: Projeto; aoTerminar: () => void }) {
  const { res, pendente, enviar } = useEnvio(aoTerminar);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const v = String(new FormData(e.currentTarget).get("ja_guardado"));
        enviar(() => atualizarGuardado(p.id, v));
      }}
    >
      <Campo rotulo="Quanto já está guardado (R$)" id="ja_guardado" inputMode="decimal" defaultValue={brl(p.ja_guardado)} autoFocus required />
      <Erro res={res} campo="ja_guardado" />
      {res.erro && !res.erros && <Aviso tom="negativo">{res.erro}</Aviso>}
      <Botao type="submit" disabled={pendente}>
        Salvar
      </Botao>
    </form>
  );
}
