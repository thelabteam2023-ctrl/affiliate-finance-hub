## Fase 1 — Proposta arquitetural (LAY + Snapshot de Lucro Realizado)

Antes de codar, abaixo está a verificação de runtime, as decisões de schema e o plano de UI para sua aprovação.

---

### 1. Verificação de regressão — `tipo='lay'` chega no card?

**Evidência DB (runtime, não teórica):**

Query executada agora:
```sql
SELECT id, tipo, comissao, stake, odd, resultado FROM apostas_pernas WHERE tipo='lay';
-- → id=101143c6..., tipo='lay', comissao=0.028, stake=96.53, odd=2.1, resultado=NULL
```

- O DB **persiste corretamente** `tipo='lay'` e `comissao=0.028` na coluna dedicada de `apostas_pernas` (NOT NULL, default `'back'` / `0`).
- O fix em `groupPernasBySelecao.ts` propaga `tipo: main.tipo ?? 'back'` e `comissao: main.comissao ?? 0` para `SurebetPerna`.
- **Gap real:** as 5 abas que alimentam o card (`ProjetoSurebetTab`, `ProjetoApostasTab`, `ProjetoValueBetTab`, `ProjetoPunterTab` + Bonus) já passaram a incluir `tipo, comissao` no `select(...)`. Vou re-verificar com um `console.log` temporário no `SurebetCard` (mount) registrando `pernas.map(p => ({sel:p.selecao, tipo:p.tipo, com:p.comissao}))` para a operação AXB e anexar o output antes de prosseguir. Se `tipo` chegar `undefined`/`'back'`, isso indica que algum consumidor ainda não inclui o campo no select.

**Status:** dados no DB OK; propagação JS OK no caminho corrigido; falta confirmação visual em runtime (1 log, descartado depois).

---

### 2. Onde a "liability" (responsabilidade) deve viver

Decisão proposta: **(b) sempre derivada em runtime** — `liability = stake * (odd - 1)`. **Não criar coluna**.

| Critério | Persistir `liability` | Derivar em runtime |
|---|---|---|
| Imutabilidade pós-resolução | Igual (snapshot de `stake` e `odd` já é imutável) | Igual |
| Fonte da verdade | Duplica info já contida em `stake`+`odd` (risco de drift) | Única fonte: `stake`, `odd` |
| Migração | Coluna nova + backfill | Zero |
| Consistência c/ princípio "snapshot" | Snapshot já garantido por `stake`+`odd` congelados | Idem |

Como `stake` e `odd` da perna **já são congelados** na criação (e nunca recalculados), `liability` derivado a partir deles é tão imutável quanto um campo persistido — sem custo de schema nem risco de divergência. A função utilitária `pernaLayHelpers.ts` (já existente) será o único ponto de cálculo.

---

### 3. Snapshot de Lucro Realizado em `apostas_unificada`

**Schema atual relevante:** `lucro_esperado numeric`, `roi_esperado numeric` (ambos NULL hoje), `lucro_prejuizo numeric`, `roi_real numeric`, `status text`, `resultado text`.

**Decisão:** **reaproveitar** `lucro_esperado` / `roi_esperado` (snapshot na **criação**, congelando o pior cenário projetado) **e** preencher `roi_real` + um novo campo `lucro_realizado numeric` no momento da **liquidação**. Não existe `lucro_realizado` hoje — proponho adicioná-lo (paralelo a `roi_real`).

| Campo | Quando grava | Fonte do cálculo | Lido por |
|---|---|---|---|
| `lucro_esperado` | INSERT da aposta | `calcularCenarios()` → pior cenário | Card pendente (fallback) |
| `roi_esperado` | INSERT da aposta | Idem | Card pendente (fallback) |
| `lucro_realizado` (**novo**) | Transição `status → LIQUIDADA` | `calcularCenarios()` com `resultado` real de cada perna | Card resolvido (autoridade) |
| `roi_real` | Transição `status → LIQUIDADA` | `lucro_realizado / stake_total` | Card resolvido |

**Disparo do congelamento:** trigger SQL `AFTER UPDATE OF status ON apostas_unificada WHEN NEW.status='LIQUIDADA' AND OLD.status<>'LIQUIDADA'`, chamando uma função `fn_snapshot_lucro_realizado(aposta_id)` que lê `apostas_pernas` (com `tipo`, `comissao`, `resultado`, `stake`, `odd`) e aplica a **mesma fórmula** do `calcularCenarios` no client.

**Solver: reaproveitar ou reescrever?** Reescrever em SQL/plpgsql é obrigatório (trigger ≠ JS). Mas a fórmula é simples e determinística — vou portar a função `calcularCenarios` (com suporte a LAY: `green = stake*(odd-1)*(1-comissao)`, `red = -stake*(odd-1)`) para plpgsql 1:1, e adicionar um **teste de paridade** comparando saída SQL × JS para 20 cenários (back puro, lay puro, misto, freebet, multi-entry) antes do merge.

**Leitura do card (regra única):**
```ts
const isLiquidada = surebet.status === 'LIQUIDADA';
const lucroExibir = isLiquidada
  ? surebet.lucro_realizado            // snapshot imutável
  : (piorCenarioRuntime?.lucro ?? surebet.lucro_esperado);
```
Isso preserva a regra documentada em `mem://finance/surebet-card-runtime-priority-standard` para pendentes e adiciona a regra de imutabilidade para liquidadas.

---

### 4. Plano de UI

| Item | Mudança | Arquivo |
|---|---|---|
| Badge "LAY" | Extrair badge usado no form (`SurebetModalRoot`/`PernaForm`) para `src/components/surebet/LayBadge.tsx` (chip vermelho-translúcido, `bg-red-500/15 text-red-300 border-red-500/30`, uppercase, dark-theme premium). Renderizar no `PernaItem` (3 variantes: column/list/multi-entry) quando `perna.tipo === 'lay'`. | `SurebetCard.tsx`, novo `LayBadge.tsx` |
| Label "Resp:" | Substituir `perna.stake` por `calcLiability(perna)` (`stake*(odd-1)`) em todas as 3 variantes. Stake permanece visível em tooltip ("Backers' stake: X"). | `SurebetCard.tsx` |
| Tooltip | Manter padrão estabelecido: `#1a1e2a`, sem seta, fade 120ms. | shared tooltip já existente |
| Pendente vs Liquidada | Visualmente idênticos; diferença só na fonte do número (snapshot vs runtime), transparente ao usuário. | — |

---

### Aguardo aprovação

Confirmando antes da Fase 2:

1. OK rodar o `console.log` temporário para fechar o item 1 antes de migrar?
2. OK **não** criar coluna `liability` (derivação runtime)?
3. OK criar **apenas** `lucro_realizado numeric` (reaproveitando `roi_real` existente e mantendo `lucro_esperado`/`roi_esperado` para pendentes)?
4. OK trigger `AFTER UPDATE OF status` + função plpgsql portada de `calcularCenarios` + teste de paridade JS×SQL?
5. OK extrair `LayBadge` como componente compartilhado entre form e card?
