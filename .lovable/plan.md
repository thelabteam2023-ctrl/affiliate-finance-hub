
## Remover "Workspace" do menu lateral e renomear no perfil

Duas alterações simples no arquivo `src/components/AppSidebar.tsx`:

### 1. Remover item "Workspace" da seção CONFIGURAÇÕES do menu lateral
- Remover a linha que define `{ title: "Workspace", url: "/workspace", icon: Settings, ... }` da lista de itens do grupo CONFIGURAÇÕES
- O grupo CONFIGURAÇÕES ficará com: Bancos, Investidores e Operadores

### 2. Renomear "Configurações" para "Workspace" no dropdown do perfil
- No menu dropdown do avatar do usuário, o texto "Configurações" será alterado para "Workspace"
- A rota `/workspace` e o ícone `Settings` permanecem iguais

### Resultado
- Acesso ao Workspace apenas pelo dropdown do perfil (clicando no avatar)
- Sem duplicidade de navegação
- Menu lateral mais limpo

---

## Tipos de Transação: RENOVACAO_PARCERIA e BONIFICACAO_ESTRATEGICA ✅

### Implementado
- Novos tipos adicionados a `CASH_REAL_TYPES` em `cashOperationalTypes.ts`
- Dialog `PagamentoCaptacaoDialog` para registrar renovações e bonificações vinculadas a parceiro
- KPI "Renov. / Bonif." na aba Financeiro da Captação
- Botão "Renovação / Bonificação" no histórico de movimentações
- Labels e cores nos dashboards: Caixa Operacional, Movimentações do Parceiro
- CAC no `useHistoricoCaptacao` inclui custos de RENOVACAO_PARCERIA e BONIFICACAO_ESTRATEGICA por parceiro

### Arquitetura
- Lançamentos vão para `cash_ledger` (com `destino_parceiro_id`) + `movimentacoes_indicacao` (com `parceiro_id`)
- `parceria_id` agora é nullable em `movimentacoes_indicacao` para permitir lançamentos por parceiro sem parceria específica
- View `v_movimentacoes_indicacao_workspace` atualizada para usar `workspace_id` diretamente
