
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
