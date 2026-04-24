---
name: ajuste-saldo-natureza-classification-standard
description: Classificação obrigatória de cada AJUSTE_SALDO via ajuste_natureza (RECONCILIACAO_OPERACIONAL default, EFEITO_FINANCEIRO ou EXTRAORDINARIO) que define em qual KPI o ajuste entra
type: feature
---
# Padrão: Natureza do Ajuste de Saldo

## Coluna canônica
`cash_ledger.ajuste_natureza TEXT` — preenchida apenas para `tipo_transacao='AJUSTE_SALDO'`.

## Taxonomia (3 valores permitidos)

| Natureza | Bloco de KPI | Significado |
|---|---|---|
| `RECONCILIACAO_OPERACIONAL` (**default**) | Performance Pura (numerador de ROI) | Centavos perdidos por arredondamento de odds, retornos fracionados (ex.: odd 2.001 retornando R$ 399,99 quando esperado R$ 400). É **parte da operação** — o operador acumula imprecisões e usa o ajuste para zerar a conta. |
| `EFEITO_FINANCEIRO` | Efeitos Financeiros (FX) | Ajustes causados por variação cambial residual ou diferenças de recebimento. Fora do controle do operador. |
| `EXTRAORDINARIO` | Extraordinários | Estornos administrativos, correções de lançamento ou eventos sem vínculo operacional. Fora da performance recorrente. |

## Garantias do banco

1. **CHECK constraint** `cash_ledger_ajuste_natureza_valid`: aceita apenas os 3 valores quando `tipo_transacao='AJUSTE_SALDO'`.
2. **Trigger BEFORE INSERT** `fn_default_ajuste_natureza`: se ajuste vier com `ajuste_natureza` NULL, set automático para `'RECONCILIACAO_OPERACIONAL'`.
3. **Backfill**: todos os AJUSTE_SALDO existentes foram classificados como `RECONCILIACAO_OPERACIONAL` na migração inicial.

## Regra fundamental

O default conservador (`RECONCILIACAO_OPERACIONAL`) reflete o cenário típico do usuário: a maioria dos ajustes são reconciliações da operação. **Nunca** alterar este default sem migração explícita — quebraria a paridade entre o KPI de Lucro Operacional canônico (que sempre somou todos os AJUSTE_SALDO) e o card de Indicadores Financeiros.

## UI de reclassificação

`ExtratoProjetoTab.tsx` renderiza o componente `AjusteNaturezaBadge` em cada card AJUSTE_SALDO. Clique abre dropdown com as 3 opções; UPDATE direto via supabase-js, protegido por RLS (apenas owner/admin do workspace). Após sucesso: invalida cache do extrato + financial metrics + canonical caches.

## Cross-reference

- `mem://finance/operational-performance-segregation-standard` — define como cada bucket entra nas 3 camadas de KPI.
- `mem://architecture/ajuste-saldo-trigger-fix-v1` — confirma que AJUSTE_SALDO gera financial_events corretamente.