---
name: lucro-realizado-metrica-primaria-standard
description: Lucro Realizado (Saques − Depósitos) é a métrica primária da Visão Financeira; Lucro Operacional fica como apoio teórico
type: feature
---

# Memory: finance/lucro-realizado-metrica-primaria-standard

## Decisão

Na **Visão Financeira** (cards kanban de projeto, header `FinancialSummaryCompact`, dashboards de workspace), o **Lucro Realizado** é a métrica de destaque (hero, número grande). O **Lucro Operacional** continua exibido como **métrica secundária** (subtexto/badge), rotulada como "teórico", porque inclui valores ainda presos em saldo de casa, pendentes de saque ou em trânsito — não representa dinheiro efetivamente retornado.

## Fórmulas (inalteradas)

- **Lucro Realizado** = `(SAQUE + SAQUE_VIRTUAL) − (DEPOSITO + DEPOSITO_VIRTUAL[MIGRACAO])` em `cash_ledger` `status=CONFIRMADO`, convertido com `convertOficial` do projeto.
  - Fonte única: `fetchProjetosLucroCanonico().lucroRealizado` (paridade absoluta com `ProjetoFinancialMetricsCard.fluxoLiquidoAjustado`).
- **Lucro Operacional** = engine canônica `calcularLucroCanonicoFromRpc` / RPC `get_projetos_lucro_operacional` (apostas + cashback + giros + bônus − perdas + ajustes + cambial + promocionais).

## Hierarquia visual obrigatória

| Tela | Hero (grande) | Secundário (menor) |
|---|---|---|
| `ProjetoKanbanCard` | Lucro Realizado | Lucro Operacional (teórico) |
| `FinancialSummaryCompact` | Lucro/Prejuízo Realizado + ROI | Lucro do período (operacional) |
| `FinancialMetricsPopover` | Realizado → Potencial → Operacional | — |

## Regras

- **Proibido** inverter a hierarquia (Operacional como hero na Visão Financeira).
- **Não remover** Operacional — ele é a métrica primária da camada de **Performance** (Apostas, Bônus, Ciclos com `metrica_lucro_ciclo='operacional'`).
- Todo rótulo "Lucro Realizado" deve ter tooltip "Dinheiro que efetivamente retornou ao caixa: Saques − Depósitos".
- Todo rótulo "Lucro Operacional" exibido na Visão Financeira deve indicar "(teórico)" e ter tooltip explicando que inclui saldo ainda preso em casa.
- Configuração por projeto `projetos.metrica_lucro_ciclo` continua valendo para ciclos.

## Arquivos
- `src/components/projetos/kanban/ProjetoKanbanCard.tsx` — Realizado é hero; Operacional secundário.
- `src/components/projeto-detalhe/FinancialSummaryCompact.tsx` — rótulo "Lucro Realizado" + tooltip.
- `src/services/fetchProjetosLucroCanonico.ts` — retorna ambos (`consolidado` = operacional, `lucroRealizado`).