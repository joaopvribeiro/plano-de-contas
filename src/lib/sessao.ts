import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

export const COOKIE_FAMILIA = "rf_familia";

export type FamiliaResumo = { id: string; nome: string; papel: "membro" | "consultor" };

export type Contexto = {
  usuario: { id: string; email: string };
  consultor: { nome: string; admin: boolean } | null;
  familias: FamiliaResumo[];
};

/** Usuário logado + papel + famílias acessíveis. Redireciona para /login se não houver sessão. */
export const obterContexto = cache(async (): Promise<Contexto> => {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  const [{ data: consultor }, { data: familias }] = await Promise.all([
    supabase.from("consultores").select("nome, admin").eq("user_id", claims.sub).maybeSingle(),
    supabase.rpc("minhas_familias"),
  ]);

  return {
    usuario: { id: claims.sub, email: String(claims.email ?? "") },
    consultor: consultor ?? null,
    familias: (familias ?? []) as FamiliaResumo[],
  };
});

/**
 * Família aberta agora.
 * - Membro com uma família: sempre ela.
 * - Consultor (ou membro de várias): a escolhida no cookie; sem escolha, vai para a área do consultor.
 */
export const obterFamiliaAtiva = cache(async (): Promise<{ ctx: Contexto; familia: FamiliaResumo }> => {
  const ctx = await obterContexto();
  const escolhida = (await cookies()).get(COOKIE_FAMILIA)?.value;

  const familia =
    ctx.familias.find((f) => f.id === escolhida) ??
    (ctx.familias.filter((f) => f.papel === "membro").length === 1
      ? ctx.familias.find((f) => f.papel === "membro")
      : undefined);

  if (!familia) {
    if (ctx.consultor) redirect("/consultor");
    redirect("/sem-familia");
  }

  return { ctx, familia };
});
