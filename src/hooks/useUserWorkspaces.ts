import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Database } from "@/integrations/supabase/types";
import { useQueryClient } from "@tanstack/react-query";

type AppRole = Database["public"]["Enums"]["app_role"];

export interface UserWorkspace {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  role: AppRole;
  plan: string;
  is_default: boolean;
}

export interface PendingWorkspaceInvite {
  id: string;
  workspace_id: string;
  workspace_name: string;
  role: AppRole;
  token: string;
  expires_at: string;
  inviter_name: string | null;
}

/**
 * Hook para gerenciar múltiplos workspaces do usuário.
 * 
 * Funcionalidades:
 * - Lista todos os workspaces que o usuário pertence
 * - Lista convites pendentes para o usuário
 * - Permite trocar entre workspaces
 * - Permite aceitar convites
 */
export function useUserWorkspaces() {
  const { user, refreshWorkspace } = useAuth();
  const queryClient = useQueryClient();
  
  const [workspaces, setWorkspaces] = useState<UserWorkspace[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingWorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  // Buscar todos os workspaces do usuário
  const fetchWorkspaces = useCallback(async () => {
    if (!user?.id) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_user_workspaces', {
        _user_id: user.id
      });

      if (error) {
        console.error("[useUserWorkspaces] Erro ao buscar workspaces:", error);
        return;
      }

      setWorkspaces((data as UserWorkspace[]) || []);
    } catch (error) {
      console.error("[useUserWorkspaces] Erro:", error);
    }
  }, [user?.id]);

  // Buscar convites pendentes
  const fetchPendingInvites = useCallback(async () => {
    if (!user) {
      setPendingInvites([]);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_my_pending_invites');

      if (error) {
        console.error("[useUserWorkspaces] Erro ao buscar convites:", error);
        return;
      }

      setPendingInvites((data as PendingWorkspaceInvite[]) || []);
    } catch (error) {
      console.error("[useUserWorkspaces] Erro:", error);
    }
  }, [user]);

  // Carregar dados iniciais
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchWorkspaces(), fetchPendingInvites()]);
      setLoading(false);
    };

    loadData();
  }, [fetchWorkspaces, fetchPendingInvites]);

  // Trocar para outro workspace
  const switchWorkspace = useCallback(async (workspaceId: string) => {
    if (!user?.id) return { success: false, error: "Usuário não autenticado" };

    setSwitching(true);
    try {
      // Chamar RPC para definir workspace atual (usa auth.uid() internamente)
      const { error } = await supabase.rpc('set_current_workspace', {
        _workspace_id: workspaceId
      });

      if (error) {
        console.error("[useUserWorkspaces] Erro ao trocar workspace:", error);
        return { success: false, error: error.message };
      }

      // Limpar cache do React Query
      queryClient.clear();
      console.log("[useUserWorkspaces] Cache limpo após troca de workspace");

      // Atualizar contexto de autenticação
      await refreshWorkspace();

      // Recarregar lista de workspaces
      await fetchWorkspaces();

      return { success: true };
    } catch (error: any) {
      console.error("[useUserWorkspaces] Erro:", error);
      return { success: false, error: error.message };
    } finally {
      setSwitching(false);
    }
  }, [user?.id, queryClient, refreshWorkspace, fetchWorkspaces]);

  // Aceitar convite de workspace
  const acceptInvite = useCallback(async (token: string) => {
    setSwitching(true);
    try {
      const { data, error } = await supabase.rpc('accept_workspace_invite', {
        _token: token
      });

      if (error) {
        console.error("[useUserWorkspaces] Erro ao aceitar convite:", error);
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string; workspace_id?: string };

      if (!result.success) {
        return { success: false, error: result.error || "Erro ao aceitar convite" };
      }

      // Limpar cache do React Query
      queryClient.clear();

      // Atualizar contexto e lista
      await refreshWorkspace();
      await Promise.all([fetchWorkspaces(), fetchPendingInvites()]);

      return { success: true, workspaceId: result.workspace_id };
    } catch (error: any) {
      console.error("[useUserWorkspaces] Erro:", error);
      return { success: false, error: error.message };
    } finally {
      setSwitching(false);
    }
  }, [queryClient, refreshWorkspace, fetchWorkspaces, fetchPendingInvites]);

  // Recusar/ignorar convite
  const declineInvite = useCallback(async (inviteId: string) => {
    try {
      // Marcar como cancelado pelo usuário
      const { error } = await supabase
        .from('workspace_invites')
        .update({ status: 'declined' })
        .eq('id', inviteId);

      if (error) {
        console.error("[useUserWorkspaces] Erro ao recusar convite:", error);
        return { success: false, error: error.message };
      }

      // Atualizar lista de convites
      await fetchPendingInvites();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [fetchPendingInvites]);

  return {
    workspaces,
    pendingInvites,
    loading,
    switching,
    switchWorkspace,
    acceptInvite,
    declineInvite,
    refresh: () => Promise.all([fetchWorkspaces(), fetchPendingInvites()]),
    hasMultipleWorkspaces: workspaces.length > 1,
    hasPendingInvites: pendingInvites.length > 0,
  };
}
