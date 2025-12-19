import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useCommunityAccess } from './useCommunityAccess';

/**
 * Definição de módulos e suas permissões mínimas
 * key: identificador do módulo (usado internamente)
 * permission: código da permissão necessária (null = sem restrição)
 * roles: roles permitidos (vazio = todos, null = verificar permission)
 * requiresPlan: plano mínimo necessário (opcional)
 */
interface ModuleConfig {
  permission: string | null;
  roles: string[] | null;
  requiresPlan?: string[];
  requiresSystemOwner?: boolean;
}

const MODULE_ACCESS_MAP: Record<string, ModuleConfig> = {
  // VISÃO GERAL - Todos podem ver
  'central': { permission: null, roles: null },
  
  // OPERAÇÃO
  'projetos': { permission: 'projetos.read', roles: null },
  'bookmakers': { permission: 'bookmakers.catalog.read', roles: null },
  
  // FINANCEIRO
  'caixa': { permission: 'caixa.read', roles: null },
  'financeiro': { permission: 'financeiro.read', roles: null },
  'bancos': { permission: 'financeiro.read', roles: null },
  'investidores': { permission: 'investidores.read', roles: null },
  
  // RELACIONAMENTOS
  'parceiros': { permission: 'parceiros.read', roles: null },
  'operadores': { permission: 'operadores.read', roles: null },
  
  // CRESCIMENTO
  'captacao': { permission: 'captacao.read', roles: null },
  
  // COMUNIDADE - Requer plano PRO+ OU ser owner
  'comunidade': { 
    permission: 'community.read', 
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
  loading: boolean;
}

export function useModuleAccess(): ModuleAccessResult {
  const { role, isSystemOwner, workspace } = useAuth();
  const { hasFullAccess: hasCommunityAccess, loading: communityLoading } = useCommunityAccess();

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
      
      // Check role restriction
      if (config.roles !== null && config.roles.length > 0) {
        if (!role || !config.roles.includes(role)) {
          // Owner bypasses role checks
          if (role !== 'owner') {
            return false;
          }
        }
      }
      
      // Empty roles array means no one can access (except system owner)
      if (config.roles !== null && config.roles.length === 0) {
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
      
      // For other roles, we trust the menu filtering
      // The actual permission check happens at the route level
      return true;
    };
  }, [role, isSystemOwner, workspace?.plan, hasCommunityAccess]);

  return {
    canAccess,
    loading: communityLoading,
  };
}

/**
 * Hook para verificar acesso a uma ação específica
 * Útil para esconder botões de criar/editar/deletar
 */
export function useActionAccess() {
  const { role, isSystemOwner } = useAuth();
  const { canWrite: canWriteCommunity } = useCommunityAccess();

  const canCreate = useMemo(() => {
    return (moduleKey: string): boolean => {
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
      
      // Finance and Operator have limited create permissions
      // This is handled by specific permission checks
      return true;
    };
  }, [role, isSystemOwner, canWriteCommunity]);

  const canEdit = useMemo(() => {
    return (moduleKey: string): boolean => {
      // Same logic as canCreate for now
      if (isSystemOwner) return true;
      if (role === 'owner' || role === 'admin') return true;
      if (role === 'viewer') return false;
      if (moduleKey === 'comunidade') return canWriteCommunity;
      return true;
    };
  }, [role, isSystemOwner, canWriteCommunity]);

  const canDelete = useMemo(() => {
    return (moduleKey: string): boolean => {
      // Only owner and admin can delete
      if (isSystemOwner) return true;
      if (role === 'owner' || role === 'admin') return true;
      return false;
    };
  }, [role, isSystemOwner]);

  return {
    canCreate,
    canEdit,
    canDelete,
    isViewer: role === 'viewer',
  };
}
