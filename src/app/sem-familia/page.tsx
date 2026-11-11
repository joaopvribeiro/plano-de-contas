import { Cartao, Marca } from "@/components/ui";
import { obterContexto } from "@/lib/sessao";
import { sair } from "@/app/actions/sessao";

export const metadata = { title: "Sem acesso · Resolutto Family" };

export default async function SemFamilia() {
  const ctx = await obterContexto();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Cartao className="w-full max-w-md p-6 text-center">
        <Marca className="text-xl" />
        <h1 className="mt-6 text-lg font-bold">Sua conta ainda não está ligada a uma família</h1>
        <p className="mt-2 text-sm text-muted">
          Você entrou como {ctx.usuario.email}. Peça ao seu consultor Resolutto um convite para este e-mail e abra o link
          que chegar.
        </p>
        <form action={sair} className="mt-6">
          <button type="submit" className="text-sm font-semibold text-brand hover:underline">
            Entrar com outro e-mail
          </button>
        </form>
      </Cartao>
    </main>
  );
}
