# Plano — Taxonomia de Ajustes de Saldo (Operacional vs FX vs Extraordinário)

## 🎯 Objetivo
Corrigir o erro conceitual atual onde **todo `AJUSTE_SALDO` cai em "Ajustes & Extraordinários"**, ignorando que a maioria dos ajustes são **reconciliações operacionais** (centavos perdidos por arredondamento de odds, retornos fracionados, etc.). Resultado: o card "Indicadores Financeiros" deixa de divergir do KPI de Lucro da Visão Geral.

## ✅ Decisões aprovadas
- **Default**: novos e legados → `RECONCILIACAO_OPERACIONAL`
- **Taxonomia**: 3 categorias — `RECONCILIACAO_OPERACIONAL` · `EFEITO_FINANCEIRO` · `EXTRAORDINARIO`
- **Migração**: backfill de **todos os 99 ajustes confirmados existentes** com o default; reclassificação manual posterior pelo usuário no Extrato.

---

## 📦 Fase 1 — Migração de schema

**Migração SQL:**
1. `ALTER TABLE cash_ledger ADD COLUMN ajuste_natureza TEXT;`
2. `CHECK` constraint: valor IN (`RECONCILIACAO_OPERACIONAL`, `EFEITO_FINANCEIRO`, `EXTRAORDINARIO`) — só validado quando `tipo_transacao='AJUSTE_SALDO'`.
3. **Backfill** (UPDATE direto, parte da migração de schema, não dado solto):
   ```sql
   UPDATE cash_ledger
   SET ajuste_natureza = 'RECONCILIACAO_OPERACIONAL'
   WHERE tipo_transacao = 'AJUSTE_SALDO' AND ajuste_natureza IS NULL;
   ```
4. **Trigger** `fn_default_ajuste_natureza` (BEFORE INSERT em `cash_ledger`): se `tipo_transacao='AJUSTE_SALDO'` e `ajuste_natureza IS NULL` → set `'RECONCILIACAO_OPERACIONAL'`.
5. Index parcial: `CREATE INDEX idx_cash_ledger_ajuste_natureza ON cash_ledger(projeto_id_snapshot, ajuste_natureza) WHERE tipo_transacao='AJUSTE_SALDO';`

**Garantia anti-retrofix:** o backfill toca **apenas** `ajuste_natureza` (campo novo, sem efeito colateral). Não modifica `valor`, `direcao`, `status` ou qualquer trigger de saldo.

---

## 📊 Fase 2 — Recálculo dos KPIs em `FinancialMetricsPopover.tsx`

**Hook `fetchFinancialMetricsRaw`** (linha 115):
- Mudar SELECT de AJUSTE_SALDO para incluir `ajuste_natureza`.
- Continuar trazendo todos os ajustes confirmados (não filtrar por natureza no fetch).

**Memo de derivação** (linhas 752-761):
- Particionar `ajustes` em três buckets:
  - `ajustesOperacionais` = soma dos ajustes com `ajuste_natureza='RECONCILIACAO_OPERACIONAL'`
  - `ajustesFx` = soma com `ajuste_natureza='EFEITO_FINANCEIRO'`
  - `ajustesExtraord` = soma com `ajuste_natureza='EXTRAORDINARIO'`
- Recompor as 3 camadas:
  - `performancePura = lucroApostasPuro + creditosPerformance + ajustesOperacionais`
  - `efeitosFinanceiros = (ganhoFx − perdaFx) + ganhoConfirmacao + ajustesFx`
  - `ajustesExtraordinarios = ajustesExtraord − perdaOp` (mantém o nome do campo para minimizar refatoração de FinancialDrillDownModal/LucroProjetadoModal)
- `resultadoOperacionalTotal` permanece igual (soma dos 3) — **garantia matemática de zero dupla contagem**.

**UI (linhas 347, 481-499):**
- Renomear bloco laranja de "Ajustes & Extraordinários" → **"Extraordinários"** (sem "Ajustes" no nome).
- Atualizar tooltip: *"Incidentes operacionais (PERDA_OPERACIONAL) e ajustes contábeis sem vínculo operacional (estornos administrativos, correções de lançamento). Não é performance recorrente."*
- Bloco emerald (Performance Pura) ganha tooltip atualizado: *"Inclui lucro de apostas, créditos promocionais e **reconciliações operacionais** (ajustes que materializam imprecisão da operação — odds fracionadas, arredondamentos)."*

---

## 🏷️ Fase 3 — Reclassificação inline no Extrato

**`ExtratoProjetoTab.tsx`** (cards de transação tipo `AJUSTE_SALDO`):
- Adicionar **badge clicável** com a natureza atual:
  - 🔧 **Reconciliação Operacional** (cor emerald — default)
  - 💱 **Efeito Financeiro** (cor amber)
  - ⚠️ **Extraordinário** (cor orange)
- Clique abre `DropdownMenu` simples com as 3 opções; seleção dispara `UPDATE` direto via `supabase.from('cash_ledger').update({ ajuste_natureza: novo }).eq('id', ledgerId)`.
- Após sucesso: invalidar cache do extrato + cache canônico (`invalidateCanonicalCaches`) para Visão Geral atualizar.
- Tooltip do badge: explica o que cada natureza significa e o impacto no KPI.

**Permissão**: apenas `OWNER` e `ADMIN` do workspace podem reclassificar (RLS já garante). Operador vê o badge mas sem ação.

---

## 📝 Fase 4 — Tooltips de KPI da Visão Geral

Garantir que o KPI de **Lucro Operacional** na Visão Geral mostre tooltip:
> *"Inclui reconciliações operacionais (ajustes de saldo classificados como rounding/odds fracionadas). Para reclassificar um ajuste como puramente extraordinário, abra o Extrato do projeto."*

(Sem mudança de cálculo — o KPI canônico **já soma `AJUSTE_SALDO`**; é justamente por isso que ele convergirá automaticamente com o card de Indicadores Financeiros após a Fase 2.)

---

## 📚 Fase 5 — Memória

**`mem://finance/ajuste-saldo-natureza-classification-standard.md`** (novo):
- Define as 3 naturezas, regra de default, mapeamento natureza → bloco de KPI.
- Documenta que `RECONCILIACAO_OPERACIONAL` entra em **Performance Pura** (numerador de ROI).
- Documenta que apenas OWNER/ADMIN podem reclassificar.
- Cross-reference com `mem://finance/operational-performance-segregation-standard.md` (atualizar este último para refletir a inclusão de ajustes operacionais em Performance).

**`mem://index.md`**: adicionar entrada Core curta:
> *AJUSTE_SALDO classificado por `ajuste_natureza` (RECONCILIACAO_OPERACIONAL → Performance, EFEITO_FINANCEIRO → FX, EXTRAORDINARIO → fora de performance). Default: RECONCILIACAO_OPERACIONAL.*

---

## 🛡️ Garantias

| Risco | Mitigação |
|---|---|
| Dupla contagem | `resultadoOperacionalTotal` continua sendo soma das 3 camadas — particionamento puro |
| Quebra de KPI canônico | KPI da Visão Geral já soma todos AJUSTE_SALDO; nada muda nele |
| Migração legada incorreta | Default conservador (operacional) cobre 100% do cenário típico do usuário; reclassificação 1-clique no Extrato resolve exceções |
| Falha do trigger | Trigger é puramente defensivo (só seta default se NULL); zero impacto se já vier preenchido |
| Permissão indevida | RLS existente em `cash_ledger` UPDATE já restringe a OWNER/ADMIN |

---

## 📁 Arquivos tocados

1. **Migração SQL** (schema + backfill + trigger + index)
2. `src/components/projeto-detalhe/FinancialMetricsPopover.tsx` (fetch + memo + UI 3 blocos)
3. `src/components/projeto-detalhe/ExtratoProjetoTab.tsx` (badge clicável + dropdown reclassificação)
4. `src/integrations/supabase/types.ts` (auto-regen após migração)
5. `.lovable/memory/finance/ajuste-saldo-natureza-classification-standard.md` (novo)
6. `.lovable/memory/finance/operational-performance-segregation-standard.md` (atualizar — Performance agora inclui ajustes operacionais)
7. `.lovable/memory/index.md` (nova entrada Core)

---

**Aprovando este plano**, executo na ordem: migração → recompor KPIs → UI de reclassificação → memórias.
