
# Editar Motivo de Finalização de Bonus

## Problema
Ao finalizar um bonus, frequentemente o motivo escolhido (Rollover Concluido vs Ciclo Encerrado) e registrado incorretamente, e atualmente nao ha como corrigir depois.

## Solucao
Adicionar um botao de edicao do motivo de finalizacao diretamente nos cards do "Historico de Bonus Finalizados", abrindo um dialog simples para trocar o motivo.

## Alteracoes

### 1. Hook `useProjectBonuses.ts`
- Adicionar uma nova mutation `updateFinalizeReason` que faz `UPDATE` apenas no campo `finalize_reason` da tabela `project_bookmaker_link_bonuses` (sem alterar status, saldo, ou qualquer campo financeiro).
- Expor a funcao no retorno do hook.

### 2. Novo componente `EditFinalizeReasonDialog.tsx`
- Dialog simples com radio buttons mostrando os 4 motivos de finalizacao (rollover_completed, cycle_completed, expired, cancelled_reversed).
- Pre-seleciona o motivo atual do bonus.
- Botao "Salvar" que chama a mutation.

### 3. Componente `BonusBookmakersTab.tsx` (Historico de Bonus Finalizados)
- Adicionar um botao de edicao (icone de lapis) no badge de motivo de cada bonus finalizado.
- Ao clicar, abre o `EditFinalizeReasonDialog` com o bonus selecionado.
- Apos salvar, atualiza a lista.

## Detalhes Tecnicos

- **Seguranca financeira**: A edicao altera APENAS o campo `finalize_reason`. Nenhum saldo, status ou campo financeiro e modificado -- em conformidade total com a "Regra de Ouro" do modelo de finalizacao.
- **Query de update**:
```sql
UPDATE project_bookmaker_link_bonuses
SET finalize_reason = $reason
WHERE id = $id AND status = 'finalized';
```
- **Invalidacao de cache**: Reutiliza o mesmo `invalidateBonusQueries` ja existente para atualizar analytics e listas.
