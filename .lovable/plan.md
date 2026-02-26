
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

---

## Multi-Entry para Aposta Simples ✅ (Fase 1-3)

### Implementado
- **Formulário**: Botão "+ Entrada" permite até 5 bookmakers na mesma seleção, com cálculo de odd média ponderada e stake total
- **Save**: Ao criar aposta com multi-entry, insere registros em `apostas_pernas` com cada bookmaker/odd/stake individual. O `apostas_unificada` recebe a odd ponderada e stake total
- **Edição**: Ao abrir aposta existente, carrega pernas de `apostas_pernas` e popula entradas adicionais. Na edição, deleta pernas antigas e re-insere
- **Card/Lista**: ApostaCard exibe ícone de camadas (Layers) com contador de entradas. Clique expande sub-entradas com logo, nome da bookmaker, odd e stake individuais
- **Validação**: Cada entrada adicional é validada (bookmaker, odd > 1, stake > 0)

### Arquitetura
- Usa tabela existente `apostas_pernas` (mesma do Surebet)
- Sem migração de banco necessária
- ProjetoApostasTab carrega pernas em batch para todas as apostas simples
- Liquidação aplica o mesmo resultado a todas as pernas (via odd média ponderada no registro pai)

### Próximos passos (Fase 4)
- Liquidação granular por perna (se necessário)
- Suporte a multi-moeda entre entradas (conversão BRL para cálculo de peso)
