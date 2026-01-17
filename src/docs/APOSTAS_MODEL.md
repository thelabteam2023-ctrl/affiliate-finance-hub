# Modelo de Dados de Apostas

## Visão Geral

A tabela `apostas_unificada` é a entidade central para todas as apostas do sistema.

## Campos Chave

### forma_registro
Define a estrutura da aposta:
- `SIMPLES` - Aposta única em um evento
- `MULTIPLA` - Aposta combinada (acumulador)
- `ARBITRAGEM` - Operação de arbitragem com múltiplas pernas

### estrategia
Define a estratégia operacional:
- `SUREBET` - Arbitragem entre casas
- `VALUEBET` - Aposta de valor
- `DUPLO_GREEN` - Estratégia de duplo green
- `COBERTURA_LAY` - Cobertura com Lay em exchange
- `EXCHANGE_BACK` - Back em exchange
- `EXCHANGE_LAY` - Lay em exchange
- `EXTRACAO_FREEBET` - Extração de freebet
- `EXTRACAO_BONUS` - Extração de bônus
- `QUALIFICADORA` - Aposta qualificadora (gera freebet)
- `PUNTER` - Aposta convencional

### contexto_operacional
Define a origem do saldo usado:
- `NORMAL` - Saldo real da casa
- `FREEBET` - Usando saldo de freebet
- `BONUS` - Usando saldo de bônus

## Relações

### Apostas SUREBET
- Cada perna de uma surebet é registrada como `forma_registro = SIMPLES` + `estrategia = SUREBET`
- As pernas são ligadas pelo mesmo evento/data
- **NÃO são excluídas da listagem geral** - aparecem com badge SB

### Apostas FREEBET
- Apostas que USAM freebet: `contexto_operacional = FREEBET` ou `tipo_freebet` preenchido
- Apostas que GERAM freebet: `gerou_freebet = true` + `valor_freebet_gerada`

## Fluxo de Saldo

### Na criação da aposta:
1. Aposta PENDENTE: stake é reservada (saldo_disponivel diminui)
2. Aposta LIQUIDADA na criação: `updateBookmakerBalance` é chamado

### Na liquidação (ResultadoPill):
1. Calcula lucro/prejuízo baseado no resultado
2. Chama `updateBookmakerBalance(bookmakerId, delta, projetoId)`
3. O helper verifica se há bônus ativo e aplica no lugar correto

### Reversão:
1. Resultado anterior é revertido
2. Novo resultado é aplicado
3. Delta = novoAjuste - antigoAjuste

## Regras de Negócio (OBRIGATÓRIAS)

### Regras Absolutas - O sistema NUNCA pode violar:

1. **TODA aposta registrada DEVE aparecer na listagem geral**
   - Independente de `estrategia`, `contexto_operacional`, ou qualquer outro campo
   - Filtros excludentes por estratégia são PROIBIDOS na query principal

2. **Contexto ou estratégia NUNCA ocultam apostas**
   - `estrategia` é apenas classificação/agrupamento
   - `contexto_operacional` é apenas origem do saldo
   - Nenhum desses campos pode ser gate de persistência ou visibilidade

3. **Saldo é DERIVADO e RECALCULÁVEL**
   - `saldo_atual` = depósitos - saques + transferências ± lucro_apostas
   - Função `recalcular_saldo_bookmaker()` sempre pode reconstruir o saldo
   - Usa tabela normalizada `apostas_pernas` (não mais JSONB)
   - Auditoria completa em `bookmaker_balance_audit`

4. **Pernas são NORMALIZADAS (tabela apostas_pernas)**
   - Todas as pernas de apostas multi-bookmaker estão em `apostas_pernas`
   - Índice por `bookmaker_id` para queries eficientes
   - Não depende de filtro por estratégia
   - Dual-write: JSONB ainda mantido por compatibilidade durante transição

4. **FreeBet é um MODIFICADOR, não um tipo separado**
   - Aposta com freebet = aposta normal + `contexto_operacional = FREEBET`
   - Não existe tabela separada para apostas de freebet

5. **Card de aposta DEVE mostrar informações completas**
   - Casa(s) utilizada(s)
   - Tipo de aposta / estratégia
   - Stake e Odd
   - Status / Resultado
   - Data
   - Parceiro/Vínculo (quando aplicável)

6. **Aposta é ENTIDADE PRIMÁRIA**
   - Estratégia é atributo, não entidade
   - Aposta existe independente de estratégia definida
   - Estratégia pode ser `null` e aposta continua válida

## Diagnóstico de Problemas Comuns

### Aposta não aparece na listagem
1. Verificar `cancelled_at` - deve ser `NULL`
2. Verificar `projeto_id` - deve corresponder ao projeto atual
3. Verificar `forma_registro` - deve ser `SIMPLES`, `MULTIPLA`, ou `ARBITRAGEM`
4. **NÃO verificar estrategia** - ela nunca deve filtrar

### Saldo incorreto
1. Executar `SELECT * FROM recalcular_saldo_bookmaker('UUID')`
2. Comparar `saldo_anterior` com `saldo_calculado`
3. Se diferente, executar com `p_aplicar = TRUE` para corrigir

### Card sem nome da casa
1. Verificar se `bookmaker_id` está preenchido
2. Verificar se query faz JOIN com tabela `bookmakers`
3. Verificar se `bookmaker.nome` está sendo passado para o componente
