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

## Etapa 2

- **Previsto e realizado nunca se somam.** Nos totais da lista, o número grande é o realizado (ou o previsto, se o filtro só tiver previstos), e o outro aparece embaixo.
- **Transferências fora dos totais**, com uma linha informando quanto somam.
- **Regra aprendida mais específica vence**: "UBER EATS" ganha de "UBER". A comparação ignora acento, caixa e pontuação. Padrões ficam gravados em maiúsculas.
- **Regras preenchem só o que o usuário não mexeu.** Se você já escolheu a categoria, digitar a descrição não a troca.
- **Mês de competência segue a fatura até você mudá-lo à mão.** Fechamento em dia que o mês não tem (31 em fevereiro) vale o último dia do mês.
- **Data obrigatória só no Realizado.** Previstos podem ficar sem data (orçamento mensal).
- **"Criar regra para os próximos?"** aparece ao corrigir categoria ou natureza de lançamento importado (`ia` ou `ia-parcela`), se nenhuma regra já cobrir aquele caso. O padrão sugerido é a primeira palavra significativa da descrição.
- **Edição em massa**: escolher só a categoria aplica a classe padrão dela. Virar transferência limpa classe e categoria; virar receita ou despesa exige categoria.
- **Contas com lançamentos não são excluídas**, só desativadas. Categorias são arquivadas (somem dos formulários, continuam nos lançamentos antigos).
- **Quitou ou antecipou?** remove só as parcelas previstas posteriores ao mês aberto que ainda não foram ligadas a uma parcela real.
- **Contas, categorias e regras** ficam como sub-abas de Lançamentos (`/lancamentos/contas`, `/categorias`, `/regras`). Membros e consultor podem editar.

## Decisões do João (16/11/2026)

| Ponto | Decisão |
| --- | --- |
| Quem edita o orçamento previsto | **Só o consultor.** O cliente vê o previsto e lança o realizado. |
| Reserva × Investimentos ao importar relatórios | Pós-fixados D+0/D+1 são sugeridos como Reserva até a meta; o resto vira Investimentos; o consultor ajusta na revisão. (Etapa 5) |
| Bruto ou líquido | **Bruto, sempre.** O líquido é guardado quando o relatório informar. |
| Regras padrão | Biblioteca da Resolutto copiada para cada família nova. |
| Nova funcionalidade | Leitura de relatórios de investimento XP e BTG no Patrimônio (Etapa 5), com conferência da soma contra o patrimônio bruto do relatório. |
| Nova ordem | Etapa 3 inclui importação do previsto por planilha e "repetir previsto". |

## Etapa 3

- **Previsto protegido no banco**, não só na tela: a RLS só deixa o consultor criar, alterar ou excluir previsto. Exceção: parcelas futuras geradas pela importação (`ia-parcela`), que o membro cria e remove ("Quitou ou antecipou?"). O membro também não transforma realizado em previsto.
- **DFC somada no banco** (`resumo_dfc`), com a RLS valendo. Evita o limite de 1.000 linhas por consulta do Supabase; a conta da DFC é linear, então o resultado é o mesmo.
- **Transferência não marca o mês como "com realizado".** Um mês cujo único realizado é o pagamento de fatura continua "—" no realizado.
- **Caixa realizado**: começa no saldo inicial; mês sem realizado entre meses com realizado repete o anterior; depois do último mês com realizado fica vazio.
- **Divergência colorida pelo sentido**: receita e saldo acima do previsto em verde; despesa acima do previsto em vermelho.
- **Distribuição sobre a receita** usa o realizado quando o mês tem; senão, o previsto. Até a meta: verde; até 5 pontos acima: âmbar; mais: vermelho.
- **Cartões do mês** mostram o realizado em destaque e o previsto embaixo; sem realizado, mostram o previsto em cinza.
- **Gráfico**: barras de receitas e despesas previstas; linhas do caixa acumulado previsto (tracejada) e realizado (contínua). Paleta categórica validada para daltonismo nos temas claro e escuro.
- **Matriz**: valores inteiros na grade (centavos no "passar o mouse" e no CSV). Clique em receita ou classe de despesa abre os lançamentos filtrados.
- **Exportação**: CSV com ponto e vírgula e BOM, que abre direto no Excel em português. Arquivo .xlsx nativo fica para depois, se fizer falta.
- **Importação do previsto**: colar do Excel/Google Sheets ou CSV (UTF-8 ou Latin-1). Cabeçalho flexível (com ou sem acento, sinônimos). Linhas com erro são mostradas com o número da linha e não entram; as válidas entram. Opção de substituir o previsto importado por planilha nos mesmos meses (previstos manuais e parcelas não são apagados). Limite de 2.000 linhas.
- **Repetir previsto**: no formulário, "repetir nos meses seguintes" (até 59) cria o mesmo previsto em meses consecutivos.
- **Regras padrão**: 37 regras iniciais (fatura, aplicação/resgate, delivery, mercados, streaming, farmácias, pets, combustível, contas de consumo). Termos curtos que aparecem dentro de outras palavras foram evitados ("POSTO" casaria com "IMPOSTO"). Só admins editam a biblioteca. "Aplicar regras padrão" adiciona só as que faltam.
- **Link de convite já usado** volta para a página do convite, que oferece um novo link.

## Etapa 4

- **Formatos**: PDF e fotos (JPG, PNG, WEBP; até 4 arquivos do mesmo documento) vão para a IA. OFX e CSV do banco são lidos sem IA; a IA só sugere categoria para as linhas que nenhuma regra cobre, recebendo apenas descrição, sentido e valor.
- **Modelo**: `claude-haiku-5-5`, com saída estruturada (JSON Schema) para a resposta vir sempre no mesmo formato. Trocável por variável de ambiente.
- **Autorização de IA** por família (versão `ia-v1`). O membro autoriza; o consultor pode registrar declarando que a família autorizou. Sem autorização, OFX e CSV funcionam sem sugestões.
- **Limite mensal** (padrão 20 leituras de extrato): conta cada chamada à IA, inclusive a categorização de OFX/CSV e leituras que falham depois de chegar à IA. Uso e tokens ficam em `uso_ia`.
- **Ordem de decisão** de cada linha: regra da família → sugestão da IA → padrão (entrada em conta vira Receita; pagamento recebido no cartão vira transferência) → pendente. Linha pendente de categoria bloqueia a confirmação.
- **Mês de competência** (ajustado em 16/11 a pedido do João): fatura = mês do fechamento para todas as linhas, inclusive parcelas de compras antigas (a 10/12 de uma compra de janeiro entra no mês da fatura que a cobra). Editável uma vez para a fatura toda. Sem fechamento lido, estima pelo vencimento (−7 dias); sem nenhuma data, usa o ciclo da compra mais recente. Vale também quando a fatura é enviada para uma conta que não é cartão (com aviso). Extrato de conta = mês da data, editável por linha.
- **Estorno** calculado pelo sentido: entrada numa categoria de despesa, ou saída na de receita.
- **Duplicadas** (critério do item 13) vêm desmarcadas, com o lançamento parecido ao lado.
- **Parcelas**: "3/10" que casa com uma parcela prevista aberta da mesma compra (mesmo cartão, mesma parcela, valor ±R$ 1, descrição parecida) realiza essa prevista e herda a categoria dela. Sem prevista, a revisão oferece prever as parcelas seguintes (`ia-parcela`).
- **Conferência**: fatura = compras − estornos (sem pagamentos) contra o total; extrato = entradas − saídas contra a variação do saldo. Diferença acima de R$ 0,05 aparece como aviso, sem bloquear.
- **Confirmação numa transação só** (`confirmar_importacao`): grava tudo ou nada, com a RLS valendo. Data, valor e sentido vêm da leitura guardada no servidor, nunca do navegador.
- **"Criar regra para os próximos meses"** em toda linha da revisão que não veio de regra (pedido do João, 16/11). O texto da regra vem sugerido (ignorando intermediadores como S2P, PAGSEGURO, PIX) e é editável; precisa aparecer na descrição da linha. A regra grava a natureza, a categoria e a classe escolhidas na linha.
- **Arquivo original apagado** do Storage ao confirmar ou descartar (`arquivos_expurgados_em`). A leitura (`resposta_ia`) fica guardada até a política de expurgo da Etapa 9.
- **Envio direto ao Storage** pelo navegador (com a regra de acesso do bucket), para não esbarrar no limite de tamanho das ações do servidor. A leitura roda numa ação de até 300 s.

## Etapa 5

- **Totais**: carteira investida = Reserva + Investimentos + Previdência + Fundo Fechado. Patrimônio líquido = carteira + FGTS + bens − dívidas. Direitos futuros = soma das cartas de consórcio. Patrimônio com direitos = patrimônio líquido + direito líquido dos consórcios.
- **Direito líquido do consórcio**: não contemplado = o que já foi pago (parcelas pagas × parcela); contemplado = carta − saldo a pagar (nunca negativo). A carta cheia aparece só como "Direitos futuros".
- **Data do saldo** (`ativos.data_saldo`, `passivos.data_saldo`): o histórico grava o ponto nessa data, não na data do cadastro. Relatório usa a data de referência; atualização manual pede a data. Um ponto por ativo e dia.
- **Saldo desatualizado**: mais de 45 dias desde a data do saldo, em âmbar.
- **Evolução**: saldo no fim de cada mês (último ponto até lá), 12 meses, sem consórcios. Bens e dívidas valem desde antes do cadastro (o primeiro saldo conhecido), para não criar salto falso no mês em que foram lançados. A série começa no primeiro mês com saldo de carteira, FGTS ou previdência.
- **Ativo zerado** (resgatado) some do balanço e dos totais, mas mantém o histórico.
- **Relatório de investimentos**: um PDF por vez; uma posição = um ativo; saldo bruto sempre, líquido guardado quando o relatório traz. Caixa da corretora entra como posição "Saldo em conta". Conferência: soma das posições contra o patrimônio bruto (tolerância R$ 1 ou 0,01%).
- **Mês a mês**: cada posição guarda uma chave (instituição + nome + vencimento + taxa) e, no relatório seguinte, atualiza o mesmo ativo mantendo a categoria escolhida. Ativo manual da mesma instituição com o mesmo nome também é reconhecido. Ativos da instituição que não vieram no relatório são sugeridos para zerar (marcados se vieram de relatório; desmarcados se manuais).
- **Reserva sugerida**: caixa e pós-fixados D+0/D+1 de posições novas, completando a meta com a menor posição que cobre o que falta (ou a maior, se nenhuma cobre, e repete). Conta o que já é Reserva em outras instituições. O consultor muda na revisão.
- **Cota de IA**: relatórios e extratos dividem as 20 leituras mensais.
- **Confirmação numa transação só** (`confirmar_relatorio`), com a RLS valendo; valores vêm da leitura guardada no servidor. O PDF é apagado ao confirmar ou descartar.

## Etapa 6

- **Liberdade financeira** soma os ativos marcados "Conta para a liberdade financeira" (padrão: Investimentos, Previdência e Fundo Fechado; editável em cada ativo). Mostra o saldo de hoje no prazo só com o retorno real e o aporte mensal constante (fim de cada mês) que fecha a meta. Tudo em reais de hoje.
- **Reserva**: meta = N meses × despesa básica prevista média do horizonte; "cobre X meses" com uma casa decimal, arredondando para baixo.
- **Projetos**: quanto guardar por mês = o que falta ÷ meses do próximo mês até o mês do prazo. Prazo vencido mostra o que falta; meta atingida, selo verde. "Guardado em" é só uma referência ao ativo; o valor guardado é informado na meta.
- **Prever no orçamento** (só consultor): cria o aporte mensal como previsto da classe Sonhos (primeira categoria da classe), do próximo mês até o prazo, dentro do horizonte, sem repetir meses já previstos.
- **Premissas** (meta, retorno real, prazo, meses de reserva): só o consultor edita, como já era no banco.
- Sem migração nesta etapa.

## Pendente de decisão

- Domínio final e nome do produto (hoje "[Resolutto Family]").
- Remetente dos e-mails (ex.: `acesso@resolutto.com.br`) e provedor SMTP.
