# "Nova Aposta" também na aba Operações (módulo Bônus)

## O que foi verificado no código

Cada módulo do projeto recebe a mesma barra de ações (com "Nova Aposta" e, no Bônus, "Novo Bônus"), já contextualizada com o projeto e o módulo atual. Ela é entregue de cima para baixo, do detalhe do projeto para cada módulo.

Situação real hoje:

| Módulo | Visão Geral | Operações | Por Casa |
| --- | --- | --- | --- |
| Todas Apostas | Sim | Sim (barra única no topo) | — |
| Arbitragem (Surebet) | Sim | Sim | Sim |
| ValueBet | Sim | Sim | Sim |
| Punter | Sim | Sim | Sim |
| Duplo Green | Sim | Sim | Sim |
| Bônus | Sim | **Não** | **Não** |

Ou seja: os demais módulos já resolveram isso; apenas o Bônus deixa de exibir o botão fora da Visão Geral. A causa é pontual: a área de Bônus repassa a barra de ações somente para a tela de Visão Geral e não a renderiza nas outras duas subabas.

Freebets não entra nesta correção: aquele módulo não tem a estrutura Visão Geral/Operações (as subabas são Estoque e Por Casa) e não recebe a barra de ações.

## O que será feito

Na área de Bônus, passar a exibir a mesma barra de ações também em "Operações" e em "Por Casa", no mesmo formato usado pelos outros módulos: uma linha no topo com o filtro de período à esquerda e as ações à direita.

Não haverá formulário novo, botão novo nem lógica nova: é o mesmo componente já usado na Visão Geral, com o mesmo contexto de projeto, módulo, estratégia, permissões, moeda e a mesma atualização de dados após salvar. Como o botão é o mesmo, o formulário aberto continua sendo o de Bônus.

## Verificação

- Em Bônus → Operações, o botão aparece, abre o formulário de Bônus, salva e a nova operação aparece na lista sem recarregar a página.
- Em Bônus → Por Casa, mesmo comportamento.
- Visão Geral do Bônus continua idêntica.
- Alternância entre subabas e troca de projeto mantêm o projeto correto.
- Layout conferido em telas menores e verificação de build.

## Detalhes técnicos

- Arquivo alterado: `src/components/projeto-detalhe/bonus/ProjetoBonusArea.tsx` — no `renderContent()`, renderizar o cabeçalho com `periodFilterComponent` + `actionsSlot` quando `activeTab !== "visao-geral"`, espelhando `ProjetoSurebetTab` / `ProjetoValueBetTab` / `ProjetoPunterTab` / `ProjetoDuploGreenTab`; remover o `periodFilterComponent` duplicado hoje renderizado só para `bookmakers`.
- `GlobalActionsBar` já recebe `activeTab="bonus"` de `ProjetoDetalhe.tsx` e passa pela whitelist `ABAS_OPERACIONAIS_APOSTA`; nenhuma alteração nela.
- Nenhuma mudança em hooks, mutations, RPCs ou regras financeiras.
