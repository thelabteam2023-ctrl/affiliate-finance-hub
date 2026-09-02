# Exportação de Parceiros — repensar a UX de seleção

## Situação atual

A listagem (`ParceiroListaSidebar`) carrega hoje: linha "Selecionar todos (N)" fixa no topo, um checkbox por parceiro que aparece no hover/seleção e uma barra "N selecionados". Ou seja, a sidebar vive permanentemente em modo de seleção, mesmo quando o usuário só quer navegar. A exportação em lote em si (`buildPartnerBundle`, bundle `.labbet`, importação multi-parceiro) já funciona e não precisa mudar.

## Alternativas de UX

### A. Modal dedicado "Exportar parceiros" com seleção interna (recomendada)

- **Como funciona:** no menu de ações da TopBar, "Exportar parceiros" abre um modal em duas etapas. Etapa 1: escolher parceiros — busca própria, filtro de status, lista rolável com checkbox, "Selecionar todos (N do filtro)", contador e chips/remoção individual. Etapa 2: as categorias de dados e a senha (tela atual do `ExportarParceiroDialog`). Se houver um parceiro aberto na tela, ele já entra pré-marcado.
- **Onde fica a seleção:** só dentro do modal.
- **Início:** clique explícito em "Exportar parceiros".
- **Vantagens:** listagem volta a ficar 100% limpa; fluxo "Exportar → escolher quem" exatamente como preferido; busca/filtro dedicados sem mexer no estado da tela; cancelar não deixa resíduo.
- **Desvantagens:** duplica busca/filtro simples dentro do modal; usuário não vê os detalhes ricos do card lateral durante a escolha.
- **Impacto técnico:** remover seleção de `ParceiroListaSidebar` e o `selectedIds` de `GestaoParceiros`; criar `ExportarParceirosSelecaoStep` dentro do `ExportarParceiroDialog` (novo passo antes do atual). Motor de exportação/importação intocado.

### B. Modo de seleção temporário na listagem

- **Como funciona:** "Exportar parceiros" liga um modo transitório na sidebar: checkboxes aparecem, cabeçalho vira barra "N selecionados · Exportar · Cancelar". Ao confirmar, abre o diálogo de categorias/senha; ao cancelar, tudo desaparece.
- **Onde fica a seleção:** na própria listagem, apenas enquanto o modo está ativo.
- **Início:** mesmo clique em "Exportar parceiros".
- **Vantagens:** reaproveita busca/filtro/ordenação existentes; nada duplicado; um só lugar de verdade sobre a lista.
- **Desvantagens:** listagem muda de comportamento (clique passa a marcar em vez de abrir detalhe), o que exige cuidado; em telas estreitas a barra concorre com o filtro.
- **Impacto técnico:** menor — manter o código de checkbox atual atrás de um `selectionMode: boolean`.

### C. Exportar direto pelo filtro atual ("exportar o que está na tela")

- **Como funciona:** o modal de exportação não lista parceiros; oferece escopos — "Parceiro aberto", "Todos em andamento", "Todos os N do filtro atual" — com opção de revisar/desmarcar em uma lista compacta.
- **Vantagens:** fluxo mais rápido para exportações grandes; zero seleção manual.
- **Desvantagens:** menos controle fino; depende do usuário ter montado o filtro certo antes.
- **Impacto técnico:** baixo, mas não atende bem "selecionar/desmarcar individualmente".

## Recomendação

**Alternativa A**, com um detalhe da C embutido: dentro do modal, um atalho "Usar filtro atual da tela" para pré-marcar rapidamente. Isso mantém a listagem totalmente limpa (requisito principal), concentra tudo em "Exportar parceiros" e preserva seleção fina, selecionar todos e cancelamento sem efeito colateral.

## Escopo da implementação (após aprovação)

1. `ParceiroListaSidebar.tsx`: remover checkboxes, linha "Selecionar todos" e barra de seleção; voltar ao clique simples de navegação.
2. `GestaoParceiros.tsx`: remover `selectedIds`; o menu da TopBar passa a abrir o modal sem depender de seleção prévia.
3. `ExportarParceiroDialog.tsx`: novo passo 1 de seleção (busca, filtro de status, lista com checkbox, selecionar todos do filtro, contador, atalho "usar filtro atual", pré-marcação do parceiro aberto) e passo 2 com as categorias/senha atuais; botão Voltar/Cancelar.
4. Sem mudanças em `buildExport.ts`, `applyImport.ts`, `schema.ts`, RLS ou qualquer regra financeira; exportação continua restrita ao workspace ativo e sem dados operacionais.
