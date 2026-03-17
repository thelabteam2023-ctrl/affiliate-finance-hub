# Memory: security/rbac/central-ops-operator-restrictions
Updated: 2026-03-17

Usuários com a função 'Operador' possuem acesso restrito na Central de Operações. (1) Visibilidade: As abas de Financeiro, Bookmakers, Ocorrências, Solicitações e Alertas são completamente ocultadas e protegidas contra renderização (mounting). (2) Bookmakers: A aba inteira (incluindo Disponíveis, Livres e Não Criadas) é bloqueada para operadores, pois expõe dados estratégicos do catálogo (grupos, casas disponíveis, parceiros sem conta). (3) Segurança: A lógica de estado impede a navegação para módulos restritos mesmo via manipulação de URL ou estado local.
