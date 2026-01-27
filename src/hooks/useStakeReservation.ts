/**
 * Hook para gerenciar reservas de saldo em tempo real
 * 
 * SISTEMA DE CONCORRÊNCIA:
 * - Quando operador digita stake, sistema cria/atualiza reserva
 * - Todos os outros formulários recebem via realtime: "saldo reservado por outros"
 * - Ao salvar: reserva vira "committed"
 * - Ao cancelar/fechar: reserva é liberada
 * 
 * Isso elimina race conditions entre operadores simultâneos.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export interface ReservationResult {
  success: boolean;
  reservationId?: string;
  errorCode?: string;
  errorMessage?: string;
  saldoContabil: number;
  saldoReservado: number;
  saldoDisponivel: number;
}

export interface ActiveReservation {
  id: string;
  bookmaker_id: string;
  user_id: string;
  stake: number;
  moeda: string;
  form_type: string;
  expires_at: string;
}

interface UseStakeReservationOptions {
  workspaceId: string;
  formType: 'SIMPLES' | 'MULTIPLA' | 'SUREBET';
  enabled?: boolean;
}

// Gera um ID único para a sessão do formulário
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Hook principal para reserva de saldo
 */
export function useStakeReservation({
  workspaceId,
  formType,
  enabled = true
}: UseStakeReservationOptions) {
  const queryClient = useQueryClient();
  const [reserving, setReserving] = useState(false);
  const [currentReservation, setCurrentReservation] = useState<ReservationResult | null>(null);
  const [activeReservations, setActiveReservations] = useState<Map<string, ActiveReservation[]>>(new Map());
  
  // Sessão única para este formulário
  const sessionIdRef = useRef<string>(generateSessionId());
  const sessionId = sessionIdRef.current;
  
  // Bookmaker atual sendo reservada
  const currentBookmakerIdRef = useRef<string | null>(null);
  
  /**
   * Criar ou atualizar reserva de saldo
   */
  const reserveStake = useCallback(async (
    bookmakerId: string,
    stake: number,
    moeda: string = 'BRL'
  ): Promise<ReservationResult> => {
    if (!enabled || !workspaceId) {
      return {
        success: false,
        errorCode: 'DISABLED',
        errorMessage: 'Sistema de reservas desabilitado',
        saldoContabil: 0,
        saldoReservado: 0,
        saldoDisponivel: 0
      };
    }
    
    setReserving(true);
    currentBookmakerIdRef.current = bookmakerId;
    
    try {
      const { data, error } = await supabase.rpc('upsert_stake_reservation', {
        p_bookmaker_id: bookmakerId,
        p_workspace_id: workspaceId,
        p_stake: stake,
        p_moeda: moeda,
        p_form_session_id: sessionId,
        p_form_type: formType
      });
      
      if (error) {
        console.error('[useStakeReservation] Erro RPC:', error);
        return {
          success: false,
          errorCode: 'RPC_ERROR',
          errorMessage: error.message,
          saldoContabil: 0,
          saldoReservado: 0,
          saldoDisponivel: 0
        };
      }
      
      // A RPC retorna um array, pegar primeiro item
      const result = Array.isArray(data) ? data[0] : data;
      
      const reservationResult: ReservationResult = {
        success: result?.success ?? false,
        reservationId: result?.reservation_id,
        errorCode: result?.error_code,
        errorMessage: result?.error_message,
        saldoContabil: Number(result?.saldo_contabil) || 0,
        saldoReservado: Number(result?.saldo_reservado) || 0,
        saldoDisponivel: Number(result?.saldo_disponivel) || 0
      };
      
      setCurrentReservation(reservationResult);
      
      return reservationResult;
    } catch (err: any) {
      console.error('[useStakeReservation] Exceção:', err);
      return {
        success: false,
        errorCode: 'EXCEPTION',
        errorMessage: err.message,
        saldoContabil: 0,
        saldoReservado: 0,
        saldoDisponivel: 0
      };
    } finally {
      setReserving(false);
    }
  }, [workspaceId, formType, sessionId, enabled]);
  
  /**
   * Commit da reserva (quando aposta é salva)
   */
  const commitReservation = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('commit_stake_reservation', {
        p_form_session_id: sessionId
      });
      
      if (error) {
        console.error('[useStakeReservation] Erro ao commitar:', error);
        return false;
      }
      
      setCurrentReservation(null);
      currentBookmakerIdRef.current = null;
      
      // FINANCIAL_STATE - Reservas afetam saldos em todas as telas
      queryClient.invalidateQueries({ queryKey: ['bookmaker-saldos'] });
      queryClient.invalidateQueries({ queryKey: ['projeto-vinculos'] });
      
      return true;
    } catch (err) {
      console.error('[useStakeReservation] Exceção ao commitar:', err);
      return false;
    }
  }, [sessionId, queryClient]);
  
  /**
   * Cancelar reserva (quando formulário é fechado ou bookmaker muda)
   */
  const cancelReservation = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('cancel_stake_reservation', {
        p_form_session_id: sessionId
      });
      
      if (error) {
        console.error('[useStakeReservation] Erro ao cancelar:', error);
        return false;
      }
      
      setCurrentReservation(null);
      currentBookmakerIdRef.current = null;
      
      return true;
    } catch (err) {
      console.error('[useStakeReservation] Exceção ao cancelar:', err);
      return false;
    }
  }, [sessionId]);
  
  /**
   * Obter saldo disponível para uma bookmaker (com reservas de outros)
   */
  const getSaldoDisponivel = useCallback(async (
    bookmakerId: string
  ): Promise<ReservationResult | null> => {
    try {
      const { data, error } = await supabase.rpc('get_saldo_disponivel_com_reservas', {
        p_bookmaker_id: bookmakerId,
        p_exclude_session_id: sessionId
      });
      
      if (error) {
        console.error('[useStakeReservation] Erro ao obter saldo:', error);
        return null;
      }
      
      const result = Array.isArray(data) ? data[0] : data;
      
      return {
        success: true,
        saldoContabil: Number(result?.saldo_contabil) || 0,
        saldoReservado: Number(result?.saldo_reservado) || 0,
        saldoDisponivel: Number(result?.saldo_disponivel) || 0
      };
    } catch (err) {
      console.error('[useStakeReservation] Exceção ao obter saldo:', err);
      return null;
    }
  }, [sessionId]);
  
  /**
   * Configurar listener realtime para reservas
   */
  useEffect(() => {
    if (!enabled || !workspaceId) return;
    
    const channel = supabase
      .channel(`reservations_${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookmaker_stake_reservations',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          // Ignorar mudanças da nossa própria sessão
          const record = payload.new as any;
          if (record?.form_session_id === sessionId) return;
          
          console.log('[useStakeReservation] Realtime update:', payload.eventType, record);
          
          // FINANCIAL_STATE - Reservas afetam saldos em todas as telas
          queryClient.invalidateQueries({ queryKey: ['bookmaker-saldos'] });
          queryClient.invalidateQueries({ queryKey: ['projeto-vinculos'] });
          
          // Atualizar mapa de reservas ativas
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (record?.status === 'active') {
              setActiveReservations(prev => {
                const newMap = new Map(prev);
                const bookmakerReservations = newMap.get(record.bookmaker_id) || [];
                
                // Remover reserva antiga da mesma sessão
                const filtered = bookmakerReservations.filter(
                  r => r.id !== record.id
                );
                
                // Adicionar nova reserva
                filtered.push({
                  id: record.id,
                  bookmaker_id: record.bookmaker_id,
                  user_id: record.user_id,
                  stake: record.stake,
                  moeda: record.moeda,
                  form_type: record.form_type,
                  expires_at: record.expires_at
                });
                
                newMap.set(record.bookmaker_id, filtered);
                return newMap;
              });
            } else {
              // Reserva não está mais ativa, remover
              setActiveReservations(prev => {
                const newMap = new Map(prev);
                const bookmakerReservations = newMap.get(record.bookmaker_id) || [];
                const filtered = bookmakerReservations.filter(r => r.id !== record.id);
                
                if (filtered.length === 0) {
                  newMap.delete(record.bookmaker_id);
                } else {
                  newMap.set(record.bookmaker_id, filtered);
                }
                
                return newMap;
              });
            }
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, sessionId, enabled, queryClient]);
  
  /**
   * Cancelar reserva ao desmontar o componente
   */
  useEffect(() => {
    return () => {
      // Limpar reserva quando componente desmonta
      if (currentBookmakerIdRef.current) {
        (async () => {
          try {
            await supabase.rpc('cancel_stake_reservation', {
              p_form_session_id: sessionIdRef.current
            });
          } catch (err) {
            console.error('[useStakeReservation] Cleanup error:', err);
          }
        })();
      }
    };
  }, []);
  
  /**
   * Obter total reservado por outros para uma bookmaker
   */
  const getReservedByOthers = useCallback((bookmakerId: string): number => {
    const reservations = activeReservations.get(bookmakerId) || [];
    return reservations.reduce((sum, r) => sum + r.stake, 0);
  }, [activeReservations]);
  
  return {
    // Estado
    reserving,
    sessionId,
    currentReservation,
    activeReservations,
    
    // Ações
    reserveStake,
    commitReservation,
    cancelReservation,
    getSaldoDisponivel,
    getReservedByOthers,
    
    // Helpers
    hasActiveReservation: !!currentReservation?.reservationId,
    currentBookmakerId: currentBookmakerIdRef.current
  };
}

/**
 * Hook simplificado para exibir saldos com reservas
 */
export function useBookmakerSaldoComReservas(
  bookmakerId: string | null,
  workspaceId: string,
  sessionId: string,
  enabled: boolean = true
) {
  const [saldo, setSaldo] = useState<{
    contabil: number;
    reservado: number;
    disponivel: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  
  const fetchSaldo = useCallback(async () => {
    if (!bookmakerId || !enabled) {
      setSaldo(null);
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_saldo_disponivel_com_reservas', {
        p_bookmaker_id: bookmakerId,
        p_exclude_session_id: sessionId
      });
      
      if (error) throw error;
      
      const result = Array.isArray(data) ? data[0] : data;
      
      setSaldo({
        contabil: Number(result?.saldo_contabil) || 0,
        reservado: Number(result?.saldo_reservado) || 0,
        disponivel: Number(result?.saldo_disponivel) || 0
      });
    } catch (err) {
      console.error('[useBookmakerSaldoComReservas] Erro:', err);
      setSaldo(null);
    } finally {
      setLoading(false);
    }
  }, [bookmakerId, sessionId, enabled]);
  
  // Buscar saldo inicial e quando bookmaker mudar
  useEffect(() => {
    fetchSaldo();
  }, [fetchSaldo]);
  
  // Listener realtime
  useEffect(() => {
    if (!bookmakerId || !enabled || !workspaceId) return;
    
    const channel = supabase
      .channel(`saldo_${bookmakerId}_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookmaker_stake_reservations',
          filter: `bookmaker_id=eq.${bookmakerId}`
        },
        (payload) => {
          const record = payload.new as any;
          // Ignorar mudanças da nossa própria sessão
          if (record?.form_session_id === sessionId) return;
          
          // Refetch saldo quando outras sessões mudam reservas
          fetchSaldo();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookmakerId, sessionId, workspaceId, enabled, fetchSaldo]);
  
  return {
    saldo,
    loading,
    refetch: fetchSaldo
  };
}
