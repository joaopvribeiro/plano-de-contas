#!/usr/bin/env node
/**
 * Cria os usuários de demonstração e os vínculos com a Família Demo.
 * Rode depois das migrações e do supabase/seed.sql.
 *
 *   node --env-file=.env.local scripts/seed-usuarios.mjs
 *
 * Variáveis:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (obrigatórias)
 *   SEED_CONSULTOR_EMAIL   e-mail do consultor admin (ex.: o seu)
 *   SEED_CONSULTOR_NOME    nome exibido (padrão "Consultor Resolutto")
 *   SEED_SENHA_DEMO        senha dos usuários demo (mín. 10 caracteres)
 *
 * Usa a service role: rode só na sua máquina, nunca no navegador.
 */
import { createClient } from "@supabase/supabase-js";

const FAMILIA_DEMO = "0d0d0d0d-0000-4000-8000-000000000001";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const consultorEmail = process.env.SEED_CONSULTOR_EMAIL;
const consultorNome = process.env.SEED_CONSULTOR_NOME ?? "Consultor Resolutto";
const senha = process.env.SEED_SENHA_DEMO;

if (!url || !serviceKey || !consultorEmail || !senha || senha.length < 10) {
  console.error(
    "Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_CONSULTOR_EMAIL e SEED_SENHA_DEMO (10+ caracteres).",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function garantirUsuario(email, nome) {
  const { data: lista, error: erroLista } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (erroLista) throw erroLista;
  const existente = lista.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existente) return existente.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const consultorId = await garantirUsuario(consultorEmail, consultorNome);
  const membro1 = await garantirUsuario("titular1.demo@resolutto.test", "Titular 1 (demo)");
  const membro2 = await garantirUsuario("titular2.demo@resolutto.test", "Titular 2 (demo)");

  const passos = [
    admin.from("consultores").upsert({ user_id: consultorId, nome: consultorNome, admin: true }),
    admin
      .from("familia_consultores")
      .upsert({ familia_id: FAMILIA_DEMO, consultor_id: consultorId, principal: true }),
    admin.from("membros").upsert([
      { user_id: membro1, familia_id: FAMILIA_DEMO, nome: "Titular 1" },
      { user_id: membro2, familia_id: FAMILIA_DEMO, nome: "Titular 2" },
    ]),
  ];

  for (const passo of passos) {
    const { error } = await passo;
    if (error) throw error;
  }

  console.log("Pronto.");
  console.log(`Consultor admin: ${consultorEmail}`);
  console.log("Membros demo: titular1.demo@resolutto.test e titular2.demo@resolutto.test (senha: SEED_SENHA_DEMO)");
}

main().catch((e) => {
  console.error("Falhou:", e.message ?? e);
  process.exit(1);
});
