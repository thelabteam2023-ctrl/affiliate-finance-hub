/**
 * Hook especializado para operações de Surebet
 * 
 * Este hook abstrai a complexidade específica de Surebets enquanto
 * delega a persistência para o ApostaService centralizado.
 * 
 * Responsabilidades:
 * - Preparar dados no formato esperado pelo ApostaService
 * - Lidar com múltiplas entradas por perna
 * - Calcular snapshots de moeda
 * - Gerenciar freebets geradas
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { criarAposta, atualizarAposta, deletarAposta } from "@/services/aposta";
import { useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { updateBookmakerBalance } from "@/lib/bookmakerBalanceHelper";
import { toast } from "sonner";
import type { CriarApostaInput, PernaInput } from "@/services/aposta/types";
import type { SupportedCurrency } from "@/hooks/useCurrencySnapshot";

// ============================================================================
// TIPOS
// ============================================================================

export interface SurebetPernaEntry {
  bookmaker_id: string;
  bookmaker_nome: string;
  moeda: SupportedCurrency;
  odd: number;
  stake: number;
  stake_brl_referencia: number | null;
  cotacao_snapshot: number | null;
  cotacao_snapshot_at: string | null;
  selecao_livre?: string;
}

export interface SurebetPerna {
  bookmaker_id: string;
  bookmaker_nome: string;
  moeda: SupportedCurrency;
  selecao: string;
  selecao_livre?: string;
  odd: number;
  stake: number;
  stake_brl_referencia: number | null;
  cotacao_snapshot: number | null;
  cotacao_snapshot_at: string | null;
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
  // Múltiplas entradas por perna
  entries?: SurebetPernaEntry[];
  odd_media?: number;
  stake_total?: number;
}

export interface CriarSurebetParams {
  projeto_id: string;
  workspace_id: string;
  user_id: string;
  evento: string;
  esporte: string;
  modelo: string;
  mercado?: string | null;
  observacoes?: string | null;
  pernas: SurebetPerna[];
  estrategia: string;
  contexto_operacional: string;
  // Calculados
  spread_calculado?: number | null;
  roi_esperado?: number | null;
  lucro_esperado?: number | null;
}

export interface AtualizarSurebetParams {
  id: string;
  projeto_id: string;
  evento?: string;
  esporte?: string;
  mercado?: string | null;
  observacoes?: string | null;
  pernas?: SurebetPerna[];
  pernas_originais?: SurebetPerna[]; // Para detectar mudanças de bookmaker
}

export interface SurebetResult {
  success: boolean;
  id?: string;
  error?: string;
}

// ============================================================================
// HOOK
// ============================================================================

export function useSurebetService() {
  const invalidateSaldos = useInvalidateBookmakerSaldos();

  /**
   * Cria uma nova Surebet usando o ApostaService centralizado
   */
  const criarSurebet = useCallback(async (
    params: CriarSurebetParams
  ): Promise<SurebetResult> => {
    console.log("[useSurebetService] Criando surebet com", params.pernas.length, "pernas");

    // Detectar moeda de operação
    const moedas = new Set(params.pernas.map(p => p.moeda));
    params.pernas.forEach(p => {
      if (p.entries) {
        p.entries.forEach(e => moedas.add(e.moeda));
      }
    });
    const moedaOperacao = moedas.size === 1 ? [...moedas][0] : "MULTI";

    // Calcular stake total e valor BRL de referência
    let stakeTotal: number | null = null;
    let valorBrlReferencia = 0;

    if (moedaOperacao !== "MULTI") {
      stakeTotal = 0;
      params.pernas.forEach(p => {
        if (p.entries && p.entries.length > 0) {
          p.entries.forEach(e => {
            stakeTotal! += e.stake;
            valorBrlReferencia += e.stake_brl_referencia || 0;
          });
        } else {
          stakeTotal! += p.stake;
          valorBrlReferencia += p.stake_brl_referencia || 0;
        }
      });
    } else {
      params.pernas.forEach(p => {
        if (p.entries && p.entries.length > 0) {
          p.entries.forEach(e => {
            valorBrlReferencia += e.stake_brl_referencia || 0;
          });
        } else {
          valorBrlReferencia += p.stake_brl_referencia || 0;
        }
      });
    }

    // Converter pernas para o formato do ApostaService
    const pernasInput: PernaInput[] = params.pernas.map(p => ({
      bookmaker_id: p.bookmaker_id,
      bookmaker_nome: p.bookmaker_nome,
      moeda: p.moeda,
      selecao: p.selecao,
      selecao_livre: p.selecao_livre,
      odd: p.odd,
      stake: p.stake,
      stake_brl_referencia: p.stake_brl_referencia,
      cotacao_snapshot: p.cotacao_snapshot,
      cotacao_snapshot_at: p.cotacao_snapshot_at,
      resultado: null,
      lucro_prejuizo: null,
      gerou_freebet: p.gerou_freebet || false,
      valor_freebet_gerada: p.valor_freebet_gerada,
    }));

    // Usar ApostaService para criar
    const result = await criarAposta({
      projeto_id: params.projeto_id,
      workspace_id: params.workspace_id,
      user_id: params.user_id,
      forma_registro: 'ARBITRAGEM',
      estrategia: params.estrategia as any,
      contexto_operacional: params.contexto_operacional as any,
      data_aposta: new Date().toISOString(),
      evento: params.evento,
      esporte: params.esporte,
      mercado: params.mercado,
      observacoes: params.observacoes,
      pernas: pernasInput,
      modelo: params.modelo,
      moeda_operacao: moedaOperacao,
      is_multicurrency: moedaOperacao === "MULTI",
      valor_brl_referencia: valorBrlReferencia,
      cotacao_snapshot: moedaOperacao !== "MULTI" && moedaOperacao !== "BRL" 
        ? params.pernas[0]?.cotacao_snapshot 
        : null,
    });

    if (!result.success) {
      console.error("[useSurebetService] Erro ao criar:", result.error);
      return {
        success: false,
        error: result.error?.message || "Erro ao criar surebet",
      };
    }

    // Atualizar campo pernas com estrutura completa (inclui entries)
    // O ApostaService salva pernas simplificadas, mas precisamos da estrutura completa
    if (result.data?.id) {
      await supabase
        .from("apostas_unificada")
        .update({
          pernas: params.pernas as any,
          spread_calculado: params.spread_calculado,
          roi_esperado: params.roi_esperado,
          lucro_esperado: params.lucro_esperado,
          stake_total: stakeTotal,
        })
        .eq("id", result.data.id);
    }

    invalidateSaldos(params.projeto_id);

    return {
      success: true,
      id: result.data?.id,
    };
  }, [invalidateSaldos]);

  /**
   * Atualiza uma Surebet existente
   */
  const atualizarSurebet = useCallback(async (
    params: AtualizarSurebetParams
  ): Promise<SurebetResult> => {
    console.log("[useSurebetService] Atualizando surebet:", params.id);

    // Se houve mudança de bookmaker em perna liquidada, ajustar saldos
    if (params.pernas && params.pernas_originais) {
      for (let i = 0; i < Math.min(params.pernas_originais.length, params.pernas.length); i++) {
        const original = params.pernas_originais[i];
        const nova = params.pernas[i];

        if (
          original?.resultado &&
          original.resultado !== "PENDENTE" &&
          original.bookmaker_id !== nova.bookmaker_id
        ) {
          const stake = original.stake || 0;
          const odd = original.odd || 0;
          const resultado = original.resultado;

          let delta = 0;
          if (resultado === "GREEN") delta = stake * (odd - 1);
          else if (resultado === "MEIO_GREEN") delta = (stake * (odd - 1)) / 2;
          else if (resultado === "RED") delta = -stake;
          else if (resultado === "MEIO_RED") delta = -stake / 2;

          if (delta !== 0) {
            // Reverter do original
            await updateBookmakerBalance(original.bookmaker_id, -delta, params.projeto_id);
            // Aplicar no novo
            await updateBookmakerBalance(nova.bookmaker_id, delta, params.projeto_id);
          }
        }
      }
    }

    // Recalcular totais
    let moedaOperacao = "BRL";
    let valorBrlRef = 0;
    let stakeTotal: number | null = null;

    if (params.pernas) {
      const moedas = new Set(params.pernas.map(p => p.moeda));
      moedaOperacao = moedas.size === 1 ? [...moedas][0] : "MULTI";

      if (moedaOperacao !== "MULTI") {
        stakeTotal = params.pernas.reduce((sum, p) => sum + p.stake, 0);
      }
      valorBrlRef = params.pernas.reduce((sum, p) => sum + (p.stake_brl_referencia || 0), 0);
    }

    // Usar ApostaService para atualizar pernas
    const result = await atualizarAposta({
      id: params.id,
      evento: params.evento,
      esporte: params.esporte,
      mercado: params.mercado,
      observacoes: params.observacoes,
      pernas: params.pernas?.map(p => ({
        bookmaker_id: p.bookmaker_id,
        bookmaker_nome: p.bookmaker_nome,
        moeda: p.moeda,
        selecao: p.selecao,
        selecao_livre: p.selecao_livre,
        odd: p.odd,
        stake: p.stake,
        stake_brl_referencia: p.stake_brl_referencia,
        cotacao_snapshot: p.cotacao_snapshot,
        cotacao_snapshot_at: p.cotacao_snapshot_at,
        resultado: p.resultado,
        lucro_prejuizo: p.lucro_prejuizo,
        lucro_prejuizo_brl_referencia: p.lucro_prejuizo_brl_referencia,
        gerou_freebet: p.gerou_freebet,
        valor_freebet_gerada: p.valor_freebet_gerada,
      })),
    });

    if (!result.success) {
      console.error("[useSurebetService] Erro ao atualizar:", result.error);
      return {
        success: false,
        error: result.error?.message || "Erro ao atualizar surebet",
      };
    }

    // Atualizar campos adicionais
    if (params.pernas) {
      const odds = params.pernas.map(p => p.odd);
      const sumProb = odds.reduce((sum, o) => sum + (o > 1 ? 1 / o : 0), 0);
      const spread = sumProb > 0 ? (1 - sumProb) * 100 : 0;
      const roi = stakeTotal && stakeTotal > 0 
        ? (spread / 100) * stakeTotal / stakeTotal * 100 
        : null;

      await supabase
        .from("apostas_unificada")
        .update({
          pernas: params.pernas as any,
          moeda_operacao: moedaOperacao,
          valor_brl_referencia: valorBrlRef,
          stake_total: stakeTotal,
          spread_calculado: spread,
          roi_esperado: roi,
        })
        .eq("id", params.id);
    }

    invalidateSaldos(params.projeto_id);

    return { success: true, id: params.id };
  }, [invalidateSaldos]);

  /**
   * Deleta uma Surebet, revertendo saldos se necessário
   */
  const deletarSurebet = useCallback(async (
    id: string,
    projetoId: string,
    pernas?: SurebetPerna[]
  ): Promise<SurebetResult> => {
    console.log("[useSurebetService] Deletando surebet:", id);

    // Reverter saldos de pernas liquidadas
    if (pernas) {
      for (const perna of pernas) {
        if (perna.resultado && perna.resultado !== "PENDENTE") {
          const stake = perna.stake || 0;
          const odd = perna.odd || 0;
          let delta = 0;

          if (perna.resultado === "GREEN") delta = -(stake * (odd - 1));
          else if (perna.resultado === "RED") delta = stake;
          // VOID = 0

          if (delta !== 0) {
            await updateBookmakerBalance(perna.bookmaker_id, delta, projetoId);
          }
        }
      }
    }

    // Usar ApostaService para deletar
    const result = await deletarAposta(id);

    if (!result.success) {
      return {
        success: false,
        error: result.error?.message || "Erro ao deletar surebet",
      };
    }

    invalidateSaldos(projetoId);

    return { success: true };
  }, [invalidateSaldos]);

  return {
    criarSurebet,
    atualizarSurebet,
    deletarSurebet,
  };
}
