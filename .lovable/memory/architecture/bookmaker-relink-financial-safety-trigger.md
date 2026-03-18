# Memory: architecture/bookmaker-relink-financial-safety-trigger
Updated: 2026-03-18

## Trigger de baseline financeira na vinculação

A integridade das baselines financeiras durante o vínculo de bookmakers é garantida pelo trigger `tr_ensure_deposito_virtual_on_link` com lógica em duas etapas:

### Processo (v4 - 2026-03-18)

1. **Adoção de depósitos/FX órfãos**: Ao vincular, o trigger busca a data do último `SAQUE_VIRTUAL` (marco de corte) e atribui `projeto_id_snapshot` a todos os registros com snapshot NULL criados APÓS esse corte:
   - Tipos adotados: `DEPOSITO`, `GANHO_CAMBIAL`, `PERDA_CAMBIAL`
   - Se a bookmaker é **virgem** (nunca teve SAQUE_VIRTUAL), TODOS os órfãos são adotados
   - Isso garante que depósitos feitos entre projetos (ou antes do primeiro projeto) sejam corretamente atribuídos
2. **Verificação de idempotência**: Ignora se já existe DEPOSITO_VIRTUAL para esta bookmaker+projeto nos últimos 30 segundos
3. **DEPOSITO_VIRTUAL = saldo_atual**: Cria baseline direta, sem cálculos de net flow
4. **data_transacao = CURRENT_DATE**: Data da vinculação (não dos depósitos antigos)

### Cenários cobertos

- **Bookmaker virgem**: Todos os depósitos e FX com snapshot NULL são adotados pelo primeiro projeto
- **Entre projetos**: Apenas depósitos/FX criados APÓS o último SAQUE_VIRTUAL são adotados
- **Depósitos de ciclos anteriores**: Permanecem com o snapshot original (protegidos pelo marco de corte)

### Resultado esperado
- FX de depósitos feitos antes do vínculo são corretamente atribuídos ao projeto
- FX de ciclos anteriores (antes do último SAQUE_VIRTUAL) NÃO são herdados
