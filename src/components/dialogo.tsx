"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * Diálogo modal acessível (elemento <dialog> nativo: foco preso, Esc fecha).
 * No celular ocupa a tela de baixo para cima; no desktop fica centralizado.
 */
export function Dialogo({
  aberto,
  aoFechar,
  titulo,
  children,
  largura = "max-w-lg",
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: React.ReactNode;
  largura?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
      aria-labelledby="dialogo-titulo"
      className={cn(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50",
        "sm:m-auto sm:rounded-2xl",
        largura,
        "sm:w-[calc(100%-2rem)]",
      )}
    >
      {aberto && (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id="dialogo-titulo" className="text-lg font-bold">
              {titulo}
            </h2>
            <button
              type="button"
              onClick={aoFechar}
              className="-m-1 rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-text"
              aria-label="Fechar"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
