/**
 * Relatório de exemplo (carteira no formato do relatório de performance do BTG, valores fictícios
 * arredondados de um caso real anonimizado). Usado nos testes e no modo IA_SIMULADA.
 */
import type { RelatorioLido } from "./esquema";

export const RELATORIO_EXEMPLO: RelatorioLido = {
  instituicao: "BTG Pactual",
  conta: "000000001",
  data_referencia: "2026-11-02",
  patrimonio_bruto: 896746.97,
  patrimonio_liquido: 888773.5,
  posicoes: [
    { nome: "Saldo em conta", estrategia: "caixa", produto: "Conta corrente", saldo_bruto: 135381.54, saldo_liquido: 135381.54, liquidez_dias: 0, vencimento: null, taxa: null },
    { nome: "BTG Tesouro Selic FIRF Ref DI", estrategia: "pos_fixado", produto: "Fundo DI", saldo_bruto: 157849.27, saldo_liquido: 156313.96, liquidez_dias: 0, vencimento: null, taxa: null },
    { nome: "AZ Quest Low Vol FIM", estrategia: "pos_fixado", produto: "Fundo multimercado", saldo_bruto: 144836.37, saldo_liquido: 142857.84, liquidez_dias: 1, vencimento: null, taxa: null },
    { nome: "Daycoval Classic FIRF CrPr", estrategia: "pos_fixado", produto: "Fundo de crédito privado", saldo_bruto: 120151.16, saldo_liquido: 118542.75, liquidez_dias: 1, vencimento: null, taxa: null },
    { nome: "Riza Lotus FIRF Ref DI CrPr", estrategia: "pos_fixado", produto: "Fundo DI", saldo_bruto: 66428.1, saldo_liquido: 66232.24, liquidez_dias: 1, vencimento: null, taxa: null },
    { nome: "LFT", estrategia: "pos_fixado", produto: "Tesouro Selic · SELIC + 0,07%", saldo_bruto: 45832.01, saldo_liquido: 45309.8, liquidez_dias: 1, vencimento: "2031-03-01", taxa: "SELIC + 0,07%" },
    { nome: "Occam Liquidez FIC FIRF CrPr", estrategia: "pos_fixado", produto: "Fundo de crédito privado", saldo_bruto: 18758.29, saldo_liquido: 18602.91, liquidez_dias: 1, vencimento: null, taxa: null },
    { nome: "BNP Paribas Match DI FIRF CrPr", estrategia: "pos_fixado", produto: "Fundo DI", saldo_bruto: 17796.51, saldo_liquido: 17576.76, liquidez_dias: 0, vencimento: null, taxa: null },
    { nome: "BTG Digital Tesouro Selic Simples FIRF", estrategia: "pos_fixado", produto: "Fundo Tesouro Selic", saldo_bruto: 4014.82, saldo_liquido: 3965.86, liquidez_dias: 0, vencimento: null, taxa: null },
    { nome: "BNP Paribas Rubi FIC FIRF CrPr", estrategia: "pos_fixado", produto: "Fundo de crédito privado", saldo_bruto: 3525.23, saldo_liquido: 3480.22, liquidez_dias: 10, vencimento: null, taxa: null },
    { nome: "NTN-B", estrategia: "inflacao", produto: "Tesouro IPCA+ · IPCA + 7,31%", saldo_bruto: 25344.35, saldo_liquido: 25122.38, liquidez_dias: 1, vencimento: "2040-08-15", taxa: "IPCA + 7,31%" },
    { nome: "NTN-B", estrategia: "inflacao", produto: "Tesouro IPCA+ · IPCA + 7,20%", saldo_bruto: 20258.18, saldo_liquido: 20203.17, liquidez_dias: 1, vencimento: "2040-08-15", taxa: "IPCA + 7,20%" },
    { nome: "Álamos Compass FIM", estrategia: "multimercado", produto: "Fundo multimercado", saldo_bruto: 106864.49, saldo_liquido: null, liquidez_dias: null, vencimento: null, taxa: null },
    { nome: "Real Investor FIC FIM", estrategia: "multimercado", produto: "Fundo multimercado", saldo_bruto: 29706.65, saldo_liquido: null, liquidez_dias: 32, vencimento: null, taxa: null },
  ],
  avisos: [],
};
