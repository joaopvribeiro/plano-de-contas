"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const ITENS = [
  { href: "/lancamentos", rotulo: "Lançamentos" },
  { href: "/lancamentos/contas", rotulo: "Contas e cartões" },
  { href: "/lancamentos/categorias", rotulo: "Categorias" },
  { href: "/lancamentos/regras", rotulo: "Regras" },
];

export function SubnavLancamentos() {
  const caminho = usePathname();
  return (
    <nav aria-label="Lançamentos" className="-mx-4 mb-5 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-border">
        {ITENS.map((i) => {
          const atual = caminho === i.href;
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={atual ? "page" : undefined}
                className={cn(
                  "-mb-px block border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
                  atual ? "border-brand text-brand" : "border-transparent text-muted hover:text-text",
                )}
              >
                {i.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
