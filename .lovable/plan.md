# Plan: Implementação Controlada — Perda Operacional → Saldo da Bookmaker

O objetivo é integrar o módulo de Ocorrências com a arquitetura financeira V6, garantindo que perdas operacionais confirmadas debitem corretamente o saldo da bookmaker sem causar duplicidade nos KPIs.

## 1. Fase de Investigação e Validação (Concluída)
- Confirmado que `fn_financial_events_sync_balance` é o mecanismo canônico.
- Verificado que `financial_events` suporta tipos específicos. Propomos o tipo `LOSS` ou `AJUSTE` com origem `PERDA_OPERACIONAL` se `LOSS` não estiver no check constraint (o check constraint atual tem `AJUSTE`).
- *Nota:* O check constraint de `financial_events` no arquivo `20260127043904_14fc45b8-59f6-4558-86b3-787c84a26525.sql` aceita: `'STAKE', 'PAYOUT', 'VOID_REFUND', 'REVERSAL', 'FREEBET_STAKE', 'FREEBET_PAYOUT', 'FREEBET_CREDIT', 'FREEBET_EXPIRE', 'DEPOSITO', 'SAQUE', 'CASHBACK', 'BONUS', 'AJUSTE'`.
- Como `LOSS` não está no constraint, utilizaremos `AJUSTE` com metadados e descrição apropriados, ou adicionaremos `LOSS` ao constraint via migração se for a preferência arquitetural. Seguiremos com a adição de `LOSS` e `LOSS_REVERSAL` para clareza.

## 2. Alterações no Banco de Dados (Supabase)
- **Migração SQL:**
  - Adicionar `LOSS` e `LOSS_REVERSAL` ao check constraint da tabela `financial_events` (tipo_evento).
  - Atualizar `fn_cash_ledger_generate_financial_events` para gerar automaticamente o `financial_event` tipo `LOSS` quando uma entrada `PERDA_OPERACIONAL` for inserida no `cash_ledger`.
  - Isso garante que qualquer módulo (não apenas ocorrências) que use o `ledgerService.registrarPerdaOperacionalViaLedger` tenha o saldo sincronizado automaticamente.

## 3. Alterações no Frontend
- **useOcorrencias.ts (`useResolverOcorrenciaComFinanceiro`):**
  - Garantir que a chamada para `registrarPerdaOperacionalViaLedger` forneça todos os IDs necessários (`bookmakerId`, `projetoIdSnapshot`, `perdaId`).
  - O fluxo atual já chama o ledger, mas o ledger não está gerando o evento financeiro V6 para perdas. A migração no banco resolverá isso de forma transparente e atômica.
- **ledgerService.ts:**
  - Nenhuma mudança estrutural necessária se a lógica for movida para o gatilho do banco (preferencial para atomicidade). Se optarmos por manual, adicionaremos o insert em `financial_events` dentro de `registrarPerdaOperacionalViaLedger`.

## 4. Testes e Validação
- **Caso Real:** Validar o caso "Lucas Pereira → Sman 365 → R$ 1.422,44".
- **Idempotência:** Testar múltiplos salvamentos. A chave de idempotência no gatilho será `ledger_loss_` + `cash_ledger.id`.
- **KPIs:** Verificar se a aba Bônus e Visão Geral continuam exibindo os valores corretos (sem dupla contagem).
- **Reversão:** Testar o cancelamento da ocorrência e se o saldo retorna à bookmaker.

## Detalhes Técnicos (Migration)
```sql
-- Adicionar LOSS ao constraint se necessário
ALTER TABLE financial_events DROP CONSTRAINT IF EXISTS financial_events_tipo_evento_check;
ALTER TABLE financial_events ADD CONSTRAINT financial_events_tipo_evento_check 
CHECK (tipo_evento IN (
    'STAKE', 'PAYOUT', 'VOID_REFUND', 'REVERSAL',
    'FREEBET_STAKE', 'FREEBET_PAYOUT', 'FREEBET_CREDIT', 'FREEBET_EXPIRE',
    'DEPOSITO', 'SAQUE', 'CASHBACK', 'BONUS', 'AJUSTE', 'LOSS', 'LOSS_REVERSAL'
));

-- Atualizar trigger no cash_ledger para incluir PERDA_OPERACIONAL
-- (Similar ao bloco de AJUSTE_MANUAL em fn_cash_ledger_generate_financial_events)
```
