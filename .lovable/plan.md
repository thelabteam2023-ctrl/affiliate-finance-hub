# Recuperação de Capital em Vínculos → Extrato

## Objetivo
Exibir no topo da aba **Vínculos → Extrato** um card com barra de progresso de recuperação do capital aportado, replicando 1:1 a lógica usada hoje na seção "Break Even" do `ProjetoFinancialMetricsCard`.

## Fórmula (paridade com Indicadores Financeiros)
- **Capital Investido** = `depositosTotal` (soma de todos os `DEPOSITO` confirmados do projeto, na moeda de consolidação)
- **Capital Recuperado** = `saquesRecebidos` (soma de todos os `SAQUE` confirmados, exclui pendentes)
- **Percentual** = `min(100, recuperado / investido × 100)`
- **Pendente** = `max(0, investido − recuperado)`
- **Excedente** (quando recuperado > investido) = `recuperado − investido`, exibido como "Lucro líquido acumulado"

Cashback, giros, ajustes e ganho FX **não entram** na recuperação (continuam apenas em "Extras", como hoje).

## Escopo de dados
- Sempre **acumulado total do projeto** — não respeita filtros de período/busca/tipo aplicados no Extrato.
- Workspace-isolated (filtro `workspace_id` obrigatório).
- Atualiza automaticamente quando aportes/saques mudam (via React Query cache invalidation já existente).

## Arquitetura

### 1. Extrair hook compartilhado
Hoje o cálculo está embutido em `ProjetoFinancialMetricsCard.tsx` (linhas 52–223). Para garantir paridade absoluta e evitar drift:

- Criar `src/hooks/useProjetoRecuperacaoCapital.ts` que faz a mesma query mínima necessária:
  - `depositos`: `cash_ledger` onde `tipo_transacao = 'DEPOSITO'` e status confirmado
  - `saques`: `cash_ledger` onde `tipo_transacao = 'SAQUE'` e status confirmado
  - Filtrado por `projeto_id` e `workspace_id`
- Retorna `{ investido, recuperado, percentual, pendente, excedente, isLoading }` já consolidado na moeda do projeto via `useProjetoCurrency` (Cotação de Trabalho).
- Refatorar `ProjetoFinancialMetricsCard` para também consumir esse hook (mantém comportamento atual; reduz duplicação).

### 2. Novo componente de UI
`src/components/projeto-detalhe/RecuperacaoCapitalCard.tsx`:
- Card compacto (mesma família visual do `ProjetoFinancialMetricsCard`).
- Header: ícone `TrendingUp` + título "Recuperação de Capital".
- 3 KPIs em linha: Investido / Recuperado / Pendente (ou Excedente).
- Barra `<Progress />` do shadcn, capada em 100%.
- Cor: âmbar < 100%, esmeralda = 100%, esmeralda + badge "Lucro acumulado" > 100%.
- Mensagem complementar dinâmica:
  - `pct < 100`: "Faltam **R$ X** para recuperar integralmente o capital."
  - `pct == 100`: "Capital totalmente recuperado."
  - `pct > 100`: "Projeto operando acima do capital investido (+R$ Y de lucro acumulado)."
- Skeleton enquanto `isLoading`.

### 3. Integração
Em `src/components/projeto-detalhe/ExtratoProjetoTab.tsx`, montar o card **acima da lista de transações e dos filtros**, dentro do mesmo container `Card` ou logo antes dele.

## Acessibilidade / formatação
- Valores via `useProjectCurrencyFormat` (mesma formatação do extrato).
- `aria-valuenow` / `aria-valuemax` na barra.
- Responsivo: KPIs empilham em mobile (`grid grid-cols-1 sm:grid-cols-3`).

## Não-objetivos
- Não alterar a lógica nem o visual do `ProjetoFinancialMetricsCard` (apenas extrair função de cálculo).
- Não adicionar toggles de período no novo card.
- Sem migrações de banco, sem novas RPCs.

## Arquivos
- **Novo:** `src/hooks/useProjetoRecuperacaoCapital.ts`
- **Novo:** `src/components/projeto-detalhe/RecuperacaoCapitalCard.tsx`
- **Editado:** `src/components/projeto-detalhe/ExtratoProjetoTab.tsx` (montar o card no topo)
- **Editado (opcional, refactor):** `src/components/projeto-detalhe/ProjetoFinancialMetricsCard.tsx` para consumir o hook compartilhado

## Critérios de aceite
1. Card aparece no topo de Vínculos → Extrato em todos os projetos.
2. Valores batem exatamente com o tooltip do "Break Even" do card de Indicadores Financeiros.
3. Barra capada em 100%; excedente vira "Lucro acumulado".
4. Atualiza ao adicionar/editar/remover depósitos ou saques sem refresh manual.
5. Não se altera com filtros do extrato.
