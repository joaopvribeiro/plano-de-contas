"use client";

import { useActionState } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import { definirSenha } from "@/app/actions/auth";

export function FormSenha() {
  const [estado, acao, enviando] = useActionState(definirSenha, undefined);
  return (
    <form action={acao} className="flex flex-col gap-3">
      {estado?.erro && <Aviso tom="negativo">{estado.erro}</Aviso>}
      {estado?.ok && <Aviso tom="positivo">{estado.ok}</Aviso>}
      <Campo rotulo="Nova senha" id="senha" type="password" autoComplete="new-password" minLength={10} required />
      <Campo rotulo="Repita a senha" id="confirmacao" type="password" autoComplete="new-password" required />
      <Botao type="submit" disabled={enviando}>
        {enviando ? "Salvando…" : "Salvar senha"}
      </Botao>
    </form>
  );
}
