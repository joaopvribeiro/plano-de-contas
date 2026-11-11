# Testes de ponta a ponta

`acesso.spec.ts` roda sem backend. `lancamentos.spec.ts` (e os próximos) precisam de um
banco com o seed da Família Demo e **alteram dados**: rode sempre num banco recém-criado.

## Com o Supabase local (recomendado na sua máquina)

```bash
npx supabase start          # sobe Postgres, Auth e REST em Docker
npx supabase db reset       # aplica migrações + seed.sql
npm run seed:usuarios       # com .env.local apontando para o Supabase local
E2E_SENHA=<SEED_SENHA_DEMO> E2E_MEMBRO_EMAIL=titular1.demo@resolutto.test npm run test:e2e
```

Rode `npx supabase db reset` antes de cada nova rodada.

## Sem Docker (PostgREST + Postgres comum)

Foi assim que os testes rodaram durante o desenvolvimento: Postgres 16 com o shim de
`supabase/tests`, as migrações, o seed e os usuários de teste; PostgREST com o
`jwt-secret`; e um pequeno gateway que expõe `/rest/v1` e `/auth/v1/user`. Os tokens
são assinados localmente com `E2E_JWT_SECRET`.
