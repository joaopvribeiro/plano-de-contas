import { cn } from "@/components/ui";

/** Barra de progresso de uma só cor; verde quando completa. */
export function Barra({ valor, rotulo, cheia }: { valor: number; rotulo: string; cheia?: boolean }) {
  return (
    <div className="h-2 rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(valor * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo}>
      <div className={cn("h-2 rounded-full", cheia ? "bg-positive" : "bg-serie-1")} style={{ width: `${Math.max(valor * 100, valor > 0 ? 1 : 0)}%` }} />
    </div>
  );
}
