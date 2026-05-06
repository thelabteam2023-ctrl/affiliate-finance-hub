Plano para deixar o calendário compacto quando houver muitas casas no mesmo dia:

1. Limitar a prévia diária a 5 operações
   - No calendário mensal, cada dia continuará mostrando as primeiras operações ordenadas por CPF/perfil, como já acontece hoje.
   - Se o dia tiver mais de 5 casas, as demais ficarão ocultas na célula para evitar que o layout cresça demais e quebre a grade.

2. Adicionar botão “+N” no próprio dia
   - Abaixo das 5 primeiras operações, exibir um botão compacto do tipo “+17 casas” ou “+17”.
   - Ao clicar nele, abrir a visão detalhada do dia já existente, com todas as casas daquele dia.
   - Esse botão também servirá como indicador visual de que existem mais operações não exibidas na célula.

3. Preservar a visão detalhada completa
   - O modal “Casas planejadas do dia” continuará mostrando todas as operações do dia, sem limite.
   - A edição, cópia de IP, valores, perfil/CPF e demais informações permanecem disponíveis ali.

4. Ajustar altura/overflow da célula para evitar quebra visual
   - Trocar o comportamento atual de rolagem interna por uma célula mais estável e compacta.
   - Manter o rodapé do dia com o resumo “X casas • Σ valor”, para que o total continue visível mesmo com itens ocultos.
   - Reduzir o risco de a semana ficar desproporcional quando um único dia tiver 20+ demandas.


## Detalhamento de Despesas por Beneficiário (Resumo por Grupo)

1. **Objetivo**: Permitir a visualização detalhada de quem recebeu os valores em cada grupo de despesas administrativas.
2. **Ações**:
   - Tornar as linhas do card "Resumo por Grupo" (Financeiro > Despesas) clicáveis.
   - Ao clicar, abrir um modal (`ResumoGrupoDetalhesModal`) que exibe a somatória dos valores agrupados por beneficiário (Operador).
   - Se a despesa não estiver vinculada a um operador, o sistema utilizará a descrição curta ou um marcador genérico como beneficiário.
3. **Alterações Técnicas**:
   - `src/hooks/useFinanceiroData.ts`: Atualizado para incluir o join com a tabela de `operadores`.
   - `src/components/financeiro/ResumoGrupoDetalhesModal.tsx`: Novo componente para o modal de detalhamento.
   - `src/components/financeiro/FinanceiroDespesasTab.tsx`: Integrada a lógica de clique e exibição do modal.