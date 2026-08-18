# Plano: Finalização de Bônus com Perda por Regra da Casa (Arquitetura V15/V16)

## Diagnóstico da Arquitetura Atual

Atualmente, o sistema trata a finalização de bônus através de quatro estados: `rollover_completed`, `cycle_completed`, `expired` e `cancelled_reversed`.
- **Rollover/Ciclo**: Apenas encerram o vínculo lógico sem mexer no saldo (considerando que o bônus já foi creditado no saldo unificado).
- **Cancelado/Revertido**: Debita um valor informado pelo usuário do saldo da casa usando `AJUSTE_SALDO` com motivo `BONUS_CANCELAMENTO`.

**A lacuna**: Não existe um meio de registrar que o bônus foi *concluído* (rollover batido), mas o saldo final foi *tosquiado* pela casa por regras de limite de ganho (ex: Ganho Máximo = 5x Bônus). Usar "Cancelado" distorce os KPIs de performance (parece que o bônus falhou, quando na verdade ele foi lucrativo, mas limitado).

## Proposta de Modelagem

### 1. Novo Conceito: Perda Promocional (Regra da Casa)
Introduzir o motivo de finalização: `completed_with_limit`.
- **Nomenclatura recomendada**: "Finalizado com Restrição de Ganho" ou "Perda por Regra da Casa".
- **Comportamento**: O bônus é marcado como finalizado (sucesso de rollover), mas gera um evento de débito específico no ledger para ajustar o saldo da casa ao valor efetivamente sacável.

### 2. Fluxo Financeiro
1.  **Entrada**: Usuário informa `Saldo Atual (Obtido)` e `Saldo Realizado (Permitido)`.
2.  **Cálculo**: `Perda = Obtido - Realizado`.
3.  **Ledger**: Insere uma entrada de `PERDA_OPERACIONAL` (ou novo tipo `PERDA_PROMOCIONAL` se necessário, mas `PERDA_OPERACIONAL` com categoria 'PROMO_LIMIT' atende bem) vinculada ao projeto.
4.  **Impacto**: 
    - O saldo da casa diminui.
    - O lucro do projeto é reduzido exatamente pelo valor da perda na data do ajuste.
    - O bônus conta como "Finalizado" nos KPIs de volume/quantidade, mas seu "Lucro Líquido" considera a perda.

### 3. Impacto nos KPIs e Gráficos
- **Lucro se Sacar Tudo**: Cairá imediatamente após a finalização, pois o saldo da casa (Mark-to-Market) será ajustado.
- **Evolução do Lucro**: Exibirá uma "escada para baixo" na data da finalização, representando a realização da perda. Isso é contabilmente correto: a perda ocorre no momento do "settlement" promocional.
- **ROI**: Será calculado sobre o valor líquido realizado.

## Diferenciação de Cenários

| Cenário | Motivo | Impacto Financeiro | Categoria Ledger |
| :--- | :--- | :--- | :--- |
| **A: Rollover OK + Perda** | `completed_with_limit` | Débito da diferença | `PERDA_OPERACIONAL` |
| **B: Rollover Falhou + Perda Parcial** | `expired` + Débito | Débito do valor bônus | `BONUS_ESTORNO` |
| **C: Rollover Falhou + Perda Total** | `expired` + Débito | Débito total | `BONUS_ESTORNO` |
| **D: Rollover OK + Sem Perda** | `rollover_completed` | Nenhum | N/A |

## Plano de Implementação

### 1. Banco de Dados (PostgreSQL)
- Adicionar `completed_with_limit` ao enum/tipo de `finalize_reason` (se houver check constraint). *Nota: No Supabase/PostgREST, se for texto, basta tratar no código.*
- Garantir que a RPC de KPIs considere o tipo de evento gerado.

### 2. Frontend (React)
- **`useProjectBonuses.ts`**: Atualizar o tipo `FinalizeReason` e a mutation `finalizeMutation` para suportar o novo motivo e o cálculo automático de débito.
- **`FinalizeBonusDialog.tsx`**: 
    - Adicionar a nova opção visual.
    - Implementar campos de "Valor Obtido" e "Valor Permitido" com cálculo automático de "Perda".
    - Exibir aviso claro de impacto financeiro.

### 3. Teste e Reconciliação (Caso Eurobet)
- **Simulação**:
    - Bônus: €100.
    - Saldo após apostas: €363,39.
    - Finalização com Limite: €194,00.
    - Resultado esperado: Registro de -€169,39 no Ledger. Saldo final da Eurobet = €194,00. Lucro do projeto Agosto reduzido em €169,39.

---
**Deseja que eu prossiga com a implementação deste plano, começando pela atualização dos tipos e do componente de diálogo?**
