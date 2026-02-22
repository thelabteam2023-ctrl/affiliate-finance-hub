/**
 * Hook para gerenciar rascunhos de apostas em localStorage
 * 
 * CONCEITO:
 * - Rascunhos são trabalhos incompletos que NÃO tocam o banco
 * - Permitem salvar: surebets 2/3 pernas, simulações, montagens parciais
 * - Nunca impactam saldo ou cash_ledger
 * - Podem ser promovidos a apostas reais após validação completa
 */

import { useState, useEffect, useCallback } from 'react';

// Tipos de rascunho suportados
export type TipoRascunho = 'SUREBET' | 'MULTIPLA' | 'SIMPLES' | 'HEDGE';

// Estado do rascunho
export type EstadoRascunho = 'INCOMPLETO' | 'PRONTO_PARA_SALVAR';

// Estrutura de uma perna de rascunho
export interface RascunhoPernaData {
  bookmaker_id?: string;
  bookmaker_nome?: string;
  selecao?: string;
  selecao_livre?: string;
  odd?: number;
  stake?: number;
  moeda?: string;
}

// Estrutura de uma seleção de múltipla
export interface RascunhoSelecaoData {
  descricao?: string;
  odd?: number;
}

// Estrutura base do rascunho
export interface ApostaRascunho {
  id: string;
  tipo: TipoRascunho;
  estado: EstadoRascunho;
  projeto_id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  
  // Dados comuns
  evento?: string;
  mercado?: string;
  esporte?: string;
  observacoes?: string;
  
  // Novos campos obrigatórios para Surebet
  estrategia?: string;
  contexto_operacional?: string;
  modelo?: string; // "1-2", "1-X-2", "4-way", etc.
  modelo_tipo?: "2" | "3" | "4+";
  quantidade_pernas?: number;
  
  // Para Surebet
  pernas?: RascunhoPernaData[];
  
  // Para Múltipla
  bookmaker_id?: string;
  bookmaker_nome?: string;
  stake?: number;
  moeda?: string;
  tipo_multipla?: string;
  selecoes?: RascunhoSelecaoData[];
  
  // Metadados
  motivo_incompleto?: string;
}

// Chave do localStorage
const STORAGE_KEY = 'aposta_rascunhos';

// Gerar ID único
const generateId = (): string => {
  return `rascunho_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Verificar se perna está completa
const isPernaCompleta = (perna: RascunhoPernaData): boolean => {
  return !!(
    perna.bookmaker_id &&
    perna.odd && perna.odd > 1 &&
    perna.stake && perna.stake > 0
  );
};

// Verificar se seleção está completa
const isSelecaoCompleta = (selecao: RascunhoSelecaoData): boolean => {
  return !!(
    selecao.descricao?.trim() &&
    selecao.odd && selecao.odd > 1
  );
};

// Calcular estado do rascunho
const calcularEstado = (rascunho: Partial<ApostaRascunho>): EstadoRascunho => {
  switch (rascunho.tipo) {
    case 'SUREBET': {
      const pernasCompletas = rascunho.pernas?.filter(isPernaCompleta).length || 0;
      return pernasCompletas >= 2 ? 'PRONTO_PARA_SALVAR' : 'INCOMPLETO';
    }
    case 'MULTIPLA': {
      const selecoesCompletas = rascunho.selecoes?.filter(isSelecaoCompleta).length || 0;
      const temBookmaker = !!rascunho.bookmaker_id;
      const temStake = (rascunho.stake || 0) > 0;
      return selecoesCompletas >= 2 && temBookmaker && temStake 
        ? 'PRONTO_PARA_SALVAR' 
        : 'INCOMPLETO';
    }
    case 'SIMPLES':
    case 'HEDGE':
    default:
      return 'INCOMPLETO';
  }
};

// Calcular motivo de incompletude
const calcularMotivoIncompleto = (rascunho: Partial<ApostaRascunho>): string | undefined => {
  if (calcularEstado(rascunho) === 'PRONTO_PARA_SALVAR') {
    return undefined;
  }

  switch (rascunho.tipo) {
    case 'SUREBET': {
      const pernasCompletas = rascunho.pernas?.filter(isPernaCompleta).length || 0;
      if (pernasCompletas === 0) return 'Nenhuma perna completa';
      if (pernasCompletas === 1) return 'Apenas 1 perna completa (mínimo 2)';
      return 'Dados incompletos';
    }
    case 'MULTIPLA': {
      const problemas: string[] = [];
      const selecoesCompletas = rascunho.selecoes?.filter(isSelecaoCompleta).length || 0;
      if (selecoesCompletas < 2) problemas.push(`${selecoesCompletas}/2 seleções`);
      if (!rascunho.bookmaker_id) problemas.push('sem bookmaker');
      if (!rascunho.stake || rascunho.stake <= 0) problemas.push('sem stake');
      return problemas.join(', ');
    }
    default:
      return 'Tipo não suportado para validação';
  }
};

export function useApostaRascunho(projetoId: string, workspaceId: string) {
  const [rascunhos, setRascunhos] = useState<ApostaRascunho[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar rascunhos do localStorage
  const loadRascunhos = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const allRascunhos: ApostaRascunho[] = JSON.parse(stored);
        const filtered = allRascunhos.filter(
          r => r.projeto_id === projetoId && r.workspace_id === workspaceId
        );
        setRascunhos(filtered);
      } else {
        setRascunhos([]);
      }
    } catch (error) {
      console.error('Erro ao carregar rascunhos:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projetoId, workspaceId]);

  useEffect(() => {
    loadRascunhos();
  }, [loadRascunhos]);

  // Reagir a mudanças no localStorage (cross-window via 'storage', same-window via custom event)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) loadRascunhos();
    };
    const handleCustomChange = () => loadRascunhos();

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('rascunhos-updated', handleCustomChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('rascunhos-updated', handleCustomChange);
    };
  }, [loadRascunhos]);

  // Salvar todos os rascunhos no localStorage
  const persistRascunhos = useCallback((updated: ApostaRascunho[]) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const allRascunhos: ApostaRascunho[] = stored ? JSON.parse(stored) : [];
      
      const outros = allRascunhos.filter(
        r => r.projeto_id !== projetoId || r.workspace_id !== workspaceId
      );
      
      const final = [...outros, ...updated];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(final));
      setRascunhos(updated);
      
      // Notificar outras instâncias do hook na mesma janela
      window.dispatchEvent(new Event('rascunhos-updated'));
    } catch (error) {
      console.error('Erro ao salvar rascunhos:', error);
    }
  }, [projetoId, workspaceId]);

  // Criar novo rascunho
  const criarRascunho = useCallback((
    tipo: TipoRascunho,
    dados: Partial<Omit<ApostaRascunho, 'id' | 'tipo' | 'estado' | 'projeto_id' | 'workspace_id' | 'created_at' | 'updated_at'>>
  ): ApostaRascunho => {
    const now = new Date().toISOString();
    const novoRascunho: ApostaRascunho = {
      id: generateId(),
      tipo,
      estado: 'INCOMPLETO',
      projeto_id: projetoId,
      workspace_id: workspaceId,
      created_at: now,
      updated_at: now,
      ...dados,
    };
    
    // Calcular estado e motivo
    novoRascunho.estado = calcularEstado(novoRascunho);
    novoRascunho.motivo_incompleto = calcularMotivoIncompleto(novoRascunho);
    
    const updated = [...rascunhos, novoRascunho];
    persistRascunhos(updated);
    
    return novoRascunho;
  }, [projetoId, workspaceId, rascunhos, persistRascunhos]);

  // Atualizar rascunho existente
  const atualizarRascunho = useCallback((
    id: string,
    dados: Partial<Omit<ApostaRascunho, 'id' | 'tipo' | 'projeto_id' | 'workspace_id' | 'created_at'>>
  ): ApostaRascunho | null => {
    const index = rascunhos.findIndex(r => r.id === id);
    if (index === -1) return null;
    
    const atualizado: ApostaRascunho = {
      ...rascunhos[index],
      ...dados,
      updated_at: new Date().toISOString(),
    };
    
    // Recalcular estado e motivo
    atualizado.estado = calcularEstado(atualizado);
    atualizado.motivo_incompleto = calcularMotivoIncompleto(atualizado);
    
    const updated = [...rascunhos];
    updated[index] = atualizado;
    persistRascunhos(updated);
    
    return atualizado;
  }, [rascunhos, persistRascunhos]);

  // Deletar rascunho
  const deletarRascunho = useCallback((id: string): boolean => {
    const index = rascunhos.findIndex(r => r.id === id);
    if (index === -1) return false;
    
    const updated = rascunhos.filter(r => r.id !== id);
    persistRascunhos(updated);
    
    return true;
  }, [rascunhos, persistRascunhos]);

  // Buscar rascunho por ID
  const buscarRascunho = useCallback((id: string): ApostaRascunho | undefined => {
    return rascunhos.find(r => r.id === id);
  }, [rascunhos]);

  // Listar rascunhos por tipo
  const listarPorTipo = useCallback((tipo: TipoRascunho): ApostaRascunho[] => {
    return rascunhos.filter(r => r.tipo === tipo);
  }, [rascunhos]);

  // Listar rascunhos prontos para salvar
  const listarProntosParaSalvar = useCallback((): ApostaRascunho[] => {
    return rascunhos.filter(r => r.estado === 'PRONTO_PARA_SALVAR');
  }, [rascunhos]);

  // Listar rascunhos incompletos
  const listarIncompletos = useCallback((): ApostaRascunho[] => {
    return rascunhos.filter(r => r.estado === 'INCOMPLETO');
  }, [rascunhos]);

  // Limpar todos os rascunhos do projeto
  const limparTodos = useCallback((): void => {
    persistRascunhos([]);
  }, [persistRascunhos]);

  // Promover rascunho (marcar como usado após criar aposta real)
  const promoverRascunho = useCallback((id: string): boolean => {
    // Simplesmente deletamos o rascunho após ele virar aposta real
    return deletarRascunho(id);
  }, [deletarRascunho]);

  return {
    // Estado
    rascunhos,
    isLoading,
    
    // CRUD
    criarRascunho,
    atualizarRascunho,
    deletarRascunho,
    buscarRascunho,
    
    // Queries
    listarPorTipo,
    listarProntosParaSalvar,
    listarIncompletos,
    
    // Utilitários
    limparTodos,
    promoverRascunho,
    
    // Helpers para validação externa
    isPernaCompleta,
    isSelecaoCompleta,
    calcularEstado,
  };
}

export default useApostaRascunho;
