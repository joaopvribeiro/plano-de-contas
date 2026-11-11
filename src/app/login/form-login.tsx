"use client";

import { useActionState, useState } from "react";
import { Aviso, Botao, Campo, Cartao, cn } from "@/components/ui";
import { entrarComSenha, enviarLinkMagico } from "@/app/actions/auth";

const ERROS: Record<string, string> = {
  link: "O link de acesso expirou ou já foi usado. Peça um novo abaixo.",
};

export function FormLogin({ next, erroInicial }: { next: string; erroInicial?: string }) {
  const [modo, setModo] = useState<"link" | "senha">("link");
  const [estadoSenha, acaoSenha, enviandoSenha] = useActionState(entrarComSenha, undefined);
  const [estadoLink, acaoLink, enviandoLink] = useActionState(enviarLinkMagico, undefined);

  const estado = modo === "senha" ? estadoSenha : estadoLink;
  const erro = estado?.erro ?? (erroInicial ? ERROS[erroInicial] : undefined);

  return (
    <Cartao className="p-6">
      <div role="tablist" aria-label="Forma de entrar" className="mb-5 grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-sm">
        {(["link", "senha"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={cn(
              "rounded-md py-2 font-medium transition-colors",
              modo === m ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
            )}
          >
            {m === "link" ? "Link por e-mail" : "E-mail e senha"}
          </button>
        ))}
      </div>

      {erro && (
        <Aviso tom="negativo" className="mb-4">
          {erro}
        </Aviso>
      )}
      {modo === "link" && estadoLink?.ok && (
        <Aviso tom="positivo" className="mb-4">
          {estadoLink.ok}
        </Aviso>
      )}

      {modo === "link" ? (
        <form action={acaoLink} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <Campo rotulo="E-mail" id="email" type="email" autoComplete="email" required />
          <Botao type="submit" disabled={enviandoLink}>
            {enviandoLink ? "Enviando…" : "Enviar link de acesso"}
          </Botao>
        </form>
      ) : (
        <form action={acaoSenha} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <Campo rotulo="E-mail" id="email-senha" name="email" type="email" autoComplete="email" required />
          <Campo rotulo="Senha" id="senha" type="password" autoComplete="current-password" required />
          <Botao type="submit" disabled={enviandoSenha}>
            {enviandoSenha ? "Entrando…" : "Entrar"}
          </Botao>
        </form>
      )}

      <p className="mt-5 text-center text-xs text-muted">
        O acesso é feito por convite do seu consultor Resolutto.
      </p>
    </Cartao>
  );
}
