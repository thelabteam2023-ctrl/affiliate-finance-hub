/**
 * ============================================================
 * PROFIT MODULES REGISTRY
 * ============================================================
 * 
 * ARQUITETURA EXTENSÍVEL PARA FONTES DE LUCRO
 * 
 * Este arquivo é o PONTO CENTRAL para registro de todos os módulos
 * que contribuem para o cálculo de lucro do sistema.
 * 
 * PARA ADICIONAR UM NOVO MÓDULO DE LUCRO:
 * 1. Adicione o módulo neste registry (PROFIT_MODULES)
 * 2. Implemente o fetcher em useProjetoResultado.ts
 * 3. Adicione o tipo de estorno no ledgerService.ts (se aplicável)
 * 4. Adicione o tipo na constraint cash_ledger_tipo_transacao_check (migration)
 * 
 * BENEFÍCIOS:
 * - Um único lugar para ver todas as fontes de lucro
 * - Facilita auditorias e debugging
 * - Garante que reset operacional cubra todos os módulos
 * - Permite adicionar novos módulos sem refatorar código existente
 */

import type { LedgerTransactionType } from './ledgerService';

/**
 * Definição de um módulo de lucro
 */
export interface ProfitModule {
  /** ID único do módulo (snake_case) */
  id: string;
  
  /** Nome amigável para exibição */
  displayName: string;
  
  /** Descrição do que o módulo representa */
  description: string;
  
  /** Tabela principal de dados (para consultas) */
  sourceTable: string;
  
  /** Coluna que contém o valor do lucro/prejuízo */
  profitColumn: string;
  
  /** Coluna de filtro por projeto (geralmente 'projeto_id') */
  projectFilterColumn: string;
  
  /** Coluna de filtro por data (para períodos) */
  dateFilterColumn: string;
  
  /** Filtros adicionais obrigatórios (ex: status = 'confirmado') */
  requiredFilters?: Record<string, unknown>;
  
  /** Tipo de transação no ledger para créditos */
  ledgerCreditType?: LedgerTransactionType;
  
  /** Tipo de transação no ledger para estornos */
  ledgerReversalType?: LedgerTransactionType;
  
  /** Se o módulo pode ter valores negativos (prejuízo) */
  canBeNegative: boolean;
  
  /** Ícone do Lucide para UI */
  icon: string;
  
  /** Cor padrão para gráficos */
  chartColor: string;
  
  /** Se está ativo no sistema atual */
  isActive: boolean;
  
  /** Ordem de exibição em relatórios */
  displayOrder: number;
}

/**
 * REGISTRO CENTRAL DE MÓDULOS DE LUCRO
 * 
 * Cada módulo aqui representa uma fonte de receita/despesa
 * que contribui para o cálculo do lucro líquido do projeto.
 */
export const PROFIT_MODULES: ProfitModule[] = [
  // ============================================================
  // MÓDULOS OPERACIONAIS (Core Business)
  // ============================================================
  {
    id: 'apostas',
    displayName: 'Apostas',
    description: 'Lucro/prejuízo de apostas liquidadas',
    sourceTable: 'apostas_unificada',
    profitColumn: 'pl_consolidado', // ou lucro_prejuizo como fallback
    projectFilterColumn: 'projeto_id',
    dateFilterColumn: 'data_aposta',
    requiredFilters: { status: 'LIQUIDADA' },
    ledgerCreditType: 'APOSTA_GREEN',
    ledgerReversalType: 'APOSTA_REVERSAO',
    canBeNegative: true, // Apostas podem dar prejuízo
    icon: 'Target',
    chartColor: 'hsl(var(--primary))',
    isActive: true,
    displayOrder: 1,
  },
  
  // ============================================================
  // MÓDULOS PROMOCIONAIS
  // ============================================================
  {
    id: 'cashback_manual',
    displayName: 'Cashback',
    description: 'Cashback recebido manualmente',
    sourceTable: 'cashback_manual',
    profitColumn: 'valor',
    projectFilterColumn: 'projeto_id',
    dateFilterColumn: 'data_credito',
    requiredFilters: undefined, // Todos os registros são válidos
    ledgerCreditType: 'CASHBACK_MANUAL',
    ledgerReversalType: 'CASHBACK_ESTORNO',
    canBeNegative: false, // Cashback é sempre positivo
    icon: 'Coins',
    chartColor: 'hsl(142.1 76.2% 36.3%)', // Emerald
    isActive: true,
    displayOrder: 2,
  },
  {
    id: 'giros_gratis',
    displayName: 'Giros Grátis',
    description: 'Retorno de giros grátis promocionais',
    sourceTable: 'giros_gratis',
    profitColumn: 'valor_retorno',
    projectFilterColumn: 'projeto_id',
    dateFilterColumn: 'data_registro',
    requiredFilters: { status: 'confirmado' },
    ledgerCreditType: 'GIRO_GRATIS',
    ledgerReversalType: 'GIRO_GRATIS_ESTORNO',
    canBeNegative: false, // Giros são sempre >= 0
    icon: 'RefreshCw',
    chartColor: 'hsl(221.2 83.2% 53.3%)', // Blue
    isActive: true,
    displayOrder: 3,
  },
  
  // ============================================================
  // MÓDULOS DE AJUSTE (Impactam lucro indiretamente)
  // ============================================================
  {
    id: 'perdas_operacionais',
    displayName: 'Perdas Operacionais',
    description: 'Perdas por limitação, bloqueio ou saldo irrecuperável',
    sourceTable: 'projeto_perdas',
    profitColumn: 'valor',
    projectFilterColumn: 'projeto_id',
    dateFilterColumn: 'data_perda',
    requiredFilters: { status: 'CONFIRMADA' },
    ledgerCreditType: 'PERDA_OPERACIONAL',
    ledgerReversalType: 'PERDA_REVERSAO',
    canBeNegative: false, // Mas é SUBTRAÍDO do lucro
    icon: 'AlertTriangle',
    chartColor: 'hsl(0 84.2% 60.2%)', // Red
    isActive: true,
    displayOrder: 4,
  },
  {
    id: 'ajustes_conciliacao',
    displayName: 'Ajustes de Conciliação',
    description: 'Diferenças identificadas em auditorias de saldo',
    sourceTable: 'bookmaker_balance_audit',
    profitColumn: 'diferenca', // saldo_novo - saldo_anterior
    projectFilterColumn: 'referencia_id',
    dateFilterColumn: 'created_at',
    requiredFilters: { 
      origem: 'CONCILIACAO_VINCULO',
      referencia_tipo: 'projeto',
    },
    ledgerCreditType: 'CONCILIACAO',
    ledgerReversalType: undefined, // Não tem estorno específico
    canBeNegative: true, // Pode ser positivo ou negativo
    icon: 'Scale',
    chartColor: 'hsl(47.9 95.8% 53.1%)', // Yellow
    isActive: true,
    displayOrder: 5,
  },
  
  // ============================================================
  // MÓDULOS FUTUROS (Placeholder para extensibilidade)
  // ============================================================
  {
    id: 'rakeback',
    displayName: 'Rakeback',
    description: 'Retorno de rake em poker/exchange',
    sourceTable: 'rakeback', // Tabela futura
    profitColumn: 'valor',
    projectFilterColumn: 'projeto_id',
    dateFilterColumn: 'data_credito',
    requiredFilters: { status: 'confirmado' },
    ledgerCreditType: undefined, // A definir
    ledgerReversalType: undefined,
    canBeNegative: false,
    icon: 'Percent',
    chartColor: 'hsl(280 65% 60%)', // Purple
    isActive: false, // INATIVO - não implementado ainda
    displayOrder: 10,
  },
  {
    id: 'eventos_promocionais',
    displayName: 'Eventos Promocionais',
    description: 'Créditos de promoções especiais',
    sourceTable: 'eventos_promocionais', // Tabela futura
    profitColumn: 'valor',
    projectFilterColumn: 'projeto_id',
    dateFilterColumn: 'data_evento',
    requiredFilters: { status: 'creditado' },
    ledgerCreditType: 'EVENTO_PROMOCIONAL',
    ledgerReversalType: 'ESTORNO',
    canBeNegative: false,
    icon: 'Gift',
    chartColor: 'hsl(340 82% 52%)', // Pink
    isActive: false, // INATIVO - não implementado ainda
    displayOrder: 11,
  },
];

// ============================================================
// HELPERS
// ============================================================

/**
 * Retorna apenas módulos ativos
 */
export function getActiveModules(): ProfitModule[] {
  return PROFIT_MODULES.filter(m => m.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Retorna um módulo por ID
 */
export function getModuleById(id: string): ProfitModule | undefined {
  return PROFIT_MODULES.find(m => m.id === id);
}

/**
 * Retorna módulos que têm tipo de estorno no ledger
 */
export function getReversibleModules(): ProfitModule[] {
  return PROFIT_MODULES.filter(m => m.isActive && m.ledgerReversalType);
}

/**
 * Retorna a fórmula de cálculo do lucro líquido em texto
 */
export function getProfitFormula(): string {
  const activeModules = getActiveModules();
  
  const positiveModules = activeModules
    .filter(m => m.id !== 'perdas_operacionais')
    .map(m => m.displayName);
  
  const negativeModules = activeModules
    .filter(m => m.id === 'perdas_operacionais')
    .map(m => m.displayName);
  
  return `Lucro Líquido = ${positiveModules.join(' + ')} - ${negativeModules.join(' - ')}`;
}

/**
 * Mapeia tipos de ledger para módulos
 */
export function getModuleByLedgerType(ledgerType: LedgerTransactionType): ProfitModule | undefined {
  return PROFIT_MODULES.find(
    m => m.ledgerCreditType === ledgerType || m.ledgerReversalType === ledgerType
  );
}

/**
 * Interface para dados de reset operacional
 */
export interface OperationalResetData {
  moduleId: string;
  moduleName: string;
  recordCount: number;
  totalValue: number;
  reversalType?: LedgerTransactionType;
}

/**
 * Retorna configuração para reset operacional de todos os módulos
 */
export function getResetConfiguration(): {
  modules: Array<{
    id: string;
    name: string;
    table: string;
    reversalType?: LedgerTransactionType;
  }>;
} {
  const reversibleModules = getReversibleModules();
  
  return {
    modules: reversibleModules.map(m => ({
      id: m.id,
      name: m.displayName,
      table: m.sourceTable,
      reversalType: m.ledgerReversalType,
    })),
  };
}
