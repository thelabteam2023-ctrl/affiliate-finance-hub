
# Plano — Observabilidade + Correção LAY + Unificação Surebet/Todas as Apostas

## Diagnóstico preliminar (já levantado, sem fix ainda)

A aba **Surebet** renderiza pernas via `SurebetCard` (alimentado por `groupPernasBySelecao`, que hoje propaga `tipo`/`comissao`).
A aba **Todas as Apostas** (`ProjetoApostasTab`) usa **dois componentes diferentes**:
- `SurebetCard` apenas quando a operação tem múltiplas pernas / multi-entrada;
- `ApostaCard` para a maioria dos casos single-leg — e `ApostaCard` **não sabe o que é uma perna lay**: não lê `tipo`/`comissao`, não calcula liability, e calcula lucro/ROI tratando `stake` como exposição back (`stake × (odd-1)`).

Esta é a hipótese forte que a Fase 0 vai confirmar/refutar com logs reais.

---

## Fase 0 — Observabilidade (entregue ANTES de qualquer fix)

Objetivo: nunca mais "achar" que um fix de tipo entrou — provar com log estruturado.

1. **Helper único** `src/utils/integrityProbe.ts`:
   - `probePernaTipo(stage, pernaId, tipoIn, tipoOut)` → loga `[INTEGRITY] tipo divergente…` quando `tipoIn !== tipoOut`.
   - `probeCardConsistency(stage, operacaoId, perna, lucroCalculado)` → se `perna.tipo === 'lay'` mas o lucro projetado corresponde a `stake*(odd-1)` (fórmula back), emite `[INTEGRITY] lay tratada como back`.
   - `publishTabRender(tab, operacaoId, pernas)` → grava em `window.__TAB_DIFF__` snapshot por aba; ao registrar a segunda aba para o mesmo `operacaoId`, compara `tipo`/`stake`/`lucro` perna a perna e loga divergências (`[INTEGRITY] divergência entre abas…`).
   - Tudo em `console.warn` + buffer global consultável (`window.__INTEGRITY_LOG__`).

2. **Pontos de instrumentação**:
   - **Loader**: dentro do `.select` de `ProjetoSurebetTab` e `ProjetoApostasTab`, logar `tipo` cru vindo do banco por perna.
   - **`groupPernasBySelecao`**: chamar `probePernaTipo("group:in→out", …)` para cada perna (entrada vs `result.tipo`/`entries[].tipo`).
   - **`SurebetCard`**: ao montar, `publishTabRender("Surebet"/"TodasApostas", op.id, pernas)` e `probeCardConsistency` após `calcularCenarios`.
   - **`ApostaCard`**: idem `publishTabRender` para detectar a divergência entre abas mesmo quando o componente de Todas as Apostas é o `ApostaCard` (não o SurebetCard).

3. **Reprodução**: rodar a app com a operação AXB (1 perna back BET365 + 1 perna lay BET365), abrir as duas abas e coletar os logs gerados. Anexar o output bruto ao relatório de Fase 1.

Critério de saída da Fase 0: logs publicados e capturados — sem nenhuma alteração de comportamento de cálculo/UI ainda.

---

## Fase 1 — Causa raiz (escrita com base nos logs da Fase 0)

Responder, com citação direta do log:
1. Em qual estágio o `tipo` é perdido (se for) — esperado: **não é perdido** em `groupPernasBySelecao`, mas é perdido porque `ApostaCard` nunca lê o campo.
2. Quais abas usam qual componente para a operação AXB.
3. Se o `groupPernasBySelecao` é sequer invocado no caminho de `ProjetoApostasTab` para essa operação single-entry — esperado: **não é**, vai direto pra `ApostaCard` com a perna agregada.

Saída: 1 parágrafo de causa raiz + tabela `aba → componente → trata lay?`.

---

## Fase 2 — Correção + unificação

1. **Fonte única de verdade de lay** já existe (`src/utils/pernaLayHelpers.ts`: `isLay`, `exposureOf`, `lucroSeGanhar`, `lucroSePerder`, `labelExposicao`). Vamos forçar **ambos** os cards a passarem por ela.

2. **`ApostaCard.tsx`** — passar a aceitar e respeitar `tipo`/`comissao` no payload `ApostaCardData`:
   - Para apostas single-leg lay (pendentes): exibir `Resp: <liability>` no lugar de `Stake:` (rótulo via `labelExposicao`), e usar `exposureOf` como denominador de ROI projetado.
   - Para apostas liquidadas: continuar usando `lucro_realizado` snapshot (fonte canônica já implementada em `apostas_unificada.lucro_realizado` na migration anterior); nenhum recálculo client.
   - Lucro projetado em pendente: delegar à mesma função usada pelo `SurebetCard` (extrair `calcularPernaProjecao(perna)` para `src/utils/pernaLayHelpers.ts` reaproveitando `lucroSeGanhar`/`lucroSePerder`).

3. **`ProjetoApostasTab.tsx`** — propagar `tipo` e `comissao` da perna até `ApostaCardData` (hoje já vêm do `select`, só não são repassados).

4. **`SurebetCard.tsx`** — substituir todo cálculo manual de exposição/ROI de perna por chamadas a `exposureOf`/`labelExposicao`/`lucroSeGanhar`/`lucroSePerder`. Remover qualquer ramo que ainda use `stake` direto para liability.

5. **Re-rodar Fase 0** com a mesma operação e anexar o log mostrando `[INTEGRITY]` zerado.

---

## Fase 3 — Reorganização visual (sem badge "LAY")

Padronizar a linha de perna nos dois cards (a estrutura abaixo vale igual para `SurebetCard` e `ApostaCard`):

```text
[seleção]   [logo] Casa · subconta            @odd          R$ stake
                                              (Lay)     Resp R$ liability
```

Regras:
- `@odd` é o token primário (mesmo `text-sm font-semibold` atual).
- Para lay: prefixo `Lay ` em `text-red-400/80` colado no `@odd`, **sem badge**, sem espaço duplo (corrige o bug visual atual onde "Lay @2.20Resp:" fica grudado).
- `Resp R$ …` aparece **abaixo** do stake em `text-[11px] text-muted-foreground`, alinhado à direita — peso secundário, sem competir com stake principal.
- `Stake` principal (`stake = backers' liability` no caso lay, que é o valor digitado) permanece no mesmo lugar visual da perna back, mantendo grid alinhado.
- Tipografia, espaçamentos e cores seguem o dark/premium já em uso (sem novas cores; usa `text-red-400`, `text-muted-foreground`, `text-foreground`).

Entregar **antes/depois** com screenshot da operação AXB nas duas abas.

---

## Detalhes técnicos

- Arquivos tocados:
  - novo: `src/utils/integrityProbe.ts`
  - editar: `src/utils/groupPernasBySelecao.ts` (instrumentação)
  - editar: `src/utils/pernaLayHelpers.ts` (adiciona `calcularPernaProjecao`)
  - editar: `src/components/projeto-detalhe/SurebetCard.tsx` (usa helpers + reorg visual + probes)
  - editar: `src/components/projeto-detalhe/ApostaCard.tsx` (aceita tipo/comissao, usa helpers, reorg visual, probes)
  - editar: `src/components/projeto-detalhe/ProjetoApostasTab.tsx` (propaga tipo/comissao para ApostaCardData; probe no loader)
  - editar: `src/components/projeto-detalhe/ProjetoSurebetTab.tsx` (probe no loader)
- Sem mudanças de schema, RPC ou RLS. `lucro_realizado` snapshot (já criado na migration anterior) continua sendo a fonte para liquidadas.
- `workspace_id` continua vindo do hook `useWorkspaceGuard` (token), nunca de input.
- Nenhum `LayBadge` adicionado nesta etapa (o componente já existe mas não será renderizado nos cards de histórico).

---

## Critérios de aceite

1. Log `[INTEGRITY]` limpo (sem warnings) na operação AXB após Fase 2.
2. Aba Surebet e aba Todas as Apostas mostram, para AXB, exatamente o mesmo `lucro`, `Resp`, `@odd` e `Stake` perna a perna.
3. Card legível: `Lay @2.20` separado de `Resp R$ 110,50`, com hierarquia visual clara.
4. Nenhuma regressão em apostas back puras (single, múltipla, multi-entrada).
