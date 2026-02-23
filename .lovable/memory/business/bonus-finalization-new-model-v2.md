 # Memory: business/bonus-finalization-new-model-v2
 Updated: 2026-02-05
 
 ## Novo Modelo de Finalização de Bônus (Sem Impacto Financeiro)
 
 ### Regra de Ouro (IMUTÁVEL)
 - Finalizar bônus **NUNCA** recalcula saldo
 - Finalizar bônus **NUNCA** soma nem subtrai dinheiro real
 - Finalização apenas: muda estado, muda direito de saque, encerra vínculo lógico
 
### Motivos de Finalização (FinalizeReason)

| Valor | Label | Impacto Financeiro |
|-------|-------|-------------------|
| `rollover_completed` | Rollover concluído (Saque liberado) | ZERO |
| `cycle_completed` | Bônus utilizado / Ciclo encerrado | ZERO |
| `expired` | Expirado | ZERO |
| `cancelled_reversed` | Cancelado / Revertido | DEBITA valor perdido do saldo via cash_ledger (AJUSTE_SALDO NEGATIVO) |
 
 ### Implementação Técnica
 ```typescript
 // Correto - Apenas muda estado
 bonus.status = 'finalized';
 bonus.finalize_reason = reason;
 
 // PROIBIDO - Não alterar saldo
 // saldo -= bonus.valor; // ❌ NUNCA FAZER
 ```
 
 ### Teste Anti-Bug Obrigatório
 - Cenário: bônus=100, saldo=283.97, rollover concluído
 - Ação: finalizar bônus
 - Resultado esperado: saldo=283.97 (inalterado), saque=habilitado, bônus=encerrado
 - Qualquer alteração no saldo = BUG CRÍTICO