# Arbitragem: trava de saldo à prova de falhas + fim da duplicidade em rascunhos

## O que foi confirmado na investigação

### Cenário 1 — Saldo insuficiente não bloqueia o registro

Duas falhas somadas, ambas confirmadas no código:

1. **Validação "fail-open"**: em `SurebetModalRoot.tsx`, o laço que compara o valor alocado com o saldo faz `const bookmaker = bookmakerSaldos.find(...); if (!bookmaker) continue;`. Se a casa não estiver na lista de saldos, a validação é **silenciosamente ignorada** e o botão continua habilitado.
2. **A lista de saldos exclui justamente as casas problemáticas**: `useBookmakerSaldosQuery` filtra `saldo_operavel > 0` (exceto a casa "atual"). Casas zeradas ou negativas somem da lista — e são exatamente essas que caem no `continue` acima. Isso é ainda mais provável quando o formulário é reidratado de um **rascunho** (o `bookmaker_id` volta do rascunho mesmo sem estar na lista atual).

Evidência no banco: existem várias contas "BORA JOGAR" com saldo negativo (`-0,84`, `-3,25`, `-9,54`), o que confirma que o overbetting vem acontecendo na prática.

3. **Backend sem trava alguma**: `criar_surebet_atomica_v3` insere pernas/entradas e chama `fn_sync_stake_event_v1` (que só lança o evento negativo no ledger). **Não há nenhuma verificação de saldo no servidor** — a UI é hoje a única barreira.

### Cenário 2 — Duplicidade a partir de rascunhos

O rascunho só é apagado em `SurebetWindowPage.tsx` quando a janela foi aberta via `?rascunhoId=` (`isFromRascunho`). Quando o usuário **cria/atualiza o rascunho dentro do próprio modal** (`rascunhoIdLocal`) e depois registra a operação, o rascunho **permanece na lista**. Reabrindo esse rascunho e registrando de novo, nasce uma segunda operação idêntica — com novos débitos no ledger (chaves de idempotência são por `entrada_id`, portanto não protegem contra reenvio).

## Correções propostas

### 1. Validação de saldo "fail-closed" (frontend)
- No modal, deixar de usar a lista filtrada para validar: carregar os saldos com `includeZeroBalance` para fins de validação, de modo que casas zeradas/negativas estejam sempre presentes.
- Trocar `if (!bookmaker) continue;` por bloqueio: casa sem saldo conhecido = **insuficiente** (marca a perna/entrada em vermelho e desabilita o registro), com mensagem clara.
- Garantir que a marcação visual cubra também **sub-entradas** (`additionalEntries`), inclusive quando a casa da sub-entrada difere da casa principal da perna.
- Aplicar a mesma regra no caminho alternativo `SurebetDialogTable.tsx` e na util compartilhada `surebetBalanceValidation.ts` (`validateBalance`), que hoje tem o mesmo `continue`.

### 2. Trava de saldo no servidor (rede de segurança)
- Em `criar_surebet_atomica_v3` e `editar_surebet_completa_v3`: antes de inserir eventos, agregar o capital comprometido por `bookmaker_id` (BACK = stake; LAY = stake × (odd−1); FREEBET no bucket de freebet), comparar com o saldo operável da casa (crédito das entradas originais no modo edição) e **abortar com mensagem explícita** quando exceder.
- Tolerância de 0,01 para arredondamento, coerente com o frontend.

### 3. Fim da duplicidade de rascunho
- Ao registrar com sucesso, apagar **sempre** o rascunho vinculado (`rascunhoIdEfetivo`, cobrindo tanto `rascunho?.id` quanto `rascunhoIdLocal`), não só quando veio por URL.
- Propagar o id do rascunho no evento de "salvo" para que a `SurebetWindowPage` também limpe o registro e a lista de rascunhos seja invalidada.
- Guarda anti-reenvio: bloquear cliques concorrentes em "Registrar" enquanto a RPC está em voo e limpar o estado do formulário após sucesso.

## Detalhes técnicos

Arquivos afetados:
- `src/components/surebet/SurebetModalRoot.tsx` (memo `balanceValidation`, `calcularSaldoDisponivel`, `handleSalvarRascunho`, pós-save)
- `src/components/projeto-detalhe/SurebetDialogTable.tsx`
- `src/utils/surebetBalanceValidation.ts`
- `src/hooks/useBookmakerSaldosQuery.ts` (uso de `includeZeroBalance` no contexto de validação)
- `src/pages/SurebetWindowPage.tsx`
- Migração: `criar_surebet_atomica_v3` e `editar_surebet_completa_v3` com validação agregada de saldo

Fora de escopo: alterar saldos existentes ou corrigir retroativamente as contas já negativas (política anti-retrofix). Se desejado, isso vira uma etapa separada de ajuste auditável.
