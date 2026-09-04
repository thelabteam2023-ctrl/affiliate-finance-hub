# Exclusão de bônus creditado não devolve o saldo (GASTON RED, US$ 100)

## O que está acontecendo (confirmado nos dados)

Ao excluir o bônus "Boas-vindas 100%" da conta GASTON RED, o sistema registrou corretamente o estorno no livro de movimentações, mas **o saldo da conta não foi debitado**.

Evidência real:
- Crédito do bônus em 28/08: US$ 100 → gerou lançamento financeiro e somou ao saldo.
- Estorno em 04/09 às 19:52 (US$ 100): registro de estorno criado, **sem nenhum lançamento financeiro correspondente**.
- Saldo hoje: US$ 100,00 (deveria ser US$ 0,00).

## Causa raiz

O saldo das contas só muda quando o registro do livro vira um "lançamento financeiro". A rotina que faz essa conversão trata depósitos, saques, bônus creditado, cashback, giros, perdas e ajustes — mas **não trata os estornos promocionais**. Estornos de bônus feitos entre abril e agosto geraram lançamento (com chave `ledger_bonus_estorno_...`), ou seja, esse tratamento existia e foi perdido em uma reescrita posterior da rotina. É uma regressão, não um comportamento intencional.

Alcance atual: 5 estornos de bônus confirmados ficaram sem lançamento (total ~400,47 em valores nominais), sendo 4 antigos de outro workspace e o da GASTON RED. Estornos de cashback e de giros grátis usam o mesmo caminho e ficariam igualmente sem efeito daqui em diante.

## Correção proposta

1. **Restaurar o tratamento dos estornos na rotina do banco** (`fn_cash_ledger_generate_financial_events`): passar a gerar lançamento negativo na conta de origem para `BONUS_ESTORNO`, `CASHBACK_ESTORNO` e `GIRO_GRATIS_ESTORNO`, com as mesmas chaves de idempotência já usadas historicamente (`ledger_bonus_estorno_…`, `ledger_cashback_estorno_…`, `ledger_giro_estorno_…`), de modo que nenhum estorno seja aplicado duas vezes.

2. **Cobrir os cenários vizinhos**: exclusão de bônus em freebet continua pelo caminho próprio (debita o pool de freebet) e não é afetada; reversões e cancelamentos continuam funcionando como hoje. Nada muda para depósitos, saques ou apostas.

3. **Regularizar o caso da GASTON RED** (mediante sua confirmação): gerar o lançamento faltante do estorno de US$ 100, levando o saldo de US$ 100,00 para US$ 0,00, com rastro de auditoria apontando para o estorno original.

4. **Decidir sobre os 4 estornos antigos** de outro workspace (0,32 / 200 / 0,15 / 100): eles também deixaram saldo inflado. Recomendo tratá-los da mesma forma, mas só executo com sua autorização explícita, um a um se preferir.

## Detalhes técnicos

- Nova ramificação na função `fn_cash_ledger_generate_financial_events`, disparada quando `tipo_transacao` é um dos três estornos e `origem_bookmaker_id` não é nulo; valor gravado como `-COALESCE(valor_origem, valor)`; `tipo_evento` = `BONUS_ESTORNO` / `CASHBACK_ESTORNO` / `GIRO_GRATIS_ESTORNO`; `tipo_uso` = `NORMAL`; moeda da bookmaker.
- O ajuste de saldo continua a cargo de `fn_financial_events_sync_balance`, que já é genérico pelo sinal do valor — nenhuma alteração nesse gatilho.
- Backfill (itens 3 e 4) apenas via inserção do lançamento faltante com a chave de idempotência canônica; sem UPDATE direto em `saldo_atual` e sem exclusão de linhas.
- Nenhuma mudança de front-end é necessária; o fluxo de exclusão em `useProjectBonuses.ts` já chama o estorno corretamente.
