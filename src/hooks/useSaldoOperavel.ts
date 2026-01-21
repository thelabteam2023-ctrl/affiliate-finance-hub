import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

/**
 * Hook para calcular o Saldo Operável do projeto.
 * 
 * CONTRATO CANÔNICO (fonte: get_bookmaker_saldos RPC):
 * saldo_operavel = saldo_disponivel + saldo_freebet + saldo_bonus
 * 
 * Onde:
 * - saldo_disponivel = saldo_real - saldo_em_aposta
 * - saldo_real = bookmakers.saldo_atual
 * - saldo_freebet = bookmakers.saldo_freebet
 * - saldo_bonus = SUM(project_bookmaker_link_bonuses.saldo_atual) WHERE status='credited'
 * - saldo_em_aposta = SUM de stakes pendentes (SIMPLES/MULTIPLA: direto, ARBITRAGEM: pernas JSON)
 * 
 * REGRA FUNDAMENTAL:
 * - NÃO existe separação entre saldo real e bônus para fins operacionais
 * - Apostas pendentes BLOQUEIAM capital
 * - Este é o ÚNICO local onde o Saldo Operável global do projeto deve ser calculado.
 */

interface BookmakerSaldoCompleto {
  id: string;
  nome: string;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  parceiro_primeiro_nome: string | null;
  logo_url: string | null;
  saldo_real: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_em_aposta: number;
  saldo_disponivel: number;
  saldo_operavel: number;
  bonus_rollover_started: boolean;
}

interface RolloverAgregado {
  totalProgress: number;
  totalTarget: number;
  percentual: number;
  isComplete: boolean;
  hasActiveRollover: boolean;
  casasComRollover: number;
}

export function useSaldoOperavel(projetoId: string) {
  const { convertToConsolidation, moedaConsolidacao } = useProjetoCurrency(projetoId);

  // Usa a RPC canônica que já calcula corretamente todos os componentes do saldo
  const { data: bookmakers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["saldo-operavel-rpc", projetoId],
    queryFn: async () => {
      console.log("[useSaldoOperavel] Chamando RPC get_bookmaker_saldos para projeto:", projetoId);
      
      const { data, error } = await supabase
        .rpc("get_bookmaker_saldos", { p_projeto_id: projetoId });

      if (error) {
        console.error("[useSaldoOperavel] ERRO CRÍTICO na RPC get_bookmaker_saldos:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          projetoId
        });
        throw error;
      }
      
      console.log("[useSaldoOperavel] RPC retornou", data?.length || 0, "casas");
      return (data || []) as BookmakerSaldoCompleto[];
    },
    enabled: !!projetoId,
    staleTime: 10000, // 10 segundos
    retry: 2, // Retry até 2 vezes em caso de erro
  });

  // Query separada para rollover agregado do projeto
  const { data: rolloverData } = useQuery({
    queryKey: ["rollover-agregado", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("rollover_progress, rollover_target_amount, bookmaker_id")
        .eq("project_id", projetoId)
        .eq("status", "credited");

      if (error) {
        console.error("[useSaldoOperavel] Erro ao buscar rollover:", error);
        return null;
      }

      return data || [];
    },
    enabled: !!projetoId,
    staleTime: 10000,
  });

  // Saldo Operável = soma do saldo_operavel de todas as casas (já inclui real + freebet + bonus - em_aposta)
  const totals = useMemo(() => {
    let saldoOperavel = 0;
    let saldoReal = 0;
    let saldoBonus = 0;
    let saldoFreebet = 0;
    let saldoEmAposta = 0;

    bookmakers.forEach((bk) => {
      const moeda = bk.moeda || "BRL";
      
      // Converte cada componente para a moeda de consolidação
      saldoOperavel += convertToConsolidation(Number(bk.saldo_operavel) || 0, moeda);
      saldoReal += convertToConsolidation(Number(bk.saldo_real) || 0, moeda);
      saldoBonus += convertToConsolidation(Number(bk.saldo_bonus) || 0, moeda);
      saldoFreebet += convertToConsolidation(Number(bk.saldo_freebet) || 0, moeda);
      saldoEmAposta += convertToConsolidation(Number(bk.saldo_em_aposta) || 0, moeda);
    });

    return {
      saldoOperavel,
      saldoReal,
      saldoBonus,
      saldoFreebet,
      saldoEmAposta,
    };
  }, [bookmakers, convertToConsolidation]);

  // Calcular rollover agregado
  const rollover = useMemo<RolloverAgregado>(() => {
    if (!rolloverData || rolloverData.length === 0) {
      return {
        totalProgress: 0,
        totalTarget: 0,
        percentual: 0,
        isComplete: false,
        hasActiveRollover: false,
        casasComRollover: 0,
      };
    }

    let totalProgress = 0;
    let totalTarget = 0;
    const bookmakerIds = new Set<string>();

    rolloverData.forEach((bonus) => {
      const progress = Number(bonus.rollover_progress) || 0;
      const target = Number(bonus.rollover_target_amount) || 0;
      
      if (target > 0) {
        totalProgress += progress;
        totalTarget += target;
        if (bonus.bookmaker_id) {
          bookmakerIds.add(bonus.bookmaker_id);
        }
      }
    });

    const hasActiveRollover = totalTarget > 0;
    const percentual = hasActiveRollover ? Math.min(100, (totalProgress / totalTarget) * 100) : 0;
    const isComplete = hasActiveRollover && percentual >= 100;

    return {
      totalProgress,
      totalTarget,
      percentual,
      isComplete,
      hasActiveRollover,
      casasComRollover: bookmakerIds.size,
    };
  }, [rolloverData]);

  const totalCasas = bookmakers.length;

  // Lista de casas com saldo > 0 para o tooltip detalhado
  // Ordenadas por maior saldo operável
  const casasComSaldo = useMemo(() => {
    return bookmakers
      .map((bk) => {
        const moeda = bk.moeda || "BRL";
        // Converter todos os componentes para moeda de consolidação
        const saldoOperavel = convertToConsolidation(Number(bk.saldo_operavel) || 0, moeda);
        const saldoReal = convertToConsolidation(Number(bk.saldo_real) || 0, moeda);
        const saldoDisponivel = convertToConsolidation(Number(bk.saldo_disponivel) || 0, moeda);
        const saldoEmAposta = convertToConsolidation(Number(bk.saldo_em_aposta) || 0, moeda);
        const saldoFreebet = convertToConsolidation(Number(bk.saldo_freebet) || 0, moeda);
        const saldoBonus = convertToConsolidation(Number(bk.saldo_bonus) || 0, moeda);
        
        return {
          id: bk.id,
          nome: bk.nome,
          parceiroPrimeiroNome: bk.parceiro_primeiro_nome || "",
          parceiroNome: bk.parceiro_nome || "",
          saldoOperavel,
          saldoReal,           // Saldo total na casa (antes de descontar pendentes)
          saldoDisponivel,     // Saldo livre (real - em aposta)
          saldoEmAposta,       // Saldo comprometido em apostas pendentes
          saldoFreebet,
          saldoBonus,
          moedaOriginal: moeda,
          logoUrl: bk.logo_url,
        };
      })
      .filter((casa) => casa.saldoOperavel > 0 || casa.saldoEmAposta > 0)
      .sort((a, b) => b.saldoOperavel - a.saldoOperavel);
  }, [bookmakers, convertToConsolidation]);

  return {
    // Valor principal do KPI
    saldoOperavel: totals.saldoOperavel,
    
    // Componentes para breakdown/tooltip
    saldoReal: totals.saldoReal,
    saldoBonus: totals.saldoBonus,
    saldoFreebet: totals.saldoFreebet,
    saldoEmAposta: totals.saldoEmAposta,
    
    // Rollover agregado do projeto
    rollover,
    
    // Detalhamento por casa (para tooltip)
    casasComSaldo,
    
    // Metadata
    totalCasas,
    isLoading,
    isError,
    error,
    moedaConsolidacao,
    
    // Função para refetch manual
    refetch,
  };
}
