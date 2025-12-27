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
const STORAGE_KEY = 'inactivity_last_activity';
const BROADCAST_CHANNEL_NAME = 'inactivity_sync';

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

interface BroadcastMessage {
  type: 'ACTIVITY_UPDATE' | 'SESSION_EXPIRED' | 'ACTIVITY_PING';
  timestamp: number;
  userId?: string;
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
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Inicializar BroadcastChannel para sincronização multi-aba
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    }
    
    return () => {
      broadcastChannelRef.current?.close();
    };
  }, []);

  // Broadcast activity update para outras abas
  const broadcastActivity = useCallback((timestamp: number) => {
    const message: BroadcastMessage = {
      type: 'ACTIVITY_UPDATE',
      timestamp,
      userId: user?.id,
    };
    
    // Atualizar localStorage para fallback
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ timestamp, userId: user?.id }));
    } catch (e) {
      console.error('[Inactivity] Erro ao salvar no localStorage:', e);
    }
    
    // Broadcast via BroadcastChannel
    broadcastChannelRef.current?.postMessage(message);
  }, [user?.id]);

  // Broadcast expiração para outras abas
  const broadcastExpiration = useCallback(() => {
    const message: BroadcastMessage = {
      type: 'SESSION_EXPIRED',
      timestamp: Date.now(),
      userId: user?.id,
    };
    
    broadcastChannelRef.current?.postMessage(message);
    
    // Limpar localStorage
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('[Inactivity] Erro ao limpar localStorage:', e);
    }
  }, [user?.id]);

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

  // Função para registrar atividade (apenas se aba estiver visível)
  const registerActivity = useCallback(() => {
    if (isExpiredRef.current) return; // Ignorar se já expirou
    
    // IMPORTANTE: Não contar atividade se aba em background
    if (document.visibilityState === 'hidden') {
      return;
    }
    
    const now = new Date();
    const timestamp = now.getTime();
    
    setLastActivity(now);
    setShowingWarning(false);
    warningShownRef.current = false;
    
    // Broadcast para outras abas
    broadcastActivity(timestamp);
    
    // Atualizar backend (throttled)
    updateBackendActivity();
  }, [updateBackendActivity, broadcastActivity]);

  // Função para verificar expiração no BACKEND (autoridade final)
  const checkBackendExpiration = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;
    
    try {
      const { data, error } = await supabase.rpc('check_session_inactivity', {
        p_user_id: user.id,
        p_timeout_minutes: 40
      });
      
      if (error) {
        console.error('[Inactivity] Erro ao verificar backend:', error);
        return false;
      }
      
      // Backend retorna was_expired = true se expirou a sessão
      return data?.[0]?.was_expired === true;
    } catch (error) {
      console.error('[Inactivity] Erro ao verificar backend:', error);
      return false;
    }
  }, [user?.id]);

  // Função para expirar sessão
  const expireSession = useCallback(async () => {
    if (!user?.id || isExpiredRef.current) return;
    
    // REGRA DE OURO: Verificar com backend antes de expirar
    const backendConfirmedExpired = await checkBackendExpiration();
    
    if (!backendConfirmedExpired) {
      // Backend não confirmou expiração, pode ter havido atividade em outra aba
      console.log('[Inactivity] Backend não confirmou expiração, verificando...');
      return;
    }
    
    isExpiredRef.current = true;
    console.log('[Inactivity] Sessão expirada por inatividade (confirmado pelo backend)');
    
    // Broadcast expiração para outras abas
    broadcastExpiration();
    
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
  }, [user?.id, signOut, navigate, toast, checkBackendExpiration, broadcastExpiration]);

  // Handler para mensagens de outras abas
  const handleBroadcastMessage = useCallback((event: MessageEvent<BroadcastMessage>) => {
    const { type, timestamp, userId } = event.data;
    
    // Ignorar mensagens de outros usuários
    if (userId && userId !== user?.id) return;
    
    switch (type) {
      case 'ACTIVITY_UPDATE':
        // Outra aba registrou atividade, atualizar estado local
        if (!isExpiredRef.current) {
          setLastActivity(new Date(timestamp));
          setShowingWarning(false);
          warningShownRef.current = false;
        }
        break;
        
      case 'SESSION_EXPIRED':
        // Outra aba expirou a sessão, expirar aqui também
        if (!isExpiredRef.current) {
          isExpiredRef.current = true;
          toast({
            title: "Sessão Expirada",
            description: "Sua sessão expirou por inatividade. Faça login novamente.",
            variant: "destructive",
            duration: 5000,
          });
          signOut().then(() => navigate('/auth'));
        }
        break;
    }
  }, [user?.id, signOut, navigate, toast]);

  // Handler para mudanças no localStorage (fallback para browsers sem BroadcastChannel)
  const handleStorageChange = useCallback((event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    
    if (event.newValue === null) {
      // Sessão foi expirada em outra aba
      if (!isExpiredRef.current) {
        isExpiredRef.current = true;
        toast({
          title: "Sessão Expirada",
          description: "Sua sessão expirou por inatividade. Faça login novamente.",
          variant: "destructive",
          duration: 5000,
        });
        signOut().then(() => navigate('/auth'));
      }
    } else {
      try {
        const data = JSON.parse(event.newValue);
        if (data.userId === user?.id && !isExpiredRef.current) {
          setLastActivity(new Date(data.timestamp));
          setShowingWarning(false);
          warningShownRef.current = false;
        }
      } catch (e) {
        console.error('[Inactivity] Erro ao parsear localStorage:', e);
      }
    }
  }, [user?.id, signOut, navigate, toast]);

  // Verificar inatividade periodicamente
  useEffect(() => {
    if (!user?.id || !lastActivity) return;
    
    const checkInactivity = async () => {
      if (isExpiredRef.current) return;
      
      const now = Date.now();
      const lastActivityTime = lastActivity.getTime();
      const inactiveMs = now - lastActivityTime;
      const remainingMs = INACTIVITY_TIMEOUT_MS - inactiveMs;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      
      setMinutesUntilTimeout(remainingMinutes > 0 ? remainingMinutes : 0);
      
      // Verificar se deve expirar (solicitar confirmação do backend)
      if (remainingMs <= 0) {
        await expireSession();
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

  // Registrar listeners de atividade e broadcast
  useEffect(() => {
    if (!user?.id) return;
    
    // Tentar recuperar última atividade do localStorage (sync multi-aba)
    let initialActivity = new Date();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.userId === user.id && data.timestamp) {
          initialActivity = new Date(data.timestamp);
        }
      }
    } catch (e) {
      console.error('[Inactivity] Erro ao ler localStorage:', e);
    }
    
    setLastActivity(initialActivity);
    isExpiredRef.current = false;
    warningShownRef.current = false;
    
    // Adicionar listeners para eventos de atividade
    const handleActivity = () => registerActivity();
    
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });
    
    // Listener para BroadcastChannel
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.onmessage = handleBroadcastMessage;
    }
    
    // Listener para localStorage (fallback)
    window.addEventListener('storage', handleStorageChange);
    
    // Listener para visibilidade - NÃO registrar atividade ao voltar, apenas verificar
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Ao voltar, verificar se há atividade mais recente de outras abas
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const data = JSON.parse(stored);
            if (data.userId === user.id && data.timestamp) {
              const storedTime = new Date(data.timestamp);
              if (lastActivity && storedTime > lastActivity) {
                setLastActivity(storedTime);
                setShowingWarning(false);
                warningShownRef.current = false;
              }
            }
          }
        } catch (e) {
          console.error('[Inactivity] Erro ao verificar localStorage:', e);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id, registerActivity, handleBroadcastMessage, handleStorageChange, lastActivity]);

  return {
    lastActivity,
    minutesUntilTimeout,
    showingWarning,
    resetActivity: registerActivity,
  };
}
