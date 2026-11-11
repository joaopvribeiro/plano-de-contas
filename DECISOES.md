# Decisões do projeto

Registro das decisões de produto e técnicas. Cada etapa acrescenta as suas.

## Decisões de produto (prompt v2)

| # | Ponto | Decisão |
| --- | --- | --- |
| 1 | Regime da DFC | Competência. Cartão no mês em que a fatura fecha; conta corrente e dinheiro no mês da data. |
| 2 | Pagamento de fatura e transferências | Campo `natureza = transferencia`, fora da DFC. |
| 3 | Aportes e resgates | Linha "Investimentos (líquido)" abaixo do Saldo do mês; caixa acumulado usa o saldo após investimentos. |
| 4 | Estornos e reembolsos | `estorno = true` abate a classe e a categoria de origem. Reembolso não é Receita. |
| 5 | Subtipo de receita | Salário, Pró-labore/distribuição, Outras receitas. |
| 6 | Parcelas previstas × reais | A prevista fica no Previsto e aponta a real por `realizado_id`. |
| 7 | Horizonte | Fixo em `meses_horizonte`, extensível pelo consultor; aviso a 2 meses do fim. |
| 8 | Meta da reserva | N × média da despesa básica prevista no horizonte. |
| 9 | Passivos | Tabela `passivos`; PL = ativos − passivos. |
| 10 | Consórcio | Carta, saldo a pagar e direito líquido; "Patrimônio com direitos" usa o direito líquido. |
| 11 | Ações, FIIs, Tesouro longo | Categoria `Investimentos`; `conta_liberdade` padrão verdadeiro em Investimentos, Previdência e Fundo Fechado. |
| 12 | Sócio | `familia_consultores` (N:N) + `consultores.admin`. Admin vê todas as famílias. |
| 13 | Duplicadas | Mesma conta, valor ±R$ 0,01, data ±3 dias, similaridade de trigramas ≥ 0,6. |
| 14 | Prêmios | `premio` + `periodicidade`; `premio_mensal` calculado. |
| 15 | Liberdade financeira | Meta e aporte em reais de hoje; aporte constante em termos reais. |
| 16 | IA e LGPD | Consentimento separado para IA; `resposta_ia` e auditoria entram no expurgo. |

## Etapa 1

- **Integridade entre famílias por chave composta.** Referências como `lancamentos.categoria_id` usam `(familia_id, categoria_id)`. Um lançamento da família A nunca aponta para categoria, conta ou ativo da B, mesmo que alguém descubra o id.
- **Auditoria sem texto.** O log guarda tabela, registro, ação, nomes dos campos alterados e só os valores numéricos (antes/depois). Descrições, observações e resumos de apólice nunca vão para a auditoria.
- **Histórico automático.** Mudou o `valor` de um ativo ou o `saldo_devedor` de uma dívida, grava um ponto no histórico (gatilho). A tela não precisa lembrar disso.
- **Padrões da família por gatilho.** Ao criar uma família: 15 categorias, metas por classe (básica 50%, padrão de vida 30%, doações 10%, sonhos 10%), objetivos (retorno real 0,40% a.m., 20 anos, reserva de 6 meses) e limites de IA (20/5/4). Todos editáveis pelo consultor depois.
- **Criação de família por função** (`criar_familia`), que já vincula o consultor criador como principal.
- **Prêmio único** não tem equivalente mensal (`premio_mensal` nulo) e não entra no orçamento.
- **Configurações reservadas ao consultor**: metas por classe, objetivos, limites de IA e horizonte. A família lê, mas não altera.
- **Acesso só por convite.** O login por link não cria contas (`shouldCreateUser: false`). Contas novas nascem do convite, enviado pela API de Auth com a service role, só no servidor. Recomendado desligar "Allow new users to sign up" no Supabase.
- **Link do convite é copiável.** Se o e-mail falhar, o consultor copia o link. A página do convite só envia o acesso para o e-mail convidado (mostrado mascarado), nunca para outro.
- **Família ativa em cookie** (`rf_familia`, httpOnly). As URLs das abas ficam limpas (`/dashboard` etc.), como pede o prompt. A segurança não depende do cookie: a RLS decide.
- **Fontes servidas pelo próprio app** (pacotes Fontsource), sem chamada ao Google Fonts. Melhor para LGPD e funciona offline no build.
- **Testes de RLS sem Docker.** Rodam num Postgres comum com um "shim" que recria só o mínimo do Supabase (papéis, `auth.uid()`, `storage.objects`). Também rodam contra `supabase start`, apontando `TEST_DATABASE_ADMIN_URL`.

## Pendente de decisão

- Domínio final e nome do produto (hoje "[Resolutto Family]").
- Remetente dos e-mails (ex.: `acesso@resolutto.com.br`) e provedor SMTP.
