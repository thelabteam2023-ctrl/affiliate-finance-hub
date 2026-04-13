

## Plano: Calculadora de Extração (nova ferramenta)

### Resumo

Criar uma nova ferramenta "Calculadora de Extração" que otimiza a conversão de bônus/freebet em dinheiro real via múltiplas (back) + hedge sequencial (lay em exchange). Ferramenta 100% client-side, sem mudanças no banco de dados.

### Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `src/lib/extracao-engine.ts` | Criar — motor de cálculo puro |
| `src/components/ferramentas/CalculadoraExtracaoContent.tsx` | Criar — UI principal |
| `src/pages/CalculadoraExtracao.tsx` | Criar — página standalone |
| `src/App.tsx` | Modificar — adicionar rota `/ferramentas/calculadora-extracao` |

---

### 1. Motor de cálculo (`extracao-engine.ts`)

Lógica pura sem React, exportando:

- **`generateOptimalStrategy(config)`** — Itera combinações de 2 a N eventos com odds distribuídas no range, seleciona a melhor por: menor perda máxima, menor capital, maior conversão.
- **`calculateHedgeSequence(strategy)`** — Calcula lay_stake, liability e lucro/perda para cada evento (lay 1 sempre, lay N só se N-1 ganhou).
- **`runMonteCarloSimulation(strategy, 10000)`** — Distribuição de lucro, pior caso, frequência de cada lay.
- **`classifyStrategy(results)`** — 🟢 Excelente / 🟡 Média / 🔴 Ruim.

**Fórmulas:**
- `odd_total = Π(odds[i])`
- `lay_stake_i = (acumulado_back × odd_acumulada_parcial) / lay_odd_i`
- `liability_i = lay_stake_i × (lay_odd_i - 1)`
- `lucro_exchange = lucro × (1 - comissão)`
- Constraint: `perda_maxima ≤ target × (1 - retention)`

---

### 2. UI (`CalculadoraExtracaoContent.tsx`)

**Painel de Inputs:**
- Valor a Extrair (R$), Bankroll (R$)
- Nº Eventos (min/max, 2-5)
- Range de Odds (min/max), Spread médio (%)
- Retenção alvo (slider 80%-95%)
- Comissão Exchange (%)
- Botão "Calcular"

**Estratégia Recomendada:**
- Card com nº eventos, odds sugeridas, odd total, badge 🟢/🟡/🔴

**Resultados Financeiros** (grid de cards):
- Valor extraído, Lucro líquido, Perda máxima (R$ e %), Taxa de conversão, Capital máximo, Capital esperado, Eficiência

**Hedge Detalhado** (tabela):
- Evento | Odd Back | Odd Lay | Lay Stake | Liability | Condicional?
- Timeline visual sequencial

**Probabilidades** (barras horizontais):
- P(parar no evento 1), P(chegar ao evento 2), ..., P(usar lay N)

**Simulação Monte Carlo** (seção expansível):
- Histograma de lucro (barras CSS), pior caso, frequência de cada lay

---

### 3. Página e Rota

- `CalculadoraExtracao.tsx` — wrapper com layout padrão
- Rota em `App.tsx`: `/ferramentas/calculadora-extracao`

