"use client";

import { useActionState, useState } from "react";
import { Aviso, Botao, Caixa, Campo, Seletor } from "@/components/ui";
import { salvarRegraModelo } from "@/app/actions/consultor";
import { CLASSES, ROTULO_NATUREZA, type Natureza } from "@/lib/dominio";

const CATEGORIAS_PADRAO = [
  "Receita", "Alimentação", "Moradia", "Saúde", "Filhos", "Babá", "Pets", "Transporte",
  "Gastos Livres", "Educação", "Profissional", "Viagens", "Doações", "Sonhos", "Outros",
];

export function FormRegraModelo() {
  const [estado, acao, salvando] = useActionState(salvarRegraModelo, undefined);
  const [natureza, setNatureza] = useState<Natureza>("fluxo");
  return (
    <form action={acao} className="flex flex-col gap-4">
      {estado?.erro && <Aviso tom="negativo">{estado.erro}</Aviso>}
      {estado?.ok && <Aviso tom="positivo">{estado.ok}</Aviso>}
      <Campo rotulo="Quando a descrição contiver" id="padrao" required minLength={2} placeholder="Ex.: DROGA RAIA" />
      <Seletor rotulo="Natureza" id="natureza" value={natureza} onChange={(e) => setNatureza(e.target.value as Natureza)}>
        {(Object.keys(ROTULO_NATUREZA) as Natureza[]).map((n) => (
          <option key={n} value={n}>
            {ROTULO_NATUREZA[n]}
          </option>
        ))}
      </Seletor>
      {natureza === "fluxo" && (
        <>
          <Seletor rotulo="Categoria" id="categoria_nome" defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {CATEGORIAS_PADRAO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Seletor>
          <Seletor rotulo="Classe" id="classe" defaultValue="">
            <option value="">Padrão da categoria</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Seletor>
          <Caixa rotulo="Marcar como assinatura" id="assinatura" />
        </>
      )}
      <Botao type="submit" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar regra padrão"}
      </Botao>
    </form>
  );
}
