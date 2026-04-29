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

Detalhes técnicos:
- Alterar `src/components/planejamento/PlanejamentoCalendario.tsx`.
- Criar uma constante como `MAX_VISIBLE_CAMPANHAS_PER_DAY = 5`.
- Na renderização do calendário, separar `visibleDayCamps = dayCamps.slice(0, 5)` e `hiddenCount = dayCamps.length - visibleDayCamps.length`.
- Renderizar `DraggableCampanha` apenas para `visibleDayCamps`.
- Renderizar um botão compacto quando `hiddenCount > 0`, chamando `setDetailsDate(key)`.
- Garantir `stopPropagation` no botão para não causar cliques duplicados.
- A lista do modal continuará usando `detailsCampanhas`, sem alteração no limite.