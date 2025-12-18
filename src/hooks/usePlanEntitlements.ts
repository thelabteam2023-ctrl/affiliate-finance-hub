import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";
import { useRole } from "./useRole";
import { useAuth } from "./useAuth";

export interface PlanEntitlements {
  max_active_partners: number;
  max_users: number;
  custom_permissions_enabled: boolean;
  max_custom_permissions: number;
  personalized_support: boolean;
}

export interface WorkspaceUsage {
  active_partners: number;
  active_users: number;
  custom_permissions: number;
}

export interface PlanLimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
  plan: string;
  enabled?: boolean;
  error?: string;
}

export interface UsePlanEntitlementsReturn {
  plan: string | null;
  entitlements: PlanEntitlements | null;
  usage: WorkspaceUsage | null;
  loading: boolean;
  error: string | null;
  
  // OWNER bypass
  isOwner: boolean;
  
  // Limit checks
  checkPartnerLimit: () => Promise<PlanLimitCheck>;
  checkUserLimit: () => Promise<PlanLimitCheck>;
  checkCustomPermissionsLimit: () => Promise<PlanLimitCheck>;
  
  // Convenience methods
  canAddPartner: () => Promise<boolean>;
  canAddUser: () => Promise<boolean>;
  canAddCustomPermission: () => Promise<boolean>;
  
  // Usage calculations
  getPartnerUsagePercent: () => number;
  getUserUsagePercent: () => number;
  getPermissionUsagePercent: () => number;
  
  // Plan helpers
  isUnlimited: (value: number) => boolean;
  getPlanLabel: () => string;
  
  // Refresh
  refresh: () => Promise<void>;
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  advanced: 'Advanced',
};

const UNLIMITED_THRESHOLD = 9999;

export function usePlanEntitlements(): UsePlanEntitlementsReturn {
  const { workspaceId } = useWorkspace();
  const { isOwner } = useRole();
  const { isSystemOwner } = useAuth();
  const [plan, setPlan] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(null);
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // OWNER do workspace ou System Owner tem acesso total - ignora limites de plano
  const hasUnlimitedAccess = isOwner || isSystemOwner;

  const fetchWorkspaceUsage = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_workspace_usage', {
        workspace_uuid: workspaceId
      });

      if (rpcError) throw rpcError;

      const result = data as unknown as {
        plan?: string;
        entitlements?: PlanEntitlements;
        usage?: WorkspaceUsage;
        error?: string;
      };

      if (result && !result.error) {
        setPlan(result.plan || null);
        setEntitlements(result.entitlements || null);
        setUsage(result.usage || null);
      } else if (result?.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error('Error fetching workspace usage:', err);
      setError('Erro ao carregar dados do plano');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchWorkspaceUsage();
  }, [fetchWorkspaceUsage]);

  const checkPartnerLimit = useCallback(async (): Promise<PlanLimitCheck> => {
    // OWNER ignora limites
    if (hasUnlimitedAccess) {
      return { allowed: true, current: usage?.active_partners || 0, limit: 9999, plan: 'owner' };
    }
    
    if (!workspaceId) {
      return { allowed: false, current: 0, limit: 0, plan: '', error: 'Workspace não encontrado' };
    }

    try {
      const { data, error } = await supabase.rpc('check_partner_limit', {
        workspace_uuid: workspaceId
      });

      if (error) throw error;
      return data as unknown as PlanLimitCheck;
    } catch (err) {
      console.error('Error checking partner limit:', err);
      return { allowed: false, current: 0, limit: 0, plan: '', error: 'Erro ao verificar limite' };
    }
  }, [workspaceId, hasUnlimitedAccess, usage]);

  const checkUserLimit = useCallback(async (): Promise<PlanLimitCheck> => {
    // OWNER ignora limites
    if (hasUnlimitedAccess) {
      return { allowed: true, current: usage?.active_users || 0, limit: 9999, plan: 'owner' };
    }
    
    if (!workspaceId) {
      return { allowed: false, current: 0, limit: 0, plan: '', error: 'Workspace não encontrado' };
    }

    try {
      const { data, error } = await supabase.rpc('check_user_limit', {
        workspace_uuid: workspaceId
      });

      if (error) throw error;
      return data as unknown as PlanLimitCheck;
    } catch (err) {
      console.error('Error checking user limit:', err);
      return { allowed: false, current: 0, limit: 0, plan: '', error: 'Erro ao verificar limite' };
    }
  }, [workspaceId, hasUnlimitedAccess, usage]);

  const checkCustomPermissionsLimit = useCallback(async (): Promise<PlanLimitCheck> => {
    // OWNER ignora limites
    if (hasUnlimitedAccess) {
      return { allowed: true, current: usage?.custom_permissions || 0, limit: 9999, plan: 'owner', enabled: true };
    }
    
    if (!workspaceId) {
      return { allowed: false, current: 0, limit: 0, plan: '', enabled: false, error: 'Workspace não encontrado' };
    }

    try {
      const { data, error } = await supabase.rpc('check_custom_permissions_limit', {
        workspace_uuid: workspaceId
      });

      if (error) throw error;
      return data as unknown as PlanLimitCheck;
    } catch (err) {
      console.error('Error checking custom permissions limit:', err);
      return { allowed: false, current: 0, limit: 0, plan: '', enabled: false, error: 'Erro ao verificar limite' };
    }
  }, [workspaceId, hasUnlimitedAccess, usage]);

  const canAddPartner = useCallback(async (): Promise<boolean> => {
    const result = await checkPartnerLimit();
    return result.allowed;
  }, [checkPartnerLimit]);

  const canAddUser = useCallback(async (): Promise<boolean> => {
    const result = await checkUserLimit();
    return result.allowed;
  }, [checkUserLimit]);

  const canAddCustomPermission = useCallback(async (): Promise<boolean> => {
    const result = await checkCustomPermissionsLimit();
    return result.allowed && result.enabled !== false;
  }, [checkCustomPermissionsLimit]);

  const getPartnerUsagePercent = useCallback((): number => {
    if (!usage || !entitlements) return 0;
    if (entitlements.max_active_partners >= UNLIMITED_THRESHOLD) return 0;
    return Math.min(100, (usage.active_partners / entitlements.max_active_partners) * 100);
  }, [usage, entitlements]);

  const getUserUsagePercent = useCallback((): number => {
    if (!usage || !entitlements) return 0;
    if (entitlements.max_users >= UNLIMITED_THRESHOLD) return 0;
    return Math.min(100, (usage.active_users / entitlements.max_users) * 100);
  }, [usage, entitlements]);

  const getPermissionUsagePercent = useCallback((): number => {
    if (!usage || !entitlements) return 0;
    if (!entitlements.custom_permissions_enabled) return 0;
    if (entitlements.max_custom_permissions >= UNLIMITED_THRESHOLD) return 0;
    return Math.min(100, (usage.custom_permissions / entitlements.max_custom_permissions) * 100);
  }, [usage, entitlements]);

  const isUnlimited = useCallback((value: number): boolean => {
    return value >= UNLIMITED_THRESHOLD;
  }, []);

  const getPlanLabel = useCallback((): string => {
    return plan ? PLAN_LABELS[plan] || plan : '';
  }, [plan]);

  return {
    plan,
    entitlements,
    usage,
    loading,
    error,
    isOwner: hasUnlimitedAccess,
    checkPartnerLimit,
    checkUserLimit,
    checkCustomPermissionsLimit,
    canAddPartner,
    canAddUser,
    canAddCustomPermission,
    getPartnerUsagePercent,
    getUserUsagePercent,
    getPermissionUsagePercent,
    isUnlimited,
    getPlanLabel,
    refresh: fetchWorkspaceUsage,
  };
}
