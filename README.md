# Resolutto Family

Plataforma de planejamento financeiro familiar da Resolutto: Dashboard & DFC, Lançamentos, Patrimônio, Objetivos e Proteções. Cada família vê só os próprios dados; o consultor vê as famílias que atende.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Auth, Postgres com RLS, Storage) · Zod · Vitest · Playwright · Vercel.

## Estado atual: Etapas 1 e 2 concluídas

- Esquema completo do banco (23 tabelas), RLS em todas, Storage privado por família.
- Papéis: membro, consultor e consultor admin. Convite por e-mail.
- Login por link mágico e por senha. Página para definir senha.
- Layout com as 5 abas (topo no desktop, barra inferior no celular), tema claro e escuro.
- Área do consultor: lista de famílias, nova família, convites e horizonte.
- Seed da Família Demo.
- **Lançamentos (Etapa 2):** lista com filtros na URL, busca, totais do filtro (previsto e realizado separados), novo lançamento com regra aprendida e mês sugerido pela fatura, edição, exclusão com confirmação, edição em massa, compras parceladas do mês, contas, categorias e regras.
- 172 testes de unidade e de banco (130 de isolamento entre famílias) + 16 de ponta a ponta.

As decisões estão em [`DECISOES.md`](DECISOES.md).

## Como subir (primeira vez)

### 1. Criar o projeto no Supabase

1. Em [supabase.com](https://supabase.com), crie um projeto na região **São Paulo (sa-east-1)**.
2. Em **Project Settings → API**, copie a URL, a chave *publishable* e a *service role*.
3. Copie `.env.example` para `.env.local` e preencha.

### 2. Aplicar as migrações e o seed

Com a [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push            # aplica supabase/migrations
```

Depois, no **SQL Editor** do Supabase, rode o conteúdo de `supabase/seed.sql` (cria a Família Demo).

Sem a CLI: rode no SQL Editor, na ordem, os arquivos de `supabase/migrations/` e depois o `seed.sql`.

> Nunca rode `supabase/tests/supabase-shim.sql` no Supabase. Ele existe só para os testes locais.

### 3. Configurar o Auth (Authentication no painel)

1. **URL Configuration**
   - Site URL: `http://localhost:3000` (depois, o domínio da Vercel).
   - Redirect URLs: `http://localhost:3000/auth/confirm**` e, depois, `https://SEU-DOMINIO/auth/confirm**`.
2. **Sign In / Providers → Email**: mantenha e-mail habilitado e **desligue "Allow new users to sign up"**. Contas novas nascem só do convite.
3. **Emails → SMTP Settings**: configure um SMTP próprio (Resend, Amazon SES etc.). O SMTP padrão do Supabase envia poucos e-mails por hora e não serve nem para os testes.
4. **Emails → Templates**: troque o link dos modelos abaixo, para que funcionem em qualquer navegador:

   | Modelo | Link |
   | --- | --- |
   | Magic Link | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` |
   | Invite user | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite` |

   Exemplo de corpo do Magic Link: `<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Entrar na Resolutto Family</a></p>`

### 4. Criar os usuários demo

```bash
npm install
npm run seed:usuarios
```

Cria você como **consultor admin** (`SEED_CONSULTOR_EMAIL`) e dois membros da Família Demo:
`titular1.demo@resolutto.test` e `titular2.demo@resolutto.test`, com a senha `SEED_SENHA_DEMO`.

> Para cadastrar seu sócio como admin depois: crie a conta dele (convide-o para qualquer família ou pelo painel do Supabase) e rode no SQL Editor:
> `insert into public.consultores (user_id, nome, admin) select id, 'Nome do sócio', true from auth.users where email = 'email@dele';`

### 5. Rodar

```bash
npm run dev     # http://localhost:3000
```

## Testes

```bash
npm run test:unit   # lógica (formatação; DFC e objetivos nas próximas etapas)
npm run test:rls    # isolamento entre famílias (precisa de um Postgres local)
npm run test:e2e    # Playwright (ver tests/e2e/LEIA-ME.md para rodar com dados)
npm run typecheck && npm run lint
```

Os testes de RLS criam e apagam o banco `resolutto_family_test`. Por padrão usam `postgres://postgres:postgres@localhost:5432/postgres`. Com o Supabase local (`npx supabase start`), aponte `TEST_DATABASE_ADMIN_URL` para `postgres://postgres:postgres@127.0.0.1:54322/postgres`.

Eles rodam cada consulta como um usuário de verdade (`set role authenticated` + JWT), igual ao Supabase, e nunca com a service role. Também conferem que nenhuma tabela ficou sem RLS e que toda tabela com `familia_id` está coberta pelos testes.

## Estrutura

```
supabase/
  migrations/          esquema, RLS, gatilhos e Storage
  seed.sql             Família Demo
  tests/               shim do Supabase para testes locais
scripts/seed-usuarios.mjs
src/
  app/(app)/           as 5 abas da família
  app/consultor/       área do consultor
  app/login, convite/, auth/confirm/, conta/
  app/actions/         server actions (Zod em toda entrada)
  lib/                 formatação, sessão, clientes do Supabase
  proxy.ts             renova a sessão e protege as rotas
tests/
  rls/                 isolamento entre famílias
  e2e/                 Playwright
```

## Segurança

- Toda tabela tem RLS. A regra é única (`pode_acessar_familia`): membro da família, consultor atribuído ou admin.
- A service role só é usada no servidor, para enviar convites. Nenhum dado de família passa por ela.
- Arquivos ficam no bucket privado `familias`, sempre em `<familia_id>/...`, com a mesma regra da RLS.
- A auditoria registra quem mudou o quê, sem gravar textos (descrições, observações).
