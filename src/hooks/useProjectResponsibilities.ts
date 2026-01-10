import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Responsabilidades operacionais disponíveis no contexto de projeto.
 * Estas responsabilidades são atribuídas explicitamente a operadores
 * e determinam o que eles podem fazer dentro de um projeto específico.
 */
export const PROJECT_RESPONSIBILITIES = {
  GERENCIAR_VINCULOS: 'GERENCIAR_VINCULOS',
  REGISTRAR_APOSTAS: 'REGISTRAR_APOSTAS',
  GERENCIAR_BONUS: 'GERENCIAR_BONUS',
  CONCILIAR_ENTREGAS: 'CONCILIAR_ENTREGAS',
  REGISTRAR_PERDAS: 'REGISTRAR_PERDAS',
} as const;

export type ProjectResponsibility = keyof typeof PROJECT_RESPONSIBILITIES;

export const RESPONSIBILITY_LABELS: Record<ProjectResponsibility, string> = {
  GERENCIAR_VINCULOS: 'Gerenciar Vínculos',
  REGISTRAR_APOSTAS: 'Registrar Apostas',
  GERENCIAR_BONUS: 'Gerenciar Bônus',
  CONCILIAR_ENTREGAS: 'Conciliar Entregas',
  REGISTRAR_PERDAS: 'Registrar Perdas',
};

export const RESPONSIBILITY_DESCRIPTIONS: Record<ProjectResponsibility, string> = {
  GERENCIAR_VINCULOS: 'Pode adicionar e remover vínculos parceiro-bookmaker no projeto',
  REGISTRAR_APOSTAS: 'Pode criar e editar apostas no projeto',
  GERENCIAR_BONUS: 'Pode adicionar e gerenciar bônus das contas do projeto',
  CONCILIAR_ENTREGAS: 'Pode conciliar e fechar ciclos de entrega',
  REGISTRAR_PERDAS: 'Pode registrar e gerenciar perdas operacionais',
};

interface ProjectResponsibilitiesState {
  isOwnerOrAdmin: boolean;
  isLinkedOperator: boolean;
  responsibilities: string[];
  operadorProjetoId: string | null;
  loading: boolean;
  error: string | null;
}

interface UseProjectResponsibilitiesResult extends ProjectResponsibilitiesState {
  /** Verifica se o usuário tem uma responsabilidade específica */
  hasResponsibility: (responsibility: ProjectResponsibility) => boolean;
  /** Verifica se pode gerenciar vínculos (adicionar/remover bookmakers) */
  canManageVinculos: boolean;
  /** Verifica se pode registrar apostas */
  canRegisterApostas: boolean;
  /** Verifica se pode gerenciar bônus */
  canManageBonus: boolean;
  /** Verifica se pode conciliar entregas */
  canConciliarEntregas: boolean;
  /** Verifica se pode registrar perdas */
  canRegisterPerdas: boolean;
  /** Recarrega as responsabilidades */
  refresh: () => Promise<void>;
}

/**
 * Hook para verificar as responsabilidades de um usuário em um projeto específico.
 * 
 * Este hook implementa o conceito de "responsabilidades operacionais" que são
 * mais granulares que roles, permitindo controle fino de ações no escopo do projeto.
 * 
 * @example
 * ```tsx
 * const { canManageVinculos, hasResponsibility, loading } = useProjectResponsibilities(projetoId);
 * 
 * if (loading) return <Spinner />;
 * 
 * return (
 *   <Button 
 *     disabled={!canManageVinculos}
 *     title={!canManageVinculos ? 'Você não possui responsabilidade para gerenciar vínculos' : undefined}
 *   >
 *     Adicionar Vínculos
 *   </Button>
 * );
 * ```
 */
export function useProjectResponsibilities(projetoId: string | null | undefined): UseProjectResponsibilitiesResult {
  const { user, role, isSystemOwner } = useAuth();
  
  const [state, setState] = useState<ProjectResponsibilitiesState>({
    isOwnerOrAdmin: false,
    isLinkedOperator: false,
    responsibilities: [],
    operadorProjetoId: null,
    loading: true,
    error: null,
  });

  const fetchResponsibilities = useCallback(async () => {
    if (!user?.id || !projetoId) {
      setState(prev => ({
        ...prev,
        loading: false,
        isOwnerOrAdmin: false,
        isLinkedOperator: false,
        responsibilities: [],
        operadorProjetoId: null,
      }));
      return;
    }

    // System owner sempre tem todas as responsabilidades
    if (isSystemOwner) {
      setState({
        isOwnerOrAdmin: true,
        isLinkedOperator: false,
        responsibilities: Object.keys(PROJECT_RESPONSIBILITIES),
        operadorProjetoId: null,
        loading: false,
        error: null,
      });
      return;
    }

    // Owner e Admin sempre têm todas as responsabilidades (verificação local rápida)
    if (role === 'owner' || role === 'admin') {
      setState({
        isOwnerOrAdmin: true,
        isLinkedOperator: false,
        responsibilities: Object.keys(PROJECT_RESPONSIBILITIES),
        operadorProjetoId: null,
        loading: false,
        error: null,
      });
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase.rpc('get_user_project_responsibilities', {
        _user_id: user.id,
        _projeto_id: projetoId,
      });

      if (error) {
        console.error('[useProjectResponsibilities] Error:', error);
        setState(prev => ({
          ...prev,
          loading: false,
          error: error.message,
        }));
        return;
      }

      const result = data?.[0];
      
      if (result) {
        setState({
          isOwnerOrAdmin: result.is_owner_or_admin || false,
          isLinkedOperator: result.is_linked_operator || false,
          responsibilities: result.responsabilidades || [],
          operadorProjetoId: result.operador_projeto_id || null,
          loading: false,
          error: null,
        });
      } else {
        setState({
          isOwnerOrAdmin: false,
          isLinkedOperator: false,
          responsibilities: [],
          operadorProjetoId: null,
          loading: false,
          error: null,
        });
      }
    } catch (err: any) {
      console.error('[useProjectResponsibilities] Exception:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'Erro ao buscar responsabilidades',
      }));
    }
  }, [user?.id, projetoId, role, isSystemOwner]);

  useEffect(() => {
    fetchResponsibilities();
  }, [fetchResponsibilities]);

  const hasResponsibility = useCallback((responsibility: ProjectResponsibility): boolean => {
    // Owner, Admin e System Owner têm todas as responsabilidades
    if (state.isOwnerOrAdmin || isSystemOwner) {
      return true;
    }
    return state.responsibilities.includes(responsibility);
  }, [state.isOwnerOrAdmin, state.responsibilities, isSystemOwner]);

  // Computed values for common checks
  const canManageVinculos = useMemo(() => 
    hasResponsibility('GERENCIAR_VINCULOS'), 
    [hasResponsibility]
  );

  const canRegisterApostas = useMemo(() => 
    hasResponsibility('REGISTRAR_APOSTAS'), 
    [hasResponsibility]
  );

  const canManageBonus = useMemo(() => 
    hasResponsibility('GERENCIAR_BONUS'), 
    [hasResponsibility]
  );

  const canConciliarEntregas = useMemo(() => 
    hasResponsibility('CONCILIAR_ENTREGAS'), 
    [hasResponsibility]
  );

  const canRegisterPerdas = useMemo(() => 
    hasResponsibility('REGISTRAR_PERDAS'), 
    [hasResponsibility]
  );

  return {
    ...state,
    hasResponsibility,
    canManageVinculos,
    canRegisterApostas,
    canManageBonus,
    canConciliarEntregas,
    canRegisterPerdas,
    refresh: fetchResponsibilities,
  };
}
