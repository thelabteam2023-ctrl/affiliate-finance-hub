## Objetivo
Evoluir o componente `PosicaoCapital` (já usado em `/caixa`) para exibir, dentro de cada barra de segmento, a parcela do capital comprometida com ocorrências operacionais abertas — sem criar dashboard novo, sem alterar o total patrimonial e sem dupla contagem.

## Fonte de dados — Capital em Disputa
Tabela `ocorrencias` com `status IN ('aberto','em_andamento')`. A coluna `valor_risco` (na `moeda` da ocorrência) é a exposição patrimonial. Capital já perdido (status `resolvido` com `valor_perda`) NÃO entra — ele já saiu do saldo via ledger.

Mapeamento ocorrência → segmento da Posição de Capital:

| Campo na ocorrência                                  | Segmento                                  |
| ---------------------------------------------------- | ----------------------------------------- |
| `bookmaker_id IS NOT NULL`                           | Bookmakers                                |
| `wallet_id IS NOT NULL`                              | Wallets Parceiros                         |
| `conta_bancaria_id` cujo `parceiro_id IS NULL`       | Caixa Operacional                         |
| `conta_bancaria_id` cujo `parceiro_id IS NOT NULL`   | Contas Parceiros                          |
| Nenhum dos acima (ex: só `projeto_id`)               | Não atribuído (ignorado na barra)         |

Conversão para BRL via `useCotacoes.convertToBRL(valor_risco, moeda)` — mesma engine já usada no componente. Cap final por segmento: `min(valorDisputaBRL, segmentValueBRL)` para evitar disputa > total.

## Mudanças

### 1. Novo hook `src/hooks/useCapitalEmDisputa.ts`
- Query única em `ocorrencias` filtrando `workspace_id` e status aberto/em_andamento, selecionando `id, valor_risco, moeda, bookmaker_id, wallet_id, conta_bancaria_id`.
- Resolve `parceiro_id` das `contas_bancarias` referenciadas (segunda query `IN (...)`).
- Retorna `{ bySegment: { bookmakers, 'caixa-op', wallets, 'contas-parc' }, byEntity: { bookmakerId→BRL, walletId→BRL, contaId→BRL }, loading }` — tudo já em BRL.
- `staleTime: 30_000`, `gcTime: 60_000`.

### 2. `src/pages/Caixa.tsx`
- Consumir `useCapitalEmDisputa()` e passar `capitalEmDisputa={bySegment}` para `<PosicaoCapital />`.

### 3. `src/components/caixa/PosicaoCapital.tsx`
- Aceitar nova prop opcional `capitalEmDisputa?: Record<string, number>` (BRL por `segment.id`).
- Em `dadosPosicao`, anexar a cada `CapitalSegment`:
  - `valorDisputa = min(capitalEmDisputa[id] ?? 0, value)`
  - `valorDisponivel = value - valorDisputa`
  - `pctDisputa = (valorDisputa / value) * 100`
- **Barra de progresso (linha do item)**: dividir em duas partes lado a lado — preenchimento sólido na cor do segmento (largura = `pctDisponivel` da própria barra) + sobreposição em `amber-500` com padrão listrado/hachura (largura = `pctDisputa` da própria barra). Largura total da barra continua sendo `item.pct` do patrimônio.
- **Textos sob o nome do segmento (`detail`)**: quando `valorDisputa > 0`, exibir segunda linha pequena: `Disponível R$ X · Em disputa R$ Y`.
- **Coluna direita**: abaixo do `pct.toFixed(2)%` existente, quando `valorDisputa > 0`, exibir `pctDisputa.toFixed(2)% em disputa` em `text-amber-500 text-[10px]`.
- **Donut central**: adicionar uma camada interna fina (raio menor, ex. `r=46` com `strokeWidth=4`) desenhada apenas para a fração `pctDisputa` dentro de cada arco do segmento, em `#f59e0b` com `opacity 0.85`. Usa o mesmo cálculo de ângulos já existente, mas o comprimento do arco é proporcional a `valorDisputa/value` dentro do trecho do segmento.
- **Tooltip do donut (`activeSegment`)**: quando o segmento tem disputa, anexar `· R$ Y em disputa (Z%)` ao texto atual.
- **Painel inline expandido**: acima da lista de breakdown adicionar um bloco compacto com 4 linhas — Capital Total, Disponível, Em Disputa (amber), Exposição `pctDisputa%`. Não alterar a lista de moedas existente.
- Manter cap de barra interna em 100% do segmento; nunca somar disputa ao total geral nem ao `dadosPosicao.total`.

## Comportamento garantido
- `R$` total da Posição de Capital permanece idêntico.
- Segmentos sem ocorrências abertas renderizam exatamente como hoje (sem zona amber, sem segunda linha).
- Capital já perdido continua fora da barra (sai naturalmente via saldos do ledger).
- Atualização automática quando ocorrências mudam de status (cache invalidado pelo `staleTime`; sem retrofit).

## Arquivos
- Novo: `src/hooks/useCapitalEmDisputa.ts`
- Editado: `src/components/caixa/PosicaoCapital.tsx`
- Editado: `src/pages/Caixa.tsx` (apenas hook + prop)

## Critérios de aceite
1. Em `/caixa`, segmentos com ocorrências abertas mostram zona amber proporcional na barra horizontal.
2. Tooltip e painel expandido exibem Capital Total, Disponível, Em Disputa e Exposição %.
3. Ocorrências `resolvido` não contam.
4. `valor_risco` em moeda estrangeira é convertido para BRL pelo mesmo `convertToBRL` usado no resto do card.
5. Total patrimonial no header do card permanece inalterado vs. produção atual.