import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Variante = "primario" | "secundario" | "fantasma" | "perigo";

const estilosBotao: Record<Variante, string> = {
  primario: "bg-brand text-brand-contrast hover:bg-brand-mid",
  secundario: "border border-border bg-surface text-text hover:bg-surface-2",
  fantasma: "text-muted hover:bg-surface-2 hover:text-text",
  perigo: "bg-negative text-white hover:opacity-90",
};

export function Botao({
  variante = "primario",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        estilosBotao[variante],
        className,
      )}
      {...props}
    />
  );
}

export function Cartao({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface p-5", className)} {...props} />;
}

export function Campo({
  rotulo,
  id,
  dica,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { rotulo: string; id: string; dica?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        name={props.name ?? id}
        className="h-10 rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-muted focus:border-brand"
        aria-describedby={dica ? `${id}-dica` : undefined}
        {...props}
      />
      {dica && (
        <p id={`${id}-dica`} className="text-xs text-muted">
          {dica}
        </p>
      )}
    </div>
  );
}

type Tom = "info" | "positivo" | "atencao" | "negativo";

const estilosAviso: Record<Tom, string> = {
  info: "border-brand/30 bg-brand/5 text-text",
  positivo: "border-positive/30 bg-positive-soft text-text",
  atencao: "border-warning/40 bg-warning-soft text-text",
  negativo: "border-negative/30 bg-negative-soft text-text",
};

export function Aviso({ tom = "info", className, ...props }: React.HTMLAttributes<HTMLDivElement> & { tom?: Tom }) {
  return <div role="status" className={cn("rounded-lg border px-4 py-3 text-sm", estilosAviso[tom], className)} {...props} />;
}

export function Selo({ tom = "info", children }: { tom?: Tom; children: React.ReactNode }) {
  const cor: Record<Tom, string> = {
    info: "bg-brand/10 text-brand",
    positivo: "bg-positive-soft text-positive",
    atencao: "bg-warning-soft text-warning",
    negativo: "bg-negative-soft text-negative",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", cor[tom])}>{children}</span>;
}

export function Marca({ className }: { className?: string }) {
  return (
    <span className={cn("font-[family-name:var(--font-display)] text-lg font-bold tracking-tight", className)}>
      <span className="text-navy">Resolutto</span> <span className="text-brand">Family</span>
    </span>
  );
}

export function Seletor({
  rotulo,
  id,
  erro,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string; id: string; erro?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <select
        id={id}
        name={props.name ?? id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={cn(
          "h-10 rounded-lg border bg-surface px-3 text-sm focus:border-brand",
          erro ? "border-negative" : "border-border",
        )}
        {...props}
      >
        {children}
      </select>
      {erro && (
        <p id={`${id}-erro`} className="text-xs text-negative">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Campo com mensagem de erro (versão do Campo para formulários validados). */
export function CampoValidado({
  rotulo,
  id,
  erro,
  dica,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { rotulo: string; id: string; erro?: string; dica?: string }) {
  const desc = erro ? `${id}-erro` : dica ? `${id}-dica` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        name={props.name ?? id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={desc}
        className={cn(
          "h-10 rounded-lg border bg-surface px-3 text-sm placeholder:text-muted focus:border-brand",
          erro ? "border-negative" : "border-border",
        )}
        {...props}
      />
      {erro ? (
        <p id={`${id}-erro`} className="text-xs text-negative">
          {erro}
        </p>
      ) : (
        dica && (
          <p id={`${id}-dica`} className="text-xs text-muted">
            {dica}
          </p>
        )
      )}
    </div>
  );
}

export function Caixa({
  rotulo,
  id,
  dica,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { rotulo: string; id: string; dica?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input id={id} name={props.name ?? id} type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" {...props} />
      <span>
        <span className="font-medium">{rotulo}</span>
        {dica && <span className="block text-xs text-muted">{dica}</span>}
      </span>
    </label>
  );
}
