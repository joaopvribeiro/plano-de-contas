"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";
import { formatMesLongo } from "@/lib/format";

export function SeletorMes({ meses, atual }: { meses: string[]; atual: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const i = meses.indexOf(atual);
  const ir = (mes: string) => iniciar(() => router.replace(`/dashboard?mes=${mes}`, { scroll: false }));

  return (
    <div className={cn("inline-flex items-center gap-1 transition-opacity", pendente && "opacity-60")}>
      <button
        type="button"
        onClick={() => ir(meses[i - 1])}
        disabled={i <= 0}
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <label htmlFor="mes-dashboard" className="sr-only">
        Mês
      </label>
      <select
        id="mes-dashboard"
        value={atual}
        onChange={(e) => ir(e.target.value)}
        className="h-9 rounded-lg border border-border bg-surface px-3 text-sm font-semibold focus:border-brand"
      >
        {meses.map((m) => (
          <option key={m} value={m}>
            {formatMesLongo(m)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => ir(meses[i + 1])}
        disabled={i < 0 || i >= meses.length - 1}
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
        aria-label="Próximo mês"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}
