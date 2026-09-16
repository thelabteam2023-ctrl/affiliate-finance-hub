# Lucro Realizado: card x extrato — origem dos R$ 0,34 e fonte de verdade única

## O que a auditoria encontrou (já confirmado nos dados)

Os dois indicadores somam exatamente os mesmos lançamentos do BONUS EVVERTON. O que muda é a **cotação do dólar** usada para converter:

| Onde | Cotação usada | Resultado |
|---|---|---|
| Card do projeto | Cotação oficial (PTAX do dia) = 5,15470 | R$ 351,04 |
| Extrato / Recuperação de Capital | Cotação de Trabalho do projeto = 5,15370 | R$ 350,70 |

Conta que fecha a diferença, centavo a centavo:

```text
Fluxo em reais   : saques 2.490 + 1.102 − depósitos 2.500 − 2.500 = −1.408,00
Fluxo em dólar   : saque 1.341,25 − depósito 1.000,00            = +341,25
351,04 = −1.408,00 + 341,25 × 5,15470
350,70 = −1.408,00 + 341,25 × 5,15370
0,34   = 341,25 × 0,00100
```

Não é arredondamento nem dupla conversão: a dupla conversão BRL→USD→BRL já foi eliminada na correção anterior. É estritamente a taxa.

A regra do sistema (memória do projeto) é clara: **consolidação de projeto usa sempre a Cotação de Trabalho**. Logo o valor certo é R$ 350,70 e o card é que está fora do padrão.

## O que será feito

1. **Card do projeto passa a usar a Cotação de Trabalho** no Lucro Realizado, exatamente como o Extrato. O card passará a exibir R$ 350,70.
2. **Mesmo resolvedor de valor para os dois lugares**: o card passa a usar a regra canônica já criada (moeda nativa primeiro, depois cotação congelada do lançamento, depois Cotação de Trabalho), em vez de converter o valor bruto pela cotação oficial.
3. **Depósito com valor confirmado**: hoje o card lê o valor nominal do depósito (US$ 1.000) e ignora o confirmado (US$ 1.005); o Extrato faz o mesmo. Isso será mantido de propósito — os US$ 5 são registrados à parte como diferença de recebimento e entram pelo saldo da casa, não pelo depósito. Documentado para não ser "corrigido" por engano depois.
4. **"Lucro se sacar tudo" fica como está conceitualmente** (saques + saldo atual das casas − depósitos = patrimônio líquido hoje), mas ganha rótulo e explicação deixando explícito que é conceito diferente de Lucro Realizado: inclui o que ainda está parado nas casas e marca o saldo estrangeiro pela cotação de hoje.
5. **Resíduo "Não conciliado −R$ 3,03"** na composição do resultado: passa a ser exibido como *Reavaliação cambial da posição* em vez de "verificar lançamentos", já que é exatamente o resultado em dólar remarcado entre a cotação da operação e a atual. Se sobrar algo além disso, aí sim continua aparecendo como não conciliado.
6. **Testes de regressão** cobrindo card e extrato lado a lado: projeto em real com fluxo em dólar, projeto em dólar, cotação de trabalho diferente da oficial, saque parcial. O critério é card == extrato para o mesmo conceito.

## Detalhes técnicos

- `src/services/fetchProjetosLucroCanonico.ts` (bloco "LUCRO REALIZADO"): trocar `convertOficial` por `convertTrabalho` e passar cada linha por `resolveValorConsolidado` (`valor`, `moeda`, `valor_usd_referencia`), incluindo os `valor_usd_referencia` no `select` de depósitos e saques. A agregação workspace-wide em BRL (`convertToBRL`) permanece com cotação oficial — ali o objetivo é somar projetos de moedas diferentes, não reproduzir o KPI do projeto.
- `src/components/projeto-detalhe/ReconciliacaoBreakdown.tsx`: linha de resíduo passa a distinguir reavaliação cambial de resíduo real.
- `src/components/projeto-detalhe/ExtratoProjetoTab.tsx`: apenas texto/tooltip do "Lucro se sacar tudo".
- Nenhuma migração, nenhum dado histórico alterado — a mudança é só de leitura/apresentação.
- Memória a atualizar: `mem/finance/reconciliacao-lucro-realizado-standard.md` com "Lucro Realizado do card e do extrato usam Cotação de Trabalho; cotação oficial só para agregação multi-projeto".
- Validação: `npx tsgo --noEmit -p tsconfig.app.json` + vitest dos novos testes.
