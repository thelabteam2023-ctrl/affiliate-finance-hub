/**
 * Serviço de Reabertura de Apostas (Fase 1: Surebets simples)
 *
 * Permite voltar uma surebet liquidada para PENDENTE, revertendo
 * os PAYOUTs no ledger atomicamente. A aposta volta a ser editável
 * pelos fluxos existentes (editar_perna_surebet_atomica, etc.).
 *
 * Bloqueios automáticos:
 * - Saque posterior à liquidação no bookmaker
 * - Saldo atual insuficiente para reverter o payout
 * - Bookmaker em estado crítico (ENCERRADA/BLOQUEADA/AGUARDANDO_SAQUE)
 * - Aposta com freebet/bônus (Fase 3)
 */

import { supabase } from "@/integrations/supabase/client";

export interface ReaberturaBlocker {
  code:
    | "NOT_FOUND"
    | "OUT_OF_SCOPE"
    | "NOT_LIQUIDATED"
    | "FREEBET_NOT_SUPPORTED"
    | "BONUS_NOT_SUPPORTED"
    | "FREEBET_LEG_NOT_SUPPORTED"
    | "FREEBET_CONSUMED"
    | "INSUFFICIENT_BALANCE"
    | "WITHDRAWAL_AFTER_LIQUIDATION"
    | "BOOKMAKER_CRITICAL_STATE"
    | string;
  message: string;
  bookmaker_id?: string;
  saldo_atual?: number;
  valor_a_estornar?: number;
  saque_posterior?: number;
}

export interface ReaberturaPernaPreview {
  perna_id: string;
  ordem: number;
  bookmaker_id: string;
  bookmaker_nome: string;
  resultado_atual: string | null;
  stake: number;
  moeda: string;
  payout_a_reverter: number;
  saldo_atual: number;
  saldo_apos_reversao: number;
}

export interface ValidacaoReaberturaResult {
  elegible: boolean;
  aposta_id: string;
  status_atual: string;
  novo_status: "PENDENTE";
  blockers: ReaberturaBlocker[];
  preview: {
    pernas: ReaberturaPernaPreview[];
    total_a_reverter: number;
  };
}

export interface ReaberturaResult {
  success: boolean;
  aposta_id?: string;
  novo_status?: "PENDENTE";
  reversoes_aplicadas?: number;
  total_revertido?: number;
  message?: string;
  error?: string;
  blockers?: ReaberturaBlocker[];
  sqlstate?: string;
}

/**
 * Validação read-only: retorna preview do impacto financeiro
 * sem executar nenhuma alteração.
 */
export async function validarReaberturaSurebet(
  apostaId: string
): Promise<ValidacaoReaberturaResult> {
  const { data, error } = await supabase.rpc("validar_reabertura_surebet", {
    p_aposta_id: apostaId,
  });

  if (error) {
    return {
      elegible: false,
      aposta_id: apostaId,
      status_atual: "UNKNOWN",
      novo_status: "PENDENTE",
      blockers: [
        {
          code: "RPC_ERROR",
          message: error.message,
        },
      ],
      preview: { pernas: [], total_a_reverter: 0 },
    };
  }

  return data as unknown as ValidacaoReaberturaResult;
}

/**
 * Executa a reabertura atomicamente.
 * - Valida internamente (re-chama validar)
 * - Faz REVERSAL dos PAYOUTs
 * - Limpa resultados das pernas
 * - Marca aposta como PENDENTE
 * - Grava audit_log com snapshot before/after
 */
export async function reabrirSurebet(
  apostaId: string
): Promise<ReaberturaResult> {
  const { data, error } = await supabase.rpc("reabrir_surebet_atomica", {
    p_aposta_id: apostaId,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return data as unknown as ReaberturaResult;
}
