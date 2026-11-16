"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { COOKIE_FAMILIA, obterContexto } from "@/lib/sessao";

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  (await cookies()).delete(COOKIE_FAMILIA);
  redirect("/login");
}

/** Destinos permitidos ao abrir uma família (evita redirecionamento arbitrário). */
const DESTINOS = ["/dashboard", "/lancamentos", "/lancamentos/importar-previsto", "/lancamentos/regras"] as const;

/** Abre a visão de uma família (consultor ou membro de mais de uma). */
export async function entrarNaFamilia(formData: FormData) {
  const id = z.uuid().parse(formData.get("familia_id"));
  const ctx = await obterContexto();
  if (!ctx.familias.some((f) => f.id === id)) redirect("/consultor");

  (await cookies()).set(COOKIE_FAMILIA, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  const destino = DESTINOS.find((d) => d === formData.get("destino")) ?? "/dashboard";
  redirect(destino);
}

/** Sai da visão da família e volta para a área do consultor. */
export async function sairDaFamilia() {
  (await cookies()).delete(COOKIE_FAMILIA);
  redirect("/consultor");
}
