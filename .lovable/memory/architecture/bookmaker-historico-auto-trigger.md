# Memory: architecture/bookmaker-historico-auto-trigger
Updated: 2026-03-12

## Trigger automático de histórico de vínculos

O trigger `tr_ensure_historico_on_projeto_change` no banco de dados garante que TODA mudança em `bookmakers.projeto_id` gera automaticamente um registro em `projeto_bookmaker_historico`.

### Cenários cobertos:
1. **NULL → projeto**: Insere novo registro com `data_vinculacao = NOW()`
2. **projeto → NULL**: Fecha registro existente com `data_desvinculacao = NOW()` (safety net, RPC `desvincular_bookmaker_atomico` já faz isso)
3. **projeto_A → projeto_B**: Fecha registro do projeto_A e insere novo para projeto_B

### Por que existe:
Antes, o histórico era criado apenas pela camada de aplicação (ContasDisponiveisModule, useProjetoVinculos). Se uma vinculação ocorresse por outro caminho (update direto, outra tela), o histórico não era registrado. O trigger é o safety net definitivo.

### Dados preenchidos automaticamente:
- `bookmaker_nome`, `parceiro_id`, `parceiro_nome` (do registro do bookmaker + parceiro)
- `tipo_projeto_snapshot` (do projeto sendo vinculado)
- Verifica duplicatas antes de inserir
