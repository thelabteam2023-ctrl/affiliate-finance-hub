/**
 * Seletor de Período para Projetos
 * Padrão unificado: Mês atual | Anterior | Tudo + Calendário
 * 
 * IMPORTANTE: Este componente segue o mesmo padrão do Dashboard Financeiro
 * para garantir consistência de UX em todo o sistema.
 */
import { DashboardPeriodFilterBar } from "@/components/shared/DashboardPeriodFilterBar";
import { DashboardPeriodFilter, getDashboardDateRange } from "@/types/dashboardFilters";
import { PeriodoAnalise } from "@/types/performance";

interface PeriodoSelectorProps {
  periodo: PeriodoAnalise;
  onChange: (periodo: PeriodoAnalise) => void;
}

export function PeriodoSelector({ periodo, onChange }: PeriodoSelectorProps) {
  // Mapear o preset atual para o novo formato
  const getCurrentFilter = (): DashboardPeriodFilter => {
    switch (periodo.preset) {
      case 'mes':
        return 'mes';
      case 'tudo':
        return 'tudo';
      case 'custom':
        return 'custom';
      case '7dias':
      case '30dias':
      case 'ano':
      default:
        return 'mes'; // Default para mês se preset antigo
    }
  };

  const handleChange = (filter: DashboardPeriodFilter) => {
    const range = getDashboardDateRange(filter);
    
    // Converter para o formato PeriodoAnalise esperado pelo sistema legado
    const presetMap: Record<DashboardPeriodFilter, PeriodoAnalise['preset']> = {
      'anterior': 'custom',
      'mes': 'mes',
      'ano': 'ano',
      'tudo': 'tudo',
      'custom': 'custom',
    };
    
    onChange({
      dataInicio: range.start,
      dataFim: range.end,
      preset: presetMap[filter],
    });
  };

  const handleCustomRangeChange = (range: { start: Date; end: Date }) => {
    onChange({
      dataInicio: range.start,
      dataFim: range.end,
      preset: 'custom',
    });
  };

  // Extrair customRange do período atual se for custom
  const customRange = periodo.preset === 'custom' && periodo.dataInicio && periodo.dataFim
    ? { start: periodo.dataInicio, end: periodo.dataFim }
    : undefined;

  return (
    <DashboardPeriodFilterBar
      value={getCurrentFilter()}
      onChange={handleChange}
      customRange={customRange}
      onCustomRangeChange={handleCustomRangeChange}
      size="sm"
    />
  );
}
