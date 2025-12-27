import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";
import { useAuth } from "./useAuth";

interface Permission {
  code: string;
  module: string;
  action: string;
  description: string;
}

interface PermissionOverride {
  id: string;
  permission_code: string;
  granted: boolean;
  reason?: string;
}

interface PermissionsByModule {
  [module: string]: Permission[];
}

// Plans that allow custom permissions
const PLANS_WITH_CUSTOM_PERMISSIONS = ['pro', 'advanced', 'enterprise'];

// Plans with limited custom permissions (max 5)
const PLANS_WITH_LIMITED_PERMISSIONS = ['pro'];
const LIMITED_PERMISSIONS_MAX = 5;

// Modules to exclude from additional permissions (internal use only)
const EXCLUDED_MODULES = ['community', 'projeto'];

// Permissions that are subsets of global permissions
// If user has the global version, hide the _self version
const SELF_TO_GLOBAL_MAP: Record<string, string> = {
  'operadores.read_self': 'operadores.read',
  'operadores.pagamentos.read_self': 'operadores.pagamentos.read',
};

export function usePermissionOverrides(userId?: string, userRole?: string) {
  const { workspaceId, workspace } = useWorkspace();
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleBasePermissions, setRoleBasePermissions] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [loading, setLoading] = useState(true);

  // Plan validation
  const workspacePlan = workspace?.plan || 'free';
  const canUseCustomPermissions = PLANS_WITH_CUSTOM_PERMISSIONS.includes(workspacePlan);
  const hasLimitedPermissions = PLANS_WITH_LIMITED_PERMISSIONS.includes(workspacePlan);
  const maxOverrides = hasLimitedPermissions ? LIMITED_PERMISSIONS_MAX : Infinity;

  const fetchPermissions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('code, module, action, description')
        .order('module')
        .order('action');

      if (error) throw error;
      setPermissions(data || []);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  }, []);

  // Fetch base permissions for the user's role
  const fetchRoleBasePermissions = useCallback(async () => {
    if (!userRole) return;

    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission_code')
        .eq('role', userRole as any); // Cast to any to handle role type

      if (error) throw error;
      setRoleBasePermissions((data || []).map(p => p.permission_code));
    } catch (error) {
      console.error('Error fetching role base permissions:', error);
    }
  }, [userRole]);

  const fetchOverrides = useCallback(async () => {
    if (!userId || !workspaceId) return;

    try {
      const { data, error } = await supabase
        .from('user_permission_overrides')
        .select('id, permission_code, granted, reason')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId);

      if (error) throw error;
      setOverrides(data || []);
    } catch (error) {
      console.error('Error fetching overrides:', error);
    }
  }, [userId, workspaceId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchPermissions(), fetchRoleBasePermissions(), fetchOverrides()]);
      setLoading(false);
    };
    load();
  }, [fetchPermissions, fetchRoleBasePermissions, fetchOverrides]);

  // Filter permissions to only show those NOT included in base role
  // and NOT in excluded modules
  // Also hide _self permissions if user already has the global version
  const availablePermissions = useMemo(() => {
    return permissions.filter(perm => {
      // Exclude internal modules
      if (EXCLUDED_MODULES.includes(perm.module)) return false;
      
      // Exclude permissions already in base role
      if (roleBasePermissions.includes(perm.code)) return false;
      
      // Hide _self permissions if user has the global version
      const globalEquivalent = SELF_TO_GLOBAL_MAP[perm.code];
      if (globalEquivalent && roleBasePermissions.includes(globalEquivalent)) {
        return false;
      }
      
      return true;
    });
  }, [permissions, roleBasePermissions]);

  // Group available permissions by module
  const permissionsByModule: PermissionsByModule = useMemo(() => {
    return availablePermissions.reduce((acc, perm) => {
      if (!acc[perm.module]) {
        acc[perm.module] = [];
      }
      acc[perm.module].push(perm);
      return acc;
    }, {} as PermissionsByModule);
  }, [availablePermissions]);

  const hasOverride = (permissionCode: string): boolean => {
    return overrides.some(o => o.permission_code === permissionCode && o.granted);
  };

  // Create audit log for permission changes
  const createAuditLog = async (
    action: 'PERMISSION_CHANGE',
    targetUserId: string,
    permissionCode: string,
    granted: boolean,
    isBulkClear: boolean = false
  ) => {
    if (!user || !workspaceId) return;

    try {
      await supabase.from('audit_logs').insert({
        workspace_id: workspaceId,
        actor_user_id: user.id,
        action: action,
        entity_type: 'permission_override',
        entity_id: null,
        entity_name: permissionCode,
        before_data: isBulkClear ? null : { granted: !granted },
        after_data: isBulkClear ? { cleared: true } : { granted },
        metadata: {
          target_user_id: targetUserId,
          permission_code: permissionCode,
          operation: granted ? 'grant' : 'revoke',
          bulk_clear: isBulkClear,
        },
      });
    } catch (error) {
      console.error('Error creating audit log:', error);
      // Don't throw - audit log failure shouldn't block the operation
    }
  };

  const toggleOverride = async (permissionCode: string, granted: boolean) => {
    if (!userId || !workspaceId) return;

    // Plan validation - block if plan doesn't allow custom permissions
    if (!canUseCustomPermissions) {
      throw new Error('PLAN_NOT_ALLOWED');
    }

    // Check limit for limited plans
    const currentCount = overrides.filter(o => o.granted).length;
    if (granted && hasLimitedPermissions && currentCount >= maxOverrides) {
      throw new Error('LIMIT_REACHED');
    }

    try {
      const existingOverride = overrides.find(o => o.permission_code === permissionCode);

      if (existingOverride) {
        if (granted) {
          // Update existing override
          const { error } = await supabase
            .from('user_permission_overrides')
            .update({ granted })
            .eq('id', existingOverride.id);

          if (error) throw error;
        } else {
          // Remove override when disabling
          const { error } = await supabase
            .from('user_permission_overrides')
            .delete()
            .eq('id', existingOverride.id);

          if (error) throw error;
        }
      } else if (granted) {
        // Create new override only if granting
        const { error } = await supabase
          .from('user_permission_overrides')
          .insert({
            workspace_id: workspaceId,
            user_id: userId,
            permission_code: permissionCode,
            granted: true,
            granted_by: user?.id,
          });

        if (error) throw error;
      }

      // Create audit log
      await createAuditLog('PERMISSION_CHANGE', userId, permissionCode, granted);

      await fetchOverrides();
    } catch (error) {
      console.error('Error toggling override:', error);
      throw error;
    }
  };

  const clearAllOverrides = async () => {
    if (!userId || !workspaceId) return;

    // Plan validation
    if (!canUseCustomPermissions && overrides.length > 0) {
      // Allow clearing even if plan doesn't support - this is a cleanup operation
    }

    try {
      // Get current overrides for audit
      const currentOverrides = [...overrides];

      const { error } = await supabase
        .from('user_permission_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId);

      if (error) throw error;

      // Create audit log for bulk clear
      if (currentOverrides.length > 0) {
        await createAuditLog(
          'PERMISSION_CHANGE',
          userId,
          `bulk_clear:${currentOverrides.length}_permissions`,
          false,
          true
        );
      }

      setOverrides([]);
    } catch (error) {
      console.error('Error clearing overrides:', error);
      throw error;
    }
  };

  // Toggle all permissions in a module
  const toggleModulePermissions = async (module: string, grant: boolean) => {
    const modulePerms = permissionsByModule[module] || [];
    if (modulePerms.length === 0) return;

    // Plan validation
    if (!canUseCustomPermissions) {
      throw new Error('PLAN_NOT_ALLOWED');
    }

    // Check limit for limited plans when granting
    if (grant && hasLimitedPermissions) {
      const currentCount = overrides.filter(o => o.granted).length;
      const toGrant = modulePerms.filter(p => !hasOverride(p.code)).length;
      if (currentCount + toGrant > maxOverrides) {
        throw new Error('LIMIT_REACHED');
      }
    }

    try {
      for (const perm of modulePerms) {
        const isEnabled = hasOverride(perm.code);
        if (grant && !isEnabled) {
          await toggleOverride(perm.code, true);
        } else if (!grant && isEnabled) {
          await toggleOverride(perm.code, false);
        }
      }
    } catch (error) {
      console.error('Error toggling module permissions:', error);
      throw error;
    }
  };

  // Check if all permissions in a module are enabled
  const isModuleFullyEnabled = (module: string): boolean => {
    const modulePerms = permissionsByModule[module] || [];
    if (modulePerms.length === 0) return false;
    return modulePerms.every(p => hasOverride(p.code));
  };

  // Check if any permission in a module is enabled
  const isModulePartiallyEnabled = (module: string): boolean => {
    const modulePerms = permissionsByModule[module] || [];
    return modulePerms.some(p => hasOverride(p.code));
  };

  return {
    permissions,
    permissionsByModule,
    overrides,
    loading,
    hasOverride,
    toggleOverride,
    clearAllOverrides,
    overrideCount: overrides.filter(o => o.granted).length,
    refresh: fetchOverrides,
    // Plan-related exports
    canUseCustomPermissions,
    hasLimitedPermissions,
    maxOverrides,
    workspacePlan,
    // Module toggle
    toggleModulePermissions,
    isModuleFullyEnabled,
    isModulePartiallyEnabled,
  };
}
