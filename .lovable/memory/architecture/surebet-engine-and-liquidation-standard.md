# Memory: architecture/surebet-engine-and-liquidation-standard
Updated: 2026-02-12

O motor de Surebet (arbitragem) está 100% unificado com o motor financeiro central. A criação utiliza a RPC 'criar_surebet_atomica' seguindo a "Single Sign Convention" (v9.3): as stakes são inseridas com valores negativos, permitindo que o gatilho central de sincronização gerencie o débito no saldo do bookmaker sem intervenção manual do RPC (evitando double-debit).

## Liquidação por Perna — Motor Unificado

A liquidação de pernas individuais utiliza a RPC atômica 'liquidar_perna_surebet_v1', que encapsula TODA a lógica financeira:
1. Guard clause (resultado igual = no-op)
2. Reversão de payout anterior (se re-liquidação) via REVERSAL em financial_events
3. Criação de evento PAYOUT/VOID_REFUND com idempotência determinística
4. Atualização da perna em apostas_pernas
5. Recálculo automático do status do registro pai

O ApostaService.liquidarPernaSurebet() é um mero orquestrador — ZERO INSERT direto em financial_events.

## Edição de Pernas

A edição de campos (stake, odd, bookmaker, seleção) utiliza a RPC 'editar_perna_surebet_atomica' com reconciliação financeira via eventos de AJUSTE. Inclui:
- **Validação de saldo**: Aumento de stake é bloqueado se `bookmakers.saldo_atual < stake_increase`
- **Keys determinísticas**: `edit_perna_{id}_{campo}_{old}_to_{new}_n{count}` (monotônico)
- **Reconciliação de payout**: Se perna já liquidada, recalcula payout e gera AJUSTE delta

## Deleção de Pernas

A RPC 'deletar_perna_surebet_v1' garante integridade total:
1. REVERSAL da stake (devolve ao bookmaker)
2. REVERSAL do payout (se perna liquidada com GREEN/VOID/MEIO_GREEN/MEIO_RED)
3. DELETE da perna em apostas_pernas
4. Recálculo do pai (ou status CANCELADA se última perna)

## Princípio Validado

Todo módulo do sistema (Aposta Simples, Surebet, Caixa, Cashback, Freebet) segue o mesmo padrão:
- INSERT em financial_events → Trigger fn_financial_events_sync_balance → UPDATE bookmakers.saldo_*
- Nenhum componente faz UPDATE direto em saldo
- Service layer é orquestrador, RPCs são a única fonte de lógica financeira

Para fins de filtragem e visibilidade na UI, todos os registros de múltiplas pernas utilizam obrigatoriamente 'forma_registro = ARBITRAGEM'.
