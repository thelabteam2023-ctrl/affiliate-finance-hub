# Memory: finance/metrica-lucro-ciclo-configurable
Updated: 2026-03-10

## Métrica de Lucro do Ciclo (Configurável por Projeto)

O campo `metrica_lucro_ciclo` na tabela `projetos` define como o lucro é calculado nos ciclos:

### Valores
- **`operacional`** (default): Lucro = Apostas + Cashback + Giros − Perdas. Mede produção independente de saques.
- **`realizado`**: Lucro = Saques Confirmados − Depósitos Confirmados (por `data_transacao`, atribuído via `projeto_id_snapshot`).

### Onde é respeitado
- `calcularMetricasPeriodo` → retorna ambos (`lucroLiquido` e `lucroRealizado`)
- `ProjetoCiclosTab` → usa `metricaLucroCiclo` do projeto para definir `lucroReal`
- `ComparativoCiclosTab` → busca `metrica_lucro_ciclo` do projeto para calcular `lucroReal`
- `useCicloAlertas` → busca via join `projeto:projetos(metrica_lucro_ciclo)` para alertas de meta
- `StepDadosBasicos` / `StepDadosBasicosEdit` → UI com RadioGroup para configuração
- `ProjectCreationWizard` / `ProjectEditWizard` → persistem o campo no banco

### Regra de Negócio
- Projetos onde operador **não controla saques** (surebet/arbitragem) → usar `operacional`
- Projetos onde operador **controla ciclo completo** (bônus) → usar `realizado`
- A escolha é feita no cadastro/edição do projeto e vale para todos os ciclos
