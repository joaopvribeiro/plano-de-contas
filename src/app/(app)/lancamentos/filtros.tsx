"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { CLASSES, ROTULO_NATUREZA, TIPOS, type Categoria, type Conta, type Natureza } from "@/lib/dominio";
import { formatMesCurto } from "@/lib/format";
import { cn } from "@/components/ui";

const estiloSelect =
  "h-9 rounded-lg border border-border bg-surface px-2.5 text-sm focus:border-brand data-[ativo=true]:border-brand data-[ativo=true]:text-brand";

export function Filtros({
  meses,
  mesAtivo,
  contas,
  categorias,
}: {
  meses: string[];
  mesAtivo: string;
  contas: Conta[];
  categorias: Categoria[];
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  const [busca, setBusca] = useState(params.get("q") ?? "");
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Última consulta pedida. Enquanto a navegação não termina, a URL (params) ainda
  // está velha; partir dela faria um filtro recém-limpo voltar.
  const ultima = useRef(params.toString());
  useEffect(() => {
    ultima.current = params.toString();
  }, [params]);

  function navegar(p: URLSearchParams) {
    ultima.current = p.toString();
    iniciar(() => router.replace(`${caminho}?${p.toString()}`, { scroll: false }));
  }

  function aplicar(chave: string, valor: string) {
    const p = new URLSearchParams(ultima.current);
    if (valor) p.set(chave, valor);
    else p.delete(chave);
    navegar(p);
  }

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const valor = (k: string) => params.get(k) ?? "";
  const algumFiltro = ["tipo", "natureza", "classe", "categoria", "conta", "q"].some((k) => params.get(k));

  return (
    <div className={cn("flex flex-col gap-2 transition-opacity", pendente && "opacity-60")} aria-busy={pendente}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="f-mes">
          Mês
        </label>
        <select id="f-mes" className={cn(estiloSelect, "font-semibold")} value={mesAtivo} onChange={(e) => aplicar("mes", e.target.value)}>
          {meses.map((m) => (
            <option key={m} value={m}>
              {formatMesCurto(m)}
            </option>
          ))}
          <option value="todos">Todos os meses</option>
        </select>

        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            aria-label="Buscar na descrição e na observação"
            placeholder="Buscar descrição ou observação"
            value={busca}
            onChange={(e) => {
              const v = e.target.value;
              setBusca(v);
              clearTimeout(temporizador.current);
              temporizador.current = setTimeout(() => aplicar("q", v.trim()), 350);
            }}
            className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-8 text-sm focus:border-brand"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Tipo" className={estiloSelect} data-ativo={!!valor("tipo")} value={valor("tipo")} onChange={(e) => aplicar("tipo", e.target.value)}>
          <option value="">Previsto e realizado</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="Natureza" className={estiloSelect} data-ativo={!!valor("natureza")} value={valor("natureza")} onChange={(e) => aplicar("natureza", e.target.value)}>
          <option value="">Toda natureza</option>
          {(Object.keys(ROTULO_NATUREZA) as Natureza[]).map((n) => (
            <option key={n} value={n}>
              {ROTULO_NATUREZA[n]}
            </option>
          ))}
        </select>
        <select aria-label="Classe" className={estiloSelect} data-ativo={!!valor("classe")} value={valor("classe")} onChange={(e) => aplicar("classe", e.target.value)}>
          <option value="">Toda classe</option>
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Categoria" className={estiloSelect} data-ativo={!!valor("categoria")} value={valor("categoria")} onChange={(e) => aplicar("categoria", e.target.value)}>
          <option value="">Toda categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select aria-label="Conta ou cartão" className={estiloSelect} data-ativo={!!valor("conta")} value={valor("conta")} onChange={(e) => aplicar("conta", e.target.value)}>
          <option value="">Toda conta</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
          <option value="sem">Sem conta</option>
        </select>
        {algumFiltro && (
          <button
            type="button"
            onClick={() => {
              setBusca("");
              clearTimeout(temporizador.current);
              const atual = new URLSearchParams(ultima.current);
              const p = new URLSearchParams();
              if (atual.get("mes")) p.set("mes", atual.get("mes")!);
              navegar(p);
            }}
            className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
          >
            <X className="size-4" aria-hidden /> Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
