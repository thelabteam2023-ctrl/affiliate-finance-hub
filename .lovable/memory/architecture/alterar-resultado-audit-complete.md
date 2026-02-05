 # Memory: architecture/alterar-resultado-audit-complete
 Updated: 2026-02-05
 
 ## Auditoria Completa: Botão "Alterar Resultado"
 
 ### Status: ✅ FUNCIONANDO CORRETAMENTE
 
 O sistema de alteração de resultado foi auditado e está operando conforme esperado.
 Todas as mudanças de resultado reprocessam o impacto financeiro corretamente.
 
 ### Fluxos Identificados
 
 #### 1. ResultadoPill (Pill Clicável)
 - Usa `reliquidarAposta()` do ApostaService
 - Chama `reliquidar_aposta_v5` RPC
 - Invalida cache via `invalidateSaldos(projetoId)`
 
 #### 2. BetRowActionsMenu (Menu Dropdown)
 - Usa `handleQuickResolve()` do componente pai
 - Chama `reliquidarAposta()` do ApostaService
 - Invalida cache via `invalidateSaldos(projetoId)`
 
 #### 3. ApostaDialog (Edição Completa)
 - Mudança apenas de resultado: `reliquidar_aposta_v5`
 - Mudança de stake/odd/bookmaker: `atualizar_aposta_liquidada_atomica_v2`
 - Ambos invalidam cache corretamente
 
 ### Convenção de Sinais (Motor Financeiro v9.5)
 
 | Tipo de Evento | Valor no Evento | Efeito no Saldo |
 |----------------|-----------------|-----------------|
 | REVERSAL | NEGATIVO | DÉBITO (reverte payout anterior) |
 | PAYOUT | POSITIVO | CRÉDITO (aplica novo payout) |
 | AJUSTE | +/- | CRÉDITO/DÉBITO conforme diferença |
 | STAKE | NEGATIVO | DÉBITO |
 
 ### Cálculo de AJUSTE para Edição de Stake (resultado RED)
 
 ```
 Cenário: Stake diminui de 85 → 35 (resultado RED)
 
 impacto_anterior = 0 (RED não creditou nada)
 impacto_novo = 0 (RED não vai creditar nada)
 diferenca_payout = 0 - 0 = 0
 ajuste_stake = 85 - 35 = +50 (stake anterior - stake novo)
 diferenca_total = 0 + 50 = +50 (CRÉDITO de 50)
 ```
 
 Se o stake DIMINUI em aposta RED, o sistema CREDITA a diferença de volta.
 Se o stake AUMENTA em aposta RED, o sistema DEBITA a diferença.
 
 ### Trigger de Sincronização
 
 O trigger `fn_financial_events_sync_balance` na tabela `financial_events`:
 - Captura saldo anterior
 - Aplica o delta (valor do evento direto, sem inversão)
 - Atualiza `bookmakers.saldo_atual` ou `saldo_freebet`
 - Registra auditoria em `bookmaker_balance_audit`
 
 ### Logs de Auditoria
 
 Toda mudança financeira é rastreável via:
 - `financial_events`: Registro de cada evento
 - `bookmaker_balance_audit`: Saldo anterior → Saldo novo com diferença
 - `metadata` do evento: Contexto completo da operação