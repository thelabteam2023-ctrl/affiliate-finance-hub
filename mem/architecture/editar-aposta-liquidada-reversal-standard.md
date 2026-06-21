---
name: editar-aposta-liquidada-reversal-standard
description: Edição de aposta simples LIQUIDADA roteia para editar_aposta_liquidada_v4 (RPC) que reverte 1:1 todos os eventos vivos via REVERSAL e relança STAKE+PAYOUT/VOID_REFUND com os novos valores. lucro_realizado e roi_realizado são recalculados no mesmo UPDATE.
type: architecture
---

# Padrão: Edição de aposta LIQUIDADA por REVERSAL + relançamento

## Regra
`ApostaService.atualizarAposta` detecta `status='LIQUIDADA'` + mudança em campo financeiro (`bookmaker_id`, `stake`, `odd`, `odd_final`, `resultado`, `lucro_prejuizo`, `moeda_operacao`) e roteia para a RPC `editar_aposta_liquidada_v4` (v5 internamente). Campos não-financeiros (evento, esporte, mercado, observações) continuam via UPDATE direto.

## O que a RPC faz
1. Reverte 1:1 todos os `financial_events` da aposta que ainda não foram revertidos (insere REVERSAL com `valor = -original` e `reversed_event_id` apontando para o evento original).
2. Relança STAKE (e FREEBET_STAKE quando aplicável) com o novo `bookmaker_id`/`stake`/`moeda`.
3. Relança PAYOUT ou VOID_REFUND conforme o novo resultado.
4. Atualiza `apostas_unificada` com `stake`, `odd`/`odd_final`, `resultado`, `lucro_prejuizo`, **`lucro_realizado`**, `valor_retorno`, `roi_real`, **`roi_realizado`** e `status`.
5. Sincroniza saldo do bookmaker novo e (se mudou) do antigo via `sync_bookmaker_balance_from_ledger`.

## Restrições
- NUNCA fazer `UPDATE` direto em `apostas_unificada` em campos financeiros de uma aposta `LIQUIDADA` — sempre passar pela RPC.
- Para SUREBETs, o caminho é `editar_surebet_completa_v3` (que já faz REVERSAL+relançamento via `fn_sync_stake_event_v1` + `liquidar_perna_surebet_v1`); não usar `editar_aposta_liquidada_v4` para surebet.

## Auditoria
Cada REVERSAL tem `reversed_event_id` apontando para o evento original — permite trilha 1:1 e reconciliação.