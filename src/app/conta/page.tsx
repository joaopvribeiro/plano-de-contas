import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Cartao, Marca } from "@/components/ui";
import { obterContexto } from "@/lib/sessao";
import { FormSenha } from "./form-senha";

export const metadata = { title: "Minha conta · Resolutto Family" };

export default async function Conta() {
  const ctx = await obterContexto();
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Voltar
      </Link>
      <Cartao className="p-6">
        <Marca />
        <h1 className="mt-4 text-lg font-bold">Minha conta</h1>
        <p className="mt-1 text-sm text-muted">{ctx.usuario.email}</p>
        <h2 className="mt-6 mb-3 text-sm font-semibold">Definir ou trocar a senha</h2>
        <FormSenha />
      </Cartao>
    </main>
  );
}
