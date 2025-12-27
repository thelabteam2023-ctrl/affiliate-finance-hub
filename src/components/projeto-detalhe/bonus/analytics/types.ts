import { ProjectBonus } from "@/hooks/useProjectBonuses";

export interface DateRangeResult {
  start: Date;
  end: Date;
}

export interface AnalyticsTabProps {
  bonuses: ProjectBonus[];
  dateRange?: DateRangeResult | null;
}

export interface BookmakerStats {
  bookmaker_id: string;
  bookmaker_nome: string;
  bookmaker_login: string;
  logo_url: string | null;
  currency: string;
}

export interface ExtracaoStats extends BookmakerStats {
  count: number;
  total_extracted: number;
}

export interface ConversaoStats extends BookmakerStats {
  received: number;
  converted: number;
  rate: number;
}

export interface ProblemaStats extends BookmakerStats {
  problem_count: number;
  value_lost: number;
  problem_types: string[];
}

export interface ConfiabilidadeStats extends BookmakerStats {
  icc: number;
  raroi: number;
  classification: 'excellent' | 'good' | 'average' | 'toxic';
  total_received: number;
  total_converted: number;
  total_problems: number;
  total_extracted: number;
  total_invested: number;
  value_lost: number;
}

export interface AlertItem {
  id: string;
  type: 'expiring_soon' | 'rollover_deadline' | 'multiple_problems' | 'toxic_bookmaker';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  bookmaker_nome: string;
  logo_url: string | null;
  created_at: Date;
}

// Helper to format currency
export const formatCurrency = (value: number, moeda: string = 'BRL') => {
  const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£' };
  return `${symbols[moeda] || moeda} ${value.toFixed(2)}`;
};

// Helper to get classification color
export const getClassificationColor = (classification: ConfiabilidadeStats['classification']) => {
  switch (classification) {
    case 'excellent': return 'text-emerald-500';
    case 'good': return 'text-blue-500';
    case 'average': return 'text-yellow-500';
    case 'toxic': return 'text-red-500';
    default: return 'text-muted-foreground';
  }
};

export const getClassificationBadge = (classification: ConfiabilidadeStats['classification']) => {
  switch (classification) {
    case 'excellent': return { label: 'Excelente', variant: 'default' as const, className: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' };
    case 'good': return { label: 'Boa', variant: 'default' as const, className: 'bg-blue-500/20 text-blue-500 border-blue-500/30' };
    case 'average': return { label: 'Média', variant: 'default' as const, className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' };
    case 'toxic': return { label: 'Tóxica', variant: 'default' as const, className: 'bg-red-500/20 text-red-500 border-red-500/30' };
    default: return { label: 'N/A', variant: 'secondary' as const, className: '' };
  }
};
