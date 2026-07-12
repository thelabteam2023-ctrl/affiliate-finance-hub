
## Diagnóstico

**Bug confirmado no print:** perna 2 é LAY @1.22 com stake 2000 → responsabilidade real = 2000 × 0,22 = **R$ 440**. O saldo BETBRA/LUIZ tem R$ 508,34 (suficiente para a liability), mas o sistema mostra "Saldo insuficiente. Disponível: R$508,34" comparando contra os R$ 2000 de stake.

### Como Lay é tratado hoje
- **Backend/ledger (✅ correto)**: `fn_sync_stake_event_v1`, `criar_surebet_atomica_v3` e `liquidar_perna_surebet_v1` já debitam `stake × (odd−1)` como liability para pernas LAY (ver `mem/finance/lay-liability-as-ledger-debit-standard.md`).
- **Motor de cálculo (✅ correto)**: `surebetCurrencyEngine.analisarArbitragem` e `pernaLayHelpers.exposureOf` retornam liability corretamente para LAY.
- **Validação de saldo pré-registro (❌ bug)**: os validadores de UI comparam `stake` bruto ao saldo, ignorando `tipo=lay`.

### Pontos onde a validação usa stake em vez de liability
1. `src/utils/surebetBalanceValidation.ts` — `validateBalance()` acumula `parseFloat(entry.stake)` sem checar `tipo`/`odd`.
2. `src/utils/surebetBalanceValidator.ts` — `validateBalanceForOperation()` idem.
3. `src/components/surebet/SurebetModalRoot.tsx` — função `calcularSaldoDisponivel` (linha ~387) e `getBookmakerSaldosParaEntry` (linha ~480/491) usam `parseFloat(entry.stake)` para alocar saldo por casa.
4. `buildOriginalStakesMap` e `stakeMap` no submit (linha ~915) creditam stake bruta em modo edição, mas o débito original no ledger foi liability — o "crédito virtual" de edição também precisa ser liability para LAY.

## Plano de implementação

### 1. Helper único de "capital comprometido"
Adicionar em `src/utils/pernaLayHelpers.ts`:
```ts
export function capitalComprometido(tipo, stake, odd): number {
  return tipo === "lay" ? stake * Math.max(0, odd - 1) : stake;
}
```
Reusar `exposureOf` internamente.

### 2. Corrigir validadores (foco do bug)
- `surebetBalanceValidation.ts`: `OddEntry` ganha `tipo?`, `odd?`, `comissao?`. Trocar `parseFloat(entry.stake)` por `capitalComprometido(tipo, stake, odd)` em `validateBalance` e em `buildOriginalStakesMap`. LAY não aceita FREEBET (já validado em `surebetValidator`), então liability sempre vai para "real".
- `surebetBalanceValidator.ts`: idem em `validateBalanceForOperation` e `originalStakes`.
- `SurebetModalRoot.tsx`:
  - `calcularSaldoDisponivel`: usar liability da perna corrente e de todas as outras pernas/sub-entradas quando `tipo==='lay'`.
  - `getBookmakerSaldosParaEntry`: mesmo tratamento no desconto de "alocadoOutros".
  - `stakeMap` do submit (modo edição): creditar liability ao invés de stake para pernas LAY originais.
  - Mensagem de erro passa a mostrar "Resp: R$ X" quando LAY.

### 3. UX Betfair-like: campo Responsabilidade interligado
Em `PernaInput` (linha do form da perna LAY), quando `tipo === 'lay'`:
- Renderizar **dois inputs lado a lado**: `Stake` (lucro potencial) e `Resp` (valor em risco).
- Digitar em Stake → recalcula Resp = `stake × (odd−1)`.
- Digitar em Resp → recalcula Stake = `resp ÷ (odd−1)`.
- Mudar Odd → mantém o **último campo editado** e recalcula o outro (rastrear via `lastEditedField: 'stake' | 'resp'`).
- Ambos usam mesmo estado subjacente `stake` (fonte única) — Resp é sempre derivado; input Resp apenas escreve `stake = resp/(odd-1)` de volta.
- Rótulo dinâmico já existe (`labelExposicao`): reaproveitar.

### 4. Modelo de dados — avaliação
**Recomendação: NÃO adicionar colunas.** `stake + odd + tipo + comissao` já são suficientes; todos os derivados (liability, lucro potencial, perda máxima) são funções puras dessas 4 colunas — armazenar duplicaria estado e criaria risco de desincronia. As RPCs (`fn_sync_stake_event_v1`, `liquidar_perna_surebet_v1`, `fn_recalc_pai_surebet`) já derivam corretamente. Basta um único helper `pernaLayHelpers` no frontend como fonte única de derivação.

### 5. Módulos que **já estão corretos** (validado nas memórias)
- Ledger/reservas: `lay-liability-as-ledger-debit-standard` ✅
- Motor Surebet (lucro/ROI/exposição): `surebetCurrencyEngine` + testes `surebetLayEqualization.test.ts` ✅
- Liquidação: `liquidar_perna_surebet_v1` trata GREEN/RED/VOID com comissão ✅
- Cards (SurebetCard/ApostaCard): usam `exposureOf`/`labelExposicao` ✅
- Reconciliação/relatórios: consomem eventos do ledger, que já refletem liability ✅

Nada além dos validadores de UI e da UX do form precisa mudar.

## Arquivos a alterar
1. `src/utils/pernaLayHelpers.ts` — expor `capitalComprometido` (wrapper de `exposureOf`).
2. `src/utils/surebetBalanceValidation.ts` — usar liability.
3. `src/utils/surebetBalanceValidator.ts` — usar liability.
4. `src/components/surebet/SurebetModalRoot.tsx` — usar liability nos 4 pontos citados; propagar `tipo`/`odd` para validadores.
5. `src/components/surebet/PernaInput.tsx` (ou equivalente) — campo Resp interligado quando LAY.
6. `src/utils/__tests__/surebetBalanceValidation.test.ts` — nova cobertura: LAY @1.22, stake 2000, saldo 500 → válido (liability 440).

## Fora de escopo
- Reprocessar apostas antigas (respeita anti-retrofix).
- Alterar schema de `apostas_pernas` (não necessário).

Confirma para eu implementar?
