Diagnóstico inicial confirmado:

A operação mostrada no print tem 2 pernas de US$ 100 com odd 2.00:

```text
AMUNRA    stake US$ 100 -> payout esperado US$ 200
MY EMPIRE stake US$ 100 -> payout esperado US$ 200
```

Como a stake deveria ter sido debitada na criação, o saldo final correto em cada casa seria:

```text
saldo inicial 100 + bônus 100 - stake 100 + payout 200 = US$ 300
lucro líquido da operação por casa = US$ 100
```

Mas o banco mostra:

```text
AMUNRA    saldo_atual = US$ 400
MY EMPIRE saldo_atual = US$ 400
```

A causa encontrada não é duplicação do payout da operação atual. O problema é mais grave: a criação dessa surebet inseriu `apostas_unificada` e `apostas_pernas` diretamente pela UI, mas não gerou eventos `STAKE` no `financial_events`. Depois, na liquidação, a RPC `liquidar_perna_surebet_v1` gerou corretamente os eventos `PAYOUT` de US$ 200 por perna. Como não houve débito anterior de US$ 100 por perna, cada casa ficou inflada em US$ 100.

Evidência da operação atual:

```text
aposta_id: 6413da1b-8620-486a-b1e2-731726298f1a
pernas: 2
stake total pelas pernas: US$ 200
STAKE events: 0
PAYOUT events: 2
PAYOUT total: US$ 400
```

Fluxo defeituoso encontrado:

```text
SurebetDialog / SurebetDialogTable
  -> insert direto em apostas_unificada
  -> insert direto em apostas_pernas
  -> NÃO cria financial_events STAKE
  -> liquidação cria PAYOUT
  -> saldo fica inflado
```

Fluxo correto que deve ser usado:

```text
criar_surebet_atomica
  -> cria pai
  -> cria pernas
  -> cria STAKE no financial_events para cada perna
  -> trigger atualiza saldo_atual
```

Plano de correção segura:

1. Trocar a criação de surebet para o motor atômico
   - Refatorar `SurebetDialog.tsx` e `SurebetDialogTable.tsx` para não fazerem mais insert direto em `apostas_unificada` + `apostas_pernas`.
   - Usar a RPC canônica `criar_surebet_atomica`, que já cria os eventos `STAKE` e mantém saldo, pernas e operação em uma única transação.

2. Blindar contra bypass futuro
   - Adicionar uma barreira no código para centralizar criação de surebet em um helper/serviço único.
   - Remover ou isolar caminhos de inserção direta para `forma_registro = ARBITRAGEM`.
   - Garantir que qualquer criação de operação com múltiplas pernas passe pelo ledger.

3. Corrigir a incompatibilidade de sinais se necessário
   - A RPC atual de criação grava `STAKE` com valor negativo.
   - O trigger atual usa o valor diretamente, então isso está consistente.
   - Confirmar no ajuste final que não existe nenhuma função antiga ainda gravando `STAKE` com sinal positivo.

4. Simulações obrigatórias antes de liberar
   - Surebet 2 pernas, mesma moeda: saldo deve reduzir na criação e creditar payout na liquidação.
   - Surebet 2 pernas com uma vencedora: apenas a casa vencedora recebe payout; a outra mantém débito da stake.
   - Surebet com sub-entries/mesma seleção em duas casas: cada casa precisa gerar seu próprio `STAKE`.
   - Surebet multimoeda: stake e payout em moeda nativa, consolidação separada.
   - Deleção de surebet pendente: deve reverter stakes.
   - Deleção de surebet liquidada: deve reverter stake + payout líquido sem duplicar.
   - Reliquidação: trocar GREEN/RED/VOID não pode deixar payout antigo ativo.

5. Auditoria sem retrofix automático
   - Criar uma consulta de auditoria para listar operações com pernas e sem eventos `STAKE`, semelhante ao caso atual.
   - Não farei correção em massa diretamente no ledger, porque o projeto tem política anti-retrofix para dados financeiros.
   - Para casos já afetados, o caminho seguro é apresentar a lista de inconsistências e, se aprovado, aplicar ajustes explícitos via `AJUSTE_SALDO`/procedimento controlado, nunca update direto em `saldo_atual` nem deleção de ledger.

6. Atualização de caches/UI após criação, liquidação, edição e exclusão
   - Manter a invalidação canônica já adicionada para Visão Geral.
   - Garantir que criação e edição de surebet também invalidem `bookmaker-saldos`, `projeto-dashboard-apostas`, calendário e KPIs canônicos.

Arquivos previstos:

```text
src/components/projeto-detalhe/SurebetDialog.tsx
src/components/projeto-detalhe/SurebetDialogTable.tsx
src/services/aposta/ApostaService.ts ou novo helper canônico de surebet
src/utils/__tests__/... testes/simulações de ledger de surebet
supabase/migrations/... se for necessário blindar no banco
```

Resultado esperado:

Depois da correção, uma surebet com US$ 100 em AMUNRA e US$ 100 em MY EMPIRE, ambas @2.00 e GREEN, ficará com apenas US$ 100 de lucro líquido por casa, porque o sistema passará a registrar:

```text
criação:   STAKE  -100 em cada casa
liquidação: PAYOUT +200 em cada casa
net:       +100 em cada casa
```

Isso elimina a inflação atual de saldo e impede que novas operações de surebet nasçam sem débito de stake.