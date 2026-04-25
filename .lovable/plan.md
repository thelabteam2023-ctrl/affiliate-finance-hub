Confirmei indícios fortes de inconsistência na aposta do Manchester:

- Projeto está com `moeda_consolidacao = USD`, `fonte_cotacao = TRABALHO`, `cotacao_trabalho = 5`.
- A aposta `MANCHESTER UNITED X BRENTFORD` gravada via formulário simples está como `moeda_operacao = MULTI`, `stake = 200`, `stake_consolidado = 200`.
- As pernas estão assim:
  - USD 100
  - BRL 500
- Com cotação de trabalho 5, o total consolidado correto em USD é `100 + (500 / 5) = 200`. Então o agregado do pai ficou matematicamente correto.
- Porém as pernas foram gravadas com `cotacao_snapshot = null` e `stake_brl_referencia = null`. Isso viola o nosso padrão de snapshot por operação/perna e deixa dependente de fallback em outras leituras.

O problema principal encontrado: o formulário de aposta simples (`ApostaDialog`) calcula usando `convertToConsolidation`, que hoje usa Cotação de Trabalho, mas ao salvar não congela `cotacao_snapshot`/`stake_brl_referencia` nas pernas de multi-entry e também não grava snapshot no pai para aposta simples mono-moeda estrangeira. Isso dá a impressão/risco de uso de cotação oficial em renderizações e relatórios que dependem desses campos.

Também encontrei pontos que precisam padronização:

- `useApostasUnificada.criarArbitragem`: usa `getSnapshotFields` sem passar override da cotação de trabalho, então pode cair na cotação oficial.
- `ApostaMultiplaDialog`: USD usa `useProjetoConsolidacao.cotacaoAtual`, mas outras moedas usam `exchangeRates.getRate`, ou seja, oficial/live para EUR/GBP/MYR/MXN/ARS/COP.
- Formulários próprios de Surebet (`SurebetDialogTable` e `SurebetModalRoot`) já têm lógica de `getEffectiveRate` com Cotação de Trabalho e passam override para `getSnapshotFields`; estes parecem mais alinhados.
- `ProjetoSurebetTab` passa `convertFnOficial` para alguns cards/gráficos/exportações; para exibição operacional de cards isso deve ser revisado para não usar cotação oficial quando houver necessidade de conversão fallback.

Plano de correção:

1. Criar um helper único para taxa de trabalho por moeda
   - Centralizar a leitura das cotações de trabalho do projeto para USD, EUR, GBP, MYR, MXN, ARS e COP.
   - Regra: Cotação de Trabalho válida > fallback oficial apenas se não existir taxa de trabalho cadastrada.
   - Stablecoins USD (`USDT`, `USDC`) usam a taxa de USD.

2. Corrigir o formulário de aposta simples (`ApostaDialog`)
   - Usar o helper de taxa efetiva/trabalho no save.
   - Para aposta simples mono-moeda estrangeira, gravar no pai:
     - `cotacao_snapshot`
     - `cotacao_snapshot_at`
     - `valor_brl_referencia`
     - `conversion_source = TRABALHO` quando aplicável
   - Para multi-entry, gravar em cada registro de `apostas_pernas`:
     - `cotacao_snapshot`
     - `stake_brl_referencia`
     - `cotacao_snapshot_at`, se a tabela aceitar esse campo
   - Manter o pai multi-moeda com `stake_consolidado` na moeda do projeto, como já funcionou no caso Manchester.

3. Corrigir criação por `useApostasUnificada.criarArbitragem`
   - Passar a Cotação de Trabalho para `getSnapshotFields` em vez de deixar cair na cotação oficial.
   - Garantir que as pernas normalizadas herdem os snapshots corretos.

4. Corrigir aposta múltipla (`ApostaMultiplaDialog`)
   - Substituir `exchangeRates.getRate(...)` para outras moedas por taxa de trabalho do projeto quando existir.
   - Gravar snapshot coerente no pai para qualquer moeda estrangeira, não só USD.

5. Revisar renderização/exportação na aba Surebet
   - Trocar `convertFnOficial` por conversão de trabalho nos cards operacionais quando a função for usada como fallback de exibição.
   - Manter oficial/PTAX apenas onde for KPI de realização financeira, se houver esse caso explícito.

6. Validação pós-correção
   - Rodar verificação TypeScript.
   - Criar/inspecionar uma aposta simples multi-entry BRL+USD em Surebet e confirmar:
     - pai com `stake_consolidado = 200` no exemplo 100 USD + 500 BRL com cotação 5;
     - pernas com snapshots preenchidos;
     - card exibindo o mesmo total esperado sem depender de cotação oficial.
   - Auditar também uma aposta múltipla em moeda estrangeira para confirmar que o snapshot usa Cotação de Trabalho.