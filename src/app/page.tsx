import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_FAMILIA, obterContexto } from "@/lib/sessao";

/** Início: consultor vai para a lista de famílias; membro vai direto para o dashboard. */
export default async function Inicio() {
  const ctx = await obterContexto();
  const escolhida = (await cookies()).get(COOKIE_FAMILIA)?.value;

  if (escolhida && ctx.familias.some((f) => f.id === escolhida)) redirect("/dashboard");
  if (ctx.consultor) redirect("/consultor");
  if (ctx.familias.length > 0) redirect("/dashboard");
  redirect("/sem-familia");
}
