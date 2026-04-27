Vou implementar seleção múltipla na sidebar do Planejamento de Campanhas para permitir enviar várias casas/células ao calendário de uma vez.

Plano:

1. Seleção múltipla na lista lateral
- Permitir clicar com Ctrl/Cmd em várias casas/células para marcar/desmarcar.
- Mostrar destaque visual nos itens selecionados.
- Exibir um contador simples, por exemplo: “3 selecionadas”.
- Manter o comportamento atual quando não houver seleção múltipla: arrastar uma casa continua funcionando igual.

2. Arrasto em lote para o calendário
- Ao arrastar uma casa selecionada, o sistema levará junto todas as selecionadas do mesmo modo:
  - modo “Sem plano”: várias casas livres;
  - modo “Plano de distribuição”: várias células do plano.
- Ao soltar em um dia, serão criadas várias campanhas naquele mesmo dia.
- Para células de plano, manter os dados já existentes: CPF, casa, grupo, valor sugerido e parceiro quando existir.
- Após agendar células do plano, marcar cada célula como agendada para evitar duplicidade.

3. Validações e mensagens
- Validar datas passadas como já acontece hoje.
- Validar regra de grupo para cada item antes de criar.
- Se alguma casa/célula for bloqueada por regra, não impedir necessariamente todo o lote: criar as válidas e avisar quantas falharam.
- Mostrar toast final resumido, por exemplo: “5 casas agendadas” ou “4 agendadas, 1 bloqueada por regra”.

4. Experiência de uso
- Adicionar instrução curta na sidebar: “Ctrl/Cmd + clique para selecionar várias”.
- Adicionar opção para limpar seleção quando houver itens marcados.
- Se filtros de plano/grupo/CPF/busca mudarem, manter apenas seleções ainda visíveis/válidas ou limpar a seleção para evitar arrastar itens ocultos por engano.

Detalhes técnicos:
- Alterar principalmente `src/components/planejamento/PlanejamentoCalendario.tsx`.
- Criar estados para IDs selecionados de casas livres e células de plano.
- Ajustar `DraggableBookmaker` e `DraggableCelula` para receber `selected`, `onToggleSelect` e lidar com Ctrl/Cmd clique sem abrir outro fluxo.
- Alterar o payload do `useDraggable` para incluir o lote selecionado quando aplicável.
- Atualizar `handleDragEnd` para processar `bookmaker-batch` e `celula-batch`, reutilizando a lógica atual de criação individual.
- Atualizar `DragOverlay` para mostrar um card de “N itens selecionados” durante o arrasto em lote.
- Validar com TypeScript após implementar.