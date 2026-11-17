-- ============================================================================
-- Reserva parcial (pedido do João, 17/11): parte de um investimento conta como
-- reserva de emergência (ex.: R$ 98 mil de um fundo de R$ 192 mil). O resto
-- continua em Investimentos. Valor fixo, limitado ao saldo na hora de somar.
-- ============================================================================

-- Só vale para a categoria Investimentos (o app ignora nas demais e limpa ao salvar).
alter table public.ativos
  add column reserva_valor numeric(16, 2) check (reserva_valor > 0);
