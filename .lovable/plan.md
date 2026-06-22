
# Detalhamento de Resultado por Projeto + separar Realizado vs Teórico

## Problema

Hoje a linha "Resultado operacional acumulado" no card **Capital Próprio**:

1. **Não mostra origem** — é só um número agregado. Não dá para saber se veio do projeto Ítalo, Marcio, etc.
2. **É um número teórico** — inclui saldo ainda parado dentro das casas. Esse saldo pode não retornar integralmente (limitação, scam, conta fechada). Não diferencia o que **já voltou para o caixa** (lucro realizado, fato) do que **ainda está nas casas** (capital exposto, promessa).
3. **Não mostra a moeda original** — projetos em USD são apresentados só em BRL convertido, perdendo a referência da operação real.

## O que será entregue

### A) Renomear/reestruturar a linha em 3 camadas

Onde hoje existe "Resultado operacional acumulado", passa a existir um mini-bloco com três linhas, em ordem de "solidez":

```text
Resultado Realizado            R$ 18.200       ← já voltou ao caixa (FATO)
Resultado Teórico (atual)      R$ 22.500       ← inclui saldo nas casas
  └─ Capital exposto           R$  4.300       ← diferença = ainda nas casas
```

- **Resultado Realizado** = soma do `lucroRealizadoBRL` de cada projeto (já existe no serviço canônico `fetchProjetosLucroCanonico`, fórmula `(Saques + Saques Virtuais) − (Depósitos + Depósitos Virtuais)`). Cor verde sólida quando ≥0.
- **Resultado Teórico** = valor que a linha mostra hoje (Patrimônio − Capital Próprio Investido). Cor mais discreta, com badge "teórico".
- **Capital exposto** = Teórico − Realizado. Em vermelho/âmbar quando significativo. Tooltip: "Lucro contábil que ainda está em saldo nas casas — depende de saque para virar dinheiro real".

Esse trio responde diretamente a pergunta do usuário: "qual é meu lucro real já realizado vs o que ainda é farsa".

### B) Clique abre **Drawer "Resultado por projeto"**

Qualquer uma das três linhas (Realizado / Teórico / Capital Exposto) vira clicável e abre um Drawer (lateral, direita) listando **um item por projeto** com:

```text
Projeto Ítalo                                    [USD → BRL]
  Lucro Operacional    $ 1.250,00   ≈ R$ 6.875,00
  Lucro Realizado      $   800,00   ≈ R$ 4.400,00
  Capital Exposto      $   450,00   ≈ R$ 2.475,00

Projeto Marcio                                   [BRL]
  Lucro Operacional    R$ 4.200,00
  Lucro Realizado      R$ 3.100,00
  Capital Exposto      R$ 1.100,00

…

Total (BRL)
  Lucro Operacional  R$ 22.500,00
  Lucro Realizado    R$ 18.200,00
  Capital Exposto    R$  4.300,00
```

Regras de apresentação:
- **Se o projeto for em BRL** → mostra **só BRL**, sem "≈".
- **Se o projeto for em moeda estrangeira (USD/EUR/…)** → mostra valor na moeda original, e logo ao lado `≈ R$ X` com a Cotação de Trabalho do projeto (já é o que o serviço retorna).
- Badge da moeda do projeto ao lado do nome (`USD`, `EUR`, `BRL`).
- Linhas ordenáveis: por padrão, do maior **Capital Exposto** para o menor (chama atenção ao risco). Cabeçalho permite alternar por Realizado.
- Filtro rápido: "Mostrar só projetos com capital exposto > 0".
- Total no rodapé, fixo, em BRL (moeda de consolidação do workspace).
- Estado vazio: "Nenhum projeto com movimentação no escopo".

Botão "Abrir projeto" em cada item leva para `/projetos/:id` (navegação igual à existente em outros cards).

### C) Onde encaixa

- Componente novo: `src/components/financeiro/ResultadoPorProjetoDrawer.tsx`
- Acionado a partir de `src/components/financeiro/PosicaoCapitalCard.tsx` (substituindo a linha única "Resultado operacional acumulado" pelo trio + clique).
- Usa shadcn `Sheet` (lateral) para não bloquear o dashboard.

## Como construir

### Dados
Reaproveitar 100% o que já existe:

- `fetchProjetosLucroCanonico({ projetoIds, cotacoesOficiais })` — já retorna por projeto:
  - `consolidado` (Lucro Operacional Teórico) **na moeda do projeto**
  - `lucroRealizado` na moeda do projeto
  - `lucroRealizadoBRL` (para somar no total)
  - `moedaConsolidacao` (BRL/USD/EUR/…)
  - `porMoeda` (mantido para futuras drilldowns)

Falta apenas:
- Para o item da lista no Drawer, devolver também `consolidadoBRL` (Lucro Operacional convertido para BRL via Cotação de Trabalho do projeto, para somar no total). Cálculo trivial: dentro do loop do serviço já temos `convertTrabalho`; basta expor `consolidadoBRL = convertTrabalho(consolidado, moedaConsolidacao) ` quando `moedaConsolidacao !== 'BRL'` ou usar a cotação trabalho USD→BRL diretamente. Acrescentar campo `consolidadoBRL` no tipo `LucroCanonicoResultado` (não breaking — adição).
- `capitalExpostoProjeto = consolidado − lucroRealizado` (na moeda do projeto) e `capitalExpostoBRL = consolidadoBRL − lucroRealizadoBRL` (para totais).

### Hook
Novo `src/hooks/useResultadoPorProjeto.ts`:
- Input: `workspaceId`, cotações oficiais.
- Busca lista de projetos ativos do workspace (mesma query usada hoje em `useWorkspaceLucroRealizado`).
- Chama `fetchProjetosLucroCanonico` e devolve `{ items, totaisBRL, loading, refresh }`.
- Cada `item`: `{ id, nome, moeda, lucroOperacional, lucroOperacionalBRL, lucroRealizado, lucroRealizadoBRL, capitalExposto, capitalExpostoBRL }`.

### UI no card
Substituir a linha única atual por:

```tsx
<BreakdownRow
  label="Resultado Realizado"
  value={resultadoRealizadoBRL}
  hint="(Saques + Saques Virtuais) − (Depósitos + Depósitos Virtuais), somado de todos os projetos. Dinheiro que já voltou ao caixa."
  onClick={() => openDrawer('realizado')}
/>
<BreakdownRow
  label="Resultado Teórico"
  badge="teórico"
  value={resultadoTeoricoBRL}
  hint="Lucro contábil considerando o saldo atual ainda nas casas. Pode não se realizar integralmente se houver limitação/scam."
  onClick={() => openDrawer('teorico')}
/>
<BreakdownRow
  label="↳ Capital exposto nas casas"
  value={capitalExpostoBRL}
  tone="warning"
  hint="Diferença entre Teórico e Realizado — quanto ainda depende de saque para virar dinheiro real."
  onClick={() => openDrawer('exposto')}
/>
```

Onde:
- `resultadoTeoricoBRL = patrimonioAtual − capitalLiquidoAcumulado` (já calculado).
- `resultadoRealizadoBRL` vem do hook novo (soma dos `lucroRealizadoBRL`).
- `capitalExpostoBRL = resultadoTeoricoBRL − resultadoRealizadoBRL`.

### Componente Drawer
- `Sheet` lateral, `side="right"`, largura `sm:max-w-xl`.
- Header: título "Resultado por projeto" + tabs internas (Visão completa | Só com exposição).
- Cabeçalho de coluna com ordenação.
- Linhas com 3 valores cada (Lucro Op / Realizado / Exposto), pintadas conforme sinal.
- Para moedas estrangeiras: valor original em destaque, conversão BRL em fonte menor abaixo, ambas alinhadas à direita.
- Rodapé fixo: totais em BRL.

## Regras de memória respeitadas

- Lucro Realizado: fórmula canônica `(Saques + Saques Virtuais) − (Depósitos + Depósitos Virtuais)` (memória `lucro-real-payment-standard`).
- Conversão sempre via Cotação de Trabalho do projeto (memórias `analytics-snapshot-conversion-hierarchy`, `volume-snapshot-cotacao-trabalho-standard`).
- Lucro Operacional canônico via `calcularLucroCanonicoFromRpc` (memória `canonical-operational-profit-standard`, `project-card-lucro-canonico-source`).
- Isolamento por `workspace_id` em todas as queries.
- Zero migração, zero alteração de ledger, zero RPC nova — só leitura e composição de serviços existentes.

## Fora do escopo
- Drilldown "evento a evento" dentro do projeto (já existe na própria tela do projeto).
- Filtro por período no Drawer (Lucro Operacional é lifetime por design do serviço canônico — manter coerente).
- Editar/sacar a partir do Drawer.

## Validação
1. Abrir Financeiro → card mostra trio Realizado / Teórico / Capital Exposto.
2. Soma: Realizado + Capital Exposto ≈ Teórico (tolerância 0,01).
3. Clicar em qualquer das 3 linhas abre o Drawer com a lista por projeto.
4. Projeto BRL aparece só com BRL; projeto USD aparece com USD e `≈ R$`.
5. Soma dos `_BRL` dos projetos = total do rodapé = valor mostrado no card.
6. Projetos sem movimento ficam fora por padrão (ou aparecem zerados se o usuário tirar o filtro).
