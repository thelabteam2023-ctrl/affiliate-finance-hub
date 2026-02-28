import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";


/**
 * Interface for the effective access data from the backend
 */
interface EffectiveAccess {
  success: boolean;
  error?: string;
  message?: string;
  user_id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_plan: string;
  is_system_owner: boolean;
  role: string | null;
  role_label: string;
  base_permissions: string[];
  additional_permissions: string[];
  effective_permissions: string[];
  fetched_at: string;
}

/**
 * Route permission mapping - centralized configuration
 */
const ROUTE_PERMISSIONS: Record<string, { permission?: string; roles?: string[]; requireSystemOwner?: boolean }> = {
  '/': { permission: undefined }, // Central - everyone
  '/projetos': { permission: 'projetos.read' },
  '/projeto': { permission: 'projetos.read' },
  '/bookmakers': { permission: 'bookmakers.catalog.read' },
  '/caixa': { permission: 'caixa.read' },
  '/financeiro': { permission: 'financeiro.read' },
  '/bancos': { permission: 'financeiro.read' },
  '/investidores': { permission: 'investidores.read' },
  '/parceiros': { permission: 'parceiros.read' },
  '/operadores': { permission: 'operadores.read' },
  '/programa-indicacao': { permission: 'captacao.read' },
  '/comunidade': { permission: undefined }, // Plan-based check
  '/workspace': { roles: ['owner', 'admin'] },
  '/admin': { requireSystemOwner: true },
  '/testes': { roles: ['owner'] },
};

interface PermissionsContextType {
  // Access data
  access: EffectiveAccess | null;
  loading: boolean;
  initialized: boolean;
  
  // Core permission checking
  can: (permissionCode: string) => boolean;
  canRoute: (route: string) => boolean;
  
  // Role checking
  isRole: (role: string | string[]) => boolean;
  isOwnerOrAdmin: boolean;
  isSystemOwner: boolean;
  
  // Lists
  effectivePermissions: string[];
  basePermissions: string[];
  additionalPermissions: string[];
  
  // Refresh
  refresh: () => Promise<void>;
  
  // Debug info (for logging)
  getDebugInfo: () => Record<string, any>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, isSystemOwner: authIsSystemOwner, initialized: authInitialized } = useAuth();
  const { workspaceId } = useWorkspace();
  
  
  const [access, setAccess] = useState<EffectiveAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  
  /**
   * Fetch effective access from backend RPC
   */
  const fetchEffectiveAccess = useCallback(async () => {
    if (!user) {
      setAccess(null);
      setLoading(false);
      setInitialized(true);
      return;
    }
    
    try {
      setLoading(true);
      
      const { data, error } = await supabase.rpc('get_effective_access', {
        _user_id: user.id,
        _workspace_id: workspaceId || null
      });
      
      if (error) {
        console.error('[PermissionsContext] Error fetching access:', error);
        setAccess(null);
      } else if (data) {
        // Cast data to unknown first, then to EffectiveAccess
        const accessData = data as unknown as EffectiveAccess;
        
        if (accessData.success) {
          setAccess(accessData);
          console.log('[PermissionsContext] Access loaded:', {
            role: accessData.role,
            role_label: accessData.role_label,
            is_system_owner: accessData.is_system_owner,
            base_count: accessData.base_permissions?.length || 0,
            additional_count: accessData.additional_permissions?.length || 0,
            effective_count: accessData.effective_permissions?.length || 0,
          });
        } else {
          console.warn('[PermissionsContext] Access check failed:', accessData.error, accessData.message);
          setAccess(null);
        }
      } else {
        setAccess(null);
      }
    } catch (err) {
      console.error('[PermissionsContext] Exception:', err);
      setAccess(null);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [user, workspaceId]);
  
  // Fetch on mount and when user/workspace changes
  useEffect(() => {
    if (authInitialized) {
      fetchEffectiveAccess();
    }
  }, [authInitialized, fetchEffectiveAccess]);
  
  // Reagir a mudanças de sessão via AuthContext (sem listener duplicado)
  // O useEffect acima já reage a authInitialized + fetchEffectiveAccess (que depende de user/workspaceId)
  // Aqui só precisamos limpar o state quando o user desloga
  useEffect(() => {
    if (authInitialized && !user) {
      setAccess(null);
      setInitialized(true);
    }
  }, [authInitialized, user]);
  
  /**
   * Check if user has a specific permission
   */
  const can = useCallback((permissionCode: string): boolean => {
    // System owner has all permissions
    if (access?.is_system_owner || authIsSystemOwner) {
      return true;
    }
    
    // Owner has all permissions within workspace
    if (access?.role === 'owner') {
      return true;
    }
    
    // Admin has all permissions within workspace
    if (access?.role === 'admin') {
      return true;
    }
    
    // Check effective permissions
    return access?.effective_permissions?.includes(permissionCode) ?? false;
  }, [access, authIsSystemOwner]);
  
  /**
   * Check if user can access a specific route
   */
  const canRoute = useCallback((route: string): boolean => {
    // System owner has access to all routes
    if (access?.is_system_owner || authIsSystemOwner) {
      return true;
    }
    
    // Find matching route config
    let routeConfig = ROUTE_PERMISSIONS[route];
    
    // Try partial match for dynamic routes
    if (!routeConfig) {
      const baseRoute = '/' + route.split('/').filter(Boolean)[0];
      routeConfig = ROUTE_PERMISSIONS[baseRoute];
    }
    
    // Unknown route - deny
    if (!routeConfig) {
      console.warn('[PermissionsContext] Unknown route:', route);
      return false;
    }
    
    // Check system owner requirement
    if (routeConfig.requireSystemOwner) {
      return access?.is_system_owner || authIsSystemOwner || false;
    }
    
    // Check role requirement
    if (routeConfig.roles && routeConfig.roles.length > 0) {
      if (!access?.role) return false;
      return routeConfig.roles.includes(access.role);
    }
    
    // Check permission requirement
    if (routeConfig.permission) {
      return can(routeConfig.permission);
    }
    
    // No specific requirement - allow
    return true;
  }, [access, authIsSystemOwner, can]);
  
  /**
   * Check if user has a specific role
   */
  const isRole = useCallback((role: string | string[]): boolean => {
    if (!access?.role) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(access.role);
  }, [access]);
  
  // Computed values
  const isOwnerOrAdmin = useMemo(() => {
    return access?.is_system_owner || access?.role === 'owner' || access?.role === 'admin' || false;
  }, [access]);
  
  const isSystemOwner = useMemo(() => {
    return access?.is_system_owner || authIsSystemOwner || false;
  }, [access, authIsSystemOwner]);
  
  const effectivePermissions = useMemo(() => {
    return access?.effective_permissions || [];
  }, [access]);
  
  const basePermissions = useMemo(() => {
    return access?.base_permissions || [];
  }, [access]);
  
  const additionalPermissions = useMemo(() => {
    return access?.additional_permissions || [];
  }, [access]);
  
  /**
   * Get debug info for logging access denied cases
   */
  const getDebugInfo = useCallback(() => {
    return {
      user_id: user?.id,
      workspace_id: workspaceId,
      role: access?.role,
      role_label: access?.role_label,
      is_system_owner: access?.is_system_owner || authIsSystemOwner,
      base_permissions_count: access?.base_permissions?.length || 0,
      additional_permissions_count: access?.additional_permissions?.length || 0,
      effective_permissions_count: access?.effective_permissions?.length || 0,
      fetched_at: access?.fetched_at,
      initialized,
      loading,
    };
  }, [user, workspaceId, access, authIsSystemOwner, initialized, loading]);
  
  const value: PermissionsContextType = {
    access,
    loading,
    initialized,
    can,
    canRoute,
    isRole,
    isOwnerOrAdmin,
    isSystemOwner,
    effectivePermissions,
    basePermissions,
    additionalPermissions,
    refresh: fetchEffectiveAccess,
    getDebugInfo,
  };
  
  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

/**
 * Hook to access the permissions context
 */
export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
}
