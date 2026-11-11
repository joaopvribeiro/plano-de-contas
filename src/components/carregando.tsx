import { Marca } from "@/components/ui";

/** Casca exibida enquanto a sessão e os dados carregam. */
export function Carregando() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true" aria-live="polite">
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex h-[52px] max-w-7xl items-center px-4">
          <Marca />
        </div>
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 pt-6">
        <span className="sr-only">Carregando…</span>
        <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-2" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
