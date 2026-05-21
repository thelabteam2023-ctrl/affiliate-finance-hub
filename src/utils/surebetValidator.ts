import { type SurebetPerna } from "@/components/projeto-detalhe/SurebetCard";

export interface ValidationResult {
  valido: boolean;
  erros: string[];
}

/**
 * Valida a integridade de um card de Surebet/Arbitragem.
 * Verifica se pernas têm odds válidas, stakes positivas e se o campo linha/mercado está preenchido.
 */
export function validateSurebetCard(surebet: any): ValidationResult {
  const erros: string[] = [];
  
  // 1. Validar estrutura básica
  const pernas = surebet.pernas || surebet.pernas_data || [];
  if (!pernas || pernas.length < 2) {
    erros.push('PERNAS_INSUFICIENTES');
  }

  // 2. Validar cada perna
  pernas.forEach((p: any, i: number) => {
    const pernaNum = i + 1;
    
    // Validar Odd
    const odd = parseFloat(String(p.odd || p.odd_media));
    if (isNaN(odd) || odd <= 1) {
      erros.push(`PERNA_${pernaNum}_ODD_INVALIDA: "${p.odd}"`);
    } else if (String(p.odd).endsWith('.')) {
      erros.push(`PERNA_${pernaNum}_ODD_TRUNCADA: "${p.odd}"`);
    }

    // Validar Moeda
    if (!p.moeda) {
      erros.push(`PERNA_${pernaNum}_MOEDA_AUSENTE`);
    }

    // Validar Stake
    const stake = parseFloat(String(p.stake || p.stake_total));
    if (isNaN(stake) || stake <= 0) {
      erros.push(`PERNA_${pernaNum}_STAKE_INVALIDA`);
    }

    // Validar Linha/Mercado (Seleção Livre)
    // O campo selecao_livre é o valor real (ex: "River Plate"), selecao é o label (ex: "Casa")
    const linhaEfetiva = (p.selecao_livre || p.selecaoLivre || p.selecao || '').trim();
    if (!linhaEfetiva || linhaEfetiva === 'Linha' || linhaEfetiva === '') {
      erros.push(`PERNA_${pernaNum}_LINHA_NAO_HIDRATADA`);
    }
  });

  // 3. Validar Stake Total
  const stakeTotal = parseFloat(String(surebet.stake_total || 0));
  if (isNaN(stakeTotal) || stakeTotal <= 0) {
    // Para multi-moeda, verificamos o valor_brl_referencia
    const brlRef = parseFloat(String(surebet.valor_brl_referencia || 0));
    if (isNaN(brlRef) || brlRef <= 0) {
      erros.push('STAKE_TOTAL_BRL_AUSENTE');
    }
  }

  const result = {
    valido: erros.length === 0,
    erros
  };

  if (!result.valido) {
    console.warn(`[SUREBET_HIDRATACAO] Erros encontrados:`, {
      id: surebet.id,
      evento: surebet.evento,
      erros
    });
  }

  return result;
}
