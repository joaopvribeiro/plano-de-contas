import { Marca } from "@/components/ui";
import { FormLogin } from "./form-login";

export const metadata = { title: "Entrar · Resolutto Family" };

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Marca className="text-2xl" />
          <p className="mt-2 text-sm text-muted">O planejamento financeiro da sua família, num só lugar.</p>
        </div>
        <FormLogin next={next} erroInicial={erro} />
      </div>
    </main>
  );
}
