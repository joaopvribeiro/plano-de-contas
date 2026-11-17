# Resolutto Family

Plataforma de planejamento financeiro familiar da Resolutto: Dashboard & DFC, Lançamentos, Patrimônio, Objetivos e Proteções. Cada família vê só os próprios dados; o consultor vê as famílias que atende.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Auth, Postgres com RLS, Storage) · Zod · Vitest · Playwright · Vercel.

## Estado atual: Etapas 1 a 7 concluídas

- Esquema completo do banco (23 tabelas), RLS em todas, Storage privado por família.
- Papéis: membro, consultor e consultor admin. Convite por e-mail.
- Login por link mágico e por senha. Página para definir senha.
- Layout com as 5 abas (topo no desktop, barra inferior no celular), tema claro e escuro.
- Área do consultor: lista de famílias, nova família, convites e horizonte.
- Seed da Família Demo.
- **Lançamentos (Etapa 2):** lista com filtros na URL, busca, totais do filtro (previsto e realizado separados), novo lançamento com regra aprendida e mês sugerido pela fatura, edição, exclusão com confirmação, edição em massa, compras parceladas do mês, contas, categorias e regras.
- **Dashboard & DFC (Etapa 3):** cartões do mês, gráfico de entradas, saídas e caixa acumulado, distribuição das despesas sobre a receita com metas, matriz DFC (Previsto, Realizado, Divergência) com exportação. Importação do orçamento previsto por planilha, "repetir previsto", regras padrão. Previsto editável só pelo consultor.
- **Importação de extratos e faturas (Etapa 4):** PDF e fotos lidos pela IA (Claude, da Anthropic), OFX e CSV lidos sem IA. Revisão antes de gravar: regras da família, sugestões da IA, mês da fatura, estornos, possíveis duplicadas, conferência com o total da fatura, parcelas ligadas às previstas e parcelas futuras. Autorização de IA por família e limite mensal de leituras. O arquivo original é apagado ao confirmar ou descartar.
- **Patrimônio (Etapa 5):** carteira investida, patrimônio líquido, direitos futuros e patrimônio com direitos; distribuição por categoria e instituição; evolução mensal; balanço por grupo com saldo desatualizado em destaque; ativos, dívidas e consórcios. Leitura de relatórios de investimento (XP, BTG e outros) com IA, conferida contra o patrimônio bruto, sugerindo a reserva até a meta e atualizando os mesmos ativos mês a mês.
- **Objetivos (Etapa 6):** liberdade financeira (saldo de hoje no prazo e aporte mensal necessário, em reais de hoje), reserva de emergência (quantos meses cobre), consórcios e projetos com quanto guardar por mês. O consultor edita as premissas e pode prever o aporte de um projeto no orçamento.
- **Proteções (Etapa 7):** prêmios mensais, apólices lidas pela IA e renovações em 60 dias; cards por tipo com os destaques; detalhe com resumo, carências, exclusões, como acionar e o arquivo original; leitura de apólice (PDF ou até 3 fotos) com revisão; cadastro à mão; "Incluir prêmio no orçamento" para o consultor.
- Testes de unidade, de banco (isolamento entre famílias e permissões) e de ponta a ponta.

## Atualizar um Supabase que já está no ar

Cada etapa pode trazer migrações novas em `supabase/migrations`. Aplique antes (ou logo depois) do deploy:

```bash
npx supabase db push
```

Sem a CLI: abra o **SQL Editor** e rode, em ordem, só os arquivos que ainda não rodou. Na Etapa 3 é o `20261116000100_etapa3_permissoes_regras_padrao.sql`; na Etapa 4, o `20261116000200_etapa4_importacao_ia.sql`; na Etapa 5, o `20261117000100_etapa5_patrimonio.sql`; na Etapa 7, o `20261117000200_etapa7_protecoes.sql`.

### Chave da IA (a partir da Etapa 4)

Na Vercel (Settings → Environment Variables), cadastre `ANTHROPIC_API_KEY` com uma chave criada em console.anthropic.com. Opcional: `ANTHROPIC_MODEL_EXTRACAO` (padrão `claude-haiku-5-5`). Sem a chave, OFX e CSV continuam funcionando e PDFs e fotos ficam indisponíveis, com aviso na tela. `IA_SIMULADA=1` é só para testes automáticos: nunca cadastre na Vercel.

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
