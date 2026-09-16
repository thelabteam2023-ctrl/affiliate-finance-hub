# Reconciliação do Lucro Realizado: operacional, cambial e fluxo financeiro

Objetivo: eliminar a dupla conversão de apresentação e passar a exibir, de forma
reconciliável, os três componentes que hoje ficam escondidos dentro de um único número.

Nada no banco é alterado. Nenhum dado histórico é corrigido. Toda a mudança é de
cálculo de apresentação e de exibição.

---

## O que foi confirmado no banco (leitura, sem alteração)

Projeto BONUS EVVERTON, consolidação BRL. Os nove lançamentos do ledger foram lidos:

- Depósito BETRISE: `moeda = USD`, nominal 1.000, `valor_confirmado = 1.005`.
- O evento dos US$ 5 existe como `GANHO_CAMBIAL`, com a descrição
  "Ganho cambial em conciliação: 1000.00 nominal → 1005.00 confirmado".
- Origem e destino estão na **mesma moeda (USD)**. Não houve troca de moeda.
- Todas as casas terminam com saldo zero; o ledger fecha por casa.

Conclusão sobre o item 7 do pedido: **os US$ 5 não são câmbio**. São diferença
efetivamente recebida na conciliação (a casa creditou mais do que o nominal), dentro
da mesma moeda. O próprio Extrato já tem essa convenção para diferenças de mesma
moeda — ele as chama de "trânsito", não de câmbio —, mas a rotina de conciliação
gravou o tipo como `GANHO_CAMBIAL`. Corrigimos a **classificação de apresentação**,
sem reescrever o evento.

---

## 1. Fim da dupla conversão (Vínculos → Extrato)

`src/hooks/useProjetoRecuperacaoCapital.ts`, função `resolveSnap`.

- Hoje: se existe `valor_usd_referencia`, o valor sempre passa por USD — inclusive
  quando a transação é em BRL e a consolidação também é BRL.
- Novo: quando a moeda da transação for igual à moeda de consolidação, devolver o
  valor nativo, sem conversão. O snapshot em USD só é usado quando as moedas diferem.

Efeito esperado neste projeto: aportado R$ 10.153,70, recuperado R$ 10.504,40,
Lucro Realizado R$ 350,70 — alinhado ao card do projeto.

## 2. Classificação dos eventos de conciliação

Novo utilitário `src/lib/ledger/classificarDiferencaConciliacao.ts`:

- mesma moeda na origem e no destino → `DIFERENCA_RECEBIMENTO` (crédito ou taxa de
  trânsito: resultado financeiro, não câmbio);
- moedas diferentes → `RESULTADO_CAMBIAL`.

O Extrato e o detalhamento passam a rotular pela classificação, não pelo nome do tipo
gravado. Os US$ 5 aparecem como "Diferença de recebimento (+R$ 25,77)".

## 3. Variação cambial: modelo adotado

Modelo **C** — marcação não realizada enquanto a posição estiver em moeda
estrangeira, virando resultado cambial realizado no saque/conversão.

Motivo: é o único compatível com a arquitetura atual, em que cada operação congela
`cotacao_snapshot` e o resultado operacional é imune à cotação de hoje. Assim:

- Operacional histórico usa sempre o snapshot da operação — não muda quando a cotação muda.
- Enquanto o saldo em USD está na casa, a diferença até a cotação atual é
  **variação cambial não realizada**.
- No saque, a mesma diferença passa a **variação cambial realizada**.

Neste projeto tudo já foi sacado, então os R$ -3,03 aparecem como realizados.

## 4. Novo detalhamento reconciliável

Novo hook `src/hooks/useProjetoReconciliacaoResultado.ts`, consumido pelo card
"Recuperação de Capital" (`RecuperacaoCapitalCard.tsx`) e pelo detalhamento
financeiro (`FinancialMetricsPopover.tsx`):

```text
Lucro Operacional            +327,96   (snapshot da operação, imutável)
Resultado Cambial             -3,03    (realizado / não realizado, separados)
Outros Resultados Financeiros +25,77   (diferença de recebimento na conciliação)
──────────────────────────────────────
Lucro Realizado              +350,70
```

O total continua sendo o mesmo número de hoje (após a correção do item 1); apenas
passa a ser decomposto e explicável. Quando houver posição aberta em moeda
estrangeira, a linha cambial mostra as duas parcelas separadas.

## 5. Testes

- Testes unitários novos para `resolveSnap` e para o cálculo da reconciliação
  cobrindo a matriz pedida: BRL puro, USD, USDT, depósito e saque em cotações
  diferentes, valorização e desvalorização, resultado positivo e negativo, saque
  parcial, múltiplos saques, ganho e perda cambial, reversão de saque e reliquidação.
- Cada caso valida separadamente operacional, cambial, fluxo, patrimônio e realizado.
- Invariante central: transação na moeda de consolidação nunca passa por conversão
  intermediária; e Operacional + Cambial + Outros = Realizado, sem resíduo.
- Build verificado com `npx tsgo --noEmit -p tsconfig.app.json`.

## Fora de escopo

- Nenhuma migration, nenhum UPDATE em `cash_ledger` ou `financial_events`.
- O Operacional Teórico e o Resultado por Estratégia não mudam de valor.
