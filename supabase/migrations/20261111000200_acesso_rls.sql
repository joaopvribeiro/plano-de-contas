-- ============================================================================
-- Acesso e Row Level Security
--
-- Regra única: um usuário acessa os dados de uma família quando
--   (a) é membro dela, ou
--   (b) é consultor atribuído a ela (familia_consultores), ou
--   (c) é consultor admin.
-- As funções abaixo são security definer, para que as políticas consultem
-- membros/consultores sem cair em recursão de RLS.
-- ============================================================================

create or replace function public.eh_consultor()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consultores c where c.user_id = auth.uid())
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consultores c where c.user_id = auth.uid() and c.admin)
$$;

create or replace function public.eh_consultor_da_familia(p_familia uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_admin()
      or exists (
        select 1 from public.familia_consultores fc
        where fc.familia_id = p_familia and fc.consultor_id = auth.uid()
      )
$$;

create or replace function public.eh_membro_da_familia(p_familia uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros m
    where m.familia_id = p_familia and m.user_id = auth.uid()
  )
$$;

create or replace function public.pode_acessar_familia(p_familia uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and (public.eh_membro_da_familia(p_familia) or public.eh_consultor_da_familia(p_familia))
$$;

revoke execute on function public.eh_consultor(), public.eh_admin(),
  public.eh_consultor_da_familia(uuid), public.eh_membro_da_familia(uuid),
  public.pode_acessar_familia(uuid) from public, anon;
grant execute on function public.eh_consultor(), public.eh_admin(),
  public.eh_consultor_da_familia(uuid), public.eh_membro_da_familia(uuid),
  public.pode_acessar_familia(uuid) to authenticated, service_role;

-- anon nunca acessa nada do esquema público.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- Habilita RLS em todas as tabelas (nenhuma fica de fora)
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Tabelas de dados da família: acesso total para quem pode acessar a família.
-- with check impede inserir ou mover um registro para outra família.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tabelas text[] := array[
    'contas', 'categorias', 'lancamentos', 'regras', 'importacoes', 'insights',
    'ativos', 'historico_ativos', 'passivos', 'historico_passivos',
    'projetos', 'apolices'
  ];
begin
  foreach t in array tabelas loop
    execute format($f$
      create policy "familia_acesso_total" on public.%I
        for all to authenticated
        using (public.pode_acessar_familia(familia_id))
        with check (public.pode_acessar_familia(familia_id))
    $f$, t);
  end loop;
end $$;

-- Configurações que só o consultor altera; a família lê.
do $$
declare
  t text;
  tabelas text[] := array['metas_classe', 'objetivos_config', 'limites_ia'];
begin
  foreach t in array tabelas loop
    execute format($f$
      create policy "familia_le" on public.%I
        for select to authenticated
        using (public.pode_acessar_familia(familia_id))
    $f$, t);
    execute format($f$
      create policy "consultor_escreve" on public.%I
        for all to authenticated
        using (public.eh_consultor_da_familia(familia_id))
        with check (public.eh_consultor_da_familia(familia_id))
    $f$, t);
  end loop;
end $$;

-- Somente leitura para a família; escrita só por funções/servidor.
create policy "familia_le" on public.uso_ia
  for select to authenticated using (public.pode_acessar_familia(familia_id));

create policy "familia_le" on public.auditoria
  for select to authenticated using (public.pode_acessar_familia(familia_id));

-- ---------------------------------------------------------------------------
-- consultores
-- ---------------------------------------------------------------------------
create policy "consultor_le_consultores" on public.consultores
  for select to authenticated
  using (user_id = auth.uid() or public.eh_consultor());

create policy "admin_gerencia_consultores" on public.consultores
  for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

-- ---------------------------------------------------------------------------
-- familias
-- ---------------------------------------------------------------------------
create policy "le_familia" on public.familias
  for select to authenticated
  using (public.pode_acessar_familia(id));

create policy "consultor_cria_familia" on public.familias
  for insert to authenticated
  with check (public.eh_consultor());

create policy "consultor_altera_familia" on public.familias
  for update to authenticated
  using (public.eh_consultor_da_familia(id))
  with check (public.eh_consultor_da_familia(id));

create policy "admin_exclui_familia" on public.familias
  for delete to authenticated
  using (public.eh_admin());

-- ---------------------------------------------------------------------------
-- familia_consultores: leitura para quem acessa a família; escrita só admin.
-- ---------------------------------------------------------------------------
create policy "le_vinculos" on public.familia_consultores
  for select to authenticated
  using (public.pode_acessar_familia(familia_id));

create policy "admin_gerencia_vinculos" on public.familia_consultores
  for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

-- ---------------------------------------------------------------------------
-- membros: a família lê; o consultor gerencia; o próprio membro altera o nome.
-- (Entrar numa família só pelo convite, via aceitar_convite.)
-- ---------------------------------------------------------------------------
create policy "le_membros" on public.membros
  for select to authenticated
  using (public.pode_acessar_familia(familia_id));

create policy "consultor_gerencia_membros" on public.membros
  for all to authenticated
  using (public.eh_consultor_da_familia(familia_id))
  with check (public.eh_consultor_da_familia(familia_id));

create policy "membro_altera_proprio_nome" on public.membros
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- convites: só o consultor (o token é segredo; membros não leem).
-- ---------------------------------------------------------------------------
create policy "consultor_gerencia_convites" on public.convites
  for all to authenticated
  using (public.eh_consultor_da_familia(familia_id))
  with check (public.eh_consultor_da_familia(familia_id));

-- ---------------------------------------------------------------------------
-- consentimentos: cada usuário registra e lê os seus; o consultor lê os da família.
-- ---------------------------------------------------------------------------
create policy "usuario_registra_consentimento" on public.consentimentos
  for insert to authenticated
  with check (user_id = auth.uid() and public.pode_acessar_familia(familia_id));

create policy "le_consentimentos" on public.consentimentos
  for select to authenticated
  using (user_id = auth.uid() or public.eh_consultor_da_familia(familia_id));
