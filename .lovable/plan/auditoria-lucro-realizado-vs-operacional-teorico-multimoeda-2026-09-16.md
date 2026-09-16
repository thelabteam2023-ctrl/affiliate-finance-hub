# Auditoria: Lucro Realizado (R$ 353,15) × Operacional Teórico (R$ 327,96)

Projeto: **BONUS EVVERTON** (`09413884-09e7-480f-9d57-2224e6722660`)
Consolidação: BRL · Cotação de Trabalho atual: **5,1537** · Cotação no momento das operações: **5,1627**

---

## 1. O que aconteceu neste teste

### Linha do tempo (dados reais do banco, 16/09/2026)

| Hora (UTC) | Evento | Casa | Valor original | Cotação gravada | Observação |
|---|---|---|---|---|---|
| 05:54:26 | Depósito | 1XBET (BRL) | R$ 2.500,00 | USD 484,2427 @ 5,16272 | `cash_ledger 77502da9` |
| 05:54:37 | Depósito | 7GAMES (BRL) | R$ 2.500,00 | USD 484,2427 @ 5,16272 | `bc18335b` |
| 05:55:38 | Depósito | BETRISE (USD) | $ 1.000,00 | USD 1.000 | `7d4d0ceb` |
| 05:56:40 | **Ganho cambial na conciliação** | BETRISE | **+$ 5,00** | — | nominal 1000 → confirmado 1005 |
| 05:59:15 | Depósito virtual BASELINE | BETRISE | $ 5,00 | — | não conta como capital aportado |
| 06:02–06:14 | Surebets (2 operações, 3 pernas cada) | todas | — | pernas USD com `cotacao_snapshot` **5,1627** | |
| 06:19:51 | Cashback manual | 1XBET | R$ 200,00 | — | |
| 06:20:40 | Saque | 1XBET | R$ 2.490,00 | USD 482,3058 @ 5,16272 | |
| 06:22:24 | Saque | 7GAMES | R$ 1.102,00 | USD 213,4542 @ 5,16272 | |
| 06:22:42 | Saque | BETRISE | $ 1.341,25 | USD 1.341,25 | |

Todas as três casas terminaram com **saldo 0,00** e o ledger fecha por casa
(1XBET, 7GAMES e BETRISE somam exatamente zero em `financial_events`).
**Invariante 5 (ledger ↔ saldo) está OK.**

### Resultado operacional por moeda original (do ledger, excluindo depósitos/saques/ajuste cambial)

- **BRL:** payouts 1.790 + cashback 200 − stakes líquidos 3.398 = **−1.408,00**
- **USD:** payout 1.001,25 − stakes líquidos 665,00 = **+336,25**

Isso bate exatamente com o tooltip "Por moeda original" da tela.

### A ponte matemática de 327,96 até 353,15

```text
327,96   Operacional Teórico  = −1.608 (surebets BRL) + 200 (cashback) + 336,25 × 5,1627
−  3,03   reavaliação do resultado USD: 336,25 × (5,1537 − 5,1627)
────────
324,93   mesmo resultado operacional, avaliado à Cotação de Trabalho de hoje
+ 25,77   ganho cambial da conciliação do depósito ($5,00 × 5,1537)
────────
350,70   Lucro Realizado do card do projeto  (valor CORRETO)
+  2,45   artefato de dupla conversão nos fluxos em BRL (ver §2)
────────
353,15   Lucro Realizado exibido em Vínculos → Extrato
```

Diferença total 353,15 − 327,96 = **25,19**, integralmente explicada:
+25,77 cambial − 3,03 reavaliação + 2,45 artefato. **Não há resíduo.**

---

## 2. Onde está a divergência (causa raiz do R$ 2,45)

`src/hooks/useProjetoRecuperacaoCapital.ts`, função `resolveSnap` (linhas 108‑118):

```ts
const resolveSnap = (valor, snap, moeda) => {
  const s = Number(snap ?? 0);
  if (s > 0) return snapToConsolidacao(s);      // usa valor_usd_referencia
  return convertToConsolidation(valor, moeda);
};
```

Ela dá prioridade a `valor_usd_referencia` **mesmo quando a transação é em BRL e a
consolidação também é BRL**. Resultado: R$ → USD (à cotação do dia da transação,
5,16272) → R$ (à Cotação de Trabalho, 5,1537). Uma ida e volta desnecessária que
encolhe todo valor em BRL em 0,175%:

| Fluxo | Valor real | Exibido | Distorção |
|---|---:|---:|---:|
| Depósitos BRL | 5.000,00 | 4.991,28 | −8,72 |
| Saques BRL | 3.592,00 | 3.585,74 | −6,26 |
| Efeito líquido no Lucro Realizado | | | **+2,46** |

Conferência exata: depósitos exibidos 10.144,98 = 1.968,485482 USD × 5,1537;
saques exibidos 10.498,14 = 2.037,00997 USD × 5,1537. Ambos batem centavo a centavo.

O card kanban do projeto (R$ 350,70) não sofre esse problema porque consolida os
valores nativos diretamente pela Cotação de Trabalho.

---

## 3. Classificação do comportamento

- **R$ 25,77 de ganho cambial** — comportamento **A) correto**, mas **mal rotulado**: é
  resultado cambial de conciliação (depósito de $1.000 creditado como $1.005), não lucro
  operacional. Hoje ele entra silenciosamente no Lucro Realizado.
- **R$ 3,03 de reavaliação** — **A) correto e esperado**: o resultado operacional em USD
  foi congelado a 5,1627 (`cotacao_snapshot` da perna) e o caixa é avaliado a 5,1537.
  É exposição cambial legítima sobre saldo mantido em moeda estrangeira.
- **R$ 2,45 de dupla conversão** — **D) bug de implementação** em `resolveSnap`. Nenhum
  valor em BRL deveria transitar por USD quando a consolidação é BRL.

---

## 4. Modelo correto (as quatro dimensões)

| Dimensão | Definição | Fonte hoje | Situação |
|---|---|---|---|
| **A. Resultado operacional** | P&L de apostas/bônus/cashback, congelado no `cotacao_snapshot` da operação | Resultado por Estratégia (327,96) | correto, é a fonte de verdade operacional |
| **B. Resultado cambial** | (i) ganho/perda de conciliação; (ii) reavaliação do resultado estrangeiro entre a cotação da operação e a atual | `GANHO_CAMBIAL`/`PERDA_CAMBIAL` + delta de cotação | existe no ledger, mas **não é segregado na UI** |
| **C. Fluxo financeiro** | Depósitos, saques, transferências | Recuperação de Capital | correto em conceito, contaminado pela dupla conversão |
| **D. Patrimônio** | Saldo das casas avaliado à cotação atual | Saldo Casas (R$ 0,00) | correto |

Identidade que deveria ser exibida:

```text
Lucro Realizado = Resultado Operacional (A)
                + Resultado Cambial (B)
                + demais eventos de caixa (extras, taxas)
```

Neste teste: 324,93 (A à cotação atual) + 25,77 (B) = 350,70. Fecha.

---

## 5. Plano de correção (nada foi alterado ainda)

### 5.1 Correção de código (obrigatória)
`src/hooks/useProjetoRecuperacaoCapital.ts` → `resolveSnap`: usar o snapshot USD
**apenas quando a moeda da transação ≠ moeda de consolidação**. Quando forem iguais,
retornar o valor nativo sem conversão. Efeito esperado neste projeto:
depósitos 10.153,70 · saques 10.504,40 · Lucro Realizado 350,70 — alinhado ao card.

### 5.2 Segregação do resultado cambial (UI + breakdown)
Quebrar o Lucro Realizado em duas linhas no tooltip:
`Operacional` e `Cambial` (conciliação + reavaliação), sem alterar o total.
Nenhuma mudança no ledger é necessária — os eventos `AJUSTE`/`GANHO_CAMBIAL` já existem.

### 5.3 Correção de dados
**Nenhuma.** O banco está íntegro: o ledger fecha, os snapshots estão gravados, os
saldos são zero. A divergência é 100% de camada de apresentação. Sem migration.

### 5.4 Invariantes a fixar em teste
1. Transação na moeda de consolidação nunca passa por conversão intermediária.
2. Resultado operacional imune a mudança da Cotação de Trabalho (usa `cotacao_snapshot`).
3. Lucro Realizado (Extrato) = Lucro Realizado (card kanban), tolerância R$ 0,01.
4. Lucro Realizado − Operacional = soma dos eventos cambiais + reavaliação, sem resíduo.
5. Σ `financial_events` por casa = `saldo_atual` (já validado neste projeto).

### 5.5 Matriz de regressão
BRL→BRL · USD→USD · USD→BRL · USDT→USD · depósito+lucro+saque · depósito+prejuízo+saque ·
variação cambial sem operação · saque parcial · múltiplos saques · depósito e saque em
cotações diferentes · reversão de saque · reliquidação · consolidação BRL · consolidação USD.
Para cada um: operacional esperado, cambial esperado, fluxo esperado, patrimônio, realizado.
