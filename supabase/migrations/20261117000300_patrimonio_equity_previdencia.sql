-- ============================================================================
-- Ajustes do Patrimônio (pedido do João, 17/11)
-- 1. Nova categoria "Equity": participação em empresas, com valor informado
--    (valuation) ou estimado por múltiplo de lucro ou de faturamento.
-- 2. Previdência: tipo do plano (PGBL ou VGBL).
-- ============================================================================

alter table public.ativos drop constraint if exists ativos_categoria_check;
alter table public.ativos add constraint ativos_categoria_check check (categoria in
  ('Reserva', 'Investimentos', 'Previdência', 'Fundo Fechado', 'FGTS', 'Bem', 'Consórcio', 'Equity'));

alter table public.ativos
  add column previdencia_tipo text check (previdencia_tipo in ('PGBL', 'VGBL')),
  -- Percentual da empresa que pertence à família (0–100).
  add column equity_participacao numeric(7, 4) check (equity_participacao > 0 and equity_participacao <= 100),
  -- valuation: equity_base é o valor da empresa inteira;
  -- lucro / faturamento: equity_base é o lucro ou faturamento anual, vezes equity_multiplo.
  add column equity_metodo text check (equity_metodo in ('valuation', 'lucro', 'faturamento')),
  add column equity_base numeric(16, 2) check (equity_base >= 0),
  add column equity_multiplo numeric(8, 2) check (equity_multiplo > 0);
