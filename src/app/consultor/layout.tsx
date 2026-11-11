import { redirect } from "next/navigation";
import { Cabecalho } from "@/components/cabecalho";
import { obterContexto } from "@/lib/sessao";

export default async function LayoutConsultor({ children }: { children: React.ReactNode }) {
  const ctx = await obterContexto();
  if (!ctx.consultor) redirect("/");

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho email={ctx.usuario.email} ehConsultor>
        <span className="hidden text-sm font-medium text-muted md:inline">Área do consultor</span>
      </Cabecalho>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
