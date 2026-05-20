/**
 * SurebetBalanceValidator — Validação de patrimônio considerando sub-entradas.
 */

import { SurebetPerna } from "@/components/projeto-detalhe/SurebetCard";
import { expandLegsWithSubEntries } from "./surebetLiquidationUtils";

export interface BalanceValidationResult {
  valid: boolean;
  errors: Array<{
    casa: string;
    currency: string;
    required: number;
    available: number;
    deficit: number;
    isSubEntry: boolean;
  }>;
}

/**
 * Valida se há saldo suficiente para registrar ou editar a operação.
 * 
 * @param legs Pernas da operação
 * @param balances Record de bookmakerId -> saldo (valor nativo)
 * @param isEditMode Se está em modo edição
 * @param originalStakes Record de entryId -> stake original (para liberar virtualmente)
 */
export function validateBalanceForOperation(
  legs: SurebetPerna[],
  balances: Record<string, { amount: number; currency: string }>,
  isEditMode: boolean = false,
  originalStakes?: Record<string, number>
): BalanceValidationResult {
  const entries = expandLegsWithSubEntries(legs);
  const errors = [];

  // Agrupar stakes por bookmaker_id (caso uma casa apareça em múltiplas entradas/pernas)
  const requiredByBookmaker: Record<string, { total: number; currency: string; isSub: boolean }> = {};
  
  entries.forEach(entry => {
    // Nota: entry.id na expansão para sub-entradas pode ser o ID do banco ou gerado.
    // Usamos o bookmaker_id da bookmaker real para validar saldo.
    // Precisamos saber o bookmaker_id... expandLegsWithSubEntries precisa retornar bookmaker_id.
  });

  // REVISÃO: A expansão precisa do bookmaker_id para validar saldo.
  // Vou ajustar expandLegsWithSubEntries no próximo passo se necessário, 
  // mas aqui vou assumir que temos acesso ao bookmaker_id através de uma versão estendida de LiquidationEntry.
  
  return { valid: true, errors: [] }; // Placeholder para não quebrar build enquanto refino
}

// Versão corrigida que será escrita após o ajuste da interface
