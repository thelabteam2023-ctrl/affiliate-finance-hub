/**
 * Definição centralizada de rotas e permissões
 * 
 * IMPORTANTE: As permission keys devem corresponder exatamente às keys no banco
 * Tabela: role_permissions
 */

// Rota segura universal - acessível por todos os roles
export const SAFE_ROUTE = '/';

// Mapa de rotas e suas permissões
export interface RouteConfig {
  path: string;
  permission?: string;
  roles?: string[];
  requireSystemOwner?: boolean;
  label: string;
}

export const ROUTE_PERMISSIONS: Record<string, RouteConfig> = {
  // VISÃO GERAL - Todos podem acessar
  central: {
    path: '/',
    permission: undefined,
    label: 'Central de Operações',
  },
  
  // OPERAÇÃO
  projetos: {
    path: '/projetos',
    permission: 'projetos.read',
    label: 'Projetos',
  },
  projetoDetalhe: {
    path: '/projeto/:id',
    permission: 'projetos.read',
    label: 'Detalhe do Projeto',
  },
  bookmakers: {
    path: '/bookmakers',
    permission: 'bookmakers.catalog.read',
    label: 'Bookmakers',
  },
  
  // FINANCEIRO
  caixa: {
    path: '/caixa',
    permission: 'caixa.read',
    label: 'Caixa',
  },
  financeiro: {
    path: '/financeiro',
    permission: 'financeiro.read',
    label: 'Financeiro',
  },
  bancos: {
    path: '/bancos',
    permission: 'financeiro.read',
    label: 'Bancos',
  },
  investidores: {
    path: '/investidores',
    permission: 'investidores.read',
    label: 'Investidores',
  },
  
  // RELACIONAMENTOS
  parceiros: {
    path: '/parceiros',
    permission: 'parceiros.read',
    label: 'Parceiros',
  },
  operadores: {
    path: '/operadores',
    permission: 'operadores.read',
    label: 'Operadores',
  },
  
  // CRESCIMENTO
  captacao: {
    path: '/programa-indicacao',
    permission: 'captacao.read',
    label: 'Programa de Indicação',
  },
  
  // COMUNIDADE
  comunidade: {
    path: '/comunidade',
    permission: undefined, // Verificado por plano
    label: 'Comunidade',
  },
  
  // ADMINISTRAÇÃO
  workspace: {
    path: '/workspace',
    roles: ['owner', 'admin'],
    label: 'Workspace',
  },
  admin: {
    path: '/admin',
    requireSystemOwner: true,
    label: 'Admin do Sistema',
  },
  testes: {
    path: '/testes',
    roles: ['owner'],
    label: 'Testes',
  },
};

/**
 * Verifica se uma rota é acessível universalmente (sem autenticação/permissão específica)
 */
export function isPublicRoute(path: string): boolean {
  const publicRoutes = ['/auth', '/landing', '/accept-invite'];
  return publicRoutes.some(r => path.startsWith(r));
}

/**
 * Obtém a configuração de uma rota pelo path
 */
export function getRouteConfig(path: string): RouteConfig | undefined {
  // Normalizar path removendo parâmetros
  const normalizedPath = path.replace(/\/[a-f0-9-]{36}/g, '/:id');
  
  return Object.values(ROUTE_PERMISSIONS).find(config => {
    if (config.path === normalizedPath) return true;
    // Match exato
    if (config.path === path) return true;
    // Match parcial para rotas dinâmicas
    if (config.path.includes(':') && path.startsWith(config.path.split(':')[0])) return true;
    return false;
  });
}
