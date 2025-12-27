import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

// Configurações de timeout (em milissegundos)
const INACTIVITY_TIMEOUT_MS = 40 * 60 * 1000; // 40 minutos
const WARNING_BEFORE_TIMEOUT_MS = 5 * 60 * 1000; // Aviso 5 minutos antes
const ACTIVITY_UPDATE_THROTTLE_MS = 60 * 1000; // Atualizar backend a cada 1 minuto
const CHECK_INTERVAL_MS = 30 * 1000; // Verificar a cada 30 segundos

// Eventos que contam como atividade humana
const ACTIVITY_EVENTS = [
  'click',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
] as const;

interface UseInactivityTimeoutReturn {
  lastActivity: Date | null;
  minutesUntilTimeout: number | null;
  showingWarning: boolean;
  resetActivity: () => void;
}

export function useInactivityTimeout(): UseInactivityTimeoutReturn {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const [minutesUntilTimeout, setMinutesUntilTimeout] = useState<number | null>(null);
  const [showingWarning, setShowingWarning] = useState(false);
  
  const lastBackendUpdateRef = useRef<number>(0);
  const warningShownRef = useRef<boolean>(false);
  const isExpiredRef = useRef<boolean>(false);

  // Função para atualizar atividade no backend (throttled)
  const updateBackendActivity = useCallback(async () => {
    if (!user?.id) return;
    
    const now = Date.now();
    if (now - lastBackendUpdateRef.current < ACTIVITY_UPDATE_THROTTLE_MS) {
      return; // Throttle: não atualizar muito frequentemente
    }
    
    lastBackendUpdateRef.current = now;
    
    try {
      await supabase.rpc('update_user_activity', { p_user_id: user.id });
    } catch (error) {
      console.error('[Inactivity] Erro ao atualizar atividade:', error);
    }
  }, [user?.id]);

  // Função para registrar atividade
  const registerActivity = useCallback(() => {
    if (isExpiredRef.current) return; // Ignorar se já expirou
    
    const now = new Date();
    setLastActivity(now);
    setShowingWarning(false);
    warningShownRef.current = false;
    
    // Atualizar backend (throttled)
    updateBackendActivity();
  }, [updateBackendActivity]);

  // Função para expirar sessão
  const expireSession = useCallback(async () => {
    if (!user?.id || isExpiredRef.current) return;
    
    isExpiredRef.current = true;
    console.log('[Inactivity] Sessão expirada por inatividade');
    
    try {
      // Marcar sessão como expirada no backend
      await supabase.rpc('expire_session_by_inactivity', { p_user_id: user.id });
    } catch (error) {
      console.error('[Inactivity] Erro ao expirar sessão:', error);
    }
    
    // Mostrar mensagem antes do logout
    toast({
      title: "Sessão Expirada",
      description: "Sua sessão expirou por inatividade. Faça login novamente.",
      variant: "destructive",
      duration: 5000,
    });
    
    // Fazer logout e redirecionar
    await signOut();
    navigate('/auth');
  }, [user?.id, signOut, navigate, toast]);

  // Verificar inatividade periodicamente
  useEffect(() => {
    if (!user?.id || !lastActivity) return;
    
    const checkInactivity = () => {
      if (isExpiredRef.current) return;
      
      const now = Date.now();
      const lastActivityTime = lastActivity.getTime();
      const inactiveMs = now - lastActivityTime;
      const remainingMs = INACTIVITY_TIMEOUT_MS - inactiveMs;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      
      setMinutesUntilTimeout(remainingMinutes > 0 ? remainingMinutes : 0);
      
      // Verificar se deve expirar
      if (remainingMs <= 0) {
        expireSession();
        return;
      }
      
      // Verificar se deve mostrar aviso
      if (remainingMs <= WARNING_BEFORE_TIMEOUT_MS && !warningShownRef.current) {
        warningShownRef.current = true;
        setShowingWarning(true);
        
        toast({
          title: "Aviso de Inatividade",
          description: `Sua sessão expirará em ${remainingMinutes} minutos por inatividade. Interaja para continuar.`,
          variant: "default",
          duration: 10000,
        });
      }
    };
    
    // Verificar imediatamente
    checkInactivity();
    
    // Verificar periodicamente
    const intervalId = setInterval(checkInactivity, CHECK_INTERVAL_MS);
    
    return () => clearInterval(intervalId);
  }, [user?.id, lastActivity, expireSession, toast]);

  // Registrar listeners de atividade
  useEffect(() => {
    if (!user?.id) return;
    
    // Inicializar última atividade
    setLastActivity(new Date());
    isExpiredRef.current = false;
    warningShownRef.current = false;
    
    // Adicionar listeners para eventos de atividade
    const handleActivity = () => registerActivity();
    
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });
    
    // Também rastrear visibilidade da página
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Quando volta a ficar visível, verificar se precisa atualizar
        registerActivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id, registerActivity]);

  return {
    lastActivity,
    minutesUntilTimeout,
    showingWarning,
    resetActivity: registerActivity,
  };
}
