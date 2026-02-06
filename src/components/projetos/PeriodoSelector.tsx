/**
 * Seletor de Período para Projetos
 * Padrão unificado: Mês | 3M | 6M | Ano | Tudo
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
      case 'ano':
        return 'ano';
      case 'tudo':
        return 'tudo';
      case '7dias':
      case '30dias':
      default:
        return 'mes'; // Default para mês se preset antigo
    }
  };

  const handleChange = (filter: DashboardPeriodFilter) => {
    const range = getDashboardDateRange(filter);
    
    // Converter para o formato PeriodoAnalise esperado pelo sistema legado
    const presetMap: Record<DashboardPeriodFilter, PeriodoAnalise['preset']> = {
      'mes': 'mes',
      '3m': 'custom', // 3M não existe no tipo antigo, usar custom
      '6m': 'custom', // 6M não existe no tipo antigo, usar custom
      'ano': 'ano',
      'tudo': 'tudo',
    };
    
    onChange({
      dataInicio: range.start,
      dataFim: range.end,
      preset: presetMap[filter],
    });
  };

  return (
    <DashboardPeriodFilterBar
      value={getCurrentFilter()}
      onChange={handleChange}
      size="sm"
    />
  );
}
