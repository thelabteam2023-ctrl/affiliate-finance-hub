# Saque cripto em Ringgit (MYR): causa raiz e correção estrutural de moedas

## Diagnóstico confirmado (sem alterar nada)

A trava do banco que bloqueou o registro é:

```text
chk_snapshot_1_para_1_nao_stable  (tabela cash_ledger)
proíbe: moeda fora de (USD, USDT, USDC)  +  valor_usd_referencia = valor  +  cotacao_origem_usd = 1
```

Ou seja: o banco recusou um lançamento que dizia "2.000 MYR valem 2.000 dólares, cotação 1,00". A trava agiu corretamente — quem gerou o valor errado foi a tela.

### Onde nasce o valor errado

Em `src/components/caixa/CaixaTransacaoDialog.tsx` (linha 2824) existe uma lista **fixa** de moedas consideradas fiduciárias, escrita à mão dentro da função de gravação:

```text
BRL, USD, EUR, GBP, MXN, ARS, CLP, COP, PEN, UYU, CAD, AUD, CHF, JPY
```

O Ringgit (MYR) **não está nessa lista**, embora seja moeda oficialmente suportada pelo sistema
(`src/types/currency.ts` lista BRL, USD, EUR, GBP, MYR, MXN, ARS, COP).

Consequência no saque cripto da casa 12BET (MYR) para wallet USDC:

```text
caminho correto (fiat)  -> cotação MYR/USD ~0,2444  -> referência US$ ~488,83
caminho tomado (cripto) -> cotação = preço do USDC = 1  -> referência US$ 2.000,00  -> BLOQUEADO
```

A estimativa exibida na tela (~488,83 USDC) usa outro cálculo e estava certa; só o registro final
seguia o caminho de cripto puro. Por isso o erro aparece em MYR e não em BRL/USD/EUR/GBP/MXN/ARS/COP,
que estão na lista fixa.

Não há dado corrompido gravado: a trava impediu a escrita. Nenhum lançamento histórico foi tocado.

## O que será feito

1. **Eliminar a lista fixa de moedas** na tela de transações e passar a usar a fonte única já existente
   (`CURRENCY_TYPES` em `src/types/currency.ts`), tanto para fiduciárias quanto para criptos.
   Com isso qualquer moeda suportada — hoje e no futuro — segue automaticamente o caminho certo.
2. **Trava de sanidade antes de gravar**: se uma transação tentar registrar moeda não-dólar com
   cotação 1,00 e referência igual ao valor, a tela bloqueia com mensagem clara em português
   ("cotação indisponível para MYR"), em vez de deixar o erro técnico do banco aparecer.
3. **Mensagem de erro amigável**: traduzir a violação dessa trava para um texto que explique o que
   houve e o que fazer, caso ela ainda ocorra.
4. **Varredura das demais listas fixas de moeda** encontradas no código
   (`formatCurrency.ts`, `bookmakerIdentity.ts`, `applyImport.ts`, diálogos de investidores,
   planejamento, broker, reclassificação de bônus). Onde a lista define comportamento financeiro,
   passa a derivar da fonte única; onde é apenas opção de formulário, alinhar ao conjunto suportado.
5. **Testes de regressão** cobrindo: saque cripto de casa MYR, GBP, ARS, COP, MXN, EUR e BRL;
   saque de casa em dólar (deve continuar cotação 1); depósito cripto→MYR; transferência cripto→cripto;
   e um teste que falha se alguma moeda suportada ficar fora da classificação fiat/cripto.
6. **Conferência no banco** de que nenhum lançamento antigo viola a regra (consulta somente leitura).

Nenhuma migração, nenhuma alteração em `cash_ledger`, `financial_events`, saldos ou histórico.
A trava do banco permanece como está.

## Detalhes técnicos

- `CaixaTransacaoDialog.tsx`: remover `FIAT_SET` (2824) e `CRYPTO_SET` (2850-2852); usar helpers
  derivados de `CURRENCY_TYPES`/`CRYPTO_CURRENCIES`. `moedaOrigemEhFiat` passa a ser
  `getCurrencyType(moedaOrigem) === "FIAT"`; `destinoEhCripto` idem.
- Novo helper em `src/types/currency.ts` (ou `src/utils/convertCurrency.ts`): `isFiat`, `isCrypto`,
  `isStableUsd`, com fallback explícito para moeda desconhecida (tratada como fiat e exigindo cotação).
- Guard client-side espelhando `chk_snapshot_1_para_1_nao_stable` antes do insert, mais tradução do
  código de erro `23514` com esse `constraint` no handler de erro do diálogo.
- Cotação MYR já existe (`MYRBRL` em `src/constants/exchangeRates.ts`), então `getRate("MYR")` funciona —
  o problema era só o desvio de caminho.
- Testes em `src/components/caixa/__tests__/` (vitest) sobre a função de montagem do payload, mais
  consulta de auditoria em `cash_ledger` procurando linhas com cotação 1 e moeda não-dólar.
- Validação: `npx tsgo --noEmit -p tsconfig.app.json` e vitest.
