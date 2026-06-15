## Diagnóstico

Hoje o KPI do topo do card "Exposição & Perdas" mostra `R$ 18.740,32` — esse valor é `totalConsolidado` = `Em disputa + Perdas confirmadas no período`. A porcentagem `11,3% do patrimônio total` também é calculada sobre esse total somado. Isso mistura dois conceitos com semânticas distintas:

- **Em disputa** = capital ainda exposto, recuperável (posição atual, tempo real).
- **Perdas confirmadas no período** = capital já reconhecido como perda no recorte temporal.

Somar os dois no header esconde a informação útil e torna a porcentagem ambígua.

Além disso, o badge "Junho de 2026" aparece dentro da seção "Perdas confirmadas no período", deslocado do contexto geral. Ele deveria identificar o **período do card inteiro** (consistência com outros cards do dashboard que mostram o período no cabeçalho).

## Proposta

### 1. Header do card — eliminar o total somado

Substituir o número único grande no topo por **duas métricas paralelas**:

```text
Exposição & Perdas                        [JUNHO DE 2026]
─────────────────────────────────────────────────────────
EM DISPUTA                  PERDAS NO PERÍODO
R$ 18.242,78                R$ 497,54
11,0% do patrimônio          0,3% do patrimônio
```

- **Coluna A — Em disputa**: `exp.totalEmDisputa` + `pctDisputaPatrimonio = totalEmDisputa / patrimonioTotal`.
- **Coluna B — Perdas no período**: `exp.totalPerdasPeriodo` + `pctPerdasPatrimonio = totalPerdasPeriodo / patrimonioTotal`.
- Cores: âmbar para "Em disputa" (recuperável), vermelho para "Perdas" (consumado) — mantém a paleta já em uso.
- Remover `pctLucro` (% do lucro op.) da seção Perdas, agora redundante.
- Remover o uso de `totalConsolidado` no header (mantém no hook por compatibilidade).

### 2. Período no cabeçalho — padronizar como nos demais cards

- **Mover** `periodBadge` (`JUNHO DE 2026`) da seção "Perdas confirmadas no período" para a linha do título `CardTitle`, ao lado de "Exposição & Perdas".
- A seção interna "Perdas confirmadas no período" deixa de carregar badge — o período já está implícito no cabeçalho.
- Padrão visual: badge sempre em **MAIÚSCULAS** (`uppercase` + `tracking-wide`), igual a outros cards.

### 3. Corpo do card — seções viram drill-downs sem repetir totais

- Seção **Em disputa** continua mostrando segmentos (Casas, Bancos, Wallets, Caixa) com barra de progresso e drill, **mas sem o total no header da seção** (já está no KPI superior). Mantém regra atual de ocultar resumo redundante.
- Seção **Perdas confirmadas no período** vira só o trigger de drill: linha clicável "Ver X ocorrências →", sem repetir o valor (já no KPI superior).

### 4. Auditoria de consistência de badges em outros cards (opcional, baixo custo)

- Varrer cards do `Financeiro.tsx` que recebem `periodBadge` e garantir que estão em UPPERCASE. Hoje o `periodBadge` é gerado no container; se já vier em maiúsculas, nada a fazer. Verificar e ajustar apenas o componente que renderiza o badge se necessário (1 ponto).

## Arquivos a alterar

- `src/components/financeiro/ExposicaoFinanceiraCard.tsx`
  - Reescrever `CardHeader`: título + `periodBadge` na linha do título, grid 2 colunas com Em Disputa / Perdas no Período + suas porcentagens individuais.
  - Remover o número grande `totalConsolidado` e seu `pctPatrimonio` único.
  - Seção "Em disputa" no body: remover linha-resumo de total (já está no header).
  - Seção "Perdas confirmadas no período" no body: remover `periodBadge` daqui e o número grande de perdas (já no header). Manter apenas o trigger clicável que abre o drawer.
- Não tocar em `useExposicaoFinanceira` (dados já existem: `totalEmDisputa`, `totalPerdasPeriodo`, `countPerdas`).
- Não tocar em `src/pages/Financeiro.tsx` — `periodBadge` continua sendo passado da mesma forma.

## Fora de escopo

- Não mexer no cálculo de `totalConsolidado` no hook (outros consumidores podem usar).
- Não mexer nas listas de drill (já redesenhadas no turno anterior).
- Não criar migrations.
- Auditoria visual exaustiva dos outros cards do Financeiro fica para um turno dedicado se o usuário pedir.
