---
name: Ledger Chain Reconstruction Standard
description: Como restaurar a integridade do cash_ledger quando um elo raiz foi revertido enquanto elos descendentes reais permanecem ativos
type: feature
---
## Reconstrução de Cadeia Financeira

Reversão só é válida no ÚLTIMO elo da cadeia. Quando o elo raiz (aporte) ou intermediário
(transferência) é estornado e existe um elo folha real e ainda ativo (depósito em casa),
a cadeia quebra: a origem do recurso é anulada mas o uso permanece.

### Procedimento canônico (nunca DELETE, nunca UPDATE de saldo)

1. Se existir um ajuste sintético paliativo (`AJUSTE_RECONCILIACAO` com origem `AJUSTE`),
   estorná-lo com um espelho `ESTORNO DE REPARO:` e marcar `reversed_at`/`reversed_by_id`.
2. Relançar o **aporte real** com o valor efetivamente consumido pelos elos folha
   (não o valor cheio do lançamento errado), `data_transacao` = data original,
   descrição prefixada `RECONSTRUÇÃO DE CADEIA:` e
   `auditoria_metadata = {motivo:'RECONSTRUCAO_DE_CADEIA', reconstrucao_de:<id original>, lastro_para:<id do elo folha>}`.
3. Relançar a **transferência real** no mesmo valor, mesma data, mesmos metadados.
4. Manter o elo folha (depósito) intocado.
5. Rodar `recompute_capital_snapshot(workspace, dia)` a partir da data afetada.

Ordem de inserção é obrigatória (crédito antes do débito), senão `trg_guard_wallet_debit` bloqueia.

### Regras
- As reversões erradas permanecem no histórico como fato auditável; nunca são apagadas.
- Reconstruir apenas a parcela realmente utilizada; o restante do lançamento errado continua estornado.
- `referencia_transacao_id` sempre aponta para a linha original revertida (rastreabilidade bidirecional).
- Proibido reverter o elo folha para "fechar a conta" — isso falsifica o saldo da casa.

### Caso de referência (01/08/2026, workspace André)
Aporte 400 USDT + transferência 400 USDT revertidos com depósito real de 120 USDT ativo.
Solução: estorno do reparo `a6606f4a`, relançamento de aporte 120 USDT + transferência 120 USDT.
Resultado: carteira ANDERSON = 3,01 USDT, Caixa sem negativo, depósito com lastro legítimo.
