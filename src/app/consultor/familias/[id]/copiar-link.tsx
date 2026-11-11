"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  const absoluto = url.startsWith("http") ? url : `${typeof window !== "undefined" ? window.location.origin : ""}${url}`;
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(absoluto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
    >
      {copiado ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copiado ? "Copiado" : "Copiar link"}
    </button>
  );
}
