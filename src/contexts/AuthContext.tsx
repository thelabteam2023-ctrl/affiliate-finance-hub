import { createContext, useContext, useEffect, useReducer, useCallback, ReactNode } from "react";
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

// ── State Machine ──────────────────────────────────────────────
type AuthStatus = 'idle' | 'bootstrapping' | 'ready' | 'signed_out' | 'error';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  workspace: Workspace | null;
  role: AppRole | null;
  isSystemOwner: boolean;
  isBlocked: boolean;
  publicId: string | null;
}

type AuthAction =
  | { type: 'BOOTSTRAP_START' }
  | { type: 'BOOTSTRAP_SUCCESS'; user: User; session: Session; workspace: Workspace | null; role: AppRole | null; isSystemOwner: boolean; isBlocked: boolean; publicId: string | null }
  | { type: 'BOOTSTRAP_EMPTY' }
  | { type: 'BOOTSTRAP_ERROR' }
  | { type: 'SESSION_UPDATE'; user: User; session: Session; workspace: Workspace | null; role: AppRole | null; isSystemOwner: boolean; isBlocked: boolean; publicId: string | null }
  | { type: 'SIGNED_OUT' }
  | { type: 'WORKSPACE_UPDATE'; workspace: Workspace; role: AppRole | null };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'BOOTSTRAP_START':
      if (state.status !== 'idle') return state; // only from idle
      return { ...state, status: 'bootstrapping' };

    case 'BOOTSTRAP_SUCCESS':
      if (state.status !== 'bootstrapping') return state;
      return {
        ...state,
        status: 'ready',
        user: action.user,
        session: action.session,
        workspace: action.workspace,
        role: action.role,
        isSystemOwner: action.isSystemOwner,
        isBlocked: action.isBlocked,
        publicId: action.publicId,
      };

    case 'BOOTSTRAP_EMPTY':
      if (state.status !== 'bootstrapping') return state;
      return { ...state, status: 'signed_out', user: null, session: null, workspace: null, role: null };

    case 'BOOTSTRAP_ERROR':
      if (state.status !== 'bootstrapping') return state;
      return { ...state, status: 'error', user: null, session: null };

    case 'SESSION_UPDATE':
      // Allow session updates when ready (e.g. TOKEN_REFRESHED)
      return {
        ...state,
        status: 'ready',
        user: action.user,
        session: action.session,
        workspace: action.workspace,
        role: action.role,
        isSystemOwner: action.isSystemOwner,
        isBlocked: action.isBlocked,
        publicId: action.publicId,
      };

    case 'SIGNED_OUT':
      return {
        status: 'signed_out',
        user: null,
        session: null,
        workspace: null,
        role: null,
        isSystemOwner: false,
        isBlocked: false,
        publicId: null,
      };

    case 'WORKSPACE_UPDATE':
      return { ...state, workspace: action.workspace, role: action.role };

    default:
      return state;
  }
}

const initialState: AuthState = {
  status: 'idle',
  user: null,
  session: null,
  workspace: null,
  role: null,
  isSystemOwner: false,
  isBlocked: false,
  publicId: null,
};

// ── Context interface (backwards-compatible) ───────────────────
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

// ── Provider ───────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(authReducer, initialState);
  const tabId = getTabId();

  // Derived flags for backwards compatibility
  const loading = state.status === 'idle' || state.status === 'bootstrapping';
  const initialized = state.status !== 'idle';

  // ── Helpers ────────────────────────────────────────────────

  const fetchWorkspaceAndRole = useCallback(async (userId: string, targetWorkspaceId: string): Promise<{ workspace: Workspace | null; role: AppRole | null }> => {
    try {
      const [wsResult, roleResult] = await Promise.all([
        supabase.from('workspaces').select('id, name, slug, plan').eq('id', targetWorkspaceId).single(),
        supabase.rpc('get_user_role', { _user_id: userId, _workspace_id: targetWorkspaceId }),
      ]);

      const workspace = (!wsResult.error && wsResult.data) ? wsResult.data : null;
      const role = (!roleResult.error && roleResult.data) ? roleResult.data as AppRole : null;

      if (workspace) {
        setTabWorkspaceId(workspace.id);
      }

      console.log(`[Auth][${tabId}] Workspace/role fetched:`, targetWorkspaceId, role);
      return { workspace, role };
    } catch (error) {
      console.error(`[Auth][${tabId}] Error fetching workspace details:`, error);
      return { workspace: null, role: null };
    }
  }, [tabId]);

  const resolveWorkspaceId = useCallback(async (userId: string, profileData: { default_workspace_id: string | null }): Promise<string | null> => {
    // Priority 1: this tab's sessionStorage
    const tabWsId = getTabWorkspaceId();
    if (tabWsId && isTabWorkspaceInitialized()) {
      console.log(`[Auth][${tabId}] Using tab workspace:`, tabWsId);
      return tabWsId;
    }

    // Priority 2: profile default
    if (profileData.default_workspace_id) {
      console.log(`[Auth][${tabId}] Using profile default workspace:`, profileData.default_workspace_id);
      setTabWorkspaceId(profileData.default_workspace_id);
      markTabAsInitialized();
      return profileData.default_workspace_id;
    }

    // Priority 3: first membership
    const { data: firstMembership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (firstMembership?.workspace_id) {
      console.log(`[Auth][${tabId}] Using first workspace:`, firstMembership.workspace_id);
      setTabWorkspaceId(firstMembership.workspace_id);
      markTabAsInitialized();
      return firstMembership.workspace_id;
    }

    console.log(`[Auth][${tabId}] User has no workspace`);
    markTabAsInitialized();
    return null;
  }, [tabId]);

  const secureLoginRecord = useCallback(async (userId: string, email: string, userName?: string) => {
    try {
      const { data: workspaceId } = await supabase.rpc('get_user_workspace', { _user_id: userId });
      
      let workspaceName: string | null = null;
      if (workspaceId) {
        const { data: wsData } = await supabase.from('workspaces').select('name').eq('id', workspaceId).single();
        workspaceName = wsData?.name || null;
      }

      const { error } = await supabase.rpc('secure_login', {
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
      }
    } catch (error) {
      console.error(`[Auth][${tabId}] Exception in secureLoginRecord:`, error);
    }
  }, [tabId]);

  const ensureLoginRecorded = useCallback(async (userId: string, email: string, userName?: string) => {
    try {
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

      if (!activeSessions || activeSessions.length === 0) {
        console.log(`[Auth][${tabId}] No active session found, recording auto-login`);
        await secureLoginRecord(userId, email, userName);
      }
    } catch (error) {
      console.error(`[Auth][${tabId}] Exception in ensureLoginRecorded:`, error);
    }
  }, [tabId, secureLoginRecord]);

  // ── Bootstrap + listener ───────────────────────────────────

  useEffect(() => {
    let mounted = true;
    const TIMEOUT_MS = 5000;

    const raceTimeout = <T,>(promise: Promise<T>, fallback: T): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS)),
      ]);

    /**
     * Full bootstrap: fetch session → profile → workspace → role → dispatch
     */
    const bootstrap = async () => {
      if (!mounted) return;
      dispatch({ type: 'BOOTSTRAP_START' });

      try {
        const { data: { session } } = await raceTimeout(
          supabase.auth.getSession(),
          { data: { session: null } } as any
        );

        if (!mounted) return;

        if (!session?.user) {
          dispatch({ type: 'BOOTSTRAP_EMPTY' });
          return;
        }

        const result = await resolveSession(session);
        if (!mounted) return;

        dispatch({ type: 'BOOTSTRAP_SUCCESS', ...result });

        // Non-blocking: ensure login is recorded
        ensureLoginRecorded(session.user.id, session.user.email || '', session.user.user_metadata?.full_name);
      } catch (error) {
        console.error(`[Auth][${tabId}] Bootstrap error:`, error);
        if (mounted) dispatch({ type: 'BOOTSTRAP_ERROR' });
      }
    };

    /**
     * Shared: given a valid session, resolve profile + workspace + role
     */
    const resolveSession = async (session: Session) => {
      const userId = session.user.id;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_system_owner, is_blocked, public_id, default_workspace_id')
        .eq('id', userId)
        .single();

      const wsId = await resolveWorkspaceId(userId, {
        default_workspace_id: profileData?.default_workspace_id ?? null,
      });

      let workspace: Workspace | null = null;
      let role: AppRole | null = null;
      if (wsId) {
        const res = await fetchWorkspaceAndRole(userId, wsId);
        workspace = res.workspace;
        role = res.role;
      }

      return {
        user: session.user,
        session,
        workspace,
        role,
        isSystemOwner: profileData?.is_system_owner || false,
        isBlocked: profileData?.is_blocked || false,
        publicId: profileData?.public_id || null,
      };
    };

    // Start bootstrap
    bootstrap();

    // Listener for subsequent events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Defer to avoid sync Supabase calls inside the callback
      setTimeout(async () => {
        if (!mounted) return;
        console.log(`[Auth][${tabId}] Auth event:`, event);

        if (event === 'SIGNED_OUT') {
          queryClient.clear();
          clearTabWorkspaceId();
          dispatch({ type: 'SIGNED_OUT' });
          return;
        }

        // INITIAL_SESSION is handled by bootstrap — skip it
        if (event === 'INITIAL_SESSION') return;

        if (newSession?.user) {
          try {
            const result = await resolveSession(newSession);
            if (mounted) {
              dispatch({ type: 'SESSION_UPDATE', ...result });
            }
            if (event === 'SIGNED_IN') {
              ensureLoginRecorded(newSession.user.id, newSession.user.email || '', newSession.user.user_metadata?.full_name);
            }
          } catch (error) {
            console.error(`[Auth][${tabId}] Error handling ${event}:`, error);
          }
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [tabId, queryClient, fetchWorkspaceAndRole, resolveWorkspaceId, ensureLoginRecorded]);

  // ── Actions ────────────────────────────────────────────────

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (!error && data.user) {
        secureLoginRecord(data.user.id, data.user.email || email, data.user.user_metadata?.full_name);
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
    const userId = state.user?.id;
    
    if (userId) {
      console.log(`[Auth][${tabId}] LOGOUT: ending session for user:`, userId);
      try {
        const { error } = await supabase.rpc('end_user_session', { p_user_id: userId });
        if (error) console.error(`[Auth][${tabId}] LOGOUT RPC error:`, error);
      } catch (error) {
        console.error(`[Auth][${tabId}] LOGOUT exception:`, error);
      }
    }

    queryClient.clear();
    clearTabWorkspaceId();
    await supabase.auth.signOut();
    dispatch({ type: 'SIGNED_OUT' });
  };

  const setWorkspaceForTab = async (workspaceId: string) => {
    if (!state.user) return;
    
    console.log(`[Auth][${tabId}] Switching tab workspace to:`, workspaceId);
    setTabWorkspaceId(workspaceId);

    try {
      await supabase.auth.refreshSession();
    } catch (error) {
      console.warn(`[Auth][${tabId}] Failed to refresh session after workspace switch:`, error);
    }
    
    const { workspace, role } = await fetchWorkspaceAndRole(state.user.id, workspaceId);
    if (workspace) {
      dispatch({ type: 'WORKSPACE_UPDATE', workspace, role });
    }
    
    await supabase.rpc('set_current_workspace', { _workspace_id: workspaceId });
    queryClient.clear();
  };

  const refreshWorkspace = async () => {
    if (!state.user) return;
    const tabWsId = getTabWorkspaceId();
    if (tabWsId) {
      const { workspace, role } = await fetchWorkspaceAndRole(state.user.id, tabWsId);
      if (workspace) {
        dispatch({ type: 'WORKSPACE_UPDATE', workspace, role });
      }
    }
  };

  const hasPermission = async (permissionCode: string): Promise<boolean> => {
    if (!state.user) return false;
    
    try {
      const { data, error } = await supabase.rpc('has_permission', { 
        _user_id: state.user.id, 
        _permission_code: permissionCode,
        _workspace_id: state.workspace?.id ?? null
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
    return state.role === 'owner' || state.role === 'admin';
  };

  const value: AuthContextType = {
    user: state.user,
    session: state.session,
    workspace: state.workspace,
    workspaceId: state.workspace?.id ?? null,
    role: state.role,
    loading,
    initialized,
    isSystemOwner: state.isSystemOwner,
    isBlocked: state.isBlocked,
    publicId: state.publicId,
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
