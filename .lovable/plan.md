Plano de correção

Objetivo: o formulário aberto por “Nova Aposta > Aposta Simples” deve ser sempre uma aposta simples multi-casa, independentemente da aba onde foi aberto. Adicionar “casa a mais” significa replicar a mesma entrada em outra bookmaker para resolver tudo junto, e não criar uma surebet/arbitragem.

O que será corrigido

1. Remover o travamento indevido da estratégia pela aba no formulário de Aposta Simples
- Hoje `ApostaDialog` usa `activeTab=surebet` para forçar `estrategia=SUREBET`.
- Isso faz uma aposta simples multi-casa entrar no caminho de arbitragem.
- Vou alterar para que `ApostaDialog` respeite o `defaultEstrategia` recebido pela URL, que já vem como `PUNTER` no botão global.
- Na aba Surebet, o formulário de Aposta Simples continuará abrindo como `PUNTER` por padrão e com `forma_registro=SIMPLES`.

2. Impedir que “Aposta Simples + casas adicionais” chame o motor atômico de Surebet
- Hoje existe um desvio em `ApostaDialog.tsx`:
  - se tem `additionalEntries.length > 0`
  - e `estrategia === SUREBET`
  - então cria `forma_registro=ARBITRAGEM` via `criar_surebet_atomica`.
- Esse desvio será removido/desativado para o formulário de Aposta Simples.
- O fluxo correto será:

```text
Nova Aposta > Aposta Simples
  -> forma_registro = SIMPLES
  -> estratégia default = PUNTER
  -> 1 ou mais casas em apostas_pernas
  -> liquidação global aplica o mesmo resultado a cada casa
```

3. Manter Surebet verdadeira apenas no formulário próprio de arbitragem
- A criação de arbitragem continuará existindo apenas no formulário/painel de Surebet (`SurebetModalRoot`).
- Esse sim continua usando `forma_registro=ARBITRAGEM`, estratégia `SUREBET` e o motor próprio de cenários.

4. Ajustar o cabeçalho visual para não exibir estratégia travada incorreta no formulário simples
- `BetFormHeaderV2` atualmente bloqueia a estratégia quando `activeTab` é uma aba especializada, incluindo `surebet`.
- Para `formType="simples"`, não deve travar como `SUREBET` só porque a janela foi aberta na aba Surebet.
- Resultado esperado: ao abrir “Aposta Simples” em qualquer aba operacional, o comportamento e cálculo serão equivalentes ao que hoje funciona na aba Punter.

5. Revisar o cálculo persistido da aposta simples multi-casa
- Para uma aposta normal, por casa:
  - stake R$ 100
  - odd 2.00
  - GREEN: retorno bruto R$ 200 e lucro líquido R$ 100
  - RED: retorno R$ 0 e lucro líquido -R$ 100
  - VOID: retorno R$ 100 e lucro líquido R$ 0
- Para 3 casas iguais, todas GREEN:
  - cada casa recebe +R$ 200 de payout após ter debitado R$ 100 de stake
  - lucro líquido por casa: +R$ 100
  - lucro líquido total: +R$ 300
- Vou garantir que o pai da aposta não use cálculo de arbitragem nem valor consolidado como se fosse moeda nativa.

6. Validar funções de liquidação multi-casa
- As funções de liquidação já têm suporte para `apostas_pernas`, criando eventos por perna.
- Vou revisar o caminho usado por `liquidarAposta` para confirmar que a liquidação de uma aposta simples multi-casa passa por `liquidar_aposta_v4`/`reliquidar_aposta_v6`, não por fluxo de surebet.
- Se necessário, farei uma migração pequena para reforçar a regra no backend: `SIMPLES + múltiplas pernas` é permitido quando a estratégia não é `SUREBET`.

Arquivos previstos

- `src/components/projeto-detalhe/ApostaDialog.tsx`
- `src/components/apostas/BetFormHeaderV2.tsx`
- Possivelmente `src/components/apostas/BetFormHeader.tsx` se ainda for usado em algum fluxo legado
- Possivelmente `src/lib/apostaConstants.ts` para separar “aba ativa” de “estratégia travada” no contexto de aposta simples
- Possivelmente uma migração de backend se a validação atual bloquear indevidamente `SIMPLES` com múltiplas pernas

Critérios de aceite

- Abrir “Aposta Simples” pela aba Punter, Surebet, ValueBet ou Apostas deve gerar o mesmo tipo operacional: `forma_registro=SIMPLES`.
- Adicionar 2, 3 ou mais casas no formulário simples não deve criar arbitragem.
- A aposta simples multi-casa deve ser liquidável globalmente com GREEN/RED/VOID.
- Exemplo validado: 3 casas, cada uma stake R$ 100 odd 2.00, resultado GREEN:
  - casa 1: retorno R$ 200, lucro R$ 100
  - casa 2: retorno R$ 200, lucro R$ 100
  - casa 3: retorno R$ 200, lucro R$ 100
  - total: retorno bruto R$ 600, lucro líquido R$ 300
- O formulário próprio de Surebet/Arbitragem continuará funcionando separado, sem perder regras de cenário e recálculo de arbitragem.