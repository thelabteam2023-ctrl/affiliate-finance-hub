/**
 * Classificação de Tipos de Transação para o Sistema Financeiro
 * 
 * ARQUITETURA DE 2 CAMADAS:
 * 
 * 1. CASH_REAL_TYPES - Movimentam dinheiro real (entram/saem do sistema)
 *    → Aparecem no Caixa Operacional
 *    → Impactam KPIs financeiros
 *    → Afetam fluxo de caixa real
 * 
 * 2. OPERATIONAL_MONEY_TYPES - Dinheiro operacional (dentro de bookmakers)
 *    → NÃO aparecem no Caixa Operacional
 *    → Aparecem apenas em Projetos/Bônus
 *    → São eventos contábeis internos
 * 
 * REGRA DE OURO:
 * "O Caixa Operacional só mostra dinheiro que entra ou sai do sistema real."
 * "Eventos promocionais são movimentos internos de bookmakers."
 */

/**
 * Tipos de transação que movimentam CASH REAL
 * (Dinheiro que entra ou sai do sistema financeiro)
 */
export const CASH_REAL_TYPES = [
  // Aportes e Liquidações (Investidores)
  'APORTE',
  'LIQUIDACAO',
  'APORTE_FINANCEIRO',
  
  // Movimentações de Caixa
  'DEPOSITO',
  'SAQUE',
  'TRANSFERENCIA',
  
  // Pagamentos para Externos
  'PAGTO_PARCEIRO',
  'PAGTO_FORNECEDOR',
  'PAGTO_OPERADOR',
  'COMISSAO_INDICADOR',
  'BONUS_INDICADOR',
  'DESPESA_ADMINISTRATIVA',
  'RENOVACAO_PARCERIA',
  'BONIFICACAO_ESTRATEGICA',
  
  // Ajustes de Caixa (quando afetam caixa real)
  'AJUSTE_MANUAL',
  'AJUSTE_SALDO',
  'CONCILIACAO',
  
  // Ajustes Cambiais (diferenças reais entre valor esperado e recebido)
  // CRÍTICO: Creditam/debitam wallets, DEVEM aparecer para trilha de auditoria
  'GANHO_CAMBIAL',
  'PERDA_CAMBIAL',
] as const;

/**
 * Tipos de transação de DINHEIRO OPERACIONAL
 * (Movimentos internos dentro de bookmakers - NÃO impactam caixa real)
 * 
 * NOVA ARQUITETURA:
 * - BONUS_CREDITADO agora é tratado como dinheiro NORMAL
 * - Apenas FREEBET tem pool separado
 * - Cashback e Giros Grátis são lucro operacional interno
 */
export const OPERATIONAL_MONEY_TYPES = [
  // Bônus e Promoções (BÔNUS = DINHEIRO NORMAL com tag de origem)
  'BONUS_CREDITADO',      // Crédito de bônus → vai para saldo_atual (normal)
  'BONUS_ESTORNO',        // Estorno de bônus
  'GIRO_GRATIS',
  'GIRO_GRATIS_GANHO',
  'GIRO_GRATIS_ESTORNO',
  'CREDITO_PROMOCIONAL',
  'EVENTO_PROMOCIONAL',
  
  // Freebet (ÚNICO pool separado - saldo_freebet)
  'FREEBET_CREDITADA',    // Freebet recebida/liberada
  'FREEBET_CONSUMIDA',    // Freebet usada em aposta
  'FREEBET_ESTORNO',      // Reversão de consumo
  'FREEBET_EXPIRADA',     // Freebet expirou sem uso
  'FREEBET_CONVERTIDA',   // Extração: debita freebet, credita real
  
  // Cashback (é lucro operacional interno, não entrada de caixa)
  'CASHBACK_MANUAL',
  'CASHBACK_ESTORNO',
  
  // Resultados de Apostas
  'APOSTA_GREEN',
  'APOSTA_RED',
  'APOSTA_VOID',
  'APOSTA_MEIO_GREEN',
  'APOSTA_MEIO_RED',
  'APOSTA_REVERSAO',
  
  // Perdas e Ajustes Operacionais
  'PERDA_OPERACIONAL',
  'PERDA_REVERSAO',
  
  // NOTA: GANHO_CAMBIAL e PERDA_CAMBIAL estão em CASH_REAL_TYPES
  // pois creditam/debitam wallets e precisam aparecer na trilha de auditoria.
] as const;

/**
 * Verifica se um tipo de transação é Cash Real (impacta caixa)
 */
export function isCashRealType(tipo: string): boolean {
  return CASH_REAL_TYPES.includes(tipo as any);
}

/**
 * Verifica se um tipo de transação é Dinheiro Operacional (não impacta caixa)
 */
export function isOperationalMoneyType(tipo: string): boolean {
  return OPERATIONAL_MONEY_TYPES.includes(tipo as any);
}

/**
 * Retorna o filtro SQL para tipos de Cash Real
 * Usado em queries do Caixa Operacional
 */
export function getCashRealTypesFilter(): string[] {
  return [...CASH_REAL_TYPES];
}

/**
 * Descrição legível da classificação de um tipo
 */
export function getTransactionClassification(tipo: string): 'cash_real' | 'operational' | 'unknown' {
  if (isCashRealType(tipo)) return 'cash_real';
  if (isOperationalMoneyType(tipo)) return 'operational';
  return 'unknown';
}
