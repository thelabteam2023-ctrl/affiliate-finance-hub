// Tipos de métricas de performance

export interface PerformanceMetrics {
  saldoInicial: number;
  saldoFinal: number;
  depositos: number;
  saques: number;
  lucroApostas: number;
  lucroTotal: number;
  roi: number | null;
  capitalMedio: number;
}

export interface PerformanceConsolidada extends PerformanceMetrics {
  totalProjetos: number;
  projetosAtivos: number;
  totalBookmakers: number;
  totalOperadores: number;
}

export type PeriodoPreset = 'hoje' | '7dias' | '30dias' | 'mes' | 'ano' | 'tudo' | 'custom';

export interface PeriodoAnalise {
  dataInicio: Date | null;
  dataFim: Date | null;
  preset: PeriodoPreset;
}

export function criarPeriodo(preset: PeriodoPreset): PeriodoAnalise {
  const now = new Date();
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (preset) {
    case 'hoje':
      return { 
        dataInicio: hoje, 
        dataFim: new Date(hoje.getTime() + 24 * 60 * 60 * 1000 - 1), 
        preset 
      };
    case '7dias':
      return { 
        dataInicio: new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000), 
        dataFim: now, 
        preset 
      };
    case '30dias':
      return { 
        dataInicio: new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000), 
        dataFim: now, 
        preset 
      };
    case 'mes':
      return { 
        dataInicio: new Date(now.getFullYear(), now.getMonth(), 1), 
        dataFim: now, 
        preset 
      };
    case 'ano':
      return { 
        dataInicio: new Date(now.getFullYear(), 0, 1), 
        dataFim: now, 
        preset 
      };
    case 'tudo':
    default:
      return { dataInicio: null, dataFim: null, preset: 'tudo' };
  }
}
