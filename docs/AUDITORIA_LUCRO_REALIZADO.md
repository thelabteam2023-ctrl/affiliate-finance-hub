# Auditoria Forense — KPI Lucro/Prejuízo Realizado (Saques × Depósitos × Eventos × Saldos)

Escopo: dados reais do banco (somente leitura na fase de diagnóstico). Nenhum registro histórico
foi alterado. As correções aplicadas são de **leitura/interpretação** do ledger, não de dados.

---

## 1. Fórmula auditada

`fetchProjetosLucroCanonico.ts` (SSOT do KPI):

```
Lucro Realizado = Σ Saques efetivos − Σ Depósitos efetivos
  Saques    : tipo_transacao IN (SAQUE, SAQUE_VIRTUAL), status=CONFIRMADO, reversed_at IS NULL
  Depósitos : DEPOSITO  +  DEPOSITO_VIRTUAL com origem_tipo='MIGRACAO'
  Filtro    : projeto_id_snapshot ∈ projetos do escopo
```

`financial_events` **não possui** coluna de ligação com `cash_ledger`
(colunas reais: id, bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor,
moeda, idempotency_key, reversed_event_id, descricao, metadata, processed_at, created_at,
created_by, event_scope, allow_negative). Logo, o KPI é derivado **direto do ledger** — a
reconciliação evento↔ledger só é possível por bookmaker/valor, não por chave.

---

## 2. Achado CRÍTICO — dupla semântica de `valor_confirmado`

`valor_confirmado` significa duas coisas diferentes:

| Tipo de moeda | Significado real de `valor_confirmado` |
|---|---|
| FIAT   | valor financeiro recebido após taxas (mesma moeda de `valor`) |
| CRYPTO | **quantidade do ativo** recebida (0.0337 ETH, 327 USDT…) — não é valor financeiro |

Todos os consumidores do KPI usavam `valor_confirmado ?? valor` sem distinguir o caso cripto.
Resultado: saques cripto entram no KPI pelo número de moedas, não pelo valor.

Exemplos reais (CONFIRMADO, não revertido):

| Ledger ID | Projeto | Data | Moeda | `valor` | `valor_confirmado` | Casa |
|---|---|---|---|---|---|---|
| 812509ee | BONUS FÊNIX | 2026-04-10 | USDT | 8.204,20 | 327,02 | SMAN365 |
| ca375091 | BONUS FÊNIX | 2026-04-08 | ETH | 5.642,61 | 0,0967 | MONSTERWIN |
| 2b3a5fc2 | SUREBET LIVE | 2026-04-20 | BRL(crypto) | 3.272,64 | 656,45 | SMAN365 |
| 3109e50e | ITALO - BROCKER THIAGO | 2026-08-15 | USD | 2.169,00 | 0,0337 | EVERYGAME |
| 057b0998 | BÔNUS MAIO | 2026-06-12 | USD | 1.998,00 | 0,0305 | EVERYGAME |
| 5e1c8b92 | ( MARCIO) | 2026-08-20 | USD | 1.436,00 | 0,0178 | EVERYGAME |
| 32353542 | BÔNUS MAIO | 2026-05-25 | MYR | 1.736,00 | 437,41 | 12BET |

Universo: 402 saques confirmados não revertidos → 103 sem `valor_confirmado`, **161 divergentes**,
delta agregado ≈ **−27.394,87** (moedas nativas somadas), concentrado em cripto.

### Impacto por projeto (moeda nativa, saques divergentes)

| Workspace | Projeto | Moeda | n | KPI antes | KPI corrigido | Δ |
|---|---|---|---|---|---|---|
| LABBET CONSULTORIA | BONUS FÊNIX | USDT | 2 | 727,05 | 8.604,23 | +7.877,18 |
| LABBET CONSULTORIA | BONUS FÊNIX | ETH | 1 | 0,10 | 5.642,61 | +5.642,52 |
| LABBET CONSULTORIA | BONUS FÊNIX | USD | 26 | 10.945,23 | 14.495,16 | +3.549,93 |
| LABBET CONSULTORIA | SUREBET LIVE | BRL | 1 | 656,45 | 3.272,64 | +2.616,19 |
| LABBET CONSULTORIA | BÔNUS MAIO | USD | 59 | 17.179,47 | 19.645,67 | +2.466,20 |
| TIAGO 🍀 | ITALO - BROCKER THIAGO | USD | 6 | 1.183,37 | 3.356,89 | +2.173,52 |
| ANDRÉ 🍀 | ( MARCIO) | USD | 8 | 3.307,22 | 4.748,46 | +1.441,24 |
| LABBET CONSULTORIA | BÔNUS MAIO | MYR | 1 | 437,41 | 1.736,00 | +1.298,59 |
| LABBET CONSULTORIA | BONUS FÊNIX | BRL | 1 | 308,32 | 1.540,02 | +1.231,70 |
| LABBET CONSULTORIA | LUIZ FELIPE | ETH | 1 | 0,25 | 500,00 | +499,75 |
| LABBET CONSULTORIA | BONUS FÊNIX | LTC | 1 | 5,87 | 324,00 | +318,13 |
| LABBET CONSULTORIA | LUIZ FELIPE II | USDC | 1 | 1.391,78 | 1.062,06 | −329,72 |
| LABBET | ITALO | EUR | 5 | 2.691,03 | 2.386,00 | −305,03 |
| LABBET CONSULTORIA | BONUS FÊNIX | EUR | 2 | 1.680,24 | 1.439,00 | −241,24 |
| ANDRÉ 🍀 | ( MARCIO) | EUR | 4 | 1.642,19 | 1.425,65 | −216,54 |
| TIAGO 🍀 | ITALO - BROCKER THIAGO | EUR | 5 | 1.374,89 | 1.191,63 | −183,26 |
| … demais linhas | | | | | | < |100| |

Distribuição temporal dos saques cripto divergentes: fev/26 (16), mar (11), abr (30), mai (48),
jun (17), jul (9), ago (25) — o problema é **estrutural e contínuo**, não um evento pontual.

### Divergência entre telas (mesma nomenclatura, conceitos diferentes)

- `FinancialMetricsPopover` e `ProjetoFinancialMetricsCard` já excluíam cripto **apenas** no
  "ganho de confirmação", mas somavam o total de saques com `valor_confirmado ?? valor`.
- `fetchProjetosLucroCanonico`, `calcularMetricasPeriodo`, `FinancialMetricsService`,
  `FinancialSummaryCompact`, `useFinanceiroMensal`, `usePosicaoCapital`,
  `useProjetoRecuperacaoCapital` e `FinancialDrillDownModal` não faziam distinção alguma.

Isso explica KPIs "quase iguais" com drift entre Visão Geral, Extrato e Indicadores Financeiros.

---

## 3. Achado — movimentações sem `projeto_id_snapshot`

Confirmadas, não revertidas, invisíveis para qualquer KPI de projeto:

| Workspace | Tipo | n | Total (nativo) | Período |
|---|---|---|---|---|
| LABBET CONSULTORIA | DEPOSITO | 51 | 43.220,05 | 02/01 → 23/04 |
| LABBET CONSULTORIA | SAQUE | 29 | 64.157,56 | 04/01 → 08/07 |
| LABBET CONSULTORIA | SAQUE_VIRTUAL | 28 | 31.586,49 | 30/04 → 23/06 |
| LABBET CONSULTORIA | DEPOSITO_VIRTUAL | 25 | 23.524,75 | 07/04 → 14/04 |
| LABBET | DEPOSITO | 3 | 2.612,00 | 24/06 → 26/07 |
| LABBET ONE | DEPOSITO | 1 | 500,00 | 24/04 |
| LABBET | SAQUE | 1 | 550,00 | 30/07 |

Todas anteriores a agosto/2026 (movimentações recentes já nascem com snapshot). **Nenhum backfill
foi executado**: atribuir projeto retroativamente altera histórico e viola a política
anti-retrofix. Recomendação: backfill manual, caso a caso, só onde houver vínculo comprovável
casa↔projeto na data.

---

## 4. Achado — assimetria virtual (verificado, sem correção necessária)

- `DEPOSITO_VIRTUAL`: 62 BASELINE, 42 MIGRACAO, **4 com `origem_tipo` NULL**.
  Os 4 NULL (workspace LABBET ONE, projeto "PROJETO 2", 21/06, R$ 1.000 cada) têm descrição
  *"Saldo existente incorporado ao projeto na vinculação"* → são BASELINE de fato. A exclusão
  atual está **correta**; a regra `origem_tipo IS NULL ⇒ BASELINE` foi confirmada empiricamente.
- `SAQUE_VIRTUAL`: 82 registros, todos de migração — não há baseline a excluir do lado do saque.
  A assimetria aparente é semântica, não um bug de contagem.

---

## 5. Dupla contabilização

Reversões usam espelho `AJUSTE_RECONCILIACAO` + `reversed_at` na linha original. Como todos os
consumidores auditados filtram `reversed_at IS NULL` e o espelho não está na lista de tipos
somados, **não há dupla contagem** nesse eixo. Nenhum par duplicado (mesma casa/valor/data com
duas linhas ativas) foi encontrado entre os saques divergentes.

---

## 6. Correção aplicada (fase 2)

Novo SSOT: `src/lib/ledger/valorEfetivoSaque.ts`

```
valorEfetivoSaque(row) = CRYPTO ? valor : (valor_confirmado ?? valor)
ganhoConfirmacaoSaque(row) = CRYPTO ? 0 : (valor_confirmado − valor)   // |Δ| ≥ 0,01
```

Consumidores migrados (todos passaram a incluir `tipo_moeda` na projeção quando faltava):

- `src/services/fetchProjetosLucroCanonico.ts` (KPI canônico)
- `src/services/calcularMetricasPeriodo.ts`
- `src/services/FinancialMetricsService.ts`
- `src/hooks/useFinanceiroData.ts` / `useFinanceiroMensal.ts`
- `src/hooks/usePosicaoCapital.ts`
- `src/hooks/useProjetoRecuperacaoCapital.ts`
- `src/hooks/useProjetoDashboardData.ts` (tipo `RawSaque`)
- `src/components/projeto-detalhe/FinancialSummaryCompact.tsx`
- `src/components/projeto-detalhe/FinancialMetricsPopover.tsx`
- `src/components/projeto-detalhe/ProjetoFinancialMetricsCard.tsx`
- `src/components/projeto-detalhe/FinancialDrillDownModal.tsx`

Nada foi alterado no banco: nenhum UPDATE, DELETE ou migração de dados.

---

## 7. Validação

- Typecheck completo (`tsgo --noEmit -p tsconfig.app.json`): sem erros.
- Todos os caminhos de saque passam agora pelo mesmo helper → paridade garantida entre
  Visão Geral, Indicadores Financeiros, Extrato, Drill-down, Recuperação de Capital, Fluxo
  Mensal e Posição de Capital.
- Saques FIAT mantêm comportamento anterior (`valor_confirmado`), incluindo os 5 casos BRL FIAT
  com taxa (valor 30.898,88 → confirmado 31.118,62).
- Reversões, idempotência e triggers não foram tocados.

## 8. Pendências recomendadas (não executadas)

1. Backfill seletivo de `projeto_id_snapshot` nas 137 movimentações órfãs — exige validação
   humana caso a caso.
2. Persistir `valor_usd_referencia` em saques cripto antigos (hoje só recentes têm), permitindo
   avaliação histórica sem depender de cotação atual.
3. Renomear no schema `valor_confirmado` → dois campos distintos (`valor_recebido_fiat` e
   `quantidade_recebida_ativo`) para eliminar a ambiguidade na origem.
