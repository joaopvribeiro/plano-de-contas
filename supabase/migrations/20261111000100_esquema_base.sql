-- ============================================================================
-- Resolutto Family — esquema base
-- Valores monetários em numeric(14,2). Meses em texto AAAA-MM.
-- Toda tabela de dados tem familia_id. Referências entre tabelas da mesma
-- família usam chave composta (familia_id, id), para que nenhum registro
-- aponte para dados de outra família.
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;

-- Domínios reutilizáveis ------------------------------------------------------
create domain public.mes_aaaa_mm as text
  check (value ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

create domain public.dinheiro as numeric(14, 2);

-- ---------------------------------------------------------------------------
-- Base: consultores, famílias, membros, convites, consentimentos
-- ---------------------------------------------------------------------------
create table public.consultores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  admin boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.familias (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  inicio_planejamento public.mes_aaaa_mm not null,
  meses_horizonte int not null default 12 check (meses_horizonte between 1 and 60),
  saldo_inicial_caixa public.dinheiro not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.familia_consultores (
  familia_id uuid not null references public.familias (id) on delete cascade,
  consultor_id uuid not null references public.consultores (user_id) on delete cascade,
  principal boolean not null default false,
  criado_em timestamptz not null default now(),
  primary key (familia_id, consultor_id)
);
create index familia_consultores_consultor_idx on public.familia_consultores (consultor_id);

create table public.membros (
  user_id uuid not null references auth.users (id) on delete cascade,
  familia_id uuid not null references public.familias (id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, familia_id)
);
create index membros_familia_idx on public.membros (familia_id);

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  email text not null check (email = lower(email) and email like '%@%'),
  nome text,
  token uuid not null default gen_random_uuid() unique,
  expira_em timestamptz not null default (now() + interval '7 days'),
  aceito_em timestamptz,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index convites_familia_idx on public.convites (familia_id);

create table public.consentimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  familia_id uuid not null references public.familias (id) on delete cascade,
  tipo text not null check (tipo in ('termos', 'ia')),
  versao text not null,
  aceito_em timestamptz not null default now(),
  unique (user_id, familia_id, tipo, versao)
);

create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  familia_id uuid references public.familias (id) on delete cascade,
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  campos_alterados text[] not null default '{}',
  valores_numericos jsonb,
  user_id uuid,
  criado_em timestamptz not null default now()
);
create index auditoria_familia_idx on public.auditoria (familia_id, criado_em desc);

create table public.uso_ia (
  id bigint generated always as identity primary key,
  familia_id uuid not null references public.familias (id) on delete cascade,
  recurso text not null check (recurso in ('extrato', 'apolice', 'insight')),
  modelo text not null,
  tokens_entrada int not null default 0,
  tokens_saida int not null default 0,
  criado_em timestamptz not null default now()
);
create index uso_ia_familia_idx on public.uso_ia (familia_id, criado_em);

create table public.limites_ia (
  familia_id uuid primary key references public.familias (id) on delete cascade,
  extrato_mes int not null default 20 check (extrato_mes >= 0),
  apolice_mes int not null default 5 check (apolice_mes >= 0),
  insight_mes int not null default 4 check (insight_mes >= 0),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Orçamento
-- ---------------------------------------------------------------------------
create table public.contas (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('cartao_credito', 'conta_corrente', 'dinheiro', 'outro')),
  dia_fechamento int check (dia_fechamento between 1 and 31),
  dia_vencimento int check (dia_vencimento between 1 and 31),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (familia_id, id),
  unique (familia_id, nome),
  check (tipo <> 'cartao_credito' or (dia_fechamento is not null and dia_vencimento is not null))
);

-- Classes fixas: as linhas da DFC.
create domain public.classe as text
  check (value in ('Receita', 'Despesa básica', 'Padrão de vida', 'Doações', 'Sonhos'));

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  nome text not null,
  classe_padrao public.classe not null,
  ordem int not null default 0,
  arquivada boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (familia_id, id),
  unique (familia_id, nome)
);

create table public.metas_classe (
  familia_id uuid not null references public.familias (id) on delete cascade,
  classe public.classe not null check (classe <> 'Receita'),
  percentual_max_receita numeric(5, 2) not null check (percentual_max_receita between 0 and 100),
  atualizado_em timestamptz not null default now(),
  primary key (familia_id, classe)
);

create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  arquivos text[] not null default '{}',
  origem_detectada text,
  fechamento date,
  vencimento date,
  status text not null default 'lendo' check (status in ('lendo', 'revisao', 'confirmada', 'descartada')),
  resposta_ia jsonb,
  arquivos_expurgados_em timestamptz,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (familia_id, id)
);

-- Patrimônio vem antes de lançamentos porque aporte/resgate podem apontar um ativo.
create table public.ativos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  nome text not null,
  categoria text not null check (categoria in
    ('Reserva', 'Investimentos', 'Previdência', 'Fundo Fechado', 'FGTS', 'Bem', 'Consórcio')),
  instituicao text,
  produto text,
  valor public.dinheiro not null default 0,
  liquidez text,
  risco text check (risco in ('baixo', 'médio', 'alto')),
  conta_liberdade boolean,
  consorcio_prazo_meses int check (consorcio_prazo_meses > 0),
  consorcio_parcelas_pagas int check (consorcio_parcelas_pagas >= 0),
  consorcio_parcela_mensal public.dinheiro check (consorcio_parcela_mensal >= 0),
  consorcio_contemplado boolean,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (familia_id, id),
  check (consorcio_parcelas_pagas is null or consorcio_prazo_meses is null
         or consorcio_parcelas_pagas <= consorcio_prazo_meses)
);

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  tipo text not null check (tipo in ('Previsto', 'Realizado')),
  natureza text not null default 'fluxo' check (natureza in ('fluxo', 'transferencia', 'aporte', 'resgate')),
  mes_competencia public.mes_aaaa_mm not null,
  data date,
  descricao text not null,
  valor public.dinheiro not null check (valor >= 0),
  estorno boolean not null default false,
  conta_id uuid,
  categoria_id uuid,
  classe public.classe,
  subtipo_receita text check (subtipo_receita in ('Salário', 'Pró-labore/distribuição', 'Outras receitas')),
  parcela text check (parcela ~ '^[0-9]+/[0-9]+$'),
  grupo_parcela uuid,
  realizado_id uuid,
  ativo_id uuid,
  assinatura boolean not null default false,
  obs text,
  origem text not null default 'manual' check (origem in ('manual', 'ia', 'ia-parcela', 'planilha')),
  importacao_id uuid,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (familia_id, id),
  foreign key (familia_id, conta_id) references public.contas (familia_id, id) on delete set null (conta_id),
  foreign key (familia_id, categoria_id) references public.categorias (familia_id, id) on delete set null (categoria_id),
  foreign key (familia_id, importacao_id) references public.importacoes (familia_id, id) on delete set null (importacao_id),
  foreign key (familia_id, ativo_id) references public.ativos (familia_id, id) on delete set null (ativo_id),
  foreign key (familia_id, realizado_id) references public.lancamentos (familia_id, id) on delete set null (realizado_id),
  -- Fluxo precisa de classe; transferência/aporte/resgate ficam fora das classes.
  check (natureza <> 'fluxo' or classe is not null),
  check (natureza = 'fluxo' or classe is null),
  -- Subtipo só existe para Receita.
  check (subtipo_receita is null or classe = 'Receita'),
  -- Ativo só faz sentido para aporte e resgate.
  check (ativo_id is null or natureza in ('aporte', 'resgate')),
  -- Ligação prevista → real só em previstos.
  check (realizado_id is null or tipo = 'Previsto')
);
create index lancamentos_familia_mes_idx on public.lancamentos (familia_id, mes_competencia);
create index lancamentos_familia_grupo_idx on public.lancamentos (familia_id, grupo_parcela) where grupo_parcela is not null;
create index lancamentos_descricao_trgm_idx on public.lancamentos using gin (descricao extensions.gin_trgm_ops);
create index lancamentos_familia_data_idx on public.lancamentos (familia_id, data desc);

create table public.regras (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  padrao text not null check (length(trim(padrao)) >= 2),
  natureza text not null default 'fluxo' check (natureza in ('fluxo', 'transferencia', 'aporte', 'resgate')),
  categoria_id uuid,
  classe public.classe,
  conta_id uuid,
  assinatura boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (familia_id, padrao),
  foreign key (familia_id, categoria_id) references public.categorias (familia_id, id) on delete cascade,
  foreign key (familia_id, conta_id) references public.contas (familia_id, id) on delete set null (conta_id)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  mes public.mes_aaaa_mm not null,
  texto text not null,
  gerado_em timestamptz not null default now()
);
create index insights_familia_mes_idx on public.insights (familia_id, mes);

-- ---------------------------------------------------------------------------
-- Patrimônio, objetivos e proteções
-- ---------------------------------------------------------------------------
create table public.historico_ativos (
  id bigint generated always as identity primary key,
  familia_id uuid not null,
  ativo_id uuid not null,
  valor public.dinheiro not null,
  data date not null default current_date,
  criado_em timestamptz not null default now(),
  foreign key (familia_id, ativo_id) references public.ativos (familia_id, id) on delete cascade
);
create index historico_ativos_idx on public.historico_ativos (familia_id, ativo_id, data);

create table public.passivos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in
    ('financiamento_imobiliario', 'financiamento_veiculo', 'emprestimo', 'cartao_rotativo', 'outro')),
  instituicao text,
  saldo_devedor public.dinheiro not null default 0 check (saldo_devedor >= 0),
  parcela_mensal public.dinheiro check (parcela_mensal >= 0),
  taxa_am numeric(7, 4),
  parcelas_restantes int check (parcelas_restantes >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (familia_id, id)
);

create table public.historico_passivos (
  id bigint generated always as identity primary key,
  familia_id uuid not null,
  passivo_id uuid not null,
  saldo_devedor public.dinheiro not null,
  data date not null default current_date,
  criado_em timestamptz not null default now(),
  foreign key (familia_id, passivo_id) references public.passivos (familia_id, id) on delete cascade
);
create index historico_passivos_idx on public.historico_passivos (familia_id, passivo_id, data);

create table public.objetivos_config (
  familia_id uuid primary key references public.familias (id) on delete cascade,
  liberdade_meta public.dinheiro,
  liberdade_retorno_real_am numeric(6, 4) not null default 0.40,
  liberdade_prazo_anos int not null default 20 check (liberdade_prazo_anos between 1 and 60),
  reserva_meses int not null default 6 check (reserva_meses between 1 and 36),
  atualizado_em timestamptz not null default now()
);

create table public.projetos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  nome text not null,
  valor_alvo public.dinheiro not null check (valor_alvo > 0),
  ja_guardado public.dinheiro not null default 0 check (ja_guardado >= 0),
  prazo_mes public.mes_aaaa_mm not null,
  ativo_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (familia_id, ativo_id) references public.ativos (familia_id, id) on delete set null (ativo_id)
);

create table public.apolices (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  tipo text not null check (tipo in ('vida', 'auto', 'saude', 'residencial', 'outro')),
  seguradora text,
  produto text,
  segurado text,
  premio public.dinheiro check (premio >= 0),
  periodicidade text not null default 'mensal'
    check (periodicidade in ('mensal', 'trimestral', 'semestral', 'anual', 'unico')),
  -- Prêmio único não entra no orçamento mensal (fica nulo).
  premio_mensal numeric(14, 2) generated always as (
    case periodicidade
      when 'mensal' then premio
      when 'trimestral' then round(premio / 3, 2)
      when 'semestral' then round(premio / 6, 2)
      when 'anual' then round(premio / 12, 2)
      else null
    end
  ) stored,
  vigencia_inicio date,
  vigencia_fim date,
  destaques jsonb not null default '{}'::jsonb,
  carencias text[] not null default '{}',
  exclusoes text[] not null default '{}',
  como_acionar text,
  resumo text,
  arquivo text,
  origem text not null default 'manual' check (origem in ('manual', 'ia')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio)
);
create index apolices_familia_idx on public.apolices (familia_id, vigencia_fim);
