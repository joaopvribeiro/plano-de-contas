import { z } from "zod";
import { Aviso, Cartao, Marca } from "@/components/ui";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormAceitar, FormPedirAcesso } from "./forms";

export const metadata = { title: "Convite · Resolutto Family" };

/** "joao.silva@gmail.com" → "jo•••••••@gmail.com" */
function mascarar(email: string) {
  const [nome, dominio] = email.split("@");
  return `${nome.slice(0, 2)}${"•".repeat(Math.max(3, nome.length - 2))}@${dominio}`;
}

export default async function PaginaConvite({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const supabase = await criarClienteServidor();

  const valido = z.uuid().safeParse(token).success;
  const { data } = valido ? await supabase.rpc("convite_publico", { p_token: token }) : { data: null };
  const convite = data?.[0];
  const { data: sessao } = await supabase.auth.getClaims();
  const emailLogado = sessao?.claims?.email ? String(sessao.claims.email).toLowerCase() : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Marca className="text-2xl" />
        </div>
        <Cartao className="p-6">
          {!convite ? (
            <Aviso tom="negativo">Convite não encontrado. Confira o link ou peça um novo ao seu consultor.</Aviso>
          ) : !convite.valido ? (
            <Aviso tom="atencao">Este convite expirou ou já foi usado. Peça um novo ao seu consultor.</Aviso>
          ) : (
            <>
              <h1 className="text-xl font-bold text-navy">Você foi convidado</h1>
              <p className="mt-2 text-sm text-muted">
                Para acompanhar o planejamento da <strong className="text-text">{convite.familia_nome}</strong> na
                Resolutto Family.
              </p>

              <div className="mt-5">
                {emailLogado === convite.email ? (
                  <FormAceitar token={token} />
                ) : emailLogado ? (
                  <Aviso tom="atencao">
                    Você está conectado como {emailLogado}, mas o convite foi enviado para {mascarar(convite.email)}.
                    Saia e entre com o e-mail convidado.
                  </Aviso>
                ) : (
                  <FormPedirAcesso token={token} emailMascarado={mascarar(convite.email)} />
                )}
              </div>
            </>
          )}
        </Cartao>
      </div>
    </main>
  );
}
