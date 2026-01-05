import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const AUTH_VERSION_KEY = 'auth_version';
const WORKSPACE_AUTH_VERSION_KEY = 'workspace_auth_version';

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
   * Força logout do usuário
   */
  const forceLogout = useCallback(async () => {
    console.log('[AuthVersionGuard] Forçando logout por version mismatch');
    
    // Limpar sessionStorage
    sessionStorage.removeItem(AUTH_VERSION_KEY);
    
    // Mostrar toast antes do logout
    toast.error('Sua sessão expirou. Por favor, faça login novamente.', {
      duration: 3000,
    });
    
    // Aguardar um pouco para o toast aparecer
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Fazer logout
    await supabase.auth.signOut();
  }, []);

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
        await forceLogout();
        return;
      }

      const workspaceValid = await checkWorkspaceAuthVersion();
      
      if (!workspaceValid) {
        setIsValid(false);
        await forceLogout();
        return;
      }

      setIsValid(true);
    } finally {
      setIsChecking(false);
    }
  }, [userId, checkUserAuthVersion, checkWorkspaceAuthVersion, forceLogout]);

  // Verificar na montagem e quando userId/workspaceId mudar
  useEffect(() => {
    if (userId) {
      performCheck();
    }
  }, [userId, workspaceId, performCheck]);

  // Verificar periodicamente (a cada 30 segundos)
  useEffect(() => {
    if (!userId) return;

    checkIntervalRef.current = setInterval(() => {
      performCheck();
    }, 30000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [userId, performCheck]);

  // Verificar quando a aba volta a ter foco
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && userId) {
        performCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, performCheck]);

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
    // Limpar todas as workspace versions
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(WORKSPACE_AUTH_VERSION_KEY)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    console.log('[AuthVersionGuard] Cleared all stored auth versions');
  } catch (e) {
    console.warn('[AuthVersionGuard] Error clearing auth versions:', e);
  }
}
