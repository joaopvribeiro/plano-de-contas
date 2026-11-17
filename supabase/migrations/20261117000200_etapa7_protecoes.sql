-- ============================================================================
-- Etapa 7 — Proteções
-- 1. Importações passam a aceitar apólices (leitura com IA).
-- 2. Apólice guarda de qual importação veio (para o arquivo original).
-- ============================================================================

alter table public.importacoes drop constraint if exists importacoes_tipo_check;
alter table public.importacoes
  add constraint importacoes_tipo_check check (tipo in ('extrato', 'relatorio', 'apolice'));

alter table public.apolices add column importacao_id uuid;
alter table public.apolices
  add constraint apolices_importacao_fk foreign key (familia_id, importacao_id)
  references public.importacoes (familia_id, id) on delete set null (importacao_id);

create index if not exists apolices_tipo_idx on public.apolices (familia_id, tipo);
