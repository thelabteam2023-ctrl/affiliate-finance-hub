import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const AUTH_VERSION_KEY = 'auth_version';
const WORKSPACE_AUTH_VERSION_KEY = 'workspace_auth_version';
const LOGOUT_TRIGGERED_KEY_PREFIX = 'auth_version_logout_triggered';

interface AuthVersionGuardState {
  isValid: boolean;
  isChecking: boolean;
  forceLogout: () => Promise<void>;
}

/**
 * Hook para verificar auth_version e forçar logout quando necessário.
 * Implementa o padrão enterprise de session versioning.
 */
export function useAuthVersionGuard(
  userId: string | null,
  workspaceId: string | null
): AuthVersionGuardState {
  const [isValid, setIsValid] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const lastCheckRef = useRef<number>(0);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logoutTriggeredRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Se o userId mudar (novo login), liberar o lock desta instância do hook
  useEffect(() => {
    if (userId && userId !== lastUserIdRef.current) {
      logoutTriggeredRef.current = false;
      lastUserIdRef.current = userId;
    }

    if (!userId) {
      lastUserIdRef.current = null;
    }
  }, [userId]);

  /**
   * Armazena auth_version no sessionStorage (isolado por aba)
   */
  const storeAuthVersion = useCallback((version: number) => {
    try {
      sessionStorage.setItem(AUTH_VERSION_KEY, version.toString());
    } catch (e) {
      console.warn('[AuthVersionGuard] Failed to store auth_version:', e);
    }
  }, []);

  /**
   * Recupera auth_version do sessionStorage
   */
  const getStoredAuthVersion = useCallback((): number | null => {
    try {
      const stored = sessionStorage.getItem(AUTH_VERSION_KEY);
      return stored ? parseInt(stored, 10) : null;
    } catch (e) {
      return null;
    }
  }, []);

  /**
   * Armazena workspace auth_version
   */
  const storeWorkspaceAuthVersion = useCallback((wsId: string, version: number) => {
    try {
      sessionStorage.setItem(`${WORKSPACE_AUTH_VERSION_KEY}_${wsId}`, version.toString());
    } catch (e) {
      console.warn('[AuthVersionGuard] Failed to store workspace auth_version:', e);
    }
  }, []);

  /**
   * Recupera workspace auth_version
   */
  const getStoredWorkspaceAuthVersion = useCallback((wsId: string): number | null => {
    try {
      const stored = sessionStorage.getItem(`${WORKSPACE_AUTH_VERSION_KEY}_${wsId}`);
      return stored ? parseInt(stored, 10) : null;
    } catch (e) {
      return null;
    }
  }, []);

  /**
   * Marca que o logout já foi disparado (edge-triggered)
   */
  const markLogoutTriggered = useCallback((uid: string | null) => {
    if (!uid) {
      logoutTriggeredRef.current = true;
      return;
    }

    logoutTriggeredRef.current = true;

    // Parar checagens periódicas imediatamente
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }

    try {
      sessionStorage.setItem(`${LOGOUT_TRIGGERED_KEY_PREFIX}_${uid}`, '1');
    } catch (e) {
      // ignore
    }
  }, []);

  /**
   * Verifica se já disparamos logout nesta aba (evita loop render → guard → logout)
   */
  const hasLogoutTriggered = useCallback((uid: string | null) => {
    if (logoutTriggeredRef.current) return true;
    if (!uid) return false;

    try {
      return sessionStorage.getItem(`${LOGOUT_TRIGGERED_KEY_PREFIX}_${uid}`) === '1';
    } catch (e) {
      return false;
    }
  }, []);

  /**
   * Força logout do usuário (uma única vez)
   */
  const forceLogout = useCallback(async () => {
    if (hasLogoutTriggered(userId)) return;

    console.warn('[AuthVersionGuard] Forçando logout por version mismatch');
    markLogoutTriggered(userId);

    // Toast 1x (não precisa esperar)
    toast.error('Sua sessão expirou. Por favor, faça login novamente.', {
      duration: 3000,
    });

    // Fazer logout (propaga para outras abas via Auth)
    await supabase.auth.signOut();
  }, [userId, hasLogoutTriggered, markLogoutTriggered]);

  /**
   * Verifica auth_version do usuário no banco
   */
  const checkUserAuthVersion = useCallback(async (): Promise<boolean> => {
    if (!userId) return true;

    try {
      const { data: dbVersion, error } = await supabase.rpc('get_user_auth_version', {
        p_user_id: userId
      });

      if (error) {
        console.error('[AuthVersionGuard] Error fetching user auth_version:', error);
        return true; // Em caso de erro, não forçar logout
      }

      const storedVersion = getStoredAuthVersion();
      
      // Primeiro acesso: armazenar versão atual
      if (storedVersion === null) {
        console.log('[AuthVersionGuard] Primeiro acesso, armazenando auth_version:', dbVersion);
        storeAuthVersion(dbVersion);
        return true;
      }

      // Comparar versões
      if (dbVersion > storedVersion) {
        console.warn('[AuthVersionGuard] Version mismatch! DB:', dbVersion, 'Stored:', storedVersion);
        return false;
      }

      return true;
    } catch (e) {
      console.error('[AuthVersionGuard] Exception checking auth_version:', e);
      return true;
    }
  }, [userId, getStoredAuthVersion, storeAuthVersion]);

  /**
   * Verifica auth_version do workspace no banco
   */
  const checkWorkspaceAuthVersion = useCallback(async (): Promise<boolean> => {
    if (!userId || !workspaceId) return true;

    try {
      const { data: dbVersion, error } = await supabase.rpc('get_workspace_auth_version', {
        p_user_id: userId,
        p_workspace_id: workspaceId
      });

      if (error) {
        console.error('[AuthVersionGuard] Error fetching workspace auth_version:', error);
        return true;
      }

      const storedVersion = getStoredWorkspaceAuthVersion(workspaceId);
      
      // Primeiro acesso ao workspace: armazenar versão
      if (storedVersion === null) {
        console.log('[AuthVersionGuard] Primeiro acesso ao workspace, armazenando auth_version:', dbVersion);
        storeWorkspaceAuthVersion(workspaceId, dbVersion);
        return true;
      }

      // Comparar versões
      if (dbVersion > storedVersion) {
        console.warn('[AuthVersionGuard] Workspace version mismatch! DB:', dbVersion, 'Stored:', storedVersion);
        return false;
      }

      return true;
    } catch (e) {
      console.error('[AuthVersionGuard] Exception checking workspace auth_version:', e);
      return true;
    }
  }, [userId, workspaceId, getStoredWorkspaceAuthVersion, storeWorkspaceAuthVersion]);

  /**
   * Executa verificação completa
   */
  const performCheck = useCallback(async () => {
    // Se já disparou logout, não checar mais (evita loop)
    if (hasLogoutTriggered(userId)) return;

    // Throttle: não verificar mais de uma vez a cada 5 segundos
    const now = Date.now();
    if (now - lastCheckRef.current < 5000) {
      return;
    }
    lastCheckRef.current = now;

    if (!userId) {
      setIsValid(true);
      return;
    }

    setIsChecking(true);

    try {
      const userValid = await checkUserAuthVersion();

      if (!userValid) {
        setIsValid(false);
        void forceLogout();
        return;
      }

      const workspaceValid = await checkWorkspaceAuthVersion();

      if (!workspaceValid) {
        setIsValid(false);
        void forceLogout();
        return;
      }

      setIsValid(true);
    } finally {
      setIsChecking(false);
    }
  }, [userId, checkUserAuthVersion, checkWorkspaceAuthVersion, forceLogout, hasLogoutTriggered]);

  // Verificar na montagem e quando userId/workspaceId mudar
  useEffect(() => {
    if (userId) {
      performCheck();
    }
  }, [userId, workspaceId, performCheck]);

  // Verificar periodicamente (a cada 30 segundos)
  useEffect(() => {
    if (!userId) return;
    if (hasLogoutTriggered(userId)) return;

    checkIntervalRef.current = setInterval(() => {
      performCheck();
    }, 30000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [userId, performCheck, hasLogoutTriggered]);

  // Verificar quando a aba volta a ter foco
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!userId) return;
      if (hasLogoutTriggered(userId)) return;
      performCheck();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, performCheck, hasLogoutTriggered]);

  return {
    isValid,
    isChecking,
    forceLogout
  };
}

/**
 * Atualiza a versão armazenada após login bem-sucedido.
 * Deve ser chamado apenas em logins reais, não em refreshes.
 */
export async function storeInitialAuthVersion(userId: string, workspaceId?: string) {
  try {
    // Novo login real: liberar lock de logout desta aba
    try {
      sessionStorage.removeItem(`${LOGOUT_TRIGGERED_KEY_PREFIX}_${userId}`);
    } catch (e) {
      // ignore
    }

    // Buscar e armazenar user auth_version
    const { data: userVersion } = await supabase.rpc('get_user_auth_version', {
      p_user_id: userId
    });

    if (userVersion !== null) {
      sessionStorage.setItem(AUTH_VERSION_KEY, userVersion.toString());
      console.log('[AuthVersionGuard] Stored initial user auth_version:', userVersion);
    }

    // Buscar e armazenar workspace auth_version se aplicável
    if (workspaceId) {
      const { data: wsVersion } = await supabase.rpc('get_workspace_auth_version', {
        p_user_id: userId,
        p_workspace_id: workspaceId
      });

      if (wsVersion !== null) {
        sessionStorage.setItem(`${WORKSPACE_AUTH_VERSION_KEY}_${workspaceId}`, wsVersion.toString());
        console.log('[AuthVersionGuard] Stored initial workspace auth_version:', wsVersion);
      }
    }
  } catch (e) {
    console.error('[AuthVersionGuard] Error storing initial auth versions:', e);
  }
}

/**
 * Limpa as versões armazenadas (chamar no logout)
 */
export function clearStoredAuthVersions() {
  try {
    sessionStorage.removeItem(AUTH_VERSION_KEY);

    // Limpar todas as workspace versions + locks de logout
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;

      if (key.startsWith(WORKSPACE_AUTH_VERSION_KEY) || key.startsWith(LOGOUT_TRIGGERED_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));

    console.log('[AuthVersionGuard] Cleared all stored auth versions');
  } catch (e) {
    console.warn('[AuthVersionGuard] Error clearing auth versions:', e);
  }
}
