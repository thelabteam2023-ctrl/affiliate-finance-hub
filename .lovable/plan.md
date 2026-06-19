# Plano — "Chance Contra" (Lay) na Calculadora de Arbitragem

Plano completo, escrito após o diagnóstico das 5 seções já entregue. Nada será codificado até sua aprovação.

---

## Ambiguidades que preciso confirmar antes de codar

1. **Liability vs saldo.** Na perna `lay`, qual conta debita a `liability = stake × (oddLay − 1)`? A mesma `bookmaker_id` selecionada na linha (tratada como conta de exchange tipo Betfair) ou um novo conceito "exchange"? Proposta: **manter `bookmaker_id` como hoje**; a perna `lay` simplesmente passa a validar `liability` em vez de `stake` contra `saldo_disponivel` da casa. Sem nova entidade.
2. **Comissão por padrão.** Comissão é por perna (default `0`) e o usuário digita por linha. Não vou criar default por bookmaker nesta etapa. Confirma?
3. **Sub-entradas (`additionalEntries`).** Sub-entrada herda o `tipo` da perna principal (toda a perna é back **ou** lay; não há mistura dentro da mesma perna)? Proposta: **sim, herda**.
4. **Freebet em lay.** Lay não aceita freebet (`fonteSaldo === 'FREEBET'` força `tipo='back'`). Confirma?
5. **Persistência das colunas novas.** OK adicionar `tipo text` e `comissao numeric(7,5)` em `apostas_pernas` **e** em `apostas_perna_entradas` (mesmo herdando), para garantir auditabilidade por entrada. Confirma?
6. **Toggle "+/−" no badge da perna.** Reaproveitar o número (badge "1", "2"…) como botão clicável que alterna back↔lay, com cor/ícone distinto. Confirma o gesto (clicar no próprio número) em vez de um botão separado?

---

## Camadas tocadas e ordem de implementação

```text
1. Tipos        → OddEntry, OddFormEntry, EngineLeg, SurebetPerna
2. Motor        → surebetCurrencyEngine.ts (payout, cenários, equalização)
                  surebetPipeline.ts (passa tipo/comissao adiante)
                  useSurebetCalculator.ts (constrói EngineLeg com novos campos)
3. Validação    → surebetValidator.ts, errosPorPerna, balanceValidation
4. UI           → SurebetTableRow, SurebetColumnsView, SurebetMobileCard,
                  SurebetTableFooter (toggle "Mostrar comissões"),
                  SurebetModalRoot (handlers toggleTipo/setComissao)
5. Persistência → migração apostas_pernas + apostas_perna_entradas
                  + adaptações em handleSave/load do SurebetModalRoot
6. Validação manual → exemplo numérico (100% back vs misto back+lay+comissão)
```

---

## 1. Modelo de dados

### Tipos TypeScript (apenas adições, nada renomeado)

`useSurebetCalculator.ts` — `OddEntry` e `OddFormEntry`:
- `tipo: 'back' | 'lay'` (default `'back'`)
- `comissao: number` (decimal 0–1, default `0`; ex.: `0.028` = 2,8%)

`surebetCurrencyEngine.ts` — `EngineLeg`:
- `tipo: 'back' | 'lay'`
- `comissao: number`

`SurebetModalRoot.tsx` — `SurebetPerna` (mapeamento DB): mesmos dois campos.

### Default em runtime
Toda função que **lê do banco** ou **hidrata** uma perna aplica fallback: `tipo ?? 'back'`, `comissao ?? 0`. Centralizar em um único helper `normalizePernaShape()` chamado em todos os pontos de hidratação (load do modal, `aplicarCamposNovaEntrada`, rascunhos do localStorage).

---

## 2. Motor de cálculo — fórmulas exatas

### Payout líquido por perna em um cenário "perna X vence"

```text
Para cada perna i:
  se tipo[i] === 'back':
    se i é a perna vencedora:  pnl[i] = stake[i] × odd[i] − stake[i]   // = stake × (odd−1)
    senão:                     pnl[i] = −stake[i]
  se tipo[i] === 'lay':
    se i é a perna vencedora (lay perde):  pnl[i] = −liability[i]
                                            // liability = stake × (oddLay − 1)
    senão (lay ganha):                      pnl[i] = stake[i] × (1 − comissao[i])

lucroCenarioX = Σ pnl[i]
```

Tudo após conversão de moeda via `convertViaBRL` (já existente). A consolidação final segue idêntica à atual.

### Capital exposto (denominador do ROI)
`exposicaoTotal = Σ (tipo[i] === 'back' ? stake[i] : liability[i])`
ROI = `lucroCenario / exposicaoTotal × 100`. **Compatibilidade:** quando todas back e comissão zero, `exposicaoTotal === stakeRealTotal` ⇒ ROI idêntico ao atual.

### Equalização multi-perna (`calcularStakesEqualizadasMultiCurrency`)

Hoje resolve `targetReturn = refStake × refOdd` e distribui via `stake[i] = targetReturn / odd[i]`. Generalizar para igualar **lucro líquido** por cenário (apenas entre pernas no `directedProfitLegs`):

```text
Dada a perna de referência (fixa pelo usuário):
  L = lucro líquido do cenário "referência vence" (fechado pelo refStake)

Para cada outra perna j ∈ direcionadas:
  No cenário "j vence", queremos lucroCenario_j = L.
  lucroCenario_j é função linear de stake[j] (todas as outras pernas direcionadas
  também variam, então o sistema é resolvido iterativamente OU em forma fechada
  via sistema linear N×N, conforme já é feito hoje para back puro).
```

Implementação concreta:
- Manter o pivot atual (`targetReturn` calculado pela perna de referência).
- Para cada perna `j` direcionada, calcular o `stake[j]` que iguala o **PnL no cenário "j vence"** ao **PnL no cenário "ref vence"**, usando a contribuição correta de back/lay/comissão.
- Forma fechada (sem iteração) é viável: o sistema é triangular se a referência é fixa — cada `stake[j]` depende apenas dos stakes já resolvidos das pernas anteriores no cenário "j vence". Vamos implementar fechado e cair em fallback iterativo (máx. 6 passos, tolerância 1e−4) se a referência for ambígua.

Snapshot de stakes para pernas **não-direcionadas** (toggle "D" desligado) continua igual: não são tocadas.

### Compatibilidade retroativa (teste obrigatório)
Adicionar caso em `src/utils/__tests__/surebetBugRepro.test.ts` (ou novo arquivo `surebetLay.test.ts`):

- **Teste A**: input 100% back, comissão 0 → resultados (stakes, lucro, ROI) devem ser **bit-exatos** aos snapshots atuais (gerar snapshot pré-mudança).
- **Teste B**: 2 pernas — perna 1 back odd 2.0 stake 100, perna 2 lay odd 2.0 comissão 0 → lucro garantido = 0 em ambos cenários.
- **Teste C**: back+lay+comissão 2,8% (caso da imagem do prompt) → bater valores calculados à mão.

---

## 3. Validação

### `surebetValidator.ts`
- Adicionar regra: `comissao >= 0 && comissao <= 1`.
- Para pernas `lay`: `odd > 1` (sem teto) e `stake > 0` (já existe; semântica muda mas regra é a mesma).
- Validar coerência: `tipo === 'lay'` ⇒ `fonteSaldo !== 'FREEBET'` (freebet só em back).

### Saldo em tempo real (`calcularSaldoDisponivel` + `errosPorPerna`)
- Função `requiredAmount(perna)` central: retorna `stake` se back, `stake × (odd − 1)` se lay.
- Todos os pontos que hoje comparam `stake` vs saldo passam a comparar `requiredAmount(perna)` vs saldo.
- Mensagem de erro reflete a natureza: "Liability insuficiente" para lay; "Stake insuficiente" para back.

### `balanceValidation` (granular por entrada)
- Sub-entradas herdam `tipo` da perna; loop atual de soma por bookmaker passa a somar `requiredAmount` por entrada.
- Bloqueio do botão "Registrar Operação" permanece com a mesma condição combinada.

---

## 4. UI

### `SurebetTableRow.tsx`
- **Badge da perna ("1", "2"...) vira botão**: clique alterna `tipo`. Visual:
  - back: badge atual (verde) + sinal `+` discreto.
  - lay: badge âmbar/vermelho + sinal `−`. Borda da linha esquerda muda de cor.
- Coluna **Stake**: quando `tipo === 'lay'`, mostra rótulo secundário "Responsabilidade: R$ X" abaixo do input (cálculo `stake × (odd − 1)`), ou tooltip no header da coluna. Não muda o input em si (usuário continua digitando stake, não liability).
- Nova **coluna "Comissão"** (renderizada condicionalmente via prop `showComissao`): input `%` decimal, default 0, com largura compacta.
- Coluna **Odd** ganha tooltip discreto explicando "Odd lay" quando `tipo === 'lay'`.

### `SurebetTableFooter.tsx`
- Adicionar toggle **"Mostrar comissões"** ao lado do toggle "Arredondar" (mesmo padrão visual). Estado `showComissao` sobe para `SurebetModalRoot` via prop drilling existente.
- "Lucro Garantido" e ROI continuam calculados pelo motor — o range `→` aparece naturalmente quando back+lay introduz spread entre cenários.
- **Novo KPI ao lado do "Total Apostado"**: "Exposição Total" = `Σ requiredAmount` (só renderiza quando existe ao menos 1 lay; caso contrário fica oculto para não poluir).

### `SurebetColumnsView.tsx` e `SurebetMobileCard.tsx`
- Mesmas alterações: badge clicável, coluna/linha de comissão condicional, exibição de liability.

### `SurebetModalRoot.tsx`
- Novos handlers: `toggleTipoPerna(index)`, `setComissaoPerna(index, value)`, `setShowComissao(boolean)`.
- Estado novo: `showComissao: boolean` (default `false`, persistido em `localStorage` por usuário, chave `surebet_show_comissao`).
- Ao trocar `tipo`, marcar `isManuallyEdited = false` da perna para que o engine recalcule stake automaticamente na próxima passada.

---

## 5. Persistência (migração)

Tabelas: `apostas_pernas` e `apostas_perna_entradas`.

```sql
ALTER TABLE public.apostas_pernas
  ADD COLUMN tipo text NOT NULL DEFAULT 'back'
    CHECK (tipo IN ('back','lay')),
  ADD COLUMN comissao numeric(7,5) NOT NULL DEFAULT 0
    CHECK (comissao >= 0 AND comissao <= 1);

ALTER TABLE public.apostas_perna_entradas
  ADD COLUMN tipo text NOT NULL DEFAULT 'back'
    CHECK (tipo IN ('back','lay')),
  ADD COLUMN comissao numeric(7,5) NOT NULL DEFAULT 0
    CHECK (comissao >= 0 AND comissao <= 1);
```

- Backfill é automático via `DEFAULT 'back' / 0`.
- Nenhuma view/RPC existente é alterada nesta etapa (lay não entra em P&L de surebet liquidada até confirmação de uma fase 2; lay só afeta o **planejamento** na calculadora).
- **Importante:** P&L pós-liquidação de surebets com lay exigirá ajuste nas RPCs `liquidar_perna_surebet_v1` / `fn_recalc_pai_surebet`. Vou marcar isso como **fase 2 separada** e deixar lay restrito à calculadora + persistência inicial nesta fase 1, para evitar tocar o motor de liquidação sem proposta dedicada.

### Frontend após migração
- `aplicarCamposNovaEntrada` e o handler de save em `SurebetModalRoot` incluem `tipo` e `comissao` no insert.
- Hidratação no load aplica `normalizePernaShape()`.

---

## 6. Validação final (exemplo numérico que vou entregar no fim)

**Caso A — regressão 100% back**
- 2 pernas BRL, odd 2.10/2.10, stake 500 cada, comissão 0, ambas back.
- Esperado: idêntico ao atual (`stakeTotal=1000`, `minLucro=50`, `roi=5%`).

**Caso B — back + lay sem comissão**
- Perna 1 back: stake 100, odd 2.00.
- Perna 2 lay: stake 100, odd 2.00, comissão 0.
- Cenário "1 vence": back ganha 100, lay perde 100 → 0. Cenário "1 perde": back perde 100, lay ganha 100 → 0. Esperado: lucro garantido = 0.

**Caso C — back + lay com comissão (matemática completa)**
- Perna 1 back: stake 100, odd 3.00.
- Perna 2 lay: odd 1.50, comissão 5%. Resolver `stake[2]` para igualar PnL.
- Mostrarei stake calculada, liability, PnL nos 2 cenários e ROI sobre exposição total.

---

## Resumo do escopo (fronteira de mudança)

| Camada | Arquivos | Mudança |
|---|---|---|
| Tipos | `useSurebetCalculator.ts`, `surebetCurrencyEngine.ts`, `SurebetModalRoot.tsx` | + `tipo`, `comissao` |
| Motor | `surebetCurrencyEngine.ts`, `surebetPipeline.ts` | payout lay, equalização por PnL |
| Hook | `useSurebetCalculator.ts` | passa novos campos ao engine |
| Validação | `surebetValidator.ts`, `SurebetModalRoot.tsx` (errosPorPerna, balanceValidation) | usa `requiredAmount` |
| UI | `SurebetTableRow.tsx`, `SurebetColumnsView.tsx`, `SurebetMobileCard.tsx`, `SurebetTableFooter.tsx`, `SurebetModalRoot.tsx` | badge clicável, coluna comissão, toggle "Mostrar comissões", liability |
| DB | `apostas_pernas`, `apostas_perna_entradas` | 2 colunas + CHECK |
| Testes | `src/utils/__tests__/surebetLay.test.ts` (novo) | regressão + back+lay |

**Fora de escopo nesta fase:** liquidação/RPC de surebet com lay, integração de comissão por bookmaker default, P&L histórico de operações lay. Tudo isso fica explicitamente para uma fase 2 (com plano próprio) para não acoplar mudanças críticas de motor financeiro.

---

Confirma as 6 ambiguidades acima e aprova o plano? Após o "ok", implemento na ordem: Tipos → Motor → Hook → Validação → UI → Migração → exemplo numérico de verificação.
