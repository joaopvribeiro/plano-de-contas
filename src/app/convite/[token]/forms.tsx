"use client";

import { useActionState } from "react";
import { Aviso, Botao } from "@/components/ui";
import { aceitarConvite, pedirAcessoPeloConvite } from "@/app/actions/convite";

export function FormAceitar({ token }: { token: string }) {
  const [estado, acao, enviando] = useActionState(aceitarConvite, undefined);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {estado?.erro && <Aviso tom="negativo">{estado.erro}</Aviso>}
      <Botao type="submit" disabled={enviando}>
        {enviando ? "Entrando…" : "Aceitar convite e entrar"}
      </Botao>
    </form>
  );
}

export function FormPedirAcesso({ token, emailMascarado }: { token: string; emailMascarado: string }) {
  const [estado, acao, enviando] = useActionState(pedirAcessoPeloConvite, undefined);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {estado?.erro && <Aviso tom="negativo">{estado.erro}</Aviso>}
      {estado?.ok ? (
        <Aviso tom="positivo">{estado.ok}</Aviso>
      ) : (
        <>
          <p className="text-sm">
            Vamos enviar um link de acesso para <strong>{emailMascarado}</strong>.
          </p>
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Receber link de acesso"}
          </Botao>
        </>
      )}
    </form>
  );
}
