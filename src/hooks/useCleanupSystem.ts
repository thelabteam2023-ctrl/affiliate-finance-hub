import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CleanupCandidate {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  is_test_user: boolean;
  workspace_id: string | null;
  workspace_name: string | null;
  is_system_owner: boolean;
}

interface ArchivedUser {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

interface DryRunResult {
  success: boolean;
  validated: boolean;
  validation_errors: string[];
  summary: {
    users_to_remove: number;
    workspaces_to_remove: number;
  };
  workspace_ids: string[];
  user_ids: string[];
  record_counts: Record<string, number>;
}

interface CleanupResult {
  success: boolean;
  message: string;
  total_records_affected: number;
  deleted_counts: Record<string, number>;
  workspace_ids_removed: string[];
}

interface HardDeleteResult {
  success: boolean;
  deleted_profiles: number;
  deleted_auth_users: number;
}

interface SystemOwnerPreview {
  workspace_id: string;
  counts: Record<string, number>;
}

interface SystemOwnerCleanupResult {
  success: boolean;
  workspace_id: string;
  deleted_counts: Record<string, number>;
}

export function useCleanupSystem() {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<CleanupCandidate[]>([]);
  const [archivedUsers, setArchivedUsers] = useState<ArchivedUser[]>([]);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [hardDeleteResult, setHardDeleteResult] = useState<HardDeleteResult | null>(null);
  const [systemOwnerPreview, setSystemOwnerPreview] = useState<SystemOwnerPreview | null>(null);
  const [systemOwnerCleanupResult, setSystemOwnerCleanupResult] = useState<SystemOwnerCleanupResult | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_cleanup_candidates');
      if (error) throw error;
      setCandidates(data || []);
    } catch (error: any) {
      console.error('Error fetching candidates:', error);
      toast.error(error.message || 'Erro ao carregar candidatos');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchArchivedUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_archived_users');
      if (error) throw error;
      setArchivedUsers(data || []);
    } catch (error: any) {
      console.error('Error fetching archived users:', error);
      toast.error(error.message || 'Erro ao carregar usuários arquivados');
    } finally {
      setLoading(false);
    }
  }, []);

  const setTestUser = useCallback(async (userId: string, isTest: boolean) => {
    try {
      const { error } = await supabase.rpc('admin_set_test_user', {
        _user_id: userId,
        _is_test: isTest
      });
      if (error) throw error;
      toast.success(isTest ? 'Marcado como teste' : 'Desmarcado como teste');
      await fetchCandidates();
    } catch (error: any) {
      console.error('Error setting test user:', error);
      toast.error(error.message || 'Erro ao marcar usuário');
    }
  }, [fetchCandidates]);

  const runDryRun = useCallback(async (userIds: string[]) => {
    if (userIds.length === 0) {
      toast.error('Selecione pelo menos um usuário');
      return null;
    }

    setLoading(true);
    setDryRunResult(null);
    try {
      const { data, error } = await supabase.rpc('admin_cleanup_dry_run', {
        _user_ids: userIds
      });
      if (error) throw error;
      const result = data as unknown as DryRunResult;
      setDryRunResult(result);
      return result;
    } catch (error: any) {
      console.error('Error running dry run:', error);
      toast.error(error.message || 'Erro ao simular limpeza');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const executeCleanup = useCallback(async (userIds: string[], confirmationPhrase: string) => {
    if (userIds.length === 0) {
      toast.error('Selecione pelo menos um usuário');
      return null;
    }

    if (confirmationPhrase !== 'CONFIRMAR LIMPEZA DEFINITIVA') {
      toast.error('Frase de confirmação incorreta');
      return null;
    }

    setLoading(true);
    setCleanupResult(null);
    try {
      const { data, error } = await supabase.rpc('admin_execute_cleanup', {
        _user_ids: userIds,
        _confirmation_phrase: confirmationPhrase
      });
      if (error) throw error;
      const result = data as unknown as CleanupResult;
      setCleanupResult(result);
      toast.success('Limpeza executada com sucesso');
      await fetchCandidates();
      return result;
    } catch (error: any) {
      console.error('Error executing cleanup:', error);
      toast.error(error.message || 'Erro ao executar limpeza');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchCandidates]);

  const executeHardDelete = useCallback(async (userIds: string[], confirmationPhrase: string) => {
    if (userIds.length === 0) {
      toast.error('Selecione pelo menos um usuário');
      return null;
    }

    if (confirmationPhrase !== 'EXCLUIR PERMANENTEMENTE') {
      toast.error('Frase de confirmação incorreta');
      return null;
    }

    setLoading(true);
    setHardDeleteResult(null);
    try {
      const { data, error } = await supabase.rpc('admin_hard_delete_users', {
        _user_ids: userIds
      });
      if (error) throw error;
      const result = data as unknown as HardDeleteResult;
      setHardDeleteResult(result);
      toast.success(`${result.deleted_profiles} usuário(s) excluído(s) permanentemente`);
      await fetchArchivedUsers();
      return result;
    } catch (error: any) {
      console.error('Error executing hard delete:', error);
      toast.error(error.message || 'Erro ao excluir usuários');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchArchivedUsers]);

  const clearResults = useCallback(() => {
    setDryRunResult(null);
    setCleanupResult(null);
    setHardDeleteResult(null);
    setSystemOwnerPreview(null);
    setSystemOwnerCleanupResult(null);
  }, []);

  const fetchSystemOwnerPreview = useCallback(async () => {
    setLoading(true);
    setSystemOwnerPreview(null);
    try {
      const { data, error } = await supabase.rpc('admin_preview_system_owner_cleanup');
      if (error) throw error;
      const result = data as unknown as SystemOwnerPreview;
      setSystemOwnerPreview(result);
      return result;
    } catch (error: any) {
      console.error('Error fetching system owner preview:', error);
      toast.error(error.message || 'Erro ao carregar preview');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const executeSystemOwnerCleanup = useCallback(async (confirmationPhrase: string) => {
    if (confirmationPhrase !== 'LIMPAR DADOS OPERACIONAIS') {
      toast.error('Frase de confirmação incorreta');
      return null;
    }

    setLoading(true);
    setSystemOwnerCleanupResult(null);
    try {
      const { data, error } = await supabase.rpc('admin_cleanup_system_owner_operational_data', {
        p_confirmation_phrase: confirmationPhrase
      });
      if (error) throw error;
      const result = data as unknown as SystemOwnerCleanupResult;
      setSystemOwnerCleanupResult(result);
      toast.success('Limpeza do System Owner executada com sucesso');
      return result;
    } catch (error: any) {
      console.error('Error executing system owner cleanup:', error);
      toast.error(error.message || 'Erro ao executar limpeza');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    candidates,
    archivedUsers,
    dryRunResult,
    cleanupResult,
    hardDeleteResult,
    systemOwnerPreview,
    systemOwnerCleanupResult,
    fetchCandidates,
    fetchArchivedUsers,
    setTestUser,
    runDryRun,
    executeCleanup,
    executeHardDelete,
    clearResults,
    fetchSystemOwnerPreview,
    executeSystemOwnerCleanup,
  };
}
