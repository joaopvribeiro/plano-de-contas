-- ============================================================================
-- Etapa 5 — Patrimônio e leitura de relatórios de investimento (XP, BTG)
-- 1. Ativos: data do saldo (o histórico usa a data de referência do relatório),
--    saldo líquido quando informado, origem e chave da posição no relatório.
-- 2. Dívidas: data do saldo, pelo mesmo motivo.
-- 3. Importações passam a ter tipo (extrato ou relatório).
-- 4. Confirmação do relatório numa transação só.
-- ============================================================================

-- 1. Ativos -----------------------------------------------------------------------
alter table public.ativos
  add column data_saldo date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  add column valor_liquido public.dinheiro,
  add column origem text not null default 'manual' check (origem in ('manual', 'relatorio')),
  -- Instituição + nome da posição normalizados: casa a mesma posição no relatório do mês seguinte.
  add column chave_relatorio text;

create index ativos_chave_relatorio_idx on public.ativos (familia_id, chave_relatorio) where chave_relatorio is not null;

-- O histórico passa a usar a data do saldo e a gravar também quando só a data muda
-- (saldo igual num relatório novo é um ponto novo na evolução).
create or replace function public.tg_historico_ativo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.valor is distinct from old.valor or new.data_saldo is distinct from old.data_saldo then
    -- Um ponto por ativo e data: atualizar duas vezes no mesmo dia substitui o ponto.
    delete from public.historico_ativos h where h.ativo_id = new.id and h.data = new.data_saldo;
    insert into public.historico_ativos (familia_id, ativo_id, valor, data)
    values (new.familia_id, new.id, new.valor, new.data_saldo);
  end if;
  return new;
end $$;

drop trigger historico_ativo on public.ativos;
create trigger historico_ativo after insert or update of valor, data_saldo on public.ativos
  for each row execute function public.tg_historico_ativo();

create index if not exists historico_ativos_ativo_data_idx on public.historico_ativos (ativo_id, data);

-- 2. Dívidas ----------------------------------------------------------------------
alter table public.passivos
  add column data_saldo date not null default ((now() at time zone 'America/Sao_Paulo')::date);

create or replace function public.tg_historico_passivo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.saldo_devedor is distinct from old.saldo_devedor or new.data_saldo is distinct from old.data_saldo then
    delete from public.historico_passivos h where h.passivo_id = new.id and h.data = new.data_saldo;
    insert into public.historico_passivos (familia_id, passivo_id, saldo_devedor, data)
    values (new.familia_id, new.id, new.saldo_devedor, new.data_saldo);
  end if;
  return new;
end $$;

drop trigger historico_passivo on public.passivos;
create trigger historico_passivo after insert or update of saldo_devedor, data_saldo on public.passivos
  for each row execute function public.tg_historico_passivo();

create index if not exists historico_passivos_passivo_data_idx on public.historico_passivos (passivo_id, data);

-- 3. Importações --------------------------------------------------------------------
alter table public.importacoes
  add column tipo text not null default 'extrato' check (tipo in ('extrato', 'relatorio'));

-- Leitura de relatório conta no mesmo limite mensal de leituras com IA.
alter table public.uso_ia drop constraint if exists uso_ia_recurso_check;
alter table public.uso_ia add constraint uso_ia_recurso_check check (recurso in ('extrato', 'relatorio', 'apolice', 'insight'));

create or replace function public.uso_ia_no_mes(p_familia uuid, p_recurso text)
returns table (usados int, limite int)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.uso_ia u
      where u.familia_id = p_familia
        -- Extratos e relatórios dividem a mesma cota.
        and (u.recurso = p_recurso or (p_recurso in ('extrato', 'relatorio') and u.recurso in ('extrato', 'relatorio')))
        and u.criado_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')),
    (select case
              when p_recurso in ('extrato', 'relatorio') then l.extrato_mes
              when p_recurso = 'apolice' then l.apolice_mes
              when p_recurso = 'insight' then l.insight_mes
            end
       from public.limites_ia l where l.familia_id = p_familia)
  where public.pode_acessar_familia(p_familia)
$$;

-- 4. Confirmação do relatório -------------------------------------------------------
-- p_atualizar: [{id, valor, valor_liquido, categoria, produto, liquidez, risco, chave_relatorio}]
-- p_criar:     [{nome, categoria, instituicao, produto, valor, valor_liquido, liquidez, risco, chave_relatorio}]
-- p_zerar:     [ativo_id] — posições da mesma instituição que não vieram no relatório (resgatadas).
-- Todos os saldos recebem a data de referência do relatório.
create or replace function public.confirmar_relatorio(
  p_importacao uuid, p_data date, p_atualizar jsonb, p_criar jsonb, p_zerar jsonb
)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  v_familia uuid;
  v_n int := 0;
  v_m int;
begin
  select i.familia_id into v_familia
  from public.importacoes i
  where i.id = p_importacao and i.tipo = 'relatorio' and i.status = 'revisao'
  for update;
  if v_familia is null then
    raise exception 'Importação não encontrada ou já confirmada.' using errcode = 'P0002';
  end if;

  update public.ativos a
     set valor = r.valor, valor_liquido = r.valor_liquido, data_saldo = p_data,
         categoria = coalesce(r.categoria, a.categoria), produto = coalesce(r.produto, a.produto),
         liquidez = coalesce(r.liquidez, a.liquidez), risco = coalesce(r.risco, a.risco),
         chave_relatorio = coalesce(r.chave_relatorio, a.chave_relatorio), origem = 'relatorio'
  from jsonb_to_recordset(p_atualizar) as r(
    id uuid, valor numeric, valor_liquido numeric, categoria text, produto text, liquidez text, risco text, chave_relatorio text
  )
  where a.id = r.id and a.familia_id = v_familia;
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;

  insert into public.ativos (familia_id, nome, categoria, instituicao, produto, valor, valor_liquido, liquidez, risco, chave_relatorio, origem, data_saldo)
  select v_familia, r.nome, r.categoria, r.instituicao, r.produto, r.valor, r.valor_liquido, r.liquidez, r.risco, r.chave_relatorio, 'relatorio', p_data
  from jsonb_to_recordset(p_criar) as r(
    nome text, categoria text, instituicao text, produto text, valor numeric, valor_liquido numeric, liquidez text, risco text, chave_relatorio text
  );
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;

  update public.ativos a
     set valor = 0, valor_liquido = null, data_saldo = p_data
  where a.familia_id = v_familia and a.id in (select (x #>> '{}')::uuid from jsonb_array_elements(p_zerar) x);
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;

  update public.importacoes set status = 'confirmada' where id = p_importacao;
  return v_n;
end $$;
revoke execute on function public.confirmar_relatorio(uuid, date, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.confirmar_relatorio(uuid, date, jsonb, jsonb, jsonb) to authenticated;
