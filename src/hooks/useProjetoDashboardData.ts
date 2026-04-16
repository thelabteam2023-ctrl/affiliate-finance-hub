/**
 * HOOK CENTRALIZADO DE DADOS DO PROJETO
 * 
 * Chama a RPC `get_projeto_dashboard_data` que consolida ~35 queries individuais
 * em uma única chamada ao banco. Retorna os dados brutos para que os consumidores
 * (useProjetoResultado, useKpiBreakdowns, ProjetoDashboardTab) derivem seus resultados.
 * 
 * ARQUITETURA:
 * - 1 RPC = 1 roundtrip ao banco (antes eram ~35 queries)
 * - Cache via React Query com staleTime de 30s
 * - Dados brutos — agregação/conversão de moeda feita pelos consumidores
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from '@/lib/query-cache-config';

// =====================================================
// TIPOS RAW (espelham as linhas retornadas pela RPC)
// =====================================================

export interface RawAposta {
  id: string;
  data_aposta: string;
  lucro_prejuizo: number | null;
  pl_consolidado: number | null;
  lucro_prejuizo_brl_referencia: number | null;
  stake: number | null;
  stake_total: number | null;
  stake_consolidado: number | null;
  moeda_operacao: string | null;
  consolidation_currency: string | null;
  forma_registro: string | null;
  estrategia: string | null;
  resultado: string | null;
  bonus_id: string | null;
  bookmaker_id: string | null;
  valor_brl_referencia: number | null;
  esporte: string | null;
  status: string;
  is_multicurrency?: boolean | null;
}

export interface RawGiro {
  data_registro: string;
  valor_retorno: number | null;
  bookmaker_id: string;
  quantidade_giros: number | null;
  valor_total_giros: number | null;
}

export interface RawCashback {
  data_credito: string;
  valor: number;
  moeda_operacao: string | null;
  valor_brl_referencia: number | null;
}

export interface RawPerda {
  valor: number;
  status: string;
  data_registro: string | null;
  bookmaker_id: string | null;
}

export interface RawOcorrenciaPerda {
  valor_perda: number | null;
  resultado_financeiro: string | null;
  status: string | null;
  created_at: string;
}

export interface RawConciliacao {
  saldo_anterior: number;
  saldo_novo: number;
  diferenca: number | null;
  bookmaker_id: string;
  created_at: string;
}

export interface RawBonus {
  credited_at: string | null;
  bonus_amount: number | null;
  currency: string | null;
  tipo_bonus: string | null;
  bookmaker_id: string | null;
  created_at: string;
  valor_consolidado_snapshot: number | null;
  cotacao_credito_snapshot: number | null;
}

export interface RawBookmaker {
  id: string;
  nome: string;
  moeda: string;
  saldo_atual: number;
  saldo_freebet: number;
  saldo_bonus: number | null;
  saldo_irrecuperavel: number;
  parceiro_id: string | null;
  bookmaker_catalogo_id: string | null;
}

export interface RawDeposito {
  id: string;
  valor: number;
  valor_confirmado: number | null;
  moeda: string;
  destino_bookmaker_id: string | null;
  data_transacao: string;
  tipo_transacao?: string;
  origem_tipo?: string | null;
}

export interface RawSaque {
  id: string;
  valor: number;
  valor_confirmado: number | null;
  moeda: string;
  origem_bookmaker_id: string | null;
  data_transacao: string;
}

export interface RawLedgerExtra {
  id: string;
  data_transacao: string;
  valor: number | null;
  moeda: string | null;
  tipo_transacao: string;
  ajuste_direcao: string | null;
  ajuste_motivo: string | null;
  destino_bookmaker_id: string | null;
  origem_bookmaker_id: string | null;
  auditoria_metadata: any;
  projeto_id_snapshot: string | null;
}

export interface RawAjustePosLimitacao {
  valor: number | null;
  moeda: string | null;
  bookmaker_id: string;
  metadata: any;
  created_at: string;
}

export interface RawApostaPerna {
  aposta_id: string;
  stake: number;
  moeda: string;
  bookmaker_id: string;
  lucro_prejuizo?: number | null;
  resultado?: string | null;
  stake_brl_referencia?: number | null;
}

// =====================================================
// TIPO AGREGADO
// =====================================================

export interface ProjetoDashboardRawData {
  moeda_consolidacao: string;
  cotacao_trabalho: number | null;
  fonte_cotacao: string | null;
  apostas: RawAposta[];
  apostas_pernas: RawApostaPerna[];
  giros_gratis: RawGiro[];
  cashback: RawCashback[];
  perdas: RawPerda[];
  ocorrencias_perdas: RawOcorrenciaPerda[];
  conciliacoes: RawConciliacao[];
  bonus: RawBonus[];
  bookmakers: RawBookmaker[];
  depositos: RawDeposito[];
  saques: RawSaque[];
  ledger_extras: RawLedgerExtra[];
  ajustes_pos_limitacao: RawAjustePosLimitacao[];
}

// =====================================================
// QUERY KEY
// =====================================================

export const PROJETO_DASHBOARD_QUERY_KEY = "projeto-dashboard-data";

export function getProjetoDashboardQueryKey(projetoId: string) {
  return [PROJETO_DASHBOARD_QUERY_KEY, projetoId];
}

// =====================================================
// HOOK
// =====================================================

interface UseProjetoDashboardDataReturn {
  data: ProjetoDashboardRawData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook centralizado que busca TODOS os dados do dashboard do projeto
 * via uma única RPC. Elimina ~35 queries individuais.
 */
export function useProjetoDashboardData(projetoId: string | undefined): UseProjetoDashboardDataReturn {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: getProjetoDashboardQueryKey(projetoId || ''),
    queryFn: async (): Promise<ProjetoDashboardRawData> => {
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('get_projeto_dashboard_data', { p_projeto_id: projetoId });

      if (rpcError) {
        console.error('[useProjetoDashboardData] RPC error:', rpcError);
        throw rpcError;
      }

      const raw = rpcResult as any;

      return {
        moeda_consolidacao: raw.moeda_consolidacao || 'BRL',
        cotacao_trabalho: raw.cotacao_trabalho,
        fonte_cotacao: raw.fonte_cotacao,
        apostas: raw.apostas || [],
        apostas_pernas: raw.apostas_pernas || [],
        giros_gratis: raw.giros_gratis || [],
        cashback: raw.cashback || [],
        perdas: raw.perdas || [],
        ocorrencias_perdas: raw.ocorrencias_perdas || [],
        conciliacoes: raw.conciliacoes || [],
        bonus: raw.bonus || [],
        bookmakers: raw.bookmakers || [],
        depositos: raw.depositos || [],
        saques: raw.saques || [],
        ledger_extras: raw.ledger_extras || [],
        ajustes_pos_limitacao: raw.ajustes_pos_limitacao || [],
      };
    },
    enabled: !!projetoId,
    staleTime: 30_000, // 30s — dados frescos
    gcTime: PERIOD_GC_TIME, // 30min no cache
  });

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    data: data || null,
    isLoading,
    error: error as Error | null,
    refresh,
  };
}

/**
 * Hook para invalidar o cache do dashboard do projeto.
 * Use após mutações que afetam KPIs.
 */
export function useInvalidateProjetoDashboard() {
  const queryClient = useQueryClient();

  return useCallback(
    (projetoId: string) => {
      queryClient.invalidateQueries({
        queryKey: getProjetoDashboardQueryKey(projetoId),
      });
    },
    [queryClient]
  );
}

// =====================================================
// HELPERS para derivar dados dos consumidores
// =====================================================

/** Cria um mapa bookmaker_id → moeda a partir dos bookmakers do RPC */
export function buildBookmakerMoedaMap(bookmakers: RawBookmaker[]): Map<string, string> {
  return new Map(bookmakers.map(b => [b.id, b.moeda || 'BRL']));
}

/** Filtra apostas LIQUIDADAS */
export function filterApostasLiquidadas(apostas: RawAposta[]): RawAposta[] {
  return apostas.filter(a => a.status === 'LIQUIDADA');
}

/** Filtra apostas excluindo bônus e extração */
export function filterApostasOperacionais(apostas: RawAposta[]): RawAposta[] {
  return apostas.filter(a => !a.bonus_id && a.estrategia !== 'EXTRACAO_BONUS');
}
