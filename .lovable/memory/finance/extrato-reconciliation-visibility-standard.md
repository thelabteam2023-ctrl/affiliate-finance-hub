---
name: Extrato Reconciliation Visibility Standard
description: Reconciliações automáticas (SV/DV canceladas pelo motor — revínculo neutralizado, baseline duplicado) ficam ocultas por padrão no Extrato do Projeto, com toggle "Mostrar reconciliações" (persistido por workspace) que as revela com badge âmbar e tooltip; KPIs nunca contam essas linhas
type: feature
---

## Princípio
"O que sai do KPI deve permanecer auditável." Transações virtuais (SV/DV) que o motor financeiro neutraliza automaticamente NÃO podem desaparecer do extrato — devem ficar disponíveis para auditoria com sinalização visual clara, sem poluir a visão padrão.

## Escopo (audit_class derivado em `useProjetoExtrato`)

| Classe | Origem | Visualização default | Conta em KPI? |
|---|---|---|---|
| `EFFECTIVE` | qualquer transação confirmada normal | visível | sim |
| `BASELINE_EXCLUDED` | DV CONFIRMADO com `origem_tipo='BASELINE'` ou NULL | visível, badge azul "📥 Saldo inicial · não contabilizado" | não |
| `RECONCILED_PHANTOM` | SV CANCELADO com `auditoria_metadata.cancelled_reason='ping_pong_neutralized_by_usage'` | OCULTA por default | não |
| `RECONCILED_DUPLICATE` | DV CANCELADO com `auditoria_metadata.origem_tipo='BASELINE'` ou `cancelled_reason='phantom_link_unused'` | OCULTA por default | não |
| `RECONCILED_OTHER` | qualquer outro SV/DV CANCELADO | OCULTA por default | não |

Cancelados que NÃO sejam SV/DV (DEPOSITO, SAQUE, AJUSTE, etc. cancelados) continuam excluídos da query — não fazem parte do escopo de "reconciliação automática".

## Query (filtro condicional no Supabase)
```ts
.or("status.neq.CANCELADO,tipo_transacao.in.(SAQUE_VIRTUAL,DEPOSITO_VIRTUAL)")
```

## Toggle UI
- Estado: `showReconciled: boolean`, default `false`.
- Persistência: `localStorage` chave `extrato:show-reconciled:${workspaceId}`.
- Header de filtros mostra:
  - OFF + count > 0: chip âmbar discreto `"🔁 N reconciliação(ões) oculta(s)"` (clique liga).
  - ON: botão `"Ocultar reconciliações"`.

## Render do card reconciliado
- `opacity-60` + `border-dashed border-amber-500/30` no Card.
- Valor com `line-through` e cor neutra (não verde/vermelho).
- Badge âmbar substitui o badge de status, com tooltip:
  - PHANTOM: "Reconciliada (revínculo)" — neutralizada porque a casa foi desvinculada e revinculada ao mesmo projeto sem operações entre.
  - DUPLICATE: "Baseline limpo (duplicava depósito)" — saldo inicial cancelado pelo motor.
  - OTHER: "Cancelada".
- Tooltip sempre informa: "NÃO entra em Saques / Depósitos / Resultado de Caixa".

## Labels canônicos para virtuais
- `DEPOSITO_VIRTUAL` com `origem_tipo='MIGRACAO'` → "Saldo migrado de outro projeto"
- `DEPOSITO_VIRTUAL` BASELINE → "Saldo inicial da vinculação"
- `SAQUE_VIRTUAL` → "Saldo transferido (desvinculação)"

## Garantias
- KPIs do Extrato (Depósitos, Saques, Extras, Resultado de Caixa) usam apenas `status='CONFIRMADO'` com classificação BASELINE/MIGRACAO no hook `useProjetoExtrato.metricsQuery`. O toggle é puramente visual no `historyQuery`.
- Tooltips dos KPIs Depósitos e Saques explicitam que reconciliações automáticas não entram e indicam o toggle como caminho de auditoria.
- Isolamento por workspace preservado (query continua com `projeto_id_snapshot`).

## Arquivo
`src/components/projeto-detalhe/ExtratoProjetoTab.tsx` — único ponto de implementação (hook + UI + render).