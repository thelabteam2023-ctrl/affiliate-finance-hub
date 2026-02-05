 # Memory: architecture/financial-engine-v10-idempotent-audit
 Updated: 2026-02-05
 
 ## Motor Financeiro v10 - Idempotência e Auditoria
 
 ### Problema Resolvido
 
 A RPC `reliquidar_aposta_v5` usava timestamp na idempotency_key, permitindo:
 - Duplicação de PAYOUTs ao clicar múltiplas vezes no mesmo resultado
 - Acumulação de eventos sem correspondência com o estado real da aposta
 - Divergência entre saldo registrado e soma de eventos
 
 ### Solução Implementada: `reliquidar_aposta_v6`
 
 A nova RPC é **100% idempotente**:
 
 1. **Guard de resultado igual**: Se o resultado não mudou, retorna sem criar eventos
 2. **Idempotency key determinística**: `reliq_{aposta_id}_{resultado_anterior}_to_{resultado_novo}`
 3. **Evento único de AJUSTE**: Em vez de REVERSAL + PAYOUT, calcula a diferença de impacto
 
 ### Fórmula de Cálculo de Impacto
 
 ```
 impacto = CASE resultado
   WHEN 'GREEN' THEN stake * odd - stake  (lucro)
   WHEN 'MEIO_GREEN' THEN stake * (1 + (odd-1)/2) - stake
   WHEN 'VOID' THEN 0  (neutro)
   WHEN 'MEIO_RED' THEN -stake/2
   WHEN 'RED' THEN -stake
 END
 
 diferença = impacto_novo - impacto_anterior
 ```
 
 ### Regra de Ouro (IMUTÁVEL)
 
 **O saldo NUNCA é atualizado incrementalmente. Ele é SEMPRE derivado da soma dos eventos.**
 
 ```
 saldo_atual = SUM(financial_events.valor) WHERE tipo_uso = 'NORMAL'
 ```
 
 ### Funções de Reconciliação
 
 | Função | Propósito |
 |--------|-----------|
 | `reconciliar_saldo_bookmaker(bookmaker_id)` | Recalcula saldo a partir de eventos |
 | `recalcular_saldo_por_apostas(bookmaker_id)` | Calcula saldo esperado baseado no estado final das apostas |
 
 ### Garantias
 
 - Clicar 10x no mesmo resultado = mesmo saldo final
 - Alternar GREEN→RED→GREEN = saldo idêntico ao GREEN original
 - Toda mudança gera no máximo 1 evento de AJUSTE por transição