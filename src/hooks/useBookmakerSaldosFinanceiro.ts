/**
 * Hook centralizado para saldos de bookmaker em OPERAÇÕES FINANCEIRAS
 * 
 * REGRA DE OURO: Dinheiro pertence a Parceiro + Bookmaker + Moeda, NUNCA a Projeto.
 * 
 * Este hook usa a RPC get_bookmaker_saldos_financeiro que:
 * - Filtra por WORKSPACE (tenant isolation)
 * - NÃO filtra por projeto_id
 * - Retorna TODAS as bookmakers com saldo do workspace
 * 
 * USAR EM:
 * - Saques
 * - Depósitos
 * - Conciliação
 * - Transferências
 * - Qualquer operação que movimenta dinheiro real
 * 
 * NÃO USAR PARA:
 * - Aba Vínculos (contexto de projeto específico)
 * - Formulários de aposta (usam contexto de projeto)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";

export interface BookmakerSaldoFinanceiro {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  parceiro_primeiro_nome: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  moeda: string;
  logo_url: string | null;
  status: string;
  // Saldos brutos
  saldo_real: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_em_aposta: number;
  // Saldos calculados
  saldo_disponivel: number;
  saldo_operavel: number;
  // Estados
  bonus_rollover_started: boolean;
  has_pending_transactions: boolean;
}

interface UseBookmakerSaldosFinanceiroOptions {
  parceiroId?: string | null;
  includeZeroBalance?: boolean;
  enabled?: boolean;
}

const QUERY_KEY = "bookmaker-saldos-financeiro";

/**
 * Hook para operações financeiras - NÃO depende de projeto
 * Retorna TODAS as bookmakers do workspace com saldo
 * 
 * IMPORTANTE: Inclui workspaceId na queryKey para isolamento de tenant
 */
export function useBookmakerSaldosFinanceiro({
  parceiroId = null,
  includeZeroBalance = false,
  enabled = true
}: UseBookmakerSaldosFinanceiroOptions = {}) {
  const { workspaceId } = useWorkspace();
  
  return useQuery({
    // CRÍTICO: Inclui workspaceId para isolamento de tenant
    queryKey: [QUERY_KEY, workspaceId, parceiroId, includeZeroBalance],
    queryFn: async (): Promise<BookmakerSaldoFinanceiro[]> => {
      const { data, error } = await supabase.rpc("get_bookmaker_saldos_financeiro", {
        p_parceiro_id: parceiroId || null,
        p_include_zero_balance: includeZeroBalance
      });

      if (error) {
        console.error("[useBookmakerSaldosFinanceiro] Erro na RPC:", error);
        throw error;
      }

      return (data || [])
        // PROTEÇÃO: Excluir bookmakers bloqueadas (parceiro inativo) ou encerradas
        .filter((row: any) => {
          const status = (row.status || "ativo").toLowerCase();
          return status !== "bloqueada" && status !== "encerrada";
        })
        .map((row: any) => ({
          id: row.id,
          nome: row.nome,
          parceiro_id: row.parceiro_id,
          parceiro_nome: row.parceiro_nome || null,
          parceiro_primeiro_nome: row.parceiro_primeiro_nome || null,
          projeto_id: row.projeto_id || null,
          projeto_nome: row.projeto_nome || null,
          moeda: row.moeda || "BRL",
          logo_url: row.logo_url || null,
          status: row.status || "ativo",
          saldo_real: Number(row.saldo_real) || 0,
          saldo_freebet: Number(row.saldo_freebet) || 0,
          saldo_bonus: Number(row.saldo_bonus) || 0,
          saldo_em_aposta: Number(row.saldo_em_aposta) || 0,
          saldo_disponivel: Number(row.saldo_disponivel) || 0,
          saldo_operavel: Number(row.saldo_operavel) || 0,
          bonus_rollover_started: Boolean(row.bonus_rollover_started),
          has_pending_transactions: Boolean(row.has_pending_transactions)
        }));
    },
    // Só executa se tiver workspace e enabled
    enabled: enabled && !!workspaceId,
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });
}

/**
 * Hook para invalidar cache de saldos financeiros + FINANCIAL_STATE
 */
export function useInvalidateBookmakerSaldosFinanceiro() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    
    // FINANCIAL_STATE - Saldos financeiros afetam todas as telas
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
    queryClient.invalidateQueries({ queryKey: ["projeto-vinculos"] });
    queryClient.invalidateQueries({ queryKey: ["projeto-resultado"] });
    queryClient.invalidateQueries({ queryKey: ["projeto-breakdowns"] });
    queryClient.invalidateQueries({ queryKey: ["parceiro-financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["parceiro-consolidado"] });
    
    console.log("[useInvalidateBookmakerSaldosFinanceiro] Invalidated FINANCIAL_STATE");
  };
}

/**
 * Agrupar bookmakers por parceiro
 */
export function groupByParceiro(
  bookmakers: BookmakerSaldoFinanceiro[]
): Map<string, BookmakerSaldoFinanceiro[]> {
  const map = new Map<string, BookmakerSaldoFinanceiro[]>();
  
  bookmakers.forEach(bk => {
    const key = bk.parceiro_id || "sem-parceiro";
    const list = map.get(key) || [];
    list.push(bk);
    map.set(key, list);
  });
  
  return map;
}

/**
 * Agrupar bookmakers por moeda
 */
export function groupByMoeda(
  bookmakers: BookmakerSaldoFinanceiro[]
): Map<string, BookmakerSaldoFinanceiro[]> {
  const map = new Map<string, BookmakerSaldoFinanceiro[]>();
  
  bookmakers.forEach(bk => {
    const list = map.get(bk.moeda) || [];
    list.push(bk);
    map.set(bk.moeda, list);
  });
  
  return map;
}

/**
 * Calcular totais por moeda
 */
export function calcularTotaisPorMoeda(
  bookmakers: BookmakerSaldoFinanceiro[]
): Map<string, { saldo_operavel: number; saldo_disponivel: number; count: number }> {
  const map = new Map();
  
  bookmakers.forEach(bk => {
    const current = map.get(bk.moeda) || { saldo_operavel: 0, saldo_disponivel: 0, count: 0 };
    map.set(bk.moeda, {
      saldo_operavel: current.saldo_operavel + bk.saldo_operavel,
      saldo_disponivel: current.saldo_disponivel + bk.saldo_disponivel,
      count: current.count + 1
    });
  });
  
  return map;
}

/**
 * Filtrar bookmakers disponíveis para saque (saldo > 0, sem pendências)
 */
export function filterForWithdrawal(
  bookmakers: BookmakerSaldoFinanceiro[]
): BookmakerSaldoFinanceiro[] {
  return bookmakers.filter(bk => 
    bk.saldo_disponivel > 0 && 
    !bk.has_pending_transactions
  );
}

/**
 * Filtrar bookmakers por status (ativo ou limitada)
 */
export function filterByStatus(
  bookmakers: BookmakerSaldoFinanceiro[],
  statuses: string[] = ["ativo", "limitada"]
): BookmakerSaldoFinanceiro[] {
  const normalized = statuses.map(s => s.toLowerCase());
  return bookmakers.filter(bk => 
    normalized.includes((bk.status || "").toLowerCase())
  );
}
