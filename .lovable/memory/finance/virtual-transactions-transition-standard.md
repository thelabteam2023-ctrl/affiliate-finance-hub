# Memory: finance/virtual-transactions-transition-standard
Updated: 2026-03-06

## Transações Virtuais (SAQUE_VIRTUAL / DEPOSITO_VIRTUAL)

O sistema utiliza os tipos 'SAQUE_VIRTUAL' e 'DEPOSITO_VIRTUAL' no ledger contábil para gerir a entrada e saída de capital durante o vínculo ou desvínculo de instâncias de bookmaker em projetos.

### Regras

1. **Cálculo Efetivo**: `SAQUE_VIRTUAL = saldo_atual - saques_pendentes + depositos_pendentes`
2. **Idempotência**: Proteção contra duplicidade (ignora transações virtuais idênticas em janelas de 10 segundos)
3. **Sem Supressão**: DEPOSITO_VIRTUAL é SEMPRE criado quando saldo > 0, mesmo em re-vinculação ao mesmo projeto. Supressão foi REMOVIDA por causar desbalanceamento no ledger.
4. **Validação de Retorno**: Ambas as funções agora verificam o retorno de `registrarSaqueVirtualViaLedger` e `registrarDepositoVirtualViaLedger`. Se o insert falhar, a operação é ABORTADA.
5. **Ordem Atômica**: Em `executeUnlink`, o SAQUE_VIRTUAL é criado ANTES de desvincular a bookmaker. Se o ledger falhar, a desvinculação NÃO ocorre.

### Gaps Corrigidos (2026-03-06)

- **Retorno não verificado**: `executeUnlink` e `executeLink` não verificavam o retorno das funções de ledger. Agora lançam exceção se o insert falhar.
- **Ordem invertida**: `executeUnlink` desvinculava ANTES de criar o SAQUE_VIRTUAL. Se o insert falhasse, a bookmaker ficava desvinculada sem registro contábil → lucro fantasma. Agora a ordem é: ledger → unlink.
- **Supressão em re-vínculo**: Removida. Causava SAQUE_VIRTUAL sem DEPOSITO_VIRTUAL correspondente, inflando lucro.
