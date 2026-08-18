---
name: Clean History (Hide Reverted Transactions)
description: Hides transactions marked as reverted or estorno by default to clean up the operational cash history view.
type: feature
---

# Plano: Limpeza do Histórico de Movimentações (Ocultar Revertidas)

## 1. UI: Filtro de Visibilidade de Reversões
Implementar um novo estado de filtro no componente `HistoricoMovimentacoes.tsx` para permitir que o usuário oculte transações que foram revertidas ou que são estornos (espelhos).

- **Estado**: `ocultarRevertidas` (default: `true`).
- **Local**: Adicionar um botão de alternância (toggle/switch) na barra de filtros superior.
- **Lógica de Filtragem**: 
  - Excluir transações onde `reversed_at` não é nulo.
  - Excluir transações onde `descricao` começa com "ESTORNO:".

## 2. Feedback Visual e Contador
Adicionar um pequeno indicador visual na barra de filtros informando quando há registros ocultos e permitir reexibi-los com um clique.

## 3. Justificativa Técnica
Em sistemas financeiros, a remoção física (Hard Delete) de registros legados é desencorajada para manter o histórico de auditoria. Ocultar por padrão resolve o problema de "poluição visual" relatado pelo usuário (que considera a informação "sem sentido" por ser um erro) sem comprometer a integridade dos dados para futuras auditorias.

## 4. Detalhes de Implementação
- **Arquivo**: `src/components/caixa/HistoricoMovimentacoes.tsx`
- **Hook**: `useState(true)` para `ocultarRevertidas`.
- **Componente**: Usar `EyeOff` / `Eye` da Lucide para o botão de toggle.
