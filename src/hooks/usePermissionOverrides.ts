import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";

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

export function usePermissionOverrides(userId?: string) {
  const { workspaceId } = useWorkspace();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [loading, setLoading] = useState(true);

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
      await Promise.all([fetchPermissions(), fetchOverrides()]);
      setLoading(false);
    };
    load();
  }, [fetchPermissions, fetchOverrides]);

  const permissionsByModule: PermissionsByModule = permissions.reduce((acc, perm) => {
    if (!acc[perm.module]) {
      acc[perm.module] = [];
    }
    acc[perm.module].push(perm);
    return acc;
  }, {} as PermissionsByModule);

  const hasOverride = (permissionCode: string): boolean => {
    return overrides.some(o => o.permission_code === permissionCode && o.granted);
  };

  const toggleOverride = async (permissionCode: string, granted: boolean) => {
    if (!userId || !workspaceId) return;

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
          });

        if (error) throw error;
      }

      await fetchOverrides();
    } catch (error) {
      console.error('Error toggling override:', error);
      throw error;
    }
  };

  const clearAllOverrides = async () => {
    if (!userId || !workspaceId) return;

    try {
      const { error } = await supabase
        .from('user_permission_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId);

      if (error) throw error;
      setOverrides([]);
    } catch (error) {
      console.error('Error clearing overrides:', error);
      throw error;
    }
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
  };
}
