import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  workspace: Workspace | null;
  workspaceId: string | null;
  role: AppRole | null;
  loading: boolean;
  initialized: boolean;
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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const fetchWorkspaceAndRole = useCallback(async (userId: string) => {
    try {
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
          .select('id, name, slug')
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
          setWorkspace(null);
          setRole(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchWorkspaceAndRole]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    await supabase.auth.signOut();
    setWorkspace(null);
    setRole(null);
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
    return role === 'owner' || role === 'admin' || role === 'master';
  };

  const isMaster = (): boolean => {
    return role === 'master';
  };

  const value: AuthContextType = {
    user,
    session,
    workspace,
    workspaceId: workspace?.id ?? null,
    role,
    loading,
    initialized,
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
