"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, LoaderCircle } from "lucide-react";
import { Aviso, Botao, Cartao } from "@/components/ui";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { criarImportacaoRelatorio, processarRelatorio } from "@/app/actions/relatorio";
import { descartarImportacao } from "@/app/actions/importacao";

export function EnviarRelatorio({ ia }: { ia: { liberada: boolean; configurada: boolean; restantes: number; limite: number } }) {
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [etapa, setEtapa] = useState<"parado" | "enviando" | "lendo">("parado");
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(0);
  const [, iniciar] = useTransition();

  function enviar() {
    if (!arquivo) return;
    setErro(null);
    iniciar(async () => {
      setEtapa("enviando");
      const nova = await criarImportacaoRelatorio({ nome: arquivo.name, tamanho: arquivo.size });
      if (nova.erro || !nova.id || !nova.caminho) {
        setErro(nova.erro ?? "Não foi possível iniciar a importação.");
        setEtapa("parado");
        return;
      }
      const { error } = await criarClienteNavegador().storage.from("familias").upload(nova.caminho, arquivo, { contentType: "application/pdf", upsert: true });
      if (error) {
        await descartarImportacao(nova.id);
        setErro("Não foi possível enviar o PDF. Confira a conexão e tente de novo.");
        setEtapa("parado");
        return;
      }
      setEtapa("lendo");
      const r = await processarRelatorio(nova.id);
      if (r.erro) {
        setErro(r.erro);
        setEtapa("parado");
        router.refresh();
        return;
      }
      // O Next preserva o estado desta tela ao voltar: deixa pronto para o próximo envio.
      setArquivo(null);
      setEtapa("parado");
      setChave((k) => k + 1);
      router.push(`/patrimonio/importar/${nova.id}`);
    });
  }

  const ocupado = etapa !== "parado";
  return (
    <Cartao className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id="relatorio-rotulo">
          Relatório em PDF
        </span>
        <label
          htmlFor="relatorio"
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm hover:bg-surface-2"
        >
          <FileUp className="size-6 text-muted" aria-hidden />
          <span className="font-medium">{arquivo ? arquivo.name : "Escolher arquivo"}</span>
          <span className="text-xs text-muted">Um relatório por vez, de uma conta</span>
        </label>
        <input
          key={chave}
          id="relatorio"
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          aria-labelledby="relatorio-rotulo"
          disabled={ocupado}
          onChange={(e) => {
            setErro(null);
            setArquivo(e.target.files?.[0] ?? null);
          }}
        />
      </div>
      {!ia.configurada && <Aviso tom="atencao">A leitura com IA ainda não foi configurada.</Aviso>}
      {ia.liberada && (
        <p className="text-xs text-muted">
          Leituras com IA restantes neste mês: {ia.restantes} de {ia.limite} (a cota é a mesma dos extratos).
        </p>
      )}
      {erro && <Aviso tom="negativo">{erro}</Aviso>}
      {ocupado && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin text-brand" aria-hidden />
          {etapa === "enviando" ? "Enviando…" : "Lendo o relatório com IA. Pode levar até um minuto…"}
        </p>
      )}
      <div>
        <Botao onClick={enviar} disabled={ocupado || !arquivo || !ia.liberada}>
          Ler relatório
        </Botao>
      </div>
    </Cartao>
  );
}
