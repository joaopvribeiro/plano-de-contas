-- ============================================================================
-- Etapa 3
-- 1. Orçamento previsto: só o consultor cria, altera ou exclui.
--    Exceção: parcelas futuras geradas pela importação (origem 'ia-parcela'),
--    que o próprio membro cria e remove ("Quitou ou antecipou?").
-- 2. Biblioteca de regras padrão da Resolutto, copiada para cada família nova.
-- 3. minhas_familias passa a dizer se o usuário é consultor daquela família.
-- ============================================================================

-- 1. Lançamentos ----------------------------------------------------------------
drop policy "familia_acesso_total" on public.lancamentos;

create or replace function public.pode_editar_lancamento(p_familia uuid, p_tipo text, p_origem text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.pode_acessar_familia(p_familia)
     and (p_tipo = 'Realizado' or p_origem = 'ia-parcela' or public.eh_consultor_da_familia(p_familia))
$$;
revoke execute on function public.pode_editar_lancamento(uuid, text, text) from public, anon;
grant execute on function public.pode_editar_lancamento(uuid, text, text) to authenticated, service_role;

create policy "le_lancamentos" on public.lancamentos
  for select to authenticated
  using (public.pode_acessar_familia(familia_id));

create policy "cria_lancamentos" on public.lancamentos
  for insert to authenticated
  with check (public.pode_editar_lancamento(familia_id, tipo, origem));

-- using: o registro atual pode ser mexido; with check: o resultado também.
-- Assim o membro não transforma um realizado em previsto nem o contrário.
create policy "altera_lancamentos" on public.lancamentos
  for update to authenticated
  using (public.pode_editar_lancamento(familia_id, tipo, origem))
  with check (public.pode_editar_lancamento(familia_id, tipo, origem));

create policy "exclui_lancamentos" on public.lancamentos
  for delete to authenticated
  using (public.pode_editar_lancamento(familia_id, tipo, origem));

-- 2. Regras padrão --------------------------------------------------------------
create table public.regras_modelo (
  id uuid primary key default gen_random_uuid(),
  padrao text not null unique check (length(trim(padrao)) >= 2),
  natureza text not null default 'fluxo' check (natureza in ('fluxo', 'transferencia', 'aporte', 'resgate')),
  categoria_nome text,
  classe public.classe,
  assinatura boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (natureza <> 'fluxo' or categoria_nome is not null)
);
alter table public.regras_modelo enable row level security;

create policy "consultor_le_modelo" on public.regras_modelo
  for select to authenticated using (public.eh_consultor());
create policy "admin_gerencia_modelo" on public.regras_modelo
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create trigger atualizado_em before update on public.regras_modelo
  for each row execute function public.tg_atualizado_em();

-- Padrões gravados como o app normaliza (maiúsculas, sem acento, sem pontuação).
-- Evitados termos curtos que aparecem dentro de outras palavras (ex.: "POSTO" em "IMPOSTO").
insert into public.regras_modelo (padrao, natureza, categoria_nome, classe, assinatura) values
  ('PAGAMENTO FATURA', 'transferencia', null, null, false),
  ('PAGTO FATURA', 'transferencia', null, null, false),
  ('PAG FATURA', 'transferencia', null, null, false),
  ('MESMA TITULARIDADE', 'transferencia', null, null, false),
  ('APLICACAO', 'aporte', null, null, false),
  ('RESGATE', 'resgate', null, null, false),
  ('IFOOD', 'fluxo', 'Alimentação', 'Padrão de vida', false),
  ('RAPPI', 'fluxo', 'Alimentação', 'Padrão de vida', false),
  ('UBER EATS', 'fluxo', 'Alimentação', 'Padrão de vida', false),
  ('UBER', 'fluxo', 'Transporte', 'Padrão de vida', false),
  ('CARREFOUR', 'fluxo', 'Alimentação', 'Despesa básica', false),
  ('PAO DE ACUCAR', 'fluxo', 'Alimentação', 'Despesa básica', false),
  ('ASSAI', 'fluxo', 'Alimentação', 'Despesa básica', false),
  ('ATACADAO', 'fluxo', 'Alimentação', 'Despesa básica', false),
  ('NETFLIX', 'fluxo', 'Gastos Livres', 'Padrão de vida', true),
  ('SPOTIFY', 'fluxo', 'Gastos Livres', 'Padrão de vida', true),
  ('AMAZON PRIME', 'fluxo', 'Gastos Livres', 'Padrão de vida', true),
  ('DISNEY', 'fluxo', 'Gastos Livres', 'Padrão de vida', true),
  ('GLOBOPLAY', 'fluxo', 'Gastos Livres', 'Padrão de vida', true),
  ('YOUTUBE PREMIUM', 'fluxo', 'Gastos Livres', 'Padrão de vida', true),
  ('APPLE COM BILL', 'fluxo', 'Gastos Livres', 'Padrão de vida', true),
  ('SMART FIT', 'fluxo', 'Saúde', 'Padrão de vida', true),
  ('DROGASIL', 'fluxo', 'Saúde', 'Despesa básica', false),
  ('DROGA RAIA', 'fluxo', 'Saúde', 'Despesa básica', false),
  ('DROGARIA', 'fluxo', 'Saúde', 'Despesa básica', false),
  ('PAGUE MENOS', 'fluxo', 'Saúde', 'Despesa básica', false),
  ('PETZ', 'fluxo', 'Pets', 'Padrão de vida', false),
  ('COBASI', 'fluxo', 'Pets', 'Padrão de vida', false),
  ('PETLOVE', 'fluxo', 'Pets', 'Padrão de vida', false),
  ('SHELL', 'fluxo', 'Transporte', 'Despesa básica', false),
  ('IPIRANGA', 'fluxo', 'Transporte', 'Despesa básica', false),
  ('IPVA', 'fluxo', 'Transporte', 'Despesa básica', false),
  ('SEM PARAR', 'fluxo', 'Transporte', 'Despesa básica', true),
  ('SABESP', 'fluxo', 'Moradia', 'Despesa básica', false),
  ('COMGAS', 'fluxo', 'Moradia', 'Despesa básica', false),
  ('ENEL', 'fluxo', 'Moradia', 'Despesa básica', false),
  ('CEMIG', 'fluxo', 'Moradia', 'Despesa básica', false);

-- Copia o modelo para uma família. Categoria casada pelo nome; regra cuja
-- categoria não existe na família é ignorada; regra já existente não é tocada.
create or replace function public._copiar_regras_modelo(p_familia uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.regras (familia_id, padrao, natureza, categoria_id, classe, assinatura)
  select p_familia, m.padrao, m.natureza, c.id,
         case when m.natureza = 'fluxo' then coalesce(m.classe, c.classe_padrao) end,
         m.assinatura
  from public.regras_modelo m
  left join public.categorias c
    on c.familia_id = p_familia and c.nome = m.categoria_nome and not c.arquivada
  where m.natureza <> 'fluxo' or c.id is not null
  on conflict (familia_id, padrao) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public._copiar_regras_modelo(uuid) from public, anon, authenticated;

create or replace function public.aplicar_regras_modelo(p_familia uuid)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_consultor_da_familia(p_familia) then
    raise exception 'Só o consultor da família aplica as regras padrão.' using errcode = '42501';
  end if;
  return public._copiar_regras_modelo(p_familia);
end $$;
revoke execute on function public.aplicar_regras_modelo(uuid) from public, anon;
grant execute on function public.aplicar_regras_modelo(uuid) to authenticated;

-- Família nova já nasce com as regras padrão (depois das categorias).
create or replace function public.tg_familia_regras_modelo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._copiar_regras_modelo(new.id);
  return new;
end $$;
-- Gatilhos AFTER rodam em ordem alfabética: "familia_padroes" (categorias) antes de "familia_regras_modelo".
create trigger familia_regras_modelo after insert on public.familias
  for each row execute function public.tg_familia_regras_modelo();

-- 3. minhas_familias com a flag de consultor -----------------------------------
drop function public.minhas_familias();
create function public.minhas_familias()
returns table (id uuid, nome text, papel text, consultor boolean)
language sql stable security definer set search_path = '' as $$
  select f.id, f.nome,
    case when public.eh_membro_da_familia(f.id) then 'membro' else 'consultor' end as papel,
    public.eh_consultor_da_familia(f.id) as consultor
  from public.familias f
  where public.pode_acessar_familia(f.id)
  order by f.nome
$$;
revoke execute on function public.minhas_familias() from public, anon;
grant execute on function public.minhas_familias() to authenticated;

-- 4. Resumo da DFC ---------------------------------------------------------------
-- Soma os lançamentos por mês, tipo, natureza, classe e estorno, no banco.
-- security invoker: roda com as permissões de quem chama, então a RLS vale.
-- A conta da DFC é linear, então somar antes não muda o resultado (lib/dfc.ts).
create or replace function public.resumo_dfc(p_familia uuid, p_de text, p_ate text)
returns table (mes_competencia text, tipo text, natureza text, classe text, estorno boolean, valor numeric)
language sql stable security invoker set search_path = '' as $$
  select l.mes_competencia::text, l.tipo, l.natureza, l.classe::text, l.estorno, sum(l.valor)
  from public.lancamentos l
  where l.familia_id = p_familia
    and l.mes_competencia between p_de and p_ate
    and l.natureza <> 'transferencia'
  group by 1, 2, 3, 4, 5
$$;
revoke execute on function public.resumo_dfc(uuid, text, text) from public, anon;
grant execute on function public.resumo_dfc(uuid, text, text) to authenticated;
