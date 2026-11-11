"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ReceiptText, Landmark, Target, ShieldCheck } from "lucide-react";
import { cn } from "@/components/ui";

export const ABAS = [
  { href: "/dashboard", rotulo: "Dashboard & DFC", curto: "Dashboard", Icone: LayoutDashboard },
  { href: "/lancamentos", rotulo: "Lançamentos", curto: "Lançamentos", Icone: ReceiptText },
  { href: "/patrimonio", rotulo: "Patrimônio", curto: "Patrimônio", Icone: Landmark },
  { href: "/objetivos", rotulo: "Objetivos", curto: "Objetivos", Icone: Target },
  { href: "/protecoes", rotulo: "Proteções", curto: "Proteções", Icone: ShieldCheck },
] as const;

function ativa(caminho: string, href: string) {
  return caminho === href || caminho.startsWith(`${href}/`);
}

/** Abas no topo (desktop). */
export function AbasTopo() {
  const caminho = usePathname();
  return (
    <nav aria-label="Seções" className="hidden md:block">
      <ul className="flex gap-1">
        {ABAS.map(({ href, rotulo, Icone }) => {
          const atual = ativa(caminho, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                  atual ? "border-brand text-brand" : "border-transparent text-muted hover:text-text",
                )}
              >
                <Icone className="size-4" aria-hidden />
                {rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Barra inferior fixa (celular). */
export function BarraInferior() {
  const caminho = usePathname();
  return (
    <nav
      aria-label="Seções"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {ABAS.map(({ href, curto, Icone }) => {
          const atual = ativa(caminho, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] font-medium",
                  atual ? "text-brand" : "text-muted",
                )}
              >
                <Icone className="size-5" aria-hidden />
                {curto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
