# Revisão Estratégica do Dashboard Financeiro

Este plano é **diagnóstico + proposta de arquitetura** — nenhuma alteração de código será feita nesta etapa. Implementação só após sua aprovação dos novos KPIs.

---

## Parte 1 — Auditoria dos indicadores atuais

Fonte: `src/pages/Financeiro.tsx`, `src/hooks/useFinanceiroCalculations.ts`, `src/hooks/useFinanceiroData.ts` e os 7 cards em `src/components/financeiro/`.

### 1. Mapa de Patrimônio  ✅ MANTER
- **Cálculo**: soma de 4 segmentos consolidados em BRL via `convertUnified` (mesma engine do Caixa).
  - Caixa Operacional (`caixaFiat` + `caixaCrypto`)
  - Bookmakers (`bookmakersSaldos`, `Math.max(0, saldo_atual)`)
  - Contas Parceiros (`contasParceiros`)
  - Wallets Crypto (`walletsParceiros`)
- **Insumos**: views `v_saldo_*` e `caixaCrypto` via `useFinanceiroData`.
- **Objetivo original**: visão única de "onde está o dinheiro".
- **Decisão que apoia**: rebalanceamento entre ambientes, alocação por casa/parceiro.
- **Coerência**: ✅ alta. Já foi reforçado com Capital em Disputa.
- **Veredito**: pilar do novo dashboard. Manter como está.

### 2. Composição de Custos  ✅ MANTER
- **Cálculo**: agrupa `despesas` (PAGTO_PARCEIRO/FORNECEDOR, COMISSAO, BONUS, RENOVACAO, BONIFICACAO), `despesas_administrativas` (separando RH × infra) e `pagamentos_operador`. Donut + drill-down por categoria.
- **Insumos**: `despesas`, `despesas_administrativas`, `pagamentos_operador` no período filtrado.
- **Objetivo**: enxergar a estrutura de custo de sustentação.
- **Decisão que apoia**: corte de despesa, renegociação de parceiros, ajuste de quadro.
- **Coerência**: ✅ alta.
- **Veredito**: 2º pilar. Manter.

### 3. Equilíbrio Operacional  ❌ DESCONTINUAR
- **Cálculo**: `cobertura = lucroOperacionalApostas / custoSustentacao`, com 6 ramos (sem custo, prejuízo, sem atividade, etc.). Renderiza barras Lucro × Custo.
- **Objetivo original**: dizer "o lucro paga o custo?".
- **Problema**: redundante com `Lucro Real` e com a leitura cruzada de "Lucro Operacional vs Composição de Custos". Não traz informação acionável nova — só restate da razão de duas células já visíveis. Estados textuais ("Operação equilibrada") são subjetivos.
- **Veredito**: remover. Substituir por **Margem Operacional** (KPI numérico simples) dentro do header.

### 4. Eficiência do Capital  🛠 REMODELAR
- **Cálculo atual**: `Yield = lucro/volume`, `Turnover = volume/capitalMédio`. 6 faixas qualitativas.
- **Problema**: dois indicadores empilhados num card só, faixas arbitrárias, "capital médio" do período raramente disponível (cai em capital atual como fallback). O nome "Eficiência" sugere uma coisa só, mas mostra duas — confunde.
- **Reprojeto proposto**:
  - **ROIC do período** = `lucro_operacional_periodo / capital_medio_periodo` em % anualizado opcional.
  - Mostrar **Yield** e **Turnover** apenas como sub-métricas pequenas (linha de apoio), não como destaque visual.
  - Trazer o card para a faixa superior, ao lado do Mapa de Patrimônio.
- **Veredito**: manter conceito, recortar escopo, promover hierarquia.

### 5. Movimentação de Capital  ⚠ DEGRADAR (linha auxiliar)
- **Cálculo**: depósitos − saques em bookmakers BRL no período (`cash_ledger`). Mostra fluxo líquido e capital em operação (saldo atual).
- **Problema**: já existe `MovimentacoesTab` (histórico) e o `Mapa de Patrimônio` mostra "capital em operação". O card hoje só consolida um delta que está no Caixa.
- **Veredito**: descontinuar como card destacado; mover o número (fluxo líquido período) para uma faixa de mini-KPIs.

### 6. Custo de Sustentação  ⚠ ABSORVER
- **Cálculo**: `custoSustentacao = custosOperacionais + despesasAdmin + pagamentosOperadores` no período. Breakdown por categoria.
- **Problema**: é literalmente o total já visível no donut da Composição de Custos. Duplicação.
- **Veredito**: remover. O "Total" já fica no header da Composição de Custos (adicionar o número grande lá se ainda não estiver).

### 7. Rentabilidade da Captação  ❌ DESCONTINUAR
- **Cálculo**: classifica em 6 estados (`SEM_ATIVIDADE`, `EM_RAMP_UP`, `RECUPERANDO`, `LUCRATIVO`...) baseando-se em investimento × parceiros × lucro.
- **Problema**: indicador "semafórico" pouco quantitativo, depende do conceito de "investimento de captação" que se mistura com `custosAquisicao` (já no donut).
- **Veredito**: remover. Caso queira manter a leitura, expor `Payback de Aquisição` (ver Parte 2).

---

## Parte 2 — Novos indicadores propostos

### A. Scan no Período (Perda Operacional) — NOVO
**Pergunta que responde**: "Quanto perdi por scan/fraude e como isso se compara ao patrimônio e ao lucro?"

- **Fonte**: `cash_ledger` filtrando `tipo_transacao IN ('PERDA_OPERACIONAL','SCAN')` no período + tabela `ocorrencias` (status `aberto`/`em_andamento` já alimenta o Capital em Disputa).
- **Métricas do card**:
  1. `Total perdido no período` (somatório BRL convertido).
  2. `% sobre patrimônio total` = `total_scan / patrimonio_consolidado`.
  3. `% sobre lucro operacional do período` (se houver lucro).
  4. Gráfico de barras mensais — últimos 6 meses — para evolução.
  5. Lista compacta com origem (já temos `getOrigemInfo` com titular).
- **Decisão que apoia**: priorizar saneamento de contas de risco, decidir corte de bookmakers/parceiros.

### B. Capital Comprometido — NOVO
**Pergunta que responde**: "Quanto do meu patrimônio está hoje fora do meu controle imediato?"

- **Fonte**: `ocorrencias` com `status IN ('aberto','em_andamento')`, segmentadas por `origem_tipo`:
  - Bookmakers (`BOOKMAKER`)
  - Bancos/Processadores (`PARCEIRO_CONTA`)
  - Wallets (`PARCEIRO_WALLET`)
- Já calculado por `useCapitalEmDisputa` — basta promovê-lo a card de 1ª linha.
- **Métricas**:
  1. Total comprometido (BRL).
  2. Quebra por segmento (Bookmakers / Bancos / Wallets) com %.
  3. `% sobre patrimônio total`.
  4. Sparkline de evolução semanal (precisa novo snapshot — ver Parte 4).
  5. Top 5 ocorrências abertas (link para detalhe).
- **Decisão que apoia**: priorizar disputas, mensurar exposição operacional real.

### C. ROIC do Período — NOVO (substitui Eficiência atual)
- `Lucro Operacional / Capital Médio Operável` no período, com opção de anualizar.
- Sub-métricas: Yield, Turnover.

### D. Margem Operacional — NOVO (mini KPI no header)
- `Lucro Operacional / (Lucro Operacional + Custo de Sustentação)`. Substitui Equilíbrio Operacional.

### E. (Opcional) Payback de Aquisição
- `Custo Aquisição acumulado / Lucro mensal médio`. Em meses. Substitui semáforo de Rentabilidade da Captação por número.

---

## Parte 3 — Nova arquitetura visual proposta

```text
┌────────────────────────────────────────────────────────────────┐
│ FAIXA 1 — Header KPIs (4 cards 1x1)                            │
│ Patrimônio Total │ Lucro Operacional │ Margem Op. │ ROIC       │
├────────────────────────────────────────────────────────────────┤
│ FAIXA 2 — Visão Patrimonial (2 cards lado a lado)              │
│  Mapa de Patrimônio (2/3)        │ Capital Comprometido (1/3)  │
├────────────────────────────────────────────────────────────────┤
│ FAIXA 3 — Risco e Performance                                  │
│  Scan no Período (1/2)           │ Composição de Custos (1/2)  │
├────────────────────────────────────────────────────────────────┤
│ FAIXA 4 — Mini KPIs auxiliares (linha)                         │
│  Fluxo líquido bookm. │ Custo total │ Despesa RH │ Payback Aq. │
└────────────────────────────────────────────────────────────────┘
```

Removidos: Equilíbrio Operacional, Custo de Sustentação (vira número no header da Composição), Movimentação de Capital (vira mini-KPI), Rentabilidade da Captação.

---

## Parte 4 — Dependências de dados para implementação futura

| Indicador novo            | Origem existente? | Trabalho de backend                             |
| ------------------------- | ----------------- | ----------------------------------------------- |
| Scan no Período           | ✅ `cash_ledger`  | Nenhum — somatório no front                     |
| Capital Comprometido      | ✅ `ocorrencias`  | Reaproveitar `useCapitalEmDisputa`              |
| Evolução Capital Compr.   | ❌                | Snapshot semanal em `capital_snapshots` (novo)  |
| ROIC                      | ⚠ parcial        | Precisamos de `capital_medio_periodo` confiável: usar média diária de `capital_snapshots` |
| Margem Operacional        | ✅                | Apenas cálculo                                  |
| Payback de Aquisição      | ✅                | Cálculo derivado                                |

A única tabela nova/ampliada é `capital_snapshots` (já existe) — passar a registrar segmentação por ocorrências em aberto para alimentar a evolução temporal de "Capital Comprometido".

---

## Parte 5 — Próximos passos

1. **Validação com você**: aprovar quais indicadores remover, quais remodelar, quais adicionar — usar esta lista como checklist.
2. Definir período padrão de cada card (mês corrente vs 30d vs 90d).
3. Criar issue por card aprovado (Scan no Período, Capital Comprometido card, ROIC, Margem Op., reorganização do grid).
4. Implementação em ondas: primeiro **remover** o que sai (ganho de tela imediato), depois **adicionar** os novos.

Nenhum código será tocado até sua confirmação dos pontos acima.
