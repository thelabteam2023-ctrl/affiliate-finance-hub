---
name: phantom-link-baseline-neutralization
description: Vínculos sem uso real são neutralizados retroativamente cancelando o DEPOSITO_VIRTUAL ao desvincular, evitando inflação de KPIs financeiros
type: finance
---

# Neutralização de Vínculo Fantasma (DEPOSITO_VIRTUAL)

## Decisão arquitetural (2026-04-17)

Quando uma bookmaker é vinculada a um projeto por engano e desvinculada **sem uso real**, a RPC `desvincular_bookmaker_atomico` **cancela retroativamente o `DEPOSITO_VIRTUAL` baseline** (status='CANCELADO') em vez de criar um `SAQUE_VIRTUAL` simétrico.

Isso evita que o ciclo "vincular + desvincular" infle simultaneamente os volumes de Depósitos e Saques do projeto, distorcendo KPIs como Total Depositado, Capital Investido, Capital Médio e ROI.

## Critério canônico de "casa utilizada no projeto"

Qualquer um dos seguintes basta para impedir a neutralização:

1. **Apostas**: existe `apostas_unificada` ou `apostas_pernas` com `bookmaker_id` da casa e `projeto_id` do projeto
2. **Ledger real**: existe `cash_ledger` com `projeto_id_snapshot` do projeto, casa como origem/destino, em tipo `DEPOSITO|SAQUE|CONVERSAO|GANHO_CAMBIAL|PERDA_CAMBIAL|AJUSTE|TRANSFERENCIA`, status `CONFIRMADO|PENDENTE`, criado **após** o `created_at` do DV baseline
3. **Bônus**: existe `project_bookmaker_link_bonuses` ativo (status ≠ 'cancelled')
4. **Freebet**: existe `freebets_recebidas` para casa+projeto
5. **Ocorrência**: existe `ocorrencias` para casa+projeto

## Salvaguardas anti-falso-positivo

A neutralização só ocorre quando **TODAS** as condições são satisfeitas:

- DV baseline existe (`tipo_transacao=DEPOSITO_VIRTUAL`, `status=CONFIRMADO`, casa+projeto)
- Casa NÃO foi utilizada (zero evidências)
- `|saldo_virtual_efetivo - DV.valor| < 0.02` → saldo não divergiu por FX/ajuste/depósito intermediário
- NÃO é conta de investidor (`is_investor_account = false`)

Caso contrário, mantém o comportamento original (cria `SAQUE_VIRTUAL`).

## Auditoria

O DV cancelado preserva `auditoria_metadata` com:
```json
{
  "cancelled_at": "...",
  "cancelled_reason": "phantom_link_unused",
  "cancelled_by_rpc": "desvincular_bookmaker_atomico",
  "cancelled_user_id": "...",
  "projeto_id": "..."
}
```

Nada é deletado fisicamente. Views agregadoras de KPI devem filtrar `status IN ('CONFIRMADO','PENDENTE')` para excluir cancelados.

## Resposta da RPC

A RPC retorna `phantom_link_neutralized: true|false` e `usage_evidence` com a contagem de cada critério, permitindo debug e relatórios de auditoria.

## TODO simétrico

A mesma lógica deve ser aplicada ao `SAQUE_VIRTUAL` em ciclos onde houve apenas saída sem operação (caso futuro identificado pelo usuário).
