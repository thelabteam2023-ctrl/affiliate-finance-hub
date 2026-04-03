/**
 * Sistema de Breakdown por Módulos
 * 
 * Arquitetura orientada a módulos dinâmicos:
 * - Cada módulo fornece sua contribuição de forma independente
 * - Novos módulos podem ser adicionados sem alterar lógica do tooltip
 * - Mesma estrutura alimenta KPIs, relatórios e exportações
 */

export interface ModuleContribution {
  /** ID único do módulo (ex: "apostas", "giros_gratis", "freebets") */
  moduleId: string;
  
  /** Nome de exibição do módulo */
  moduleName: string;
  
  /** Valor da contribuição (positivo ou negativo) */
  value: number;
  
  /** Ícone opcional do módulo (nome do lucide-react) */
  icon?: string;
  
  /** Cor opcional para diferenciação visual */
  color?: 'default' | 'positive' | 'negative' | 'warning' | 'muted';
  
  /** Indica se o módulo está ativo no projeto */
  isActive: boolean;
  
  /** Detalhes adicionais (ex: quantidade de itens) */
  details?: string;
}

/**
 * Breakdown por moeda original (antes da conversão)
 */
export interface CurrencyBreakdownItem {
  /** Código da moeda (ex: "USD", "BRL") */
  moeda: string;
  
  /** Valor na moeda original */
  valor: number;
}

export interface KpiBreakdown {
  /** Valor total consolidado */
  total: number;
  
  /** Lista de contribuições por módulo */
  contributions: ModuleContribution[];
  
  /** Moeda de consolidação */
  currency: string;
  
  /** Breakdown por moeda original (opcional) */
  currencyBreakdown?: CurrencyBreakdownItem[];
  
  /** Timestamp da última atualização */
  lastUpdated?: Date;
}

/**
 * Estatísticas temporais de volume (normalização por tempo operacional)
 */
export interface VolumeTemporalStats {
  /** Data da primeira aposta no período */
  primeiraAposta: string | null;
  /** Data da última aposta no período */
  ultimaAposta: string | null;
  /** Dias ativos = (última - primeira) + 1 */
  diasAtivos: number;
  /** Dias com pelo menos 1 aposta */
  diasComOperacao: number;
  /** Volume médio diário = volume / diasAtivos */
  volumeMedioDiario: number;
  /** Média de apostas por dia = totalApostas / diasAtivos */
  mediaApostasPorDia: number;
  /** Densidade operacional = diasComOperacao / diasAtivos (0-1) */
  densidadeOperacional: number;
  /** Volume projetado (run rate) = volumeMedio * diasTotaisPeriodo */
  volumeProjetado: number | null;
}

/**
 * Interface para breakdowns de todos os KPIs
 */
export interface ProjetoKpiBreakdowns {
  /** Breakdown do KPI de Apostas (quantidade) */
  apostas: KpiBreakdown;
  
  /** Breakdown do KPI de Volume (stake) */
  volume: KpiBreakdown;
  
  /** Breakdown do KPI de Lucro */
  lucro: KpiBreakdown;
  
  /** Breakdown do KPI de ROI */
  roi: {
    total: number | null;
    volumeTotal: number;
    lucroTotal: number;
    currency: string;
  };
}

/**
 * Helper para criar uma contribuição de módulo
 */
export function createModuleContribution(
  moduleId: string,
  moduleName: string,
  value: number,
  isActive: boolean = true,
  options?: {
    icon?: string;
    color?: ModuleContribution['color'];
    details?: string;
  }
): ModuleContribution {
  return {
    moduleId,
    moduleName,
    value,
    isActive,
    icon: options?.icon,
    color: options?.color ?? (value >= 0 ? 'positive' : 'negative'),
    details: options?.details,
  };
}

/**
 * Helper para criar um breakdown de KPI
 */
export function createKpiBreakdown(
  contributions: ModuleContribution[],
  currency: string
): KpiBreakdown {
  const total = contributions
    .filter(c => c.isActive)
    .reduce((acc, c) => acc + c.value, 0);
  
  return {
    total,
    contributions: contributions.filter(c => c.isActive),
    currency,
    lastUpdated: new Date(),
  };
}
