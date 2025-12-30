import { useMemo, useCallback, useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { useCommunityAccess } from './useCommunityAccess';
import { supabase } from '@/integrations/supabase/client';

/**
 * Definição de módulos e suas permissões mínimas
 * key: identificador do módulo (usado internamente)
 * permission: código da permissão necessária OU array de permissões (qualquer uma é suficiente)
 * roles: roles permitidos (vazio = todos, null = verificar permission)
 * 
 * IMPORTANTE: As permission keys DEVEM corresponder às keys no banco (role_permissions)
 */
interface ModuleConfig {
  permission: string | string[] | null;  // String, array, ou null
  roles: string[] | null;
  requiresPlan?: string[];
  requiresSystemOwner?: boolean;
}

const MODULE_ACCESS_MAP: Record<string, ModuleConfig> = {
  // VISÃO GERAL - Todos podem ver
  'central': { permission: null, roles: null },
  
  // OPERAÇÃO - Usa permission keys do banco
  // Projetos: aceita projetos.read OU projetos.read_vinculados (para operadores)
  'projetos': { permission: ['projetos.read', 'projetos.read_vinculados'], roles: null },
  'bookmakers': { permission: 'bookmakers.catalog.read', roles: null },
  
  // FINANCEIRO - Usa permission keys do banco
  'caixa': { permission: 'caixa.read', roles: null },
  'financeiro': { permission: 'financeiro.read', roles: null },
  'bancos': { permission: 'financeiro.read', roles: null },
  'investidores': { permission: 'investidores.read', roles: null },
  
  // RELACIONAMENTOS - Usa permission keys do banco
  'parceiros': { permission: 'parceiros.read', roles: null },
  'operadores': { permission: 'operadores.read', roles: null },
  
  // CRESCIMENTO - Usa permission keys do banco
  'captacao': { permission: 'captacao.read', roles: null },
  
  // FERRAMENTAS - Disponível para todos os usuários autenticados
  'ferramentas': { permission: null, roles: null },
  
  // COMUNIDADE - Requer plano PRO+ OU ser owner
  'comunidade': { 
    permission: null, // Verificado por plano
    roles: null,
    requiresPlan: ['pro', 'advanced']
  },
  
  // ADMINISTRAÇÃO
  'workspace': { permission: null, roles: ['owner', 'admin'] },
  'admin': { permission: null, roles: [], requiresSystemOwner: true },
  
  // DESENVOLVIMENTO
  'testes': { permission: null, roles: ['owner'] },
};

// Role base permissions - cached for quick lookup
// These MUST match the role_permissions table in the database
const ROLE_BASE_PERMISSIONS: Record<string, string[]> = {
  owner: ['*'], // Owner has all permissions
  admin: ['*'], // Admin has all permissions
  finance: [
    'bookmakers.accounts.read',
    'bookmakers.accounts.create',
    'bookmakers.accounts.edit',
    'bookmakers.catalog.read',
    'bookmakers.transactions.create',
    'bookmakers.transactions.read',
    'caixa.read',
    'caixa.reports.read',
    'caixa.transactions.confirm',
    'caixa.transactions.create',
    'captacao.pagamentos.create',
    'captacao.read',
    'financeiro.despesas.create',
    'financeiro.despesas.edit',
    'financeiro.participacoes.read',
    'financeiro.read',
    'investidores.deals.manage',
    'investidores.participacoes.pay',
    'investidores.read',
    'operadores.pagamentos.create',
    'operadores.pagamentos.read',
    'operadores.read',
    'parceiros.read',
    'parceiros.view_financeiro',
    'projeto.ciclos.close',
    'projeto.ciclos.read',
    'projeto.dashboard.read',
    'projeto.perdas.confirm',
    'projeto.perdas.read',
    'projetos.read',
  ],
  operator: [
    // Permissões removidas da base (agora são adicionais):
    // - 'parceiros.read'
    // - 'bookmakers.catalog.read'
    // - 'bookmakers.accounts.read_project'
    'operadores.pagamentos.read_self',
    'operadores.read_self',
    'projeto.apostas.cancel',
    'projeto.apostas.create',
    'projeto.apostas.edit',
    'projeto.apostas.read',
    'projeto.ciclos.read',
    'projeto.dashboard.read',
    'projeto.perdas.create',
    'projeto.perdas.read',
    'projeto.vinculos.read',
    'projetos.read_vinculados',
  ],
  viewer: [
    'bookmakers.accounts.read',
    'bookmakers.catalog.read',
    'bookmakers.transactions.read',
    'caixa.read',
    'caixa.reports.read',
    'captacao.read',
    'financeiro.participacoes.read',
    'financeiro.read',
    'investidores.read',
    'operadores.pagamentos.read',
    'operadores.read',
    'parceiros.read',
    'parceiros.view_financeiro',
    'projeto.apostas.read',
    'projeto.ciclos.read',
    'projeto.dashboard.read',
    'projeto.perdas.read',
    'projeto.vinculos.read',
    'projetos.read',
  ],
};

export interface ModuleAccessResult {
  canAccess: (moduleKey: string) => boolean;
  hasPermission: (permissionCode: string) => boolean;
  loading: boolean;
}

export function useModuleAccess(): ModuleAccessResult {
  const { role, isSystemOwner, workspace, user } = useAuth();
  const { hasFullAccess: hasCommunityAccess, loading: communityLoading } = useCommunityAccess();
  const [userOverrides, setUserOverrides] = useState<string[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(true);

  // Fetch user permission overrides from database
  useEffect(() => {
    const fetchOverrides = async () => {
      if (!user?.id || !workspace?.id) {
        setUserOverrides([]);
        setOverridesLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_permission_overrides')
          .select('permission_code')
          .eq('user_id', user.id)
          .eq('workspace_id', workspace.id)
          .eq('granted', true);

        if (error) {
          console.error('[useModuleAccess] Error fetching overrides:', error);
          setUserOverrides([]);
        } else {
          setUserOverrides(data?.map(o => o.permission_code) || []);
        }
      } catch (err) {
        console.error('[useModuleAccess] Exception fetching overrides:', err);
        setUserOverrides([]);
      } finally {
        setOverridesLoading(false);
      }
    };

    fetchOverrides();
  }, [user?.id, workspace?.id]);

  /**
   * Check if the current role has a specific permission
   * Now also checks user_permission_overrides from database
   */
  const hasPermission = useCallback((permissionCode: string): boolean => {
    // System Owner has all permissions
    if (isSystemOwner) return true;
    
    // Owner and Admin have all permissions
    if (role === 'owner' || role === 'admin') return true;
    
    // Check overrides first (additional permissions granted to user)
    if (userOverrides.includes(permissionCode)) return true;
    
    // Get base permissions for role
    const basePerms = ROLE_BASE_PERMISSIONS[role || ''] || [];
    
    // Check if permission is in base permissions
    return basePerms.includes(permissionCode);
  }, [role, isSystemOwner, userOverrides]);

  const canAccess = useMemo(() => {
    return (moduleKey: string): boolean => {
      const config = MODULE_ACCESS_MAP[moduleKey];
      
      // Module not configured = allow
      if (!config) return true;
      
      // System Owner has access to everything
      if (isSystemOwner) return true;
      
      // Check if requires system owner
      if (config.requiresSystemOwner) {
        return isSystemOwner === true;
      }
      
      // Check role restriction first
      if (config.roles !== null && config.roles.length > 0) {
        if (!role || !config.roles.includes(role)) {
          // Owner bypasses role checks
          if (role !== 'owner') {
            return false;
          }
        }
      }
      
      // Empty roles array means no one can access (except system owner)
      if (config.roles !== null && config.roles.length === 0 && !config.requiresSystemOwner) {
        return false;
      }
      
      // Special handling for community (plan-based)
      if (moduleKey === 'comunidade') {
        // Owner always has access
        if (role === 'owner') return true;
        // Otherwise check plan access
        return hasCommunityAccess;
      }
      
      // Check plan requirement
      if (config.requiresPlan && config.requiresPlan.length > 0) {
        const userPlan = workspace?.plan;
        if (!userPlan || !config.requiresPlan.includes(userPlan)) {
          // Owner bypasses plan check
          if (role !== 'owner') {
            return false;
          }
        }
      }
      
      // Owner and admin have all permissions within workspace
      if (role === 'owner' || role === 'admin') {
        return true;
      }
      
      // Check permission requirement (can be string or array)
      if (config.permission) {
        const permsToCheck = Array.isArray(config.permission) 
          ? config.permission 
          : [config.permission];
        // User needs ANY of the permissions
        return permsToCheck.some(p => hasPermission(p));
      }
      
      // No specific requirement - allow
      return true;
    };
  }, [role, isSystemOwner, workspace?.plan, hasCommunityAccess, hasPermission]);

  return {
    canAccess,
    hasPermission,
    loading: communityLoading || overridesLoading,
  };
}

/**
 * Hook para verificar acesso a uma ação específica
 * Útil para esconder botões de criar/editar/deletar
 */
export function useActionAccess() {
  const { role, isSystemOwner } = useAuth();
  const { canWrite: canWriteCommunity } = useCommunityAccess();
  const { hasPermission } = useModuleAccess();

  const canCreate = useMemo(() => {
    return (moduleKey: string, permissionCode?: string): boolean => {
      // System Owner can do everything
      if (isSystemOwner) return true;
      
      // Owner and Admin can create in all modules
      if (role === 'owner' || role === 'admin') return true;
      
      // Viewer can NEVER create
      if (role === 'viewer') return false;
      
      // Special case for community
      if (moduleKey === 'comunidade') {
        return canWriteCommunity;
      }
      
      // If specific permission code provided, check it
      if (permissionCode) {
        return hasPermission(permissionCode);
      }
      
      // Finance and Operator have limited create permissions
      return true;
    };
  }, [role, isSystemOwner, canWriteCommunity, hasPermission]);

  const canEdit = useMemo(() => {
    return (moduleKey: string, permissionCode?: string): boolean => {
      if (isSystemOwner) return true;
      if (role === 'owner' || role === 'admin') return true;
      if (role === 'viewer') return false;
      if (moduleKey === 'comunidade') return canWriteCommunity;
      if (permissionCode) return hasPermission(permissionCode);
      return true;
    };
  }, [role, isSystemOwner, canWriteCommunity, hasPermission]);

  const canDelete = useMemo(() => {
    return (moduleKey: string, permissionCode?: string): boolean => {
      // Only owner and admin can delete
      if (isSystemOwner) return true;
      if (role === 'owner' || role === 'admin') return true;
      if (permissionCode) return hasPermission(permissionCode);
      return false;
    };
  }, [role, isSystemOwner, hasPermission]);

  return {
    canCreate,
    canEdit,
    canDelete,
    isViewer: role === 'viewer',
  };
}

/**
 * Get the list of available additional permissions for a role
 * (permissions that can be granted beyond the base role)
 */
export function getAvailableAdditionalPermissions(role: string | null): string[] {
  if (!role) return [];
  
  // Owner and admin have all permissions - nothing to add
  if (role === 'owner' || role === 'admin') return [];
  
  // Get base permissions for the role
  const basePerms = new Set(ROLE_BASE_PERMISSIONS[role] || []);
  
  // Get all possible permissions
  const allPerms = new Set<string>();
  Object.values(ROLE_BASE_PERMISSIONS).forEach(perms => {
    perms.forEach(p => {
      if (p !== '*') allPerms.add(p);
    });
  });
  
  // Return permissions not in base role
  return Array.from(allPerms).filter(p => !basePerms.has(p)).sort();
}
