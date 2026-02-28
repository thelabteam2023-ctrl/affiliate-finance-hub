import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useQueryClient } from "@tanstack/react-query";
import { 
  getTabWorkspaceId, 
  setTabWorkspaceId, 
  clearTabWorkspaceId, 
  isTabWorkspaceInitialized,
  markTabAsInitialized,
  getTabId
} from "@/lib/tabWorkspace";

type AppRole = Database["public"]["Enums"]["app_role"];

interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  workspace: Workspace | null;
  workspaceId: string | null;
  role: AppRole | null;
  loading: boolean;
  initialized: boolean;
  isSystemOwner: boolean;
  isBlocked: boolean;
  publicId: string | null;
  tabId: string;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  setWorkspaceForTab: (workspaceId: string) => Promise<void>;
  hasPermission: (permissionCode: string) => Promise<boolean>;
  isOwnerOrAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [isSystemOwner, setIsSystemOwner] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [publicId, setPublicId] = useState<string | null>(null);
  
  // Tab ID para identificação única desta aba
  const tabId = getTabId();

  /**
   * Busca workspace e role para um workspace_id específico.
   * IMPORTANTE: Usa o workspace da ABA, não do banco.
   */
  const fetchWorkspaceDetails = useCallback(async (userId: string, targetWorkspaceId: string) => {
    try {
      // Fetch workspace details
      const { data: workspaceData, error: wsError } = await supabase
        .from('workspaces')
        .select('id, name, slug, plan')
        .eq('id', targetWorkspaceId)
        .single();

      if (!wsError && workspaceData) {
        setWorkspace(workspaceData);
        // Garantir que sessionStorage está sincronizado
        setTabWorkspaceId(workspaceData.id);
      }

      // Get user's role in THIS specific workspace
      const { data: userRole, error: roleError } = await supabase
        .rpc('get_user_role', { _user_id: userId, _workspace_id: targetWorkspaceId });

      if (!roleError && userRole) {
        setRole(userRole as AppRole);
        console.log(`[Auth][${tabId}] Role fetched for workspace:`, targetWorkspaceId, '- Role:', userRole);
      }
    } catch (error) {
      console.error(`[Auth][${tabId}] Error fetching workspace details:`, error);
    }
  }, [tabId]);

  /**
   * Inicializa o workspace para esta aba.
   * Prioridade:
   * 1. sessionStorage desta aba (se já inicializada)
   * 2. default_workspace_id do perfil
   * 3. Primeiro workspace do usuário
   */
  const initializeTabWorkspace = useCallback(async (userId: string) => {
    try {
      // Check if user is system owner or blocked, and get public_id
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('is_system_owner, is_blocked, public_id, default_workspace_id')
        .eq('id', userId)
        .single();
      
      if (!profileError && profileData) {
        setIsSystemOwner(profileData.is_system_owner || false);
        setIsBlocked(profileData.is_blocked || false);
        setPublicId(profileData.public_id || null);
      }

      // PRIORIDADE 1: Verificar se esta aba já tem um workspace definido
      const tabWorkspaceId = getTabWorkspaceId();
      if (tabWorkspaceId && isTabWorkspaceInitialized()) {
        console.log(`[Auth][${tabId}] Usando workspace da aba:`, tabWorkspaceId);
        await fetchWorkspaceDetails(userId, tabWorkspaceId);
        return;
      }

      // PRIORIDADE 2: Usar default_workspace_id do perfil
      if (profileData?.default_workspace_id) {
        console.log(`[Auth][${tabId}] Usando default_workspace_id do perfil:`, profileData.default_workspace_id);
        setTabWorkspaceId(profileData.default_workspace_id);
        await fetchWorkspaceDetails(userId, profileData.default_workspace_id);
        markTabAsInitialized();
        return;
      }

      // PRIORIDADE 3: Buscar primeiro workspace do usuário
      const { data: firstMembership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (firstMembership?.workspace_id) {
        console.log(`[Auth][${tabId}] Usando primeiro workspace do usuário:`, firstMembership.workspace_id);
        setTabWorkspaceId(firstMembership.workspace_id);
        await fetchWorkspaceDetails(userId, firstMembership.workspace_id);
        markTabAsInitialized();
        return;
      }

      // Usuário sem workspace
      console.log(`[Auth][${tabId}] Usuário sem workspace`);
      markTabAsInitialized();
    } catch (error) {
      console.error(`[Auth][${tabId}] Error initializing tab workspace:`, error);
    }
  }, [tabId, fetchWorkspaceDetails]);

  // Função de login seguro - usa RPC que encerra sessões anteriores atomicamente
  const secureLoginRecord = useCallback(async (userId: string, email: string, userName?: string, forceRecord: boolean = false) => {
    try {
      console.log(`[Auth][${tabId}] Recording secure login for user:`, userId, forceRecord ? '(forced)' : '');
      
      // Get workspace info for this user
      const { data: workspaceId } = await supabase.rpc('get_user_workspace', { _user_id: userId });
      
      let workspaceName: string | null = null;
      if (workspaceId) {
        const { data: wsData } = await supabase
          .from('workspaces')
          .select('name')
          .eq('id', workspaceId)
          .single();
        workspaceName = wsData?.name || null;
      }

      // Usar secure_login que encerra sessões anteriores automaticamente
      const { data: sessionId, error } = await supabase.rpc('secure_login', {
        p_user_id: userId,
        p_user_email: email,
        p_user_name: userName || null,
        p_workspace_id: workspaceId || null,
        p_workspace_name: workspaceName,
        p_ip_address: null,
        p_user_agent: navigator.userAgent || null
      });
      
      if (error) {
        console.error(`[Auth][${tabId}] secure_login RPC error:`, error);
      } else {
        console.log(`[Auth][${tabId}] Secure login recorded, session ID:`, sessionId);
      }
    } catch (error) {
      console.error(`[Auth][${tabId}] Exception in secureLoginRecord:`, error);
    }
  }, [tabId]);

  /**
   * Verifica se o usuário tem sessão ativa registrada.
   * Se não tiver, registra automaticamente.
   * Isso garante que usuários com sessão persistida também tenham login registrado.
   */
  const ensureLoginRecorded = useCallback(async (userId: string, email: string, userName?: string) => {
    try {
      // Verificar se existe sessão ativa para este usuário
      const { data: activeSessions, error } = await supabase
        .from('login_history')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1);

      if (error) {
        console.error(`[Auth][${tabId}] Error checking active sessions:`, error);
        return;
      }

      // Se não há sessão ativa, registrar login
      if (!activeSessions || activeSessions.length === 0) {
        console.log(`[Auth][${tabId}] Nenhuma sessão ativa encontrada, registrando login automático`);
        await secureLoginRecord(userId, email, userName, true);
      } else {
        console.log(`[Auth][${tabId}] Sessão ativa já existe, não precisa registrar`);
      }
    } catch (error) {
      console.error(`[Auth][${tabId}] Exception in ensureLoginRecorded:`, error);
    }
  }, [tabId, secureLoginRecord]);

  useEffect(() => {
    let mounted = true;
    let lastHandledAccessToken: string | null = null;

    const applySessionState = async (event: string, newSession: Session | null) => {
      if (!mounted) return;

      try {
        console.log(`[Auth][${tabId}] Auth state changed:`, event);

        const accessToken = newSession?.access_token ?? null;

        // Evita processamento duplicado do INITIAL_SESSION para a mesma sessão
        if (event === "INITIAL_SESSION" && accessToken && accessToken === lastHandledAccessToken) {
          console.log(`[Auth][${tabId}] INITIAL_SESSION duplicado ignorado`);
          return;
        }

        if (accessToken) {
          lastHandledAccessToken = accessToken;
        }

        if (newSession?.user) {
          setLoading(true);
          setSession(newSession);
          setUser(newSession.user);

          await initializeTabWorkspace(newSession.user.id);

          if (
            event === "SIGNED_IN" ||
            event === "TOKEN_REFRESHED" ||
            event === "INITIAL_SESSION" ||
            event === "BOOTSTRAP"
          ) {
            await ensureLoginRecorded(
              newSession.user.id,
              newSession.user.email || "",
              newSession.user.user_metadata?.full_name
            );
          }
        } else {
          setSession(null);
          setUser(null);
          setWorkspace(null);
          setRole(null);
        }

        if (event === "SIGNED_OUT") {
          queryClient.clear();
          clearTabWorkspaceId();
          console.log(`[Auth][${tabId}] SIGNED_OUT event, cleared cache and tab workspace`);
          setWorkspace(null);
          setRole(null);
          setIsSystemOwner(false);
          setIsBlocked(false);
          setPublicId(null);
        }
      } catch (error) {
        console.error(`[Auth][${tabId}] Error applying session state:`, error);
      } finally {
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    // Bootstrap explícito para garantir inicialização mesmo se INITIAL_SESSION falhar
    void (async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        await applySessionState("BOOTSTRAP", initialSession);
      } catch (error) {
        console.error(`[Auth][${tabId}] Bootstrap auth error:`, error);
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      void applySessionState(event, newSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initializeTabWorkspace, tabId, queryClient, ensureLoginRecorded]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (!error && data.user) {
        // Usar secure_login que encerra sessões anteriores automaticamente
        secureLoginRecord(
          data.user.id, 
          data.user.email || email, 
          data.user.user_metadata?.full_name
        );
      }
      
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.toUpperCase() },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    const userId = user?.id;
    
    // CRÍTICO: Encerrar sessão na base ANTES de limpar estado local
    if (userId) {
      console.log(`[Auth][${tabId}] LOGOUT: Encerrar sessão para user:`, userId);
      try {
        // Chamar RPC para encerrar todas as sessões ativas deste usuário
        const { data: closedCount, error } = await supabase.rpc('end_user_session', { p_user_id: userId });
        if (error) {
          console.error(`[Auth][${tabId}] LOGOUT FALHOU - RPC error:`, error);
        } else {
          console.log(`[Auth][${tabId}] LOGOUT: Sessões encerradas:`, closedCount);
        }
      } catch (error) {
        console.error(`[Auth][${tabId}] LOGOUT exception:`, error);
      }
    } else {
      console.log(`[Auth][${tabId}] LOGOUT: Sem user_id para encerrar sessão`);
    }

    // Limpar cache do React Query
    queryClient.clear();
    // Limpar workspace da aba
    clearTabWorkspaceId();
    console.log(`[Auth][${tabId}] Cache React Query e workspace da aba limpos`);
    
    // Executar logout do Supabase Auth (invalida token)
    await supabase.auth.signOut();
    console.log(`[Auth][${tabId}] Deslogado do Supabase Auth`);
    
    // Limpar estado local
    setWorkspace(null);
    setRole(null);
    setIsSystemOwner(false);
    setIsBlocked(false);
    setPublicId(null);
  };

  /**
   * Atualiza o workspace para esta aba específica.
   * Também atualiza o default_workspace_id no perfil para persistência.
   */
  const setWorkspaceForTab = async (workspaceId: string) => {
    if (!user) return;
    
    console.log(`[Auth][${tabId}] Alterando workspace da aba para:`, workspaceId);
    
    // Atualizar sessionStorage desta aba
    setTabWorkspaceId(workspaceId);

    // Revalidar sessão para garantir que o backend reconheça o novo contexto.
    // (o request-scoped workspace é enviado via header, mas refresh evita estados limítrofes)
    try {
      await supabase.auth.refreshSession();
    } catch (error) {
      console.warn(`[Auth][${tabId}] Falha ao refreshSession após trocar workspace:`, error);
    }
    
    // Carregar detalhes do novo workspace
    await fetchWorkspaceDetails(user.id, workspaceId);
    
    // Atualizar default_workspace_id no banco para persistência
    await supabase.rpc('set_current_workspace', { _workspace_id: workspaceId });
    
    // Limpar cache do React Query para forçar reload com novo workspace
    queryClient.clear();
  };

  const refreshWorkspace = async () => {
    if (user) {
      const tabWorkspaceId = getTabWorkspaceId();
      if (tabWorkspaceId) {
        await fetchWorkspaceDetails(user.id, tabWorkspaceId);
      } else {
        await initializeTabWorkspace(user.id);
      }
    }
  };

  const hasPermission = async (permissionCode: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const { data, error } = await supabase
        .rpc('has_permission', { 
          _user_id: user.id, 
          _permission_code: permissionCode,
          _workspace_id: workspace?.id ?? null
        });

      if (error) {
        console.error("Error checking permission:", error);
        return false;
      }

      return data ?? false;
    } catch (error) {
      console.error("Error in hasPermission:", error);
      return false;
    }
  };

  const isOwnerOrAdmin = (): boolean => {
    return role === 'owner' || role === 'admin';
  };

  const value: AuthContextType = {
    user,
    session,
    workspace,
    workspaceId: workspace?.id ?? null,
    role,
    loading,
    initialized,
    isSystemOwner,
    isBlocked,
    publicId,
    tabId,
    signIn,
    signUp,
    signOut,
    refreshWorkspace,
    setWorkspaceForTab,
    hasPermission,
    isOwnerOrAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
