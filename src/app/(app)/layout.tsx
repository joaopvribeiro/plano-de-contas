import { Eye } from "lucide-react";
import { Cabecalho } from "@/components/cabecalho";
import { AbasTopo, BarraInferior } from "@/components/navegacao";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { sairDaFamilia } from "@/app/actions/sessao";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const { ctx, familia } = await obterFamiliaAtiva();
  const vendoComoConsultor = familia.papel === "consultor";

  return (
    <div className="flex min-h-dvh flex-col">
      {vendoComoConsultor && (
        <div className="bg-navy text-white dark:bg-brand-mid">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2 text-sm">
            <p className="flex min-w-0 items-center gap-2">
              <Eye className="size-4 shrink-0" aria-hidden />
              <span className="truncate">
                Você está vendo a família <strong>{familia.nome}</strong>
              </span>
            </p>
            <form action={sairDaFamilia}>
              <button type="submit" className="rounded-md px-2 py-1 font-semibold underline-offset-2 hover:underline">
                <span className="sm:hidden">Voltar</span>
                <span className="hidden sm:inline">Voltar para minhas famílias</span>
              </button>
            </form>
          </div>
        </div>
      )}

      <Cabecalho email={ctx.usuario.email} ehConsultor={Boolean(ctx.consultor)}>
        <AbasTopo />
      </Cabecalho>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-24 md:pb-10">{children}</main>

      <BarraInferior />
    </div>
  );
}
