## Diagnóstico — você está certo

Hoje o cálculo é:

```
pctDisputaPatrimonio  = totalEmDisputa / patrimonioTotal  (HOJE)
pctPerdasPatrimonio   = totalPerdasPeriodo (período X) / patrimonioTotal (HOJE)
```

**Problemas conceituais:**

1. **"Perdas no período" vs "patrimônio de hoje"** — comparar uma perda confirmada em março/2026 com o patrimônio de junho/2026 distorce o indicador. Se o patrimônio dobrar, a mesma perda histórica "encolhe" sem nada ter mudado no passado.
2. **"Em disputa" vs "patrimônio"** — "Em disputa" é uma posição em tempo real, então comparar com patrimônio de hoje **faz sentido** (ambos são "agora").
3. **Período retroativo** — quando o usuário troca o filtro para "Maio/2026", o patrimônio mostrado continua sendo o de hoje, não o que existia em maio.

Conclusão: a porcentagem da **perda do período** precisa do **patrimônio do período**. A porcentagem do **em disputa** continua válida com patrimônio atual (ambos são snapshots de "agora").

## Por que não usar `capital_snapshots` direto

A tabela `capital_snapshots` existe, mas hoje só guarda capital **de bookmakers** (`capital_bookmakers_total_brl`). O patrimônio total do card "Exposição & Perdas" vem de **4 fontes** somadas no `Financeiro.tsx`:

```
patrimonioTotal = capitalOperacional + saldoBookmakers + totalContasParceiros + totalWalletsParceiros
```

Snapshot atual cobre só ~1/4 da fórmula. Reaproveitar exigiria estender o snapshot — fora do escopo de um ajuste de KPI.

## Proposta

### Opção A (recomendada) — Snapshot calculado on-demand do fim do período

Em vez de criar tabela nova, **calcular o patrimônio no `dataFim` do filtro** reconstruindo cada componente a partir do ledger:

- `capitalOperacional(dataFim)` = `cash_ledger` agrupado por moeda até `dataFim`, convertido com cotação histórica (PTAX da data).
- `saldoBookmakers(dataFim)` = soma de eventos `bookmaker_balance_audit` ou reconstrução via `cash_ledger` com `bookmaker_id`/categorias de movimentação até `dataFim`.
- `totalContasParceiros(dataFim)` e `totalWalletsParceiros(dataFim)` = mesma técnica via ledger filtrado.

**Custo:** alto — exige um RPC dedicado (`fn_patrimonio_at_date(workspace_id, date)`) que replica a lógica do `useFinanceiro` em SQL com FX histórico. Risco de divergência se não compartilhar a fonte canônica.

### Opção B (pragmática, recomendada para este turno) — Etiquetar a porcentagem como "atual" e mostrar perdas absolutas

Reconhecer no UI que a porcentagem de Perdas é **referência atual**, não histórica:

1. **Manter** os números absolutos (`Em disputa: R$ X` e `Perdas: R$ Y`).
2. **Em disputa**: continuar com `% do patrimônio atual` — semanticamente válido.
3. **Perdas no período**: **remover** a porcentagem de patrimônio e exibir, no lugar, um indicador mais fiel ao recorte temporal — por exemplo:
   - `R$ 497,54` (valor absoluto, principal)
   - `2 ocorrências · 0,3% do lucro op. do período`
   - O denominador "lucro operacional do período" **já é do mesmo período** (vem de `lucroOperacional` que já é filtrado por `dataInicio/dataFim`), então a comparação fica honesta.
4. **Tooltip explicativo** no badge "EM DISPUTA": "Posição atual sobre patrimônio atual".
5. **Tooltip explicativo** no badge "PERDAS NO PERÍODO": "Valor absoluto consumado no período. Comparativo usa lucro operacional do mesmo recorte."

### Opção C (futuro) — Snapshot diário completo do patrimônio

Criar tabela `patrimonio_snapshots` (workspace, snapshot_date, patrimonio_total_brl, breakdown JSONB) populada por job diário ou trigger no fechamento de ciclo. A partir daí o card pega o snapshot mais próximo do `dataFim` do filtro. Robusto, mas exige:
- Migração (tabela + grants + RLS + índice).
- Job/edge function diária.
- Backfill histórico (que pode não ter dados precisos).
- Fora do escopo deste ajuste de UI/KPI.

## Recomendação final

**Implementar Opção B agora** (1 arquivo, sem migration) e deixar a Opção C como item de backlog quando o usuário pedir histórico completo.

Mudanças na Opção B:

- `src/components/financeiro/ExposicaoFinanceiraCard.tsx`
  - Coluna "Em disputa": manter `% do patrimônio` + tooltip "atual".
  - Coluna "Perdas no período": substituir `% do patrimônio` por `% do lucro op. do período` (já temos `lucroOperacional` como prop) + `N ocorrências`.
  - Adicionar `Tooltip` em ambas as labels para deixar o contexto explícito.
  - Manter `patrimonioTotal` na prop (usado pela coluna A).

## Fora de escopo

- Não criar `patrimonio_snapshots`.
- Não tocar em hook/RPC.
- Não tocar no `Financeiro.tsx`.

## Pergunta de decisão

Confirma a Opção B? Ou prefere que eu já planeje a Opção C com tabela e job de snapshot diário do patrimônio?
