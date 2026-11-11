-- ============================================================================
-- Gatilhos e funções de negócio da Etapa 1
-- ============================================================================

-- atualizado_em automático ------------------------------------------------------
create or replace function public.tg_atualizado_em()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

do $$
declare t record;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'atualizado_em'
  loop
    execute format(
      'create trigger atualizado_em before update on public.%I
         for each row execute function public.tg_atualizado_em()', t.table_name);
  end loop;
end $$;

-- Auditoria ---------------------------------------------------------------------
-- Grava quem alterou, quando, quais campos e só os valores numéricos.
-- Nunca grava textos (descrição, observação, resumo de apólice etc.).
-- Exclusões em cascata (família apagada) não geram auditoria dos registros filhos.
create or replace function public.tg_auditoria()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_novo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_velho jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_ref jsonb := coalesce(v_novo, v_velho);
  v_campos text[];
  v_nums jsonb;
  v_familia uuid;
begin
  v_familia := case
    when tg_table_name = 'familias' then (v_ref ->> 'id')::uuid
    else (v_ref ->> 'familia_id')::uuid
  end;

  if tg_op = 'DELETE' and not exists (select 1 from public.familias f where f.id = v_familia) then
    return old;
  end if;

  select coalesce(array_agg(k order by k), '{}') into v_campos
  from (
    select key as k from jsonb_each(coalesce(v_novo, '{}'))
    union
    select key from jsonb_each(coalesce(v_velho, '{}'))
  ) chaves
  where k not in ('atualizado_em', 'criado_em')
    and (v_novo -> k) is distinct from (v_velho -> k);

  select jsonb_object_agg(k, jsonb_build_object('antes', v_velho -> k, 'depois', v_novo -> k))
  into v_nums
  from unnest(v_campos) k
  where jsonb_typeof(coalesce(v_novo -> k, v_velho -> k)) = 'number';

  insert into public.auditoria (tabela, registro_id, familia_id, acao, campos_alterados, valores_numericos, user_id)
  values (tg_table_name, v_ref ->> 'id', v_familia, tg_op, v_campos, v_nums, auth.uid());

  return coalesce(new, old);
end $fn$;

do $$
declare
  t text;
  tabelas text[] := array[
    'contas', 'categorias', 'lancamentos', 'regras', 'ativos', 'passivos',
    'projetos', 'apolices', 'metas_classe', 'objetivos_config', 'limites_ia', 'membros'
  ];
begin
  foreach t in array tabelas loop
    execute format(
      'create trigger auditoria after insert or update or delete on public.%I
         for each row execute function public.tg_auditoria()', t);
  end loop;
end $$;

-- A exclusão da família apaga a auditoria dela em cascata; o gatilho em
-- familias não pode inserir uma linha apontando para a família apagada.
create or replace function public.tg_auditoria_familia_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria (tabela, registro_id, familia_id, acao, campos_alterados, user_id)
  values ('familias', old.id::text, null, 'DELETE', '{}', auth.uid());
  return old;
end $$;
create trigger auditoria after insert or update on public.familias
  for each row execute function public.tg_auditoria();
create trigger auditoria_delete after delete on public.familias
  for each row execute function public.tg_auditoria_familia_delete();


-- Padrões ao criar uma família -------------------------------------------------
-- Categorias pré-carregadas, metas por classe, objetivos, limites de IA e
-- vínculo do consultor que criou a família como principal.
create or replace function public.tg_familia_padroes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.categorias (familia_id, nome, classe_padrao, ordem) values
    (new.id, 'Receita', 'Receita', 1),
    (new.id, 'Alimentação', 'Despesa básica', 2),
    (new.id, 'Moradia', 'Despesa básica', 3),
    (new.id, 'Saúde', 'Despesa básica', 4),
    (new.id, 'Filhos', 'Despesa básica', 5),
    (new.id, 'Babá', 'Despesa básica', 6),
    (new.id, 'Pets', 'Padrão de vida', 7),
    (new.id, 'Transporte', 'Despesa básica', 8),
    (new.id, 'Gastos Livres', 'Padrão de vida', 9),
    (new.id, 'Educação', 'Despesa básica', 10),
    (new.id, 'Profissional', 'Padrão de vida', 11),
    (new.id, 'Viagens', 'Padrão de vida', 12),
    (new.id, 'Doações', 'Doações', 13),
    (new.id, 'Sonhos', 'Sonhos', 14),
    (new.id, 'Outros', 'Padrão de vida', 15);

  insert into public.metas_classe (familia_id, classe, percentual_max_receita) values
    (new.id, 'Despesa básica', 50),
    (new.id, 'Padrão de vida', 30),
    (new.id, 'Doações', 10),
    (new.id, 'Sonhos', 10);

  insert into public.objetivos_config (familia_id) values (new.id);
  insert into public.limites_ia (familia_id) values (new.id);

  if exists (select 1 from public.consultores c where c.user_id = auth.uid()) then
    insert into public.familia_consultores (familia_id, consultor_id, principal)
    values (new.id, auth.uid(), true);
  end if;

  return new;
end $$;

create trigger familia_padroes after insert on public.familias
  for each row execute function public.tg_familia_padroes();

-- conta_liberdade: padrão verdadeiro para Investimentos, Previdência e Fundo Fechado.
create or replace function public.tg_ativo_padroes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.conta_liberdade is null then
    new.conta_liberdade := new.categoria in ('Investimentos', 'Previdência', 'Fundo Fechado');
  end if;
  return new;
end $$;

create trigger ativo_padroes before insert or update on public.ativos
  for each row execute function public.tg_ativo_padroes();

-- Histórico automático quando o saldo de um ativo ou dívida muda.
create or replace function public.tg_historico_ativo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.valor is distinct from old.valor then
    insert into public.historico_ativos (familia_id, ativo_id, valor, data)
    values (new.familia_id, new.id, new.valor, (now() at time zone 'America/Sao_Paulo')::date);
  end if;
  return new;
end $$;

create trigger historico_ativo after insert or update of valor on public.ativos
  for each row execute function public.tg_historico_ativo();

create or replace function public.tg_historico_passivo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.saldo_devedor is distinct from old.saldo_devedor then
    insert into public.historico_passivos (familia_id, passivo_id, saldo_devedor, data)
    values (new.familia_id, new.id, new.saldo_devedor, (now() at time zone 'America/Sao_Paulo')::date);
  end if;
  return new;
end $$;

create trigger historico_passivo after insert or update of saldo_devedor on public.passivos
  for each row execute function public.tg_historico_passivo();

-- Convites --------------------------------------------------------------------
-- O convidado, já autenticado com o e-mail convidado, entra na família.
create or replace function public.aceitar_convite(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_convite public.convites;
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null then
    raise exception 'Faça login para aceitar o convite.' using errcode = '28000';
  end if;

  select * into v_convite from public.convites where token = p_token for update;

  if not found then
    raise exception 'Convite não encontrado.' using errcode = 'P0002';
  end if;
  if v_convite.aceito_em is not null then
    raise exception 'Este convite já foi usado.' using errcode = 'P0001';
  end if;
  if v_convite.expira_em < now() then
    raise exception 'Este convite expirou. Peça um novo ao seu consultor.' using errcode = 'P0001';
  end if;
  if v_email is distinct from v_convite.email then
    raise exception 'Este convite foi enviado para outro e-mail.' using errcode = '42501';
  end if;

  insert into public.membros (user_id, familia_id, nome)
  values (auth.uid(), v_convite.familia_id, coalesce(v_convite.nome, split_part(v_email, '@', 1)))
  on conflict (user_id, familia_id) do nothing;

  update public.convites set aceito_em = now() where id = v_convite.id;

  return v_convite.familia_id;
end $$;

revoke execute on function public.aceitar_convite(uuid) from public, anon;
grant execute on function public.aceitar_convite(uuid) to authenticated;

-- Dados mínimos de um convite para a página pública /convite/<token>.
-- Quem tem o token (segredo de 122 bits) vê só o nome da família e o e-mail convidado.
create or replace function public.convite_publico(p_token uuid)
returns table (email text, familia_nome text, valido boolean)
language sql stable security definer set search_path = '' as $$
  select c.email, f.nome, (c.aceito_em is null and c.expira_em > now())
  from public.convites c
  join public.familias f on f.id = c.familia_id
  where c.token = p_token
$$;

revoke execute on function public.convite_publico(uuid) from public;
grant execute on function public.convite_publico(uuid) to anon, authenticated, service_role;

-- Criação de família pelo consultor --------------------------------------------
-- Um INSERT ... RETURNING direto falharia: a política de leitura só passa a valer
-- depois que o gatilho vincula o consultor. A função faz tudo numa operação.
create or replace function public.criar_familia(
  p_nome text,
  p_inicio public.mes_aaaa_mm,
  p_meses int default 12,
  p_saldo_inicial numeric default 0
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.eh_consultor() then
    raise exception 'Só consultores criam famílias.' using errcode = '42501';
  end if;
  insert into public.familias (nome, inicio_planejamento, meses_horizonte, saldo_inicial_caixa)
  values (p_nome, p_inicio, coalesce(p_meses, 12), coalesce(p_saldo_inicial, 0))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.criar_familia(text, public.mes_aaaa_mm, int, numeric) from public, anon;
grant execute on function public.criar_familia(text, public.mes_aaaa_mm, int, numeric) to authenticated;

-- Famílias que o usuário acessa (para o seletor e para o redirecionamento após login).
create or replace function public.minhas_familias()
returns table (id uuid, nome text, papel text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.nome,
    case when public.eh_membro_da_familia(f.id) then 'membro' else 'consultor' end as papel
  from public.familias f
  where public.pode_acessar_familia(f.id)
  order by f.nome
$$;

revoke execute on function public.minhas_familias() from public, anon;
grant execute on function public.minhas_familias() to authenticated;
