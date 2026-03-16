# Memory: architecture/bookmaker-relink-financial-safety-trigger
Updated: 2026-03-16

## Trigger de baseline financeira na vinculação

A integridade das baselines financeiras durante o vínculo de bookmakers é garantida pelo trigger `tr_ensure_deposito_virtual_on_link` com lógica simplificada:

### Processo (v3 - 2026-03-16)

1. **Verificação de idempotência**: Ignora se já existe DEPOSITO_VIRTUAL para esta bookmaker+projeto nos últimos 30 segundos
2. **DEPOSITO_VIRTUAL = saldo_atual**: Cria baseline direta, sem cálculos de net flow
3. **data_transacao = CURRENT_DATE**: Data da vinculação (não dos depósitos antigos)

### O que NÃO faz mais (removido)
- ❌ **Adoção de órfãos**: Depósitos anteriores à vinculação NÃO são atribuídos ao projeto
- ❌ **Cálculo de net flow**: Não calcula diferença entre depósitos reais e saldo
- ❌ **Safety net de fluxo total**: Desnecessário com a lógica simplificada

### Resultado verificado por simulação
- 3 depósitos criados (€100 + €150 + €50) com `projeto_id_snapshot = NULL`
- Bookmaker vinculada ao projeto com saldo = €300
- Trigger criou DEPOSITO_VIRTUAL = €300 com `data_transacao = 2026-03-16`
- Os 3 depósitos permaneceram com `projeto_id_snapshot = NULL` (não adotados)
- Projeto reconhece a data de vínculo, não a data dos depósitos antigos
