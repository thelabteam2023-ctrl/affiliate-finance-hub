/**
 * BonusImpactAlert - DEPRECATED / REMOVIDO
 * 
 * O card informativo de bônus foi removido conforme solicitação.
 * O ícone de presente no SaldoWaterfallPreview já indica presença de bônus.
 * Este componente agora retorna null para manter compatibilidade com imports existentes.
 */

interface BonusImpactAlertProps {
  bookmakerId: string | null;
  bookmakerNome: string;
  estrategia: string;
  hasActiveBonus: boolean;
  rolloverProgress?: number;
  rolloverTarget?: number;
  minOdds?: number;
  currentOdd?: number;
}

export function BonusImpactAlert(_props: BonusImpactAlertProps) {
  // Componente desativado - o Gift icon no SaldoWaterfallPreview indica bônus ativo
  return null;
}
