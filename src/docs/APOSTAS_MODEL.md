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

## Regras de Negócio

1. **TODA aposta deve aparecer na listagem geral**
2. **Contexto ou estratégia NUNCA ocultam apostas**
3. **Saldo é derivado e recalculável**
4. **FreeBet é um modificador, não um tipo separado**
