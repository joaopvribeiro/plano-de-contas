"use client";

import { useActionState } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import { atualizarHorizonte, convidarMembro, criarFamilia } from "@/app/actions/consultor";
import type { EstadoForm } from "@/app/actions/auth";

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado?.erro) return <Aviso tom="negativo">{estado.erro}</Aviso>;
  if (estado?.ok) return <Aviso tom="positivo">{estado.ok}</Aviso>;
  return null;
}

export function FormNovaFamilia({ mesPadrao }: { mesPadrao: string }) {
  const [estado, acao, enviando] = useActionState(criarFamilia, undefined);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <Retorno estado={estado} />
      <Campo rotulo="Nome da família" id="nome" placeholder="Ex.: Família Souza" required />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Início do planejamento" id="inicio" type="month" defaultValue={mesPadrao} required />
        <Campo rotulo="Meses de horizonte" id="meses" type="number" min={1} max={60} defaultValue={12} required />
      </div>
      <Campo
        rotulo="Saldo inicial de caixa (R$)"
        id="saldo"
        inputMode="decimal"
        placeholder="0,00"
        dica="Opcional. Ponto de partida do caixa acumulado."
      />
      <Botao type="submit" disabled={enviando}>
        {enviando ? "Criando…" : "Criar família"}
      </Botao>
    </form>
  );
}

export function FormConvite({ familiaId }: { familiaId: string }) {
  const [estado, acao, enviando] = useActionState(convidarMembro, undefined);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="familia_id" value={familiaId} />
      <Retorno estado={estado} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="E-mail" id="email" type="email" required />
        <Campo rotulo="Nome (opcional)" id="nome" placeholder="Como aparece no painel" />
      </div>
      <Botao type="submit" disabled={enviando} className="self-start">
        {enviando ? "Enviando…" : "Enviar convite"}
      </Botao>
    </form>
  );
}

export function FormHorizonte({
  familiaId,
  inicio,
  meses,
  saldo,
}: {
  familiaId: string;
  inicio: string;
  meses: number;
  saldo: number;
}) {
  const [estado, acao, enviando] = useActionState(atualizarHorizonte, undefined);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="familia_id" value={familiaId} />
      <Retorno estado={estado} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Início" id="inicio" type="month" defaultValue={inicio} required />
        <Campo rotulo="Meses" id="meses" type="number" min={1} max={60} defaultValue={meses} required />
        <Campo
          rotulo="Saldo inicial (R$)"
          id="saldo"
          inputMode="decimal"
          defaultValue={saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        />
      </div>
      <Botao type="submit" variante="secundario" disabled={enviando} className="self-start">
        {enviando ? "Salvando…" : "Salvar horizonte"}
      </Botao>
    </form>
  );
}
