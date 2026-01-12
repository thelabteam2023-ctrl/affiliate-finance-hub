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

export interface ModuleAccessResult {
  canAccess: (moduleKey: string) => boolean;
  hasPermission: (permissionCode: string) => boolean;
  loading: boolean;
}

export function useModuleAccess(): ModuleAccessResult {
  const { role, isSystemOwner, workspace, user } = useAuth();
  const { hasFullAccess: hasCommunityAccess, loading: communityLoading } = useCommunityAccess();
  const [roleBasePermissions, setRoleBasePermissions] = useState<string[]>([]);
  const [userOverrides, setUserOverrides] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  // Fetch role base permissions AND user overrides from database
  useEffect(() => {
    const fetchPermissions = async () => {
      if (!user?.id || !workspace?.id || !role) {
        setRoleBasePermissions([]);
        setUserOverrides([]);
        setPermissionsLoading(false);
        return;
      }

      try {
        // Fetch role base permissions from role_permissions table
        const [rolePermsResult, overridesResult] = await Promise.all([
          supabase
            .from('role_permissions')
            .select('permission_code')
            .eq('role', role),
          supabase
            .from('user_permission_overrides')
            .select('permission_code')
            .eq('user_id', user.id)
            .eq('workspace_id', workspace.id)
            .eq('granted', true)
        ]);

        if (rolePermsResult.error) {
          console.error('[useModuleAccess] Error fetching role permissions:', rolePermsResult.error);
          setRoleBasePermissions([]);
        } else {
          setRoleBasePermissions(rolePermsResult.data?.map(p => p.permission_code) || []);
        }

        if (overridesResult.error) {
          console.error('[useModuleAccess] Error fetching overrides:', overridesResult.error);
          setUserOverrides([]);
        } else {
          setUserOverrides(overridesResult.data?.map(o => o.permission_code) || []);
        }
      } catch (err) {
        console.error('[useModuleAccess] Exception fetching permissions:', err);
        setRoleBasePermissions([]);
        setUserOverrides([]);
      } finally {
        setPermissionsLoading(false);
      }
    };

    fetchPermissions();
  }, [user?.id, workspace?.id, role]);

  /**
   * Check if the current role has a specific permission
   * Fetches permissions from database instead of hardcoded cache
   */
  const hasPermission = useCallback((permissionCode: string): boolean => {
    // System Owner has all permissions
    if (isSystemOwner) return true;
    
    // Owner and Admin have all permissions
    if (role === 'owner' || role === 'admin') return true;
    
    // Check overrides first (additional permissions granted to user)
    if (userOverrides.includes(permissionCode)) return true;
    
    // Check base permissions from database
    return roleBasePermissions.includes(permissionCode);
  }, [role, isSystemOwner, userOverrides, roleBasePermissions]);

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
    loading: communityLoading || permissionsLoading,
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
 * This function is now async as it fetches from the database
 * NOTE: For synchronous usage, use usePermissionOverrides hook instead
 */
export async function getAvailableAdditionalPermissions(role: string | null): Promise<string[]> {
  if (!role) return [];
  
  // Owner and admin have all permissions - nothing to add
  if (role === 'owner' || role === 'admin') return [];
  
  try {
    // Fetch all permissions and role base permissions from database
    const [allPermsResult, rolePermsResult] = await Promise.all([
      supabase.from('permissions').select('code'),
      supabase.from('role_permissions').select('permission_code').eq('role', role as any)
    ]);

    if (allPermsResult.error || rolePermsResult.error) {
      console.error('[getAvailableAdditionalPermissions] Error:', allPermsResult.error || rolePermsResult.error);
      return [];
    }

    const allPerms = new Set(allPermsResult.data?.map(p => p.code) || []);
    const basePerms = new Set(rolePermsResult.data?.map(p => p.permission_code) || []);

    // Return permissions not in base role
    return Array.from(allPerms).filter(p => !basePerms.has(p)).sort();
  } catch (err) {
    console.error('[getAvailableAdditionalPermissions] Exception:', err);
    return [];
  }
}
