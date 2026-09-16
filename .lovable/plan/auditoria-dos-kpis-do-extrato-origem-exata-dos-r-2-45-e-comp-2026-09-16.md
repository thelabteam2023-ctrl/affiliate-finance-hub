# Auditoria dos KPIs do Extrato — origem exata dos R$ 2,45 e composição do Lucro Realizado

## O que a auditoria encontrou (com os números do BONUS EVVERTON)

Os lançamentos do projeto (todos confirmados, nada revertido):

| Lançamento | Moeda | Valor | Cotação congelada no registro |
|---|---|---|---|
| Depósito | BRL | 2.500,00 | 5,16270 |
| Depósito | BRL | 2.500,00 | 5,16270 |
| Depósito | USD | 1.000,00 (recebido 1.005) | 1,00 |
| Ganho na conciliação | USD | 5,00 | — |
| Saque | BRL | 2.490,00 | 5,16270 |
| Saque | BRL | 1.102,00 | 5,16270 |
| Saque | USD | 1.341,25 | 1,00 |

Saldo atual das três casas: **zero**. Cotação de Trabalho do projeto: **5,1537**.

**A diferença de R$ 2,45 tem origem única e comprovada: dupla conversão dos valores em reais.**
Os KPIs "Depósitos" e "Saques" do Extrato convertem todo lançamento para dólar pelo valor
congelado (5,16270) e devolvem para real pela Cotação de Trabalho (5,1537). Um valor que já
estava em reais faz a viagem BRL → USD → BRL com duas cotações diferentes:

```text
Depósitos em BRL: 5.000,00  ->  4.991,28   (-8,72)
Saques em BRL:    3.592,00  ->  3.585,74   (-6,26)
Efeito em (Saques - Depósitos):        +2,45
```

- Depósitos hoje: R$ 10.144,98 (deveria ser R$ 10.153,70)
- Saques hoje: R$ 10.498,14 (deveria ser R$ 10.504,40)
- "Lucro se sacar tudo": 10.498,14 + 0 − 10.144,98 = **R$ 353,16** (distorcido)
- Lucro Realizado (já corrigido): 10.504,40 − 10.153,70 = **R$ 350,70** (correto)

Ou seja: o Lucro Realizado já está certo; quem ainda distorce são os cartões de Depósitos,
Saques e "Lucro se sacar tudo".

## Definições confirmadas (serão documentadas, não forçadas a coincidir)

- **Lucro Realizado** = saques confirmados − depósitos efetivos. Só dinheiro que já voltou.
- **Lucro se sacar tudo** = saques + saldo atual das casas − depósitos. É a opção **C**:
  resultado já realizado + o que ainda está nas casas, avaliado pela cotação de hoje.
  Neste projeto os saldos são zero, então os dois indicadores coincidem — e isso é correto.
- **Operacional (teórico)** = resultado das operações pela cotação do dia de cada operação.
- Composição comprovada: Operacional R$ 327,96 + diferença cambial/financeira R$ 22,74 =
  Lucro Realizado R$ 350,70. Os R$ 22,74 são: +R$ 25,77 de crédito extra recebido na
  conciliação (US$ 5 na mesma moeda, não é câmbio) e −R$ 3,03 de conversão de capital
  (aporte em reais, recuperação em dólar).

## O que será feito

1. **Eliminar a dupla conversão nos KPIs do Extrato.** Depósitos, Saques, Ajustes, saques
   pendentes e baseline passam a usar a mesma regra já adotada no Lucro Realizado: valor na
   moeda de consolidação fica nativo; só o que está em outra moeda usa o valor congelado e,
   na falta dele, a Cotação de Trabalho. Depósitos passam a R$ 10.153,70, Saques a
   R$ 10.504,40 e "Lucro se sacar tudo" a R$ 350,70 neste projeto.
2. **Manter os dois indicadores separados**, com o texto explicativo dizendo o que cada um
   inclui e por que podem divergir (saldo parado nas casas e cotação de hoje).
3. **Tooltip no card de Projetos**, ao passar o mouse sobre o Lucro Realizado, mostrando a
   composição real calculada no banco: Operacional teórico, diferença cambial (separada em
   realizada, conversão de capital e reavaliação de posição aberta), crédito/perda de
   recebimento e o total. Carregado só quando o mouse entra no card, para não pesar a lista.
4. **Testes de regressão** reconstruindo o BONUS EVVERTON número a número (depósitos, saques,
   lucro realizado, lucro se sacar tudo, os R$ 2,45 e os R$ 22,74), além de casos em USD,
   USDT, projeto consolidado em dólar, saque parcial e saldo remanescente em casa.
5. **Registro da regra na memória do projeto**, para que nenhum KPI volte a converter um valor
   que já está na moeda do projeto.

## Detalhes técnicos

- `src/components/projeto-detalhe/ExtratoProjetoTab.tsx`: substituir o `resolveConsolidado`
  local (que prioriza `valor_usd_referencia` mesmo para BRL) por `resolveValorConsolidado`
  (`src/lib/ledger/resolveValorConsolidado.ts`), mantendo a regra atual de `valor_destino`,
  `valor_confirmado` em mesma moeda e exclusão de baseline. `variacaoCambialDepositos` passa
  a comparar apenas a parcela em moeda estrangeira.
- Fórmula de `resultadoCaixa` permanece `saques + saldo casas − depósitos`; muda só a conversão.
- Card: `src/components/projetos/ProjetoCard.tsx` (bloco "Lucro Realizado") + novo tooltip
  alimentado por `useProjetoReconciliacaoResultado`, com `enabled` acionado no hover.
- Testes: `src/lib/ledger/__tests__/` (novo caso extrato/card) e extração da agregação do
  Extrato para função pura testável, se necessário para cobrir os KPIs.
- Nenhum dado histórico é alterado; o ledger continua somente leitura.
