import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useQueryClient } from "@tanstack/react-query";

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
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  hasPermission: (permissionCode: string) => Promise<boolean>;
  isOwnerOrAdmin: () => boolean;
  isMaster: () => boolean;
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

  const fetchWorkspaceAndRole = useCallback(async (userId: string) => {
    try {
      // Check if user is system owner or blocked, and get public_id
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('is_system_owner, is_blocked, public_id')
        .eq('id', userId)
        .single();
      
      if (!profileError && profileData) {
        setIsSystemOwner(profileData.is_system_owner || false);
        setIsBlocked(profileData.is_blocked || false);
        setPublicId(profileData.public_id || null);
      }

      // Get user's workspace
      const { data: workspaceId, error: workspaceError } = await supabase
        .rpc('get_user_workspace', { _user_id: userId });

      if (workspaceError) {
        console.error("Error fetching workspace:", workspaceError);
        return;
      }

      if (workspaceId) {
        // Fetch workspace details
        const { data: workspaceData, error: wsError } = await supabase
          .from('workspaces')
          .select('id, name, slug, plan')
          .eq('id', workspaceId)
          .single();

        if (!wsError && workspaceData) {
          setWorkspace(workspaceData);
        }

        // Get user's role in this workspace
        const { data: userRole, error: roleError } = await supabase
          .rpc('get_user_role', { _user_id: userId, _workspace_id: workspaceId });

        if (!roleError && userRole) {
          setRole(userRole as AppRole);
        }
      }
    } catch (error) {
      console.error("Error in fetchWorkspaceAndRole:", error);
    }
  }, []);

  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (initialSession?.user) {
          setSession(initialSession);
          setUser(initialSession.user);
          await fetchWorkspaceAndRole(initialSession.user.id);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log("Auth state changed:", event);
        
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Use setTimeout to avoid blocking the auth state change
          setTimeout(() => {
            fetchWorkspaceAndRole(newSession.user.id);
          }, 0);
        } else {
          setWorkspace(null);
          setRole(null);
        }

        if (event === 'SIGNED_OUT') {
          // CRITICAL: Limpar cache ao deslogar
          queryClient.clear();
          console.log('[Auth] SIGNED_OUT event, cleared React Query cache');
          setWorkspace(null);
          setRole(null);
          setIsSystemOwner(false);
          setIsBlocked(false);
          setPublicId(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchWorkspaceAndRole]);

  // Função de login seguro - usa RPC que encerra sessões anteriores atomicamente
  const secureLoginRecord = useCallback(async (userId: string, email: string, userName?: string) => {
    try {
      console.log('[Auth] Recording secure login for user:', userId);
      
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
        console.error('[Auth] secure_login RPC error:', error);
      } else {
        console.log('[Auth] Secure login recorded, session ID:', sessionId);
      }
    } catch (error) {
      console.error('[Auth] Exception in secureLoginRecord:', error);
    }
  }, []);

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
          data: { full_name: fullName },
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
      console.log('[Auth] LOGOUT: Encerrar sessão para user:', userId);
      try {
        // Chamar RPC para encerrar todas as sessões ativas deste usuário
        const { data: closedCount, error } = await supabase.rpc('end_user_session', { p_user_id: userId });
        if (error) {
          console.error('[Auth] LOGOUT FALHOU - RPC error:', error);
          // Mesmo com erro, continuar com logout do Supabase Auth
        } else {
          console.log('[Auth] LOGOUT: Sessões encerradas:', closedCount);
        }
      } catch (error) {
        console.error('[Auth] LOGOUT exception:', error);
        // Mesmo com exceção, continuar com logout
      }
    } else {
      console.log('[Auth] LOGOUT: Sem user_id para encerrar sessão');
    }

    // Limpar cache do React Query
    queryClient.clear();
    console.log('[Auth] Cache React Query limpo');
    
    // Executar logout do Supabase Auth (invalida token)
    await supabase.auth.signOut();
    console.log('[Auth] Deslogado do Supabase Auth');
    
    // Limpar estado local
    setWorkspace(null);
    setRole(null);
    setIsSystemOwner(false);
    setIsBlocked(false);
    setPublicId(null);
  };

  const refreshWorkspace = async () => {
    if (user) {
      await fetchWorkspaceAndRole(user.id);
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

  // DEPRECATED: Master role is obsolete. Use isSystemOwner for global privileges.
  const isMaster = (): boolean => {
    return false;
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
    signIn,
    signUp,
    signOut,
    refreshWorkspace,
    hasPermission,
    isOwnerOrAdmin,
    isMaster,
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
