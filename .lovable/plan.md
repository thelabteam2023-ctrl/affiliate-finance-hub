Vou ajustar apenas o posicionamento do botão “+” na barra de KPIs do projeto.

Plano:
1. Alterar o wrapper do botão “+” em `src/pages/ProjetoDetalhe.tsx` para ocupar uma célula própria no grid mobile.
2. Centralizar horizontal e verticalmente o botão nessa célula, evitando que ele fique grudado à esquerda.
3. Preservar o comportamento atual em telas maiores, mantendo o botão compacto no fluxo horizontal dos KPIs.

Detalhe técnico:
- O botão está no bloco `+ Mais Indicadores`, dentro do grid da summary bar.
- A correção deve ser feita com classes responsivas de layout, sem alterar regras financeiras, dados ou popover.