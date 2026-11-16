import { describe, expect, it } from "vitest";
import { lerOFX } from "./ofx";
import { lerCSVBanco, lerData } from "./csv-banco";
import { decodificarTexto, extrairParcela, formatoDoArquivo } from "./tipos";

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>Banco C6<FID>336</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005120000[-3:BRT]
<TRNAMT>12000.00
<FITID>1
<MEMO>SALARIO EMPRESA X
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261006
<TRNAMT>-4200,00
<FITID>2
<MEMO>PIX ENVIADO ALUGUEL
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261007
<TRNAMT>-0.00
<MEMO>TARIFA ZERO
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>9800.50<DTASOF>20261031</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe("OFX", () => {
  it("lê o extrato em SGML com valor em vírgula ou ponto e ignora valor zero", () => {
    const r = lerOFX(OFX_SGML);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.tipo).toBe("extrato_conta");
    expect(r.banco).toBe("Banco C6");
    expect(r.saldo_final).toBe(9800.5);
    expect(r.itens).toEqual([
      { data: "2026-10-05", descricao: "SALARIO EMPRESA X", valor: 12000, sentido: "entrada", parcela: null },
      { data: "2026-10-06", descricao: "PIX ENVIADO ALUGUEL", valor: 4200, sentido: "saida", parcela: null },
    ]);
  });

  it("reconhece fatura de cartão em XML e a parcela na descrição", () => {
    const xml = `<?xml version="1.0"?><?OFX OFXHEADER="200"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261003</DTPOSTED><TRNAMT>-480.00</TRNAMT><NAME>MAGAZINE LUIZA PARC 03/10</NAME></STMTTRN>
      <STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261010</DTPOSTED><TRNAMT>3500.00</TRNAMT><NAME>PAGAMENTO RECEBIDO</NAME></STMTTRN>
      </BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    const r = lerOFX(xml);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.tipo).toBe("fatura_cartao");
    expect(r.itens.map((i) => [i.sentido, i.valor, i.parcela])).toEqual([
      ["saida", 480, "3/10"],
      ["entrada", 3500, null],
    ]);
  });

  it("recusa arquivo que não é OFX", () => {
    expect(lerOFX("data;valor\n")).toEqual({ erro: "O arquivo não parece ser um OFX." });
  });
});

describe("CSV de banco", () => {
  it("fatura do Nubank: compras positivas, pagamento negativo", () => {
    const csv = "date,title,amount\n2026-10-02,Petz,120.50\n2026-10-03,Amazon - Parcela 2/6,99.90\n2026-10-10,Pagamento recebido,-3500.00\n";
    const r = lerCSVBanco(csv, true);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.itens).toEqual([
      { data: "2026-10-02", descricao: "Petz", valor: 120.5, sentido: "saida", parcela: null },
      { data: "2026-10-03", descricao: "Amazon - Parcela 2/6", valor: 99.9, sentido: "saida", parcela: "2/6" },
      { data: "2026-10-10", descricao: "Pagamento recebido", valor: 3500, sentido: "entrada", parcela: null },
    ]);
  });

  it("extrato com título antes do cabeçalho, crédito e débito separados e linha de saldo", () => {
    const csv = [
      "Extrato conta corrente;Agência 0001",
      "",
      "Data;Histórico;Crédito;Débito",
      "01/10/2026;SALDO ANTERIOR;;",
      "05/10/26;Salário;12.000,00;",
      "06/10/2026;Pix aluguel;;4.200,00",
    ].join("\n");
    const r = lerCSVBanco(csv, false);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.itens.map((i) => [i.data, i.sentido, i.valor])).toEqual([
      ["2026-10-05", "entrada", 12000],
      ["2026-10-06", "saida", 4200],
    ]);
  });

  it("extrato com uma coluna: negativo é saída", () => {
    const r = lerCSVBanco("Data,Valor,Identificador,Descrição\n05/10/2026,-35.90,abc,Uber\n06/10/2026,200.00,def,Pix recebido\n", false);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.itens.map((i) => i.sentido)).toEqual(["saida", "entrada"]);
  });

  it("explica quando não reconhece as colunas", () => {
    expect(lerCSVBanco("a;b\n1;2\n", false)).toHaveProperty("erro");
  });

  it("lê datas nos formatos comuns", () => {
    expect([lerData("5/1/2026"), lerData("05.01.26"), lerData("2026-01-05T10:00"), lerData("32/01/2026")]).toEqual([
      "2026-01-05",
      "2026-01-05",
      "2026-01-05",
      null,
    ]);
  });
});

describe("apoio", () => {
  it("extrai a parcela nos formatos dos bancos", () => {
    expect(extrairParcela("LOJA X PARC 03/10")).toEqual({ base: "LOJA X", parcela: "3/10" });
    expect(extrairParcela("Loja X - Parcela 3/10")).toEqual({ base: "Loja X", parcela: "3/10" });
    expect(extrairParcela("LOJA X PARCELA 3 DE 10")).toEqual({ base: "LOJA X", parcela: "3/10" });
    expect(extrairParcela("LOJA X 3/10")).toEqual({ base: "LOJA X", parcela: "3/10" });
    expect(extrairParcela("LOJA X 11/10").parcela).toBeNull();
    expect(extrairParcela("LOJA X").parcela).toBeNull();
  });

  it("decodifica Windows-1252 quando o arquivo não é UTF-8", () => {
    const bytes = new Uint8Array([0x53, 0x41, 0x4c, 0xc1, 0x52, 0x49, 0x4f]); // "SALÁRIO" em 1252
    expect(decodificarTexto(bytes)).toBe("SALÁRIO");
    expect(decodificarTexto(new TextEncoder().encode("SALÁRIO"))).toBe("SALÁRIO");
  });

  it("reconhece o formato pelo nome", () => {
    expect(["a.PDF", "b.jpeg", "c.ofx", "d.csv", "e.docx"].map((n) => formatoDoArquivo(n))).toEqual(["pdf", "imagem", "ofx", "csv", null]);
  });
});
