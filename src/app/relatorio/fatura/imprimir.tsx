"use client";

import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

/** Barra do relatório (some na impressão). "Baixar PDF" abre a impressão do navegador: escolha "Salvar como PDF". */
export function BarraRelatorio({ voltar }: { voltar: string }) {
  return (
    <div className="sticky top-0 z-10 border-b border-[#D9D9D9] bg-white/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-3 px-4 py-2">
        <Link href={voltar} className="inline-flex items-center gap-1 text-sm text-[#0F26A6] hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Voltar ao resumo
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-neutral-500 sm:inline">Na janela de impressão, escolha “Salvar como PDF”.</span>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1431D9] px-4 text-sm font-semibold text-white hover:bg-[#0F26A6]"
          >
            <Download className="size-4" aria-hidden /> Baixar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
