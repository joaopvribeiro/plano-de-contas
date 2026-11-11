"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const assinar = () => () => {};

export function AlternarTema() {
  const { resolvedTheme, setTheme } = useTheme();
  // Evita divergência de hidratação: o tema só é conhecido no navegador.
  const montado = useSyncExternalStore(assinar, () => true, () => false);
  const escuro = montado && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(escuro ? "light" : "dark")}
      className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
      aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
    >
      {escuro ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
