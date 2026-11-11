import Link from "next/link";
import { LogOut, UserRound, Users } from "lucide-react";
import { Marca } from "@/components/ui";
import { AlternarTema } from "@/components/alternar-tema";
import { sair } from "@/app/actions/sessao";

export function Cabecalho({
  email,
  ehConsultor,
  children,
}: {
  email: string;
  ehConsultor: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="py-3" aria-label="Início">
            <Marca />
          </Link>
          {children}
        </div>
        <div className="flex items-center gap-1">
          {ehConsultor && (
            <Link
              href="/consultor"
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text"
            >
              <Users className="size-4" aria-hidden />
              <span className="hidden sm:inline">Minhas famílias</span>
            </Link>
          )}
          <AlternarTema />
          <Link
            href="/conta"
            title={email}
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
            aria-label="Minha conta"
          >
            <UserRound className="size-4" aria-hidden />
          </Link>
          <form action={sair}>
            <button
              type="submit"
              title={`Sair (${email})`}
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
              aria-label="Sair"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
