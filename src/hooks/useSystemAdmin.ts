import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  is_blocked: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_role: string | null;
}

interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  created_at: string;
  deactivated_at: string | null;
  deactivation_reason: string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  member_count: number;
}

interface WorkspaceMember {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  joined_at: string;
}

export function useSystemAdmin() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_all_users');
      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error(error.message || 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_all_workspaces');
      if (error) throw error;
      setWorkspaces(data || []);
    } catch (error: any) {
      console.error('Error fetching workspaces:', error);
      toast.error(error.message || 'Erro ao carregar workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  const createWorkspaceForUser = useCallback(async (
    userId: string,
    workspaceName: string,
    plan: string = 'free',
    role: string = 'owner'
  ) => {
    try {
      const { data, error } = await supabase.rpc('admin_create_workspace_for_user', {
        _user_id: userId,
        _workspace_name: workspaceName,
        _plan: plan,
        _role: role as any
      });
      if (error) throw error;
      toast.success('Workspace criado com sucesso');
      await fetchUsers();
      await fetchWorkspaces();
      return data;
    } catch (error: any) {
      console.error('Error creating workspace:', error);
      toast.error(error.message || 'Erro ao criar workspace');
      throw error;
    }
  }, [fetchUsers, fetchWorkspaces]);

  const addUserToWorkspace = useCallback(async (
    userId: string,
    workspaceId: string,
    role: string = 'user'
  ) => {
    try {
      const { error } = await supabase.rpc('admin_add_user_to_workspace', {
        _user_id: userId,
        _workspace_id: workspaceId,
        _role: role as any
      });
      if (error) throw error;
      toast.success('Usuário vinculado ao workspace');
      await fetchUsers();
    } catch (error: any) {
      console.error('Error adding user to workspace:', error);
      toast.error(error.message || 'Erro ao vincular usuário');
      throw error;
    }
  }, [fetchUsers]);

  const setUserBlocked = useCallback(async (
    userId: string,
    blocked: boolean,
    reason?: string
  ) => {
    try {
      const { error } = await supabase.rpc('admin_set_user_blocked', {
        _user_id: userId,
        _blocked: blocked,
        _reason: reason || null
      });
      if (error) throw error;
      toast.success(blocked ? 'Usuário bloqueado' : 'Usuário desbloqueado');
      await fetchUsers();
    } catch (error: any) {
      console.error('Error blocking user:', error);
      toast.error(error.message || 'Erro ao alterar status do usuário');
      throw error;
    }
  }, [fetchUsers]);

  const updateWorkspacePlan = useCallback(async (
    workspaceId: string,
    plan: string
  ) => {
    try {
      const { error } = await supabase.rpc('admin_update_workspace_plan', {
        _workspace_id: workspaceId,
        _plan: plan
      });
      if (error) throw error;
      toast.success('Plano atualizado com sucesso');
      await fetchWorkspaces();
    } catch (error: any) {
      console.error('Error updating plan:', error);
      toast.error(error.message || 'Erro ao atualizar plano');
      throw error;
    }
  }, [fetchWorkspaces]);

  const setWorkspaceActive = useCallback(async (
    workspaceId: string,
    active: boolean,
    reason?: string
  ) => {
    try {
      const { error } = await supabase.rpc('admin_set_workspace_active', {
        _workspace_id: workspaceId,
        _active: active,
        _reason: reason || null
      });
      if (error) throw error;
      toast.success(active ? 'Workspace ativado' : 'Workspace desativado');
      await fetchWorkspaces();
    } catch (error: any) {
      console.error('Error toggling workspace:', error);
      toast.error(error.message || 'Erro ao alterar status do workspace');
      throw error;
    }
  }, [fetchWorkspaces]);

  const getWorkspaceMembers = useCallback(async (workspaceId: string): Promise<WorkspaceMember[]> => {
    try {
      const { data, error } = await supabase.rpc('admin_get_workspace_members', {
        _workspace_id: workspaceId
      });
      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('Error fetching members:', error);
      toast.error(error.message || 'Erro ao carregar membros');
      return [];
    }
  }, []);

  return {
    loading,
    users,
    workspaces,
    fetchUsers,
    fetchWorkspaces,
    createWorkspaceForUser,
    addUserToWorkspace,
    setUserBlocked,
    updateWorkspacePlan,
    setWorkspaceActive,
    getWorkspaceMembers,
  };
}
