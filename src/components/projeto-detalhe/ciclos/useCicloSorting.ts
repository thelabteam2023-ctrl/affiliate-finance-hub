import { useMemo } from "react";

export interface CicloBase {
  id: string;
  numero_ciclo?: number;
  data_inicio: string;
  data_fim_prevista: string;
  data_fim_real: string | null;
  status: string;
  tipo_gatilho: string;
  meta_volume: number | null;
}

type CicloStatus = "EM_ANDAMENTO" | "FECHADO" | "FUTURO" | "CANCELADO";

/**
 * Determina o status real do ciclo considerando datas
 * - FUTURO: data_inicio > hoje
 * - EM_ANDAMENTO: data_inicio <= hoje && status === "EM_ANDAMENTO"
 * - FECHADO: status === "FECHADO"
 */
export function getCicloRealStatus(ciclo: CicloBase): CicloStatus {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  const dataInicio = new Date(ciclo.data_inicio);
  dataInicio.setHours(0, 0, 0, 0);
  
  // Se ainda não começou, é futuro
  if (dataInicio > hoje && ciclo.status === "EM_ANDAMENTO") {
    return "FUTURO";
  }
  
  if (ciclo.status === "CANCELADO") return "CANCELADO";
  if (ciclo.status === "FECHADO") return "FECHADO";
  
  return "EM_ANDAMENTO";
}

/**
 * Verifica se o ciclo é do tipo Meta + Prazo
 */
export function isMetaPrazo(ciclo: CicloBase): boolean {
  // META com data_fim_prevista diferente de data_inicio = Meta + Prazo
  if (ciclo.tipo_gatilho === "META" && ciclo.meta_volume) {
    const temPrazo = ciclo.data_fim_prevista !== ciclo.data_inicio;
    return temPrazo;
  }
  // HIBRIDO é o legado para Meta + Prazo
  if (ciclo.tipo_gatilho === "HIBRIDO") return true;
  return false;
}

/**
 * Ordena ciclos na ordem de prioridade operacional:
 * 1. Em andamento (mais recentes primeiro)
 * 2. Fechados (mais recentes primeiro)  
 * 3. Futuros (mais próximos primeiro)
 */
export function sortCiclosOperacional<T extends CicloBase>(ciclos: T[]): T[] {
  return [...ciclos].sort((a, b) => {
    const statusA = getCicloRealStatus(a);
    const statusB = getCicloRealStatus(b);
    
    // Prioridade de status: EM_ANDAMENTO > FECHADO > FUTURO > CANCELADO
    const prioridade = {
      "EM_ANDAMENTO": 0,
      "FECHADO": 1,
      "FUTURO": 2,
      "CANCELADO": 3,
    };
    
    const prioridadeA = prioridade[statusA];
    const prioridadeB = prioridade[statusB];
    
    if (prioridadeA !== prioridadeB) {
      return prioridadeA - prioridadeB;
    }
    
    // Dentro do mesmo status, ordenar por data
    if (statusA === "FUTURO") {
      // Futuros: mais próximos primeiro (data_inicio ASC)
      return new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime();
    } else {
      // Em andamento e fechados: mais recentes primeiro (data_inicio DESC)
      return new Date(b.data_inicio).getTime() - new Date(a.data_inicio).getTime();
    }
  });
}

/**
 * Calcula a duração real do ciclo em dias
 */
export function calcularDuracaoReal(ciclo: CicloBase): {
  dias: number; 
  tipo: "concluido" | "em_andamento" | "previsto";
} {
  const dataInicio = new Date(ciclo.data_inicio);
  
  if (ciclo.status === "FECHADO" && ciclo.data_fim_real) {
    // Ciclo fechado: usar data real de fechamento
    const dataFim = new Date(ciclo.data_fim_real);
    const dias = Math.ceil((dataFim.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24));
    return { dias: Math.max(1, dias), tipo: "concluido" };
  }
  
  if (ciclo.status === "EM_ANDAMENTO") {
    // Em andamento: dias até agora
    const hoje = new Date();
    const dias = Math.ceil((hoje.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24));
    return { dias: Math.max(0, dias), tipo: "em_andamento" };
  }
  
  // Futuro ou não iniciado: duração prevista
  const dataFimPrevista = new Date(ciclo.data_fim_prevista);
  const dias = Math.ceil((dataFimPrevista.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24));
  return { dias: Math.max(1, dias), tipo: "previsto" };
}

/**
 * Calcula a meta diária necessária para atingir o objetivo
 */
export function calcularMetaDiaria(ciclo: CicloBase, valorAtual: number = 0): {
  metaDiaria: number;
  diasRestantes: number;
  diasTotais: number;
  atrasado: boolean;
  projecao: number;
} | null {
  if (!ciclo.meta_volume || ciclo.meta_volume <= 0) return null;
  if (ciclo.status !== "EM_ANDAMENTO") return null;
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  const dataInicio = new Date(ciclo.data_inicio);
  dataInicio.setHours(0, 0, 0, 0);
  
  const dataFimPrevista = new Date(ciclo.data_fim_prevista);
  dataFimPrevista.setHours(0, 0, 0, 0);
  
  const diasTotais = Math.ceil((dataFimPrevista.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24));
  const diasDecorridos = Math.ceil((hoje.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24));
  const diasRestantes = Math.max(0, diasTotais - diasDecorridos);
  
  const faltaAtingir = ciclo.meta_volume - valorAtual;
  
  // Se já atingiu a meta
  if (faltaAtingir <= 0) {
    return {
      metaDiaria: 0,
      diasRestantes,
      diasTotais,
      atrasado: false,
      projecao: valorAtual,
    };
  }
  
  // Meta diária = quanto falta / dias restantes
  const metaDiaria = diasRestantes > 0 ? faltaAtingir / diasRestantes : faltaAtingir;
  
  // Projeção: se continuar no ritmo atual
  const mediaAtual = diasDecorridos > 0 ? valorAtual / diasDecorridos : 0;
  const projecao = diasDecorridos > 0 ? mediaAtual * diasTotais : 0;
  
  // Atrasado: se a projeção não atinge a meta
  const atrasado = projecao < ciclo.meta_volume && diasRestantes > 0;
  
  return {
    metaDiaria,
    diasRestantes,
    diasTotais,
    atrasado,
    projecao,
  };
}

/**
 * Hook para calcular contagens de filtros
 */
export function useCicloCounts<T extends CicloBase>(ciclos: T[]) {
  return useMemo(() => {
    let emAndamento = 0;
    let fechados = 0;
    let futuros = 0;
    let porTempo = 0;
    let porMeta = 0;
    let metaPrazo = 0;
    
    ciclos.forEach(ciclo => {
      const status = getCicloRealStatus(ciclo);
      
      // Contagem por status
      if (status === "EM_ANDAMENTO") emAndamento++;
      else if (status === "FECHADO") fechados++;
      else if (status === "FUTURO") futuros++;
      
      // Contagem por tipo
      if (isMetaPrazo(ciclo)) {
        metaPrazo++;
      } else if (ciclo.tipo_gatilho === "META" || ciclo.tipo_gatilho === "VOLUME") {
        porMeta++;
      } else if (ciclo.tipo_gatilho === "TEMPO") {
        porTempo++;
      }
    });
    
    return {
      emAndamento,
      fechados,
      futuros,
      porTempo,
      porMeta,
      metaPrazo,
    };
  }, [ciclos]);
}
