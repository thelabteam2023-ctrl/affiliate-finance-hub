# Auditoria e Sincronização: Resultado por Estratégia × Evolução de Lucro

## Diagnóstico
O sistema apresenta divergências entre o KPI de "Resultado por Estratégia" e o gráfico de "Evolução de Lucro" porque, apesar de ambos usarem o hook `useCanonicalCalendarDaily` como fonte no `ProjetoDashboardTab`, a camada de agregação e filtros pode introduzir variações (filtros de data civil vs UTC, arredondamentos ou inclusão de módulos extras).

### Fluxos Atuais
1.  **KPI Resultado por Estratégia:**
    *   `ProjetoDashboardTab.tsx` → `useKpiBreakdowns` → `FinancialMetricsService.calculate` (ou derivação in-memory).
    *   Usa `useProjetoDashboardData` (RPC `get_projeto_dashboard_data`).
2.  **Gráfico Evolução de Lucro:**
    *   `ProjetoDashboardTab.tsx` → `useCanonicalCalendarDaily` (RPC `get_projeto_lucro_operacional_daily`).
    *   Os pontos do gráfico são alimentados pelo `canonicalDaily`.

### Problema Identificado
O `useKpiBreakdowns` deriva o lucro a partir dos dados brutos da RPC principal, enquanto o gráfico usa uma RPC secundária focada em dados diários. Embora ambas devessem ser idênticas, qualquer diferença na lógica de `FinancialMetricsService` vs `get_projeto_lucro_operacional_daily` causa a divergência. Além disso, o `dateRange` aplicado no frontend pode filtrar os dados de forma diferente entre o KPI agregado e os pontos do gráfico.

---

## Plano de Ação

### 1. Camada Canônica de Agregação
Criar um hook unificado `useProjetoProfitSourced` que utilize a fonte canônica (`useCanonicalCalendarDaily`) para derivar tanto o valor total do período quanto a distribuição temporal.

### 2. Sincronização de Filtros
Garantir que o `lucroKpiData` exibido no topo do gráfico seja SEMPRE a soma dos pontos visíveis no gráfico, sem exceções.

### 3. Integração de Perdas Operacionais
Validar que a RPC `get_projeto_lucro_operacional_daily` no banco de dados já integra o módulo `LOSS` (Perda Operacional) conforme a diretriz V6 recém-implementada, garantindo que o gráfico reflita o impacto econômico na data correta.

### 4. Implementação Técnica
*   **Refatoração no `ProjetoDashboardTab.tsx`**: Alterar o cálculo do `lucroKpiData` para ser derivado exclusivamente do `mergedCalendarData` filtrado.
*   **Paridade em `UnifiedStatisticsCard`**: Passar os mesmos parâmetros de consolidação e dados filtrados para garantir que as estatísticas avançadas coincidam com o lucro total.
*   **Validação da RPC `get_projeto_lucro_operacional_daily`**: Verificar se o SQL inclui transações de `PERDA_OPERACIONAL` via Ledger.

---

## Arquivos Afetados
*   `src/components/projeto-detalhe/ProjetoDashboardTab.tsx`: Unificação da fonte de dados.
*   `src/hooks/useCanonicalCalendarDaily.ts`: Adição de suporte a perdas operacionais se necessário.
*   `src/services/FinancialMetricsService.ts`: Alinhamento de fórmulas.
*   `src/components/projeto-detalhe/VisaoGeralCharts.tsx`: Garantia de exibição do lucro canônico passado por prop.

---

## Teste de Aceite
1. Selecionar o projeto "Lucas Pereira".
2. Confirmar que o lucro do KPI de Estratégias = Soma dos pontos do gráfico.
3. Inserir uma perda operacional de R$ 1.422,44 e verificar se o gráfico cai exatamente este valor na data do registro.
