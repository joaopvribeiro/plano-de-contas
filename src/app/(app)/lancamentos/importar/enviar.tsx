"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, LoaderCircle } from "lucide-react";
import { Aviso, Botao, Cartao, Seletor } from "@/components/ui";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { criarImportacao, descartarImportacao, processarImportacao } from "@/app/actions/importacao";
import { formatoDoArquivo } from "@/lib/importacao/tipos";
import type { TipoConta } from "@/lib/dominio";

type Etapa = "parado" | "enviando" | "lendo";

const TIPOS_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ofx: "application/x-ofx",
  qfx: "application/x-ofx",
  csv: "text/csv",
  txt: "text/plain",
};

export function EnviarExtrato({
  contas,
  ia,
}: {
  contas: { id: string; nome: string; tipo: TipoConta }[];
  ia: { liberada: boolean; configurada: boolean; consentimento: boolean; restantes: number; limite: number };
}) {
  const router = useRouter();
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [etapa, setEtapa] = useState<Etapa>("parado");
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const precisaIA = arquivos.some((a) => {
    const f = formatoDoArquivo(a.name, a.type);
    return f === "pdf" || f === "imagem";
  });

  function enviar() {
    setErro(null);
    iniciar(async () => {
      setEtapa("enviando");
      const nova = await criarImportacao({
        conta_id: contaId,
        arquivos: arquivos.map((a) => ({ nome: a.name, tamanho: a.size, tipo: a.type })),
      });
      if (nova.erro || !nova.id || !nova.caminhos) {
        setErro(nova.erro ?? "Não foi possível iniciar a importação.");
        setEtapa("parado");
        return;
      }
      const supabase = criarClienteNavegador();
      for (const [i, arquivo] of arquivos.entries()) {
        const ext = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
        const { error } = await supabase.storage
          .from("familias")
          .upload(nova.caminhos[i], arquivo, { contentType: TIPOS_MIME[ext] ?? (arquivo.type || "application/octet-stream"), upsert: true });
        if (error) {
          await descartarImportacao(nova.id);
          setErro(`Não foi possível enviar "${arquivo.name}". Confira a conexão e tente de novo.`);
          setEtapa("parado");
          return;
        }
      }
      setEtapa("lendo");
      const r = await processarImportacao(nova.id);
      if (r.erro) {
        setErro(r.erro);
        setEtapa("parado");
        router.refresh();
        return;
      }
      router.push(`/lancamentos/importar/${nova.id}`);
    });
  }

  const ocupado = etapa !== "parado";

  return (
    <Cartao className="flex flex-col gap-4">
      <Seletor rotulo="Conta ou cartão do documento" id="conta_id" value={contaId} onChange={(e) => setContaId(e.target.value)} disabled={ocupado}>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
            {c.tipo === "cartao_credito" ? " (cartão)" : ""}
          </option>
        ))}
      </Seletor>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id="arquivos-rotulo">
          Arquivos
        </span>
        <label
          htmlFor="arquivos"
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm hover:bg-surface-2"
        >
          <FileUp className="size-6 text-muted" aria-hidden />
          <span className="font-medium">{arquivos.length ? arquivos.map((a) => a.name).join(", ") : "Escolher arquivos"}</span>
          <span className="text-xs text-muted">PDF ou fotos da mesma fatura (até 4), ou um OFX/CSV exportado do banco</span>
        </label>
        <input
          id="arquivos"
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.ofx,.qfx,.csv,.txt"
          className="sr-only"
          aria-labelledby="arquivos-rotulo"
          disabled={ocupado}
          onChange={(e) => {
            setErro(null);
            setArquivos(Array.from(e.target.files ?? []).slice(0, 4));
          }}
        />
      </div>

      {precisaIA && !ia.consentimento && <Aviso tom="atencao">PDFs e fotos precisam da autorização de IA acima. OFX e CSV funcionam sem ela.</Aviso>}
      {precisaIA && ia.consentimento && !ia.configurada && (
        <Aviso tom="atencao">A leitura com IA ainda não foi configurada. Por enquanto, use OFX ou CSV.</Aviso>
      )}
      {ia.liberada && (
        <p className="text-xs text-muted">
          Leituras com IA restantes neste mês: {ia.restantes} de {ia.limite}.
        </p>
      )}
      {erro && <Aviso tom="negativo">{erro}</Aviso>}

      {ocupado && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin text-brand" aria-hidden />
          {etapa === "enviando" ? "Enviando…" : precisaIA ? "Lendo o documento com IA. Pode levar até um minuto…" : "Lendo o arquivo…"}
        </p>
      )}

      <div>
        <Botao onClick={enviar} disabled={ocupado || !arquivos.length || !contaId || (precisaIA && !ia.liberada)}>
          Ler arquivo
        </Botao>
      </div>
    </Cartao>
  );
}
