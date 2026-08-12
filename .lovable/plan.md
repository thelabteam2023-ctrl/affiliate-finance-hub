# Auditoria Forense: Fluxo Financeiro (Ocorrência → Saldo → KPI)

## 1. Diagnóstico
Existe uma **divergência de sincronismo** entre o reconhecimento de perdas operacionais em Ocorrências e a atualização do saldo das casas de apostas. Enquanto o KPI de Lucro (Projetos) já subtrai corretamente o valor da perda (via tabela `projeto_perdas`), o saldo da bookmaker permanece inalterado porque o fluxo de resolução da ocorrência não está gerando um evento no Ledger que impacte o `saldo_atual`.

## 2. Evidência do caso R$ 1.422,44 (Lucas Pereira)
A investigação preliminar nos arquivos do projeto e lógica de banco aponta para o seguinte estado:
- **Projeto:** Lucas Pereira (vinculado via `projeto_id`).
- **Bookmaker:** Sman 365.
- **Valor:** R$ 1.422,44.
- **Status:** Resolvido como 'perda_confirmada'.
- **Causa da Divergência:** O valor foi inserido em `projeto_perdas` (o que corrige o KPI), mas o `registrarPerdaOperacionalViaLedger` chamado no frontend insere um registro em `cash_ledger` que, devido ao trigger `atualizar_saldo_bookmaker_v6`, **não atualiza o saldo diretamente** (audit-only), esperando que um evento financeiro (`financial_events`) faça a sincronização. Como as ocorrências não geram `financial_events`, o saldo fica "congelado".

## 3. Fluxo da Ocorrência
- **Arquivo:** `src/hooks/useOcorrencias.ts`
- **Função:** `useResolverOcorrenciaComFinanceiro`
- **Tabela:** `ocorrencias`
- **Registro Financeiro:** 
  1. Chama `registrarPerdaOperacionalViaLedger` (LedgerService).
  2. Insere na tabela `projeto_perdas`.
- **Destino:** `cash_ledger` (como `PERDA_OPERACIONAL`) e `projeto_perdas`.

## 4. Fluxo do KPI
- **Arquivo:** `src/services/FinancialMetricsService.ts`
- **Hook:** `useProjetoResultado`
- **Query/RPC:** `get_projeto_dashboard_data` (que alimenta o `rawData.perdas`).
- **Regra:** O KPI subtrai explicitamente `operationalLossesConfirmed` (obtido filtrando `projeto_perdas` por status 'CONFIRMADA').
- **Por que está correto?** Porque a tabela `projeto_perdas` é a fonte primária para esse KPI e ela é alimentada diretamente na resolução.

## 5. Fluxo do Saldo da Bookmaker
- **Função:** `get_bookmaker_saldos` (RPC no Postgres).
- **Tabela:** `bookmakers` (coluna `saldo_atual`).
- **Cálculo:** O saldo é **calculado em tempo real** subtraindo apostas pendentes do `saldo_atual` persistido.
- **Origem do erro:** O `saldo_atual` da tabela `bookmakers` não foi decrementado.

## 6. Ponto da Divergência
A divergência ocorre no **Ledger**. O trigger `atualizar_saldo_bookmaker_v6` (migration `20260514171239`) desativou o update direto no saldo para o tipo `PERDA_OPERACIONAL`, marcando-o como `V6_AUDIT_ONLY`. Ele espera que a sincronização venha da tabela `financial_events`, mas o fluxo de ocorrências não gera eventos nessa tabela.

## 7. Ledger
A perda **chega ao Ledger** (`cash_ledger`), mas é ignorada pelo trigger de atualização de saldo.

## 8. Causa Raiz
A adoção da **Arquitetura V6/Event-Sync** (onde apenas `financial_events` atualizam saldo) não contemplou o módulo de Ocorrências. O sistema está em um estado híbrido onde KPIs leem de tabelas paralelas (`projeto_perdas`), mas o saldo depende de uma cadeia de eventos que não é disparada por perdas operacionais manuais.

## 9. Impactos Adicionais
- **Gráfico de Evolução:** Pode ignorar a perda se a query do gráfico ler apenas de `financial_events` em vez de consolidar com `projeto_perdas`.
- **Patrimônio Total:** Inflado em R$ 1.422,44.

## 10. Solução Proposta
Unificar o evento canônico. A resolução de uma ocorrência com perda deve gerar um `financial_event` do tipo `LOSS` ou `ADJUSTMENT`. Isso garantirá que o trigger `fn_financial_events_sync_balance` atualize o saldo e que os gráficos (que já leem eventos) reflitam a perda na data correta.

## 11. Risco de Dupla Contagem
**Altíssimo.** Se passarmos a atualizar o saldo via Ledger e o KPI de lucro continuar subtraindo `projeto_perdas`, a perda será descontada duas vezes (uma no saldo das casas e outra na métrica de perdas).
- **Estratégia:** O KPI deve parar de ler `projeto_perdas` para o lucro operacional e passar a considerar apenas os débitos confirmados no Ledger/Eventos, ou `projeto_perdas` deve ser a fonte exclusiva para gerar o evento no Ledger.

## 12. Dados Históricos
- **Registros Afetados:** Todas as ocorrências resolvidas como 'perda' desde a implantação do Trigger V6.
- **Identificação:** Queries comparando `SUM(valor) FROM projeto_perdas` vs `SUM(valor) FROM cash_ledger WHERE tipo='PERDA_OPERACIONAL'`.

## 13. Plano de Correção (Resumo)
1. Ajustar `useResolverOcorrenciaComFinanceiro` para garantir integridade.
2. Atualizar Trigger V6 ou criar `financial_event` para perdas.
3. Sincronizar query de Lucro para evitar dupla contagem.

## 14. Plano de Testes
1. Validar caso Lucas Pereira: Saldo Sman 365 deve cair R$ 1.422,44 após correção.
2. Verificar se o Lucro Total do projeto Lucas Pereira permanece inalterado (confirmando proteção contra dupla contagem).
