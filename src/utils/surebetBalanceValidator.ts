/**
 * SurebetBalanceValidator — Validação de patrimônio considerando sub-entradas.
 */

import { SurebetPerna } from "@/components/projeto-detalhe/SurebetCard";
import { expandLegsWithSubEntries } from "./surebetLiquidationUtils";
import { capitalComprometido } from "./pernaLayHelpers";

export interface BalanceValidationResult {
  valid: boolean;
  errors: Array<{
    bookmakerId: string;
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
 */
export function validateBalanceForOperation(
  legs: SurebetPerna[],
  balances: Record<string, { amount: number; currency: string }>,
  isEditMode: boolean = false,
  originalStakes?: Record<string, number>
): BalanceValidationResult {
  const entries = expandLegsWithSubEntries(legs);
  const errors: BalanceValidationResult['errors'] = [];

  // Agrupar stakes por bookmaker_id
  const requiredByBookmaker: Record<string, { 
    total: number; 
    currency: string; 
    casa: string;
    isSub: boolean 
  }> = {};
  
  entries.forEach(entry => {
    if (!entry.bookmaker_id) return;
    
    if (!requiredByBookmaker[entry.bookmaker_id]) {
      requiredByBookmaker[entry.bookmaker_id] = { 
        total: 0, 
        currency: entry.currency, 
        casa: entry.casa,
        isSub: entry.isSubEntry
      };
    }
    // LAY reserva liability (stake × (odd−1)), não a stake bruta.
    requiredByBookmaker[entry.bookmaker_id].total += capitalComprometido(
      entry.tipo ?? "back",
      entry.stake,
      entry.odd,
    );
  });

  // Validar cada casa
  Object.keys(requiredByBookmaker).forEach(bookmakerId => {
    const req = requiredByBookmaker[bookmakerId];
    const balance = balances[bookmakerId];
    
    if (!balance) return; // Se não tem saldo mapeado, assume-se OK ou ignorado

    // Em modo edição: saldo disponível = saldo atual + stake original dessa entrada (crédito virtual)
    const originalStake = isEditMode ? (originalStakes?.[bookmakerId] ?? 0) : 0;
    const effectiveAvailable = balance.amount + originalStake;
    
    if (req.total > effectiveAvailable) {
      errors.push({
        bookmakerId,
        casa: req.casa,
        currency: req.currency,
        required: req.total,
        available: effectiveAvailable,
        deficit: req.total - effectiveAvailable,
        isSubEntry: req.isSub,
      });
    }
  });

  return { valid: errors.length === 0, errors };
}

