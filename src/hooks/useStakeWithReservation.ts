/**
 * Hook para integrar reserva de saldo com campos de stake nos formulários
 * 
 * Este hook gerencia:
 * - Debounce de reservas (evita chamadas excessivas ao digitar)
 * - Atualização em tempo real do saldo disponível
 * - Commit automático ao salvar
 * - Cancelamento ao desmontar ou mudar de bookmaker
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useStakeReservation, useBookmakerSaldoComReservas } from "./useStakeReservation";

interface UseStakeWithReservationOptions {
  workspaceId: string;
  formType: 'SIMPLES' | 'MULTIPLA' | 'SUREBET';
  bookmakerId: string | null;
  moeda?: string;
  enabled?: boolean;
  debounceMs?: number;
}

interface StakeWithReservationResult {
  // Estado do saldo
  saldoContabil: number;
  saldoReservado: number;
  saldoDisponivel: number;
  loading: boolean;
  
  // Validação
  isStakeValid: boolean;
  errorMessage: string | null;
  
  // Ações
  onStakeChange: (value: string) => void;
  onCommit: () => Promise<boolean>;
  onCancel: () => Promise<boolean>;
  
  // Estado interno
  reserving: boolean;
  sessionId: string;
  currentStake: number;
}

export function useStakeWithReservation({
  workspaceId,
  formType,
  bookmakerId,
  moeda = 'BRL',
  enabled = true,
  debounceMs = 500
}: UseStakeWithReservationOptions): StakeWithReservationResult {
  const [currentStake, setCurrentStake] = useState(0);
  const [localLoading, setLocalLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastBookmakerIdRef = useRef<string | null>(null);
  
  // Hook principal de reservas
  const {
    reserving,
    sessionId,
    currentReservation,
    reserveStake,
    commitReservation,
    cancelReservation,
    getSaldoDisponivel
  } = useStakeReservation({
    workspaceId,
    formType,
    enabled: enabled && !!bookmakerId
  });
  
  // Hook de saldo com realtime
  const {
    saldo,
    loading: saldoLoading,
    refetch: refetchSaldo
  } = useBookmakerSaldoComReservas(
    bookmakerId,
    workspaceId,
    sessionId,
    enabled && !!bookmakerId
  );
  
  // Valores de saldo (com fallbacks)
  const saldoContabil = saldo?.contabil ?? 0;
  const saldoReservado = saldo?.reservado ?? 0;
  const saldoDisponivel = saldo?.disponivel ?? 0;
  
  // Cancelar reserva quando bookmaker muda
  useEffect(() => {
    if (lastBookmakerIdRef.current && lastBookmakerIdRef.current !== bookmakerId) {
      cancelReservation();
    }
    lastBookmakerIdRef.current = bookmakerId;
  }, [bookmakerId, cancelReservation]);
  
  // Limpar debounce ao desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);
  
  // Handler para mudança de stake com debounce
  const onStakeChange = useCallback((value: string) => {
    const numValue = parseFloat(value) || 0;
    setCurrentStake(numValue);
    
    // Cancelar debounce anterior
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Se não tem bookmaker ou valor é 0, cancelar reserva
    if (!bookmakerId || numValue <= 0) {
      cancelReservation();
      return;
    }
    
    // Debounce para não sobrecarregar o backend
    setLocalLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        await reserveStake(bookmakerId, numValue, moeda);
        // Refetch saldo após reservar (para pegar reservas de outros)
        refetchSaldo();
      } finally {
        setLocalLoading(false);
      }
    }, debounceMs);
  }, [bookmakerId, moeda, debounceMs, reserveStake, cancelReservation, refetchSaldo]);
  
  // Commit da reserva (chamado ao salvar)
  const onCommit = useCallback(async (): Promise<boolean> => {
    const success = await commitReservation();
    if (success) {
      setCurrentStake(0);
    }
    return success;
  }, [commitReservation]);
  
  // Cancelar reserva (chamado ao fechar/cancelar)
  const onCancel = useCallback(async (): Promise<boolean> => {
    const success = await cancelReservation();
    setCurrentStake(0);
    return success;
  }, [cancelReservation]);
  
  // Validação
  const isStakeValid = currentStake <= saldoDisponivel;
  const errorMessage = useMemo(() => {
    if (currentStake <= 0) return null;
    if (currentStake > saldoDisponivel) {
      return `Stake excede saldo disponível (${saldoDisponivel.toFixed(2)})`;
    }
    return null;
  }, [currentStake, saldoDisponivel]);
  
  return {
    // Estado do saldo
    saldoContabil,
    saldoReservado,
    saldoDisponivel,
    loading: saldoLoading || localLoading,
    
    // Validação
    isStakeValid,
    errorMessage,
    
    // Ações
    onStakeChange,
    onCommit,
    onCancel,
    
    // Estado interno
    reserving,
    sessionId,
    currentStake
  };
}

/**
 * Hook para múltiplas pernas (Surebet/Múltipla)
 * Gerencia reservas independentes para cada perna
 */
interface LegReservation {
  bookmakerId: string;
  stake: number;
  sessionId: string;
}

interface UseMultiLegReservationOptions {
  workspaceId: string;
  formType: 'MULTIPLA' | 'SUREBET';
  enabled?: boolean;
}

export function useMultiLegReservation({
  workspaceId,
  formType,
  enabled = true
}: UseMultiLegReservationOptions) {
  const [legReservations, setLegReservations] = useState<Map<number, LegReservation>>(new Map());
  
  // Criar hook de reserva para cada perna
  const createLegReservation = useCallback((legIndex: number) => {
    return useStakeReservation({
      workspaceId,
      formType,
      enabled
    });
  }, [workspaceId, formType, enabled]);
  
  // Commit de todas as reservas
  const commitAllReservations = useCallback(async (): Promise<boolean> => {
    // Este método seria chamado após o save bem-sucedido
    // Por enquanto, o commit individual acontece no save de cada perna
    return true;
  }, []);
  
  // Cancelar todas as reservas
  const cancelAllReservations = useCallback(async (): Promise<boolean> => {
    // Este método seria chamado ao fechar o formulário
    return true;
  }, []);
  
  return {
    legReservations,
    setLegReservations,
    commitAllReservations,
    cancelAllReservations
  };
}

export default useStakeWithReservation;
