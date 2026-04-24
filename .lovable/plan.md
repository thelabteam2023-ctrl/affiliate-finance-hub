
# Visibilidade de Reconciliações no Extrato do Projeto

## Objetivo
Tornar auditável no Extrato as transações virtuais (SV/DV) que foram **canceladas/neutralizadas** automaticamente pelo sistema (revínculos da mesma casa ao mesmo projeto, baselines duplicados, limpezas) — **sem alterar KPIs**, que continuam excluindo essas linhas corretamente.

## Decisões aprovadas
- **Toggle default**: DESLIGADO (extrato limpo). Aparece chip discreto `"🔁 N reconciliações ocultas"` para ligar com 1 clique. Preferência persistida em `localStorage` por workspace.
- **Escopo**: Todas as SV/DV canceladas (phantom-link + baselines duplicados + limpezas), com badge diferenciado por motivo.
- **Agrupamento Ciclo (Fase 2)**: Adiado. Linhas individuais com badge claro são suficientes nesta iteração.

---

## Mudanças

### 1. `src/components/projeto-detalhe/ExtratoProjetoTab.tsx` — Hook `useProjetoExtrato`
- Incluir `auditoria_metadata` no SELECT do `cash_ledger`.
- Substituir o filtro atual `.not("status", "eq", "CANCELADO")` por filtro condicional: cancelados são ocultados **exceto** quando `tipo_transacao IN ('SAQUE_VIRTUAL','DEPOSITO_VIRTUAL')`.
- Classificar cada transação adicionando um campo derivado `auditClass`:
  - `'EFFECTIVE'` — comportamento atual; entra em todos os fluxos/KPIs.
  - `'BASELINE_EXCLUDED'` — DV BASELINE confirmado (já reconhecido hoje, mas sem destaque visual).
  - `'RECONCILED_PHANTOM'` — SV cancelada com `cancelled_reason='ping_pong_neutralized_by_usage'` (revínculo neutralizado).
  - `'RECONCILED_DUPLICATE'` — DV cancelado classificado como BASELINE em `auditoria_metadata.origem_tipo`.
  - `'RECONCILED_OTHER'` — qualquer outro SV/DV cancelado.
- Expor `reconciledHiddenCount: number` no retorno do hook (count de classes `RECONCILED_*`).

### 2. Novo estado UI
- `showReconciled: boolean`, default `false`, persistido em `localStorage` chave `extrato:show-reconciled:${workspaceId}`.
- `filteredTransactions` oculta linhas `RECONCILED_*` quando o toggle está desligado. `BASELINE_EXCLUDED` permanece visível (já é hoje).

### 3. Header de filtros
- Quando `!showReconciled && reconciledHiddenCount > 0`: chip clicável `"🔁 N reconciliações ocultas"` ao lado do contador `X / Y registros`. Clique liga o toggle.
- Quando `showReconciled === true`: botão `"Ocultar reconciliações"` no mesmo lugar.

### 4. Render do card de transação
- Linhas `RECONCILED_*`:
  - `opacity-60`, borda `border-dashed border-amber-500/30`, valor com `line-through` discreto.
  - Badge âmbar substituindo o badge de status:
    - `RECONCILED_PHANTOM` → `"🔁 Reconciliada (revínculo)"`
    - `RECONCILED_DUPLICATE` → `"🧹 Baseline limpo (duplicava depósito real)"`
    - `RECONCILED_OTHER` → `"⊘ Cancelada"`
  - Tooltip explicativo: motivo + aviso *"NÃO entra em KPIs de Saques/Depósitos/Resultado de Caixa"*.
- Linhas `BASELINE_EXCLUDED`: badge azul `"📥 Saldo inicial · não contabilizado"` (deixa explícito o que hoje é silencioso).

### 5. Labels mais claros para virtuais (todas as classes)
- `DEPOSITO_VIRTUAL` (MIGRACAO efetivo) → `"Saldo migrado de outro projeto"`
- `DEPOSITO_VIRTUAL` (BASELINE) → `"Saldo inicial da vinculação"`
- `SAQUE_VIRTUAL` → `"Saldo transferido (desvinculação)"`

### 6. Tooltips dos KPIs (Saques e Depósitos)
- Adicionar parágrafo: *"Reconciliações automáticas (revínculo da mesma casa ao mesmo projeto sem operações entre) **não entram aqui** — você pode visualizá-las marcando 'Mostrar reconciliações' nos filtros."*

---

## Memória nova
- `mem://finance/extrato-reconciliation-visibility-standard.md` — princípio "o que sai do KPI deve permanecer auditável"; vocabulário UI (Reconciliada, Baseline limpo, Saldo migrado, Saldo inicial); regra do toggle (default OFF, persistido por workspace); escopo (todas SV/DV canceladas).
- Atualizar `mem://index.md` para referenciar.

---

## Garantias
- **KPIs inalterados**: a fórmula canônica continua usando apenas registros `CONFIRMADO` com classificação BASELINE/MIGRACAO. Zero risco de inflação.
- **Ciclo desvincular/revincular** mesmo projeto continua **0 impacto** em Depósitos/Saques/Resultado/Performance/ROI.
- **Isolamento workspace** preservado (query continua filtrando por `projeto_id_snapshot`).

---

## Arquivos
1. `src/components/projeto-detalhe/ExtratoProjetoTab.tsx` (alterações principais — hook + UI + render)
2. `.lovable/memory/finance/extrato-reconciliation-visibility-standard.md` (novo)
3. `.lovable/memory/index.md` (adicionar referência)
