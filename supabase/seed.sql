-- ============================================================================
-- Seed: Família Demo (dados fictícios)
--
-- Horizonte: ago/2026 a jul/2027 (12 meses). Realizado em set/2026 e out/2026.
-- Cobre os casos que a DFC precisa tratar: pagamento de fatura (transferência),
-- aporte, estorno, reembolso como estorno, compra parcelada com previstas
-- futuras ligadas às reais, consórcio, financiamento e apólice a renovar.
--
-- Este arquivo só cria dados. Usuários e vínculos (consultor, membros) são
-- criados por scripts/seed-usuarios.mjs, que usa a API de Auth do Supabase.
-- ============================================================================

do $seed$
declare
  f uuid := '0d0d0d0d-0000-4000-8000-000000000001';
  c_cc uuid := '0d0d0d0d-0000-4000-8000-0000000000c1';
  c_nu uuid := '0d0d0d0d-0000-4000-8000-0000000000c2';
  c_din uuid := '0d0d0d0d-0000-4000-8000-0000000000c3';
  a_tesouro_selic uuid := '0d0d0d0d-0000-4000-8000-0000000000a2';
  a_ipca uuid := '0d0d0d0d-0000-4000-8000-0000000000a3';
  grupo_note uuid := '0d0d0d0d-0000-4000-8000-0000000000e1';
  mes text;
  i int;
  cat jsonb;
  prev_id uuid;
  real_id uuid;
begin
  if exists (select 1 from public.familias where id = f) then
    raise notice 'Família demo já existe; seed ignorado.';
    return;
  end if;

  insert into public.familias (id, nome, inicio_planejamento, meses_horizonte, saldo_inicial_caixa)
  values (f, 'Família Demo', '2026-08', 12, 15000);

  -- Mapa nome → id das categorias criadas pelo gatilho da família.
  select jsonb_object_agg(nome, id) into cat from public.categorias where familia_id = f;

  insert into public.contas (id, familia_id, nome, tipo, dia_fechamento, dia_vencimento) values
    (c_cc, f, 'CC - C6', 'conta_corrente', null, null),
    (c_nu, f, 'Nubank', 'cartao_credito', 28, 5),
    (c_din, f, 'Dinheiro', 'dinheiro', null, null);

  update public.objetivos_config
     set liberdade_meta = 3000000, liberdade_retorno_real_am = 0.40, liberdade_prazo_anos = 20, reserva_meses = 6
   where familia_id = f;

  -- -------------------------------------------------------------------------
  -- Ativos
  -- -------------------------------------------------------------------------
  insert into public.ativos (id, familia_id, nome, categoria, instituicao, produto, valor, liquidez, risco,
                             consorcio_prazo_meses, consorcio_parcelas_pagas, consorcio_parcela_mensal, consorcio_contemplado)
  values
    ('0d0d0d0d-0000-4000-8000-0000000000a1', f, 'CDB liquidez diária', 'Reserva', 'Nubank', 'CDB 100% CDI', 38000, 'D+0', 'baixo', null, null, null, null),
    (a_tesouro_selic, f, 'Tesouro Selic 2029', 'Reserva', 'XP', 'Tesouro Selic', 22500, 'D+1', 'baixo', null, null, null, null),
    (a_ipca, f, 'Tesouro IPCA+ 2035', 'Investimentos', 'XP', 'IPCA + 6,8%', 41200, 'D+1', 'médio', null, null, null, null),
    ('0d0d0d0d-0000-4000-8000-0000000000a4', f, 'ETF Ibovespa', 'Investimentos', 'XP', 'BOVA11', 18700, 'D+2', 'alto', null, null, null, null),
    ('0d0d0d0d-0000-4000-8000-0000000000a5', f, 'PGBL titular 1', 'Previdência', 'BTG Pactual', 'PGBL multimercado', 86400, 'D+30', 'médio', null, null, null, null),
    ('0d0d0d0d-0000-4000-8000-0000000000a6', f, 'Fundo imobiliário fechado', 'Fundo Fechado', 'XP', 'FIP imobiliário', 25000, 'No vencimento', 'alto', null, null, null, null),
    ('0d0d0d0d-0000-4000-8000-0000000000a7', f, 'FGTS titular 2', 'FGTS', 'Caixa', 'FGTS · saque-aniversário', 31800, 'Saque-aniversário', 'baixo', null, null, null, null),
    ('0d0d0d0d-0000-4000-8000-0000000000a8', f, 'Apartamento', 'Bem', null, 'Imóvel residencial', 720000, null, null, null, null, null, null),
    ('0d0d0d0d-0000-4000-8000-0000000000a9', f, 'Carro', 'Bem', null, 'Veículo', 85000, null, null, null, null, null, null),
    ('0d0d0d0d-0000-4000-8000-0000000000aa', f, 'Consórcio imóvel', 'Consórcio', 'Porto Seguro', 'Carta de crédito imobiliário', 300000, 'Na contemplação', 'baixo', 180, 24, 2050, false);

  -- Histórico dos meses anteriores (o gatilho já gravou o ponto de hoje).
  insert into public.historico_ativos (familia_id, ativo_id, valor, data)
  select f, a.id, round(a.valor * fator, 2), dt::date
  from public.ativos a
  cross join (values ('2026-08-31', 0.955), ('2026-09-30', 0.972), ('2026-10-31', 0.988)) h(dt, fator)
  where a.familia_id = f and a.categoria in ('Reserva', 'Investimentos', 'Previdência', 'Fundo Fechado', 'FGTS');

  insert into public.passivos (familia_id, nome, tipo, instituicao, saldo_devedor, parcela_mensal, taxa_am, parcelas_restantes)
  values (f, 'Financiamento do carro', 'financiamento_veiculo', 'Banco do Brasil', 32000, 1450, 1.49, 24);

  -- -------------------------------------------------------------------------
  -- Orçamento previsto: 12 meses
  -- -------------------------------------------------------------------------
  for i in 0..11 loop
    mes := to_char(date '2026-08-01' + make_interval(months => i), 'YYYY-MM');

    insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, conta_id, categoria_id, classe, subtipo_receita, assinatura, origem, ativo_id, natureza)
    values
      (f, 'Previsto', mes, 'Salário titular 1', 12000, null, (cat->>'Receita')::uuid, 'Receita', 'Salário', false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Salário titular 2', 11500, null, (cat->>'Receita')::uuid, 'Receita', 'Salário', false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Aluguel', 4200, c_cc, (cat->>'Moradia')::uuid, 'Despesa básica', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Condomínio', 950, c_cc, (cat->>'Moradia')::uuid, 'Despesa básica', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Energia', 380, c_cc, (cat->>'Moradia')::uuid, 'Despesa básica', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Internet', 150, c_nu, (cat->>'Moradia')::uuid, 'Despesa básica', null, true, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Supermercado', 2200, c_nu, (cat->>'Alimentação')::uuid, 'Despesa básica', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Escola', 2100, c_cc, (cat->>'Filhos')::uuid, 'Despesa básica', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Plano de saúde', 1450, c_cc, (cat->>'Saúde')::uuid, 'Despesa básica', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Babá', 2300, c_cc, (cat->>'Babá')::uuid, 'Despesa básica', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Combustível', 800, c_nu, (cat->>'Transporte')::uuid, 'Despesa básica', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Parcela financiamento carro', 1450, c_cc, (cat->>'Transporte')::uuid, 'Despesa básica', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Restaurantes', 1200, c_nu, (cat->>'Alimentação')::uuid, 'Padrão de vida', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Streaming', 120, c_nu, (cat->>'Gastos Livres')::uuid, 'Padrão de vida', null, true, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Academia', 280, c_nu, (cat->>'Saúde')::uuid, 'Padrão de vida', null, true, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Pet shop e veterinário', 350, c_nu, (cat->>'Pets')::uuid, 'Padrão de vida', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Gastos livres', 1000, c_nu, (cat->>'Gastos Livres')::uuid, 'Padrão de vida', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Doação mensal ONG', 300, c_cc, (cat->>'Doações')::uuid, 'Doações', null, true, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Parcela consórcio imóvel', 2050, c_cc, (cat->>'Sonhos')::uuid, 'Sonhos', null, false, 'planilha', null, 'fluxo'),
      (f, 'Previsto', mes, 'Aporte mensal Tesouro IPCA+', 1000, c_cc, null, null, null, false, 'planilha', a_ipca, 'aporte');

    if mes = '2026-12' then
      insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, categoria_id, classe, subtipo_receita, origem)
      values
        (f, 'Previsto', mes, '13º salário titular 1', 12000, (cat->>'Receita')::uuid, 'Receita', 'Salário', 'planilha'),
        (f, 'Previsto', mes, '13º salário titular 2', 11500, (cat->>'Receita')::uuid, 'Receita', 'Salário', 'planilha');
    end if;

    if mes = '2027-01' then
      insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, conta_id, categoria_id, classe, origem)
      values
        (f, 'Previsto', mes, 'IPVA e licenciamento', 3400, c_cc, (cat->>'Transporte')::uuid, 'Despesa básica', 'planilha'),
        (f, 'Previsto', mes, 'Material escolar e matrícula', 2600, c_cc, (cat->>'Educação')::uuid, 'Despesa básica', 'planilha');
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- Compra parcelada: notebook 10x R$ 480 no Nubank, compra em 15/09/2026.
  -- 10 previstas (set/26 a jun/27); as 2 primeiras já chegaram e estão ligadas.
  -- -------------------------------------------------------------------------
  for i in 1..10 loop
    mes := to_char(date '2026-09-01' + make_interval(months => i - 1), 'YYYY-MM');
    insert into public.lancamentos (familia_id, tipo, mes_competencia, data, descricao, valor, conta_id, categoria_id, classe,
                                    parcela, grupo_parcela, origem)
    values (f, 'Previsto', mes, date '2026-09-15', 'Notebook loja online', 480, c_nu, (cat->>'Profissional')::uuid,
            'Padrão de vida', i || '/10', grupo_note, 'ia-parcela')
    returning id into prev_id;

    if i <= 2 then
      insert into public.lancamentos (familia_id, tipo, mes_competencia, data, descricao, valor, conta_id, categoria_id, classe,
                                      parcela, grupo_parcela, origem)
      values (f, 'Realizado', mes, date '2026-09-15', 'Notebook loja online', 480, c_nu, (cat->>'Profissional')::uuid,
              'Padrão de vida', i || '/10', grupo_note, 'ia')
      returning id into real_id;
      update public.lancamentos set realizado_id = real_id where id = prev_id;
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- Realizado: setembro e outubro de 2026
  -- -------------------------------------------------------------------------
  insert into public.lancamentos (familia_id, tipo, natureza, mes_competencia, data, descricao, valor, estorno, conta_id,
                                  categoria_id, classe, subtipo_receita, assinatura, origem, ativo_id, obs)
  values
    -- setembro
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-05', 'Salário titular 1', 12000, false, null, (cat->>'Receita')::uuid, 'Receita', 'Salário', false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-05', 'Salário titular 2', 11500, false, null, (cat->>'Receita')::uuid, 'Receita', 'Salário', false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-20', 'Freela consultoria', 1800, false, null, (cat->>'Receita')::uuid, 'Receita', 'Outras receitas', false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-05', 'Aluguel', 4200, false, c_cc, (cat->>'Moradia')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-10', 'Condomínio', 950, false, c_cc, (cat->>'Moradia')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-12', 'Energia', 412.37, false, c_cc, (cat->>'Moradia')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-08', 'Internet fibra', 149.90, false, c_nu, (cat->>'Moradia')::uuid, 'Despesa básica', null, true, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-14', 'Supermercado', 2486.52, false, c_nu, (cat->>'Alimentação')::uuid, 'Despesa básica', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-05', 'Escola', 2100, false, c_cc, (cat->>'Filhos')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-10', 'Plano de saúde', 1450, false, c_cc, (cat->>'Saúde')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-05', 'Babá', 2300, false, c_cc, (cat->>'Babá')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-18', 'Posto combustível', 742.10, false, c_nu, (cat->>'Transporte')::uuid, 'Despesa básica', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-15', 'Parcela financiamento carro', 1450, false, c_cc, (cat->>'Transporte')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-21', 'Restaurantes', 1534.80, false, c_nu, (cat->>'Alimentação')::uuid, 'Padrão de vida', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-03', 'Streaming', 119.70, false, c_nu, (cat->>'Gastos Livres')::uuid, 'Padrão de vida', null, true, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-02', 'Academia', 280, false, c_nu, (cat->>'Saúde')::uuid, 'Padrão de vida', null, true, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-22', 'Petz', 418.40, false, c_nu, (cat->>'Pets')::uuid, 'Padrão de vida', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-25', 'Compras diversas', 1187.33, false, c_nu, (cat->>'Gastos Livres')::uuid, 'Padrão de vida', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-10', 'Doação mensal ONG', 300, false, c_cc, (cat->>'Doações')::uuid, 'Doações', null, true, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-09', '2026-09-10', 'Parcela consórcio imóvel', 2050, false, c_cc, (cat->>'Sonhos')::uuid, 'Sonhos', null, false, 'manual', null, null),
    (f, 'Realizado', 'aporte', '2026-09', '2026-09-06', 'Aporte Tesouro IPCA+', 1000, false, c_cc, null, null, null, false, 'manual', a_ipca, null),
    (f, 'Realizado', 'transferencia', '2026-09', '2026-09-05', 'Pagamento fatura Nubank', 6390.15, false, c_cc, null, null, null, false, 'ia', null, 'Fatura de agosto'),
    -- outubro
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-05', 'Salário titular 1', 12000, false, null, (cat->>'Receita')::uuid, 'Receita', 'Salário', false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-05', 'Salário titular 2', 11500, false, null, (cat->>'Receita')::uuid, 'Receita', 'Salário', false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-05', 'Aluguel', 4200, false, c_cc, (cat->>'Moradia')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-10', 'Condomínio', 950, false, c_cc, (cat->>'Moradia')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-12', 'Energia', 365.81, false, c_cc, (cat->>'Moradia')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-08', 'Internet fibra', 149.90, false, c_nu, (cat->>'Moradia')::uuid, 'Despesa básica', null, true, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-13', 'Supermercado', 2311.09, false, c_nu, (cat->>'Alimentação')::uuid, 'Despesa básica', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-05', 'Escola', 2100, false, c_cc, (cat->>'Filhos')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-10', 'Plano de saúde', 1450, false, c_cc, (cat->>'Saúde')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-24', 'Reembolso consulta plano de saúde', 320, true, c_cc, (cat->>'Saúde')::uuid, 'Despesa básica', null, false, 'manual', null, 'Reembolso abate a categoria Saúde'),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-05', 'Babá', 2300, false, c_cc, (cat->>'Babá')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-17', 'Posto combustível', 811.45, false, c_nu, (cat->>'Transporte')::uuid, 'Despesa básica', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-15', 'Parcela financiamento carro', 1450, false, c_cc, (cat->>'Transporte')::uuid, 'Despesa básica', null, false, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-19', 'Restaurantes', 1088.60, false, c_nu, (cat->>'Alimentação')::uuid, 'Padrão de vida', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-03', 'Streaming', 119.70, false, c_nu, (cat->>'Gastos Livres')::uuid, 'Padrão de vida', null, true, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-02', 'Academia', 280, false, c_nu, (cat->>'Saúde')::uuid, 'Padrão de vida', null, true, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-20', 'Petz', 296.90, false, c_nu, (cat->>'Pets')::uuid, 'Padrão de vida', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-11', 'Loja online - fone', 189.90, false, c_nu, (cat->>'Gastos Livres')::uuid, 'Padrão de vida', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-16', 'Estorno loja online - fone', 189.90, true, c_nu, (cat->>'Gastos Livres')::uuid, 'Padrão de vida', null, false, 'ia', null, 'Compra cancelada'),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-26', 'Compras diversas', 1342.18, false, c_nu, (cat->>'Gastos Livres')::uuid, 'Padrão de vida', null, false, 'ia', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-10', 'Doação mensal ONG', 300, false, c_cc, (cat->>'Doações')::uuid, 'Doações', null, true, 'manual', null, null),
    (f, 'Realizado', 'fluxo', '2026-10', '2026-10-10', 'Parcela consórcio imóvel', 2050, false, c_cc, (cat->>'Sonhos')::uuid, 'Sonhos', null, false, 'manual', null, null),
    (f, 'Realizado', 'aporte', '2026-10', '2026-10-06', 'Aporte Tesouro IPCA+', 1000, false, c_cc, null, null, null, false, 'manual', a_ipca, null),
    (f, 'Realizado', 'transferencia', '2026-10', '2026-10-05', 'Pagamento fatura Nubank', 7428.75, false, c_cc, null, null, null, false, 'ia', null, 'Fatura de setembro');

  -- Regras aprendidas
  insert into public.regras (familia_id, padrao, natureza, categoria_id, classe, conta_id, assinatura) values
    (f, 'PETZ', 'fluxo', (cat->>'Pets')::uuid, 'Padrão de vida', c_nu, false),
    (f, 'PAGAMENTO FATURA', 'transferencia', null, null, c_cc, false),
    (f, 'NETFLIX', 'fluxo', (cat->>'Gastos Livres')::uuid, 'Padrão de vida', c_nu, true);

  -- -------------------------------------------------------------------------
  -- Objetivos: projetos
  -- -------------------------------------------------------------------------
  insert into public.projetos (familia_id, nome, valor_alvo, ja_guardado, prazo_mes, ativo_id) values
    (f, 'Viagem em família 2027', 30000, 8500, '2027-07', a_tesouro_selic),
    (f, 'Troca do carro', 60000, 12000, '2028-12', null);

  -- -------------------------------------------------------------------------
  -- Proteções
  -- -------------------------------------------------------------------------
  insert into public.apolices (familia_id, tipo, seguradora, produto, segurado, premio, periodicidade,
                               vigencia_inicio, vigencia_fim, destaques, carencias, exclusoes, como_acionar, resumo, origem)
  values
    (f, 'vida', 'Prudential', 'Vida Inteira', 'Titular 1', 380, 'mensal', '2022-03-01', null,
     '{"Morte": "R$ 1.000.000", "Invalidez": "R$ 1.000.000", "Doenças Graves": "R$ 300.000", "Beneficiários": "Cônjuge (50%) e filhos (50%)"}',
     array['Suicídio: 24 meses a partir do início da vigência'],
     array['Doenças preexistentes não declaradas', 'Atos ilícitos dolosos do segurado'],
     'Ligar para a central da seguradora ou abrir o aviso de sinistro no site, com certidão de óbito ou laudo médico e documentos dos beneficiários.',
     'Seguro de vida vitalício: paga R$ 1 milhão aos beneficiários em caso de morte ou ao segurado em caso de invalidez total, e R$ 300 mil no diagnóstico de doenças graves cobertas.',
     'manual'),
    (f, 'auto', 'Porto Seguro', 'Auto Compreensivo', 'Titular 2', 4200, 'anual', '2025-12-15', '2026-12-15',
     '{"Franquia": "R$ 4.850 (reduzida)", "Danos a Terceiros": "R$ 200.000 materiais / R$ 200.000 corporais", "Carro Reserva": "15 dias, categoria básica", "Assistência 24h": "Guincho ilimitado até 400 km"}',
     array[]::text[],
     array['Condutor sem habilitação válida', 'Uso do veículo para aplicativo de transporte não declarado'],
     'Acionar pelo app da seguradora ou 0800 em até 24h; registrar boletim de ocorrência em caso de roubo ou acidente com vítimas.',
     'Cobertura compreensiva do carro (colisão, roubo, incêndio) com franquia reduzida, proteção para danos a terceiros, carro reserva por 15 dias e guincho.',
     'manual'),
    (f, 'saude', 'Bradesco Saúde', 'Top Nacional Empresarial', 'Família (4 vidas)', 1450, 'mensal', '2024-01-01', null,
     '{"Abrangência": "Nacional", "Acomodação": "Apartamento", "Coparticipação": "Não", "Rede": "Rede referenciada Top + reembolso"}',
     array['Parto: 300 dias', 'Demais procedimentos: 180 dias (cumpridas)'],
     array['Procedimentos estéticos', 'Tratamentos experimentais'],
     'Consultas e exames direto na rede; internações eletivas exigem autorização prévia pelo app; reembolso pelo app com nota fiscal e pedido médico.',
     'Plano nacional para os 4 membros da família, quarto individual, sem coparticipação e com reembolso para médicos fora da rede.',
     'manual');
end $seed$;
