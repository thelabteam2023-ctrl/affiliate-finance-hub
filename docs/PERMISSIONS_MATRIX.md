# Matriz de Permissões - Labbet One

## Roles e Permissões Base

### Owner (Proprietário)
- **Acesso Total**: Todas as permissões implícitas
- **Rotas**: Todas
- **Ações**: Criar, editar, deletar tudo

### Admin (Administrador)  
- **Acesso Total dentro do Workspace**: Todas as permissões implícitas
- **Rotas**: Todas exceto /admin (System Owner only)
- **Ações**: Criar, editar, deletar tudo no workspace

### Finance (Financeiro)
| Módulo | Permissões Base |
|--------|-----------------|
| Bookmakers | `bookmakers.accounts.read`, `bookmakers.catalog.read`, `bookmakers.transactions.create`, `bookmakers.transactions.read` |
| Caixa | `caixa.read`, `caixa.reports.read`, `caixa.transactions.confirm`, `caixa.transactions.create` |
| Captação | `captacao.pagamentos.create`, `captacao.read` |
| Financeiro | `financeiro.despesas.create`, `financeiro.despesas.edit`, `financeiro.participacoes.read`, `financeiro.read` |
| Investidores | `investidores.deals.manage`, `investidores.participacoes.pay`, `investidores.read` |
| Operadores | `operadores.pagamentos.create`, `operadores.pagamentos.read`, `operadores.read` |
| Parceiros | `parceiros.read`, `parceiros.view_financeiro` |
| Projetos | `projeto.ciclos.close`, `projeto.ciclos.read`, `projeto.dashboard.read`, `projeto.perdas.confirm`, `projeto.perdas.read`, `projetos.read` |

### Operator (Operador)
| Módulo | Permissões Base |
|--------|-----------------|
| Bookmakers | `bookmakers.accounts.read_project` |
| Operadores | `operadores.pagamentos.read_self`, `operadores.read_self` |
| Projetos | `projeto.apostas.cancel`, `projeto.apostas.create`, `projeto.apostas.edit`, `projeto.apostas.read`, `projeto.ciclos.read`, `projeto.dashboard.read`, `projeto.perdas.create`, `projeto.perdas.read`, `projeto.vinculos.read`, `projetos.read_vinculados` |

### Viewer (Visualizador)
| Módulo | Permissões Base |
|--------|-----------------|
| Bookmakers | `bookmakers.accounts.read`, `bookmakers.catalog.read`, `bookmakers.transactions.read` |
| Caixa | `caixa.read`, `caixa.reports.read` |
| Captação | `captacao.read` |
| Financeiro | `financeiro.participacoes.read`, `financeiro.read` |
| Investidores | `investidores.read` |
| Operadores | `operadores.pagamentos.read`, `operadores.read` |
| Parceiros | `parceiros.read`, `parceiros.view_financeiro` |
| Projetos | `projeto.apostas.read`, `projeto.ciclos.read`, `projeto.dashboard.read`, `projeto.perdas.read`, `projeto.vinculos.read`, `projetos.read` |

---

## Mapa de Rotas → Permissões

| Rota | Permissão Necessária | Roles Diretos |
|------|---------------------|---------------|
| `/` | Nenhuma (Central) | Todos |
| `/projetos` | `projetos.read` | - |
| `/projeto/:id` | `projetos.read` | - |
| `/bookmakers` | `bookmakers.catalog.read` | - |
| `/caixa` | `caixa.read` | - |
| `/financeiro` | `financeiro.read` | - |
| `/bancos` | `financeiro.read` | - |
| `/investidores` | `investidores.read` | - |
| `/parceiros` | `parceiros.read` | - |
| `/operadores` | `operadores.read` | - |
| `/programa-indicacao` | `captacao.read` | - |
| `/comunidade` | Plano PRO+ | owner bypass |
| `/workspace` | - | owner, admin |
| `/testes` | - | owner |
| `/admin` | - | System Owner |

---

## Permissões Adicionais

Permissões adicionais **SÓ aparecem** se:
1. Não estão incluídas na role base do usuário
2. Não são redundantes (`_self` vs global)
3. Têm efeito real no sistema

### Regras de Ocultação
- `operadores.read_self` → oculta se role tem `operadores.read`
- `operadores.pagamentos.read_self` → oculta se role tem `operadores.pagamentos.read`

---

## Fontes de Verdade

| Camada | Fonte |
|--------|-------|
| Role do usuário | `get_user_role()` RPC → `workspace_members.role` |
| Permissões base | `role_permissions` table |
| Permissões adicionais | `user_permission_overrides` table |
| Permissões efetivas | `get_effective_access()` RPC |
| Validação de rota | `has_route_access()` RPC |

---

## Códigos de Negação

| Código | Descrição |
|--------|-----------|
| `REQUIRES_SYSTEM_OWNER` | Acesso restrito ao admin do sistema |
| `ROLE_INSUFFICIENT` | Role não está na lista permitida |
| `PERMISSION_MISSING` | Permissão específica não concedida |
| `NO_WORKSPACE` | Usuário sem workspace ativo |
| `NO_MEMBERSHIP` | Usuário não é membro do workspace |
