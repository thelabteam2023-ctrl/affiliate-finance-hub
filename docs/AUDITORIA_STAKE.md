# Auditoria — Divergência de Stake (Todas as Apostas × Bônus)

## Causa raiz

`SurebetCard.tsx` calculava `stakeRealTotal` com a **prioridade invertida**
para surebets multi-moeda:

```
// ANTES (bug)
stakeConsolidadoFallback     // recomputa em runtime com Cotação de Trabalho VIVA
 → surebet.stake_consolidado // snapshot congelado no banco
  → surebet.stake_total
```

O fallback usava `convertToConsolidation(stake, moeda)` (Cotação de Trabalho
corrente do projeto), enquanto o snapshot `stake_consolidado` gravado no banco
foi congelado com `cotacao_snapshot` por perna. Sempre que a Cotação de
Trabalho drifta em relação ao snapshot original, o card passa a exibir stake
diferente do gravado — e divergente do lucro/ROI, que continuam vindo dos
snapshots imutáveis (`lucro_realizado`, `roi_realizado`).

`ApostaCard.tsx` já respeitava a ordem correta
(`stake_consolidado (DB) → fallback → stake_total`), por isso apostas simples
ficaram corretas e apenas os cards de surebet exibiam divergência — inclusive
na aba Bônus quando o surebet era multi-moeda.

Padrão canônico: memória
[Analytics Snapshot Conversion Hierarchy](mem://finance/analytics-snapshot-conversion-hierarchy).

## Evidência — BELGRANO x ROSARIO (`4603a29a-…`)

| Perna | Moeda | Stake | `cotacao_snapshot` | `stake_brl_referencia` |
| ----- | ----- | ----- | ------------------ | ---------------------- |
| 1 | BRL | 759,00 | — | 759,00 |
| 2 | USD | 144,28 | 5,102 | 736,12 |
| 3 | USD | 111,00 | 5,102 | 566,32 |

- `stake_consolidado` (DB) = **1014,28 USD** (registro gravado com soma naive —
  única ocorrência sistêmica em 771 surebets liquidadas multi-moeda).
- Recomputo correto via snapshot: 759 / 5,102 + 144,28 + 111 ≈ **404,05 USD**.
- Card exibia `$ 404,07` de stake e `$ 943,94 (+93,1 %)` de lucro. O ROI só
  fecha com stake = 1014,28 (943,94 / 1014,28 = 93,06 %). Portanto o card
  convivia com dois valores diferentes de stake ao mesmo tempo.

Consulta de escopo:

```sql
WITH sums AS (
  SELECT au.id, au.stake_consolidado,
         SUM(ap.stake_brl_referencia) AS soma_brl,
         MAX(ap.cotacao_snapshot) AS max_cot
  FROM apostas_unificada au
  JOIN apostas_pernas ap ON ap.aposta_id = au.id
  WHERE au.forma_registro='ARBITRAGEM' AND au.status='LIQUIDADA'
    AND au.stake_consolidado IS NOT NULL
  GROUP BY au.id, au.stake_consolidado
  HAVING COUNT(DISTINCT ap.moeda) > 1
)
SELECT COUNT(*) FROM sums
WHERE ABS(stake_consolidado - soma_brl / NULLIF(max_cot,0)) > 1;
-- 1 registro com naive-sum no snapshot histórico.
```

Todos os outros 770 têm `stake_consolidado` correto no banco — logo o bug
estava no consumo, não na gravação.

## Correção aplicada

`src/components/projeto-detalhe/SurebetCard.tsx`

1. Prioridade correta em `stakeRealTotal`:
   `surebet.stake_consolidado` (snapshot DB) → `stakeConsolidadoFallback` →
   `surebet.stake_total`.
2. `stakeConsolidadoFallback` reescrito para usar `convertPernaToConsolidacao`
   (snapshot da perna → Cotação de Trabalho → live), em conformidade com a
   memória de arquitetura.
3. Instrumentação: sempre que o fallback divergir do snapshot em mais de
   R$ 0,01, é emitido `stakeTraceLog` com origem, delta, moeda e id da aposta.

## Observabilidade

`src/lib/debug/stakeTraceLogger.ts` — ativação opt-in:

- `localStorage.setItem('stake-trace', '1')`
- ou querystring `?debug=stake`

Emite `console.warn("[stake-trace]", …)` e mantém buffer circular
`window.__stakeTraceBuffer` (últimos 500 eventos) para inspeção manual.

## Testes

`src/lib/__tests__/stakeParity.test.ts` — 4 cenários (snapshot BRL→USD,
USD→USD, fallback sem snapshot e o cenário real BELGRANO). Todos passam.

## Impacto

- Cards de surebet multi-moeda voltam a exibir stake idêntico ao do banco.
- Zero mudança em dados/snapshots.
- Zero migração de banco / RPC / trigger.

## Riscos residuais

- O registro `4603a29a-…` continua com `stake_consolidado` e `lucro_realizado`
  gravados com fórmula naive. Correção segura requer reprocessamento pontual
  do snapshot (via `atualizar_aposta_liquidada_atomica_v2` ou ajuste manual).
  **Aguardando aprovação** antes de aplicar — o padrão anti-retrofix da
  memória impede correção em massa.
- Observabilidade é temporária, remover após validação em produção.

## Recomendações

1. Estender a hierarquia snapshot → trabalho → live a qualquer novo componente
   que iterar pernas (adicionar ao checklist de code review).
2. Investigar o caminho da RPC que gerou `stake_consolidado = 1014,28` para
   BELGRANO — provavelmente um edge case legado não coberto por
   `fn_recalc_pai_surebet`.
3. Manter `stakeParity.test.ts` como guardrail permanente.
