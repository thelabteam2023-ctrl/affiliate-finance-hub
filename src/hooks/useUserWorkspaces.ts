import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Database } from "@/integrations/supabase/types";
import { useQueryClient } from "@tanstack/react-query";
import { setTabWorkspaceId } from "@/lib/tabWorkspace";

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
 * IMPORTANTE: Agora usa sessionStorage para isolamento por aba.
 * Cada aba mantém seu próprio workspace independentemente.
 * 
 * Funcionalidades:
 * - Lista todos os workspaces que o usuário pertence
 * - Lista convites pendentes para o usuário
 * - Permite trocar entre workspaces (isolado por aba)
 * - Permite aceitar convites
 */
export function useUserWorkspaces() {
  const { user, refreshWorkspace, tabId } = useAuth();
  const queryClient = useQueryClient();
  
  const [workspaces, setWorkspaces] = useState<UserWorkspace[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingWorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  // Carregar dados iniciais quando o usuário está disponível
  useEffect(() => {
    if (!user?.id) {
      setWorkspaces([]);
      setPendingInvites([]);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      console.log("[useUserWorkspaces] Carregando dados para user:", user.id);
      
      // Buscar workspaces
      try {
        const { data: wsData, error: wsError } = await supabase.rpc('get_user_workspaces', {
          _user_id: user.id
        });

        if (wsError) {
          console.error("[useUserWorkspaces] Erro ao buscar workspaces:", wsError);
        } else {
          console.log("[useUserWorkspaces] Workspaces encontrados:", wsData);
          setWorkspaces((wsData as UserWorkspace[]) || []);
        }
      } catch (error) {
        console.error("[useUserWorkspaces] Erro ao buscar workspaces:", error);
      }

      // Buscar convites pendentes
      try {
        const { data: invitesData, error: invitesError } = await supabase.rpc('get_my_pending_invites');

        if (invitesError) {
          console.error("[useUserWorkspaces] Erro ao buscar convites:", invitesError);
        } else {
          console.log("[useUserWorkspaces] Convites encontrados:", invitesData);
          setPendingInvites((invitesData as PendingWorkspaceInvite[]) || []);
        }
      } catch (error) {
        console.error("[useUserWorkspaces] Erro ao buscar convites:", error);
      }

      setLoading(false);
      console.log("[useUserWorkspaces] Dados carregados");
    };

    loadData();
  }, [user?.id]); // Only re-run when user.id changes

  // Função para recarregar dados
  const reloadData = useCallback(async () => {
    if (!user?.id) return;

    // Buscar workspaces
    try {
      const { data: wsData, error: wsError } = await supabase.rpc('get_user_workspaces', {
        _user_id: user.id
      });

      if (!wsError && wsData) {
        setWorkspaces((wsData as UserWorkspace[]) || []);
      }
    } catch (error) {
      console.error("[useUserWorkspaces] Erro ao buscar workspaces:", error);
    }

    // Buscar convites pendentes
    try {
      const { data: invitesData, error: invitesError } = await supabase.rpc('get_my_pending_invites');

      if (!invitesError && invitesData) {
        setPendingInvites((invitesData as PendingWorkspaceInvite[]) || []);
      }
    } catch (error) {
      console.error("[useUserWorkspaces] Erro ao buscar convites:", error);
    }
  }, [user?.id]);

  // Trocar para outro workspace (atualiza sessionStorage desta aba)
  const switchWorkspace = useCallback(async (workspaceId: string) => {
    if (!user?.id) return { success: false, error: "Usuário não autenticado" };

    setSwitching(true);
    try {
      console.log(`[useUserWorkspaces][${tabId}] Trocando workspace para:`, workspaceId);
      
      // 1. Atualizar sessionStorage desta aba PRIMEIRO
      setTabWorkspaceId(workspaceId);
      
      // 2. Chamar RPC para definir workspace atual (para persistência entre sessões)
      const { error } = await supabase.rpc('set_current_workspace', {
        _workspace_id: workspaceId
      });

      if (error) {
        console.error(`[useUserWorkspaces][${tabId}] Erro ao trocar workspace:`, error);
        return { success: false, error: error.message };
      }

      // 3. Limpar cache do React Query
      queryClient.clear();
      console.log(`[useUserWorkspaces][${tabId}] Cache limpo após troca de workspace`);

      // 4. Atualizar contexto de autenticação (vai ler do sessionStorage)
      await refreshWorkspace();

      // 5. Recarregar lista de workspaces
      await reloadData();

      return { success: true };
    } catch (error: any) {
      console.error(`[useUserWorkspaces][${tabId}] Erro:`, error);
      return { success: false, error: error.message };
    } finally {
      setSwitching(false);
    }
  }, [user?.id, queryClient, refreshWorkspace, reloadData, tabId]);

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
      await reloadData();

      return { success: true, workspaceId: result.workspace_id };
    } catch (error: any) {
      console.error("[useUserWorkspaces] Erro:", error);
      return { success: false, error: error.message };
    } finally {
      setSwitching(false);
    }
  }, [queryClient, refreshWorkspace, reloadData]);

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
      await reloadData();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [reloadData]);

  return {
    workspaces,
    pendingInvites,
    loading,
    switching,
    switchWorkspace,
    acceptInvite,
    declineInvite,
    refresh: reloadData,
    hasMultipleWorkspaces: workspaces.length > 1,
    hasPendingInvites: pendingInvites.length > 0,
  };
}
