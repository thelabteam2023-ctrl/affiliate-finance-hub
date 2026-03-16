import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * DESACOPLAMENTO CALENDÁRIO-FILTROS:
 * 
 * Hook dedicado para buscar apostas SEM filtro de data, 
 * exclusivamente para alimentar o calendário visual.
 * 
 * Usa useQuery com queryKey "calendar-apostas" para que
 * invalidateFinancialState() atualize automaticamente.
 */

interface CalendarApostaData {
  id: string;
  data_aposta: string;
  lucro_prejuizo: number | null;
  pl_consolidado: number | null;
  resultado: string | null;
  stake: number;
  stake_total: number | null;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  bookmaker_id: string | null;
  // Campos multi-moeda para consolidação correta
  moeda_operacao: string | null;
  stake_consolidado: number | null;
  lucro_prejuizo_brl_referencia: number | null;
  valor_brl_referencia: number | null;
  /** Número de operações (pernas) que esta aposta representa */
  operacoes: number;
}

interface UseCalendarApostasOptions {
  projetoId: string;
  /** Filtro de estratégia para abas específicas (SUREBET, VALUEBET, etc) */
  estrategia?: string | string[];
  /** Se true, busca automaticamente quando projetoId muda */
  autoFetch?: boolean;
}

async function fetchCalendarApostas(
  projetoId: string,
  estrategia?: string | string[]
): Promise<CalendarApostaData[]> {
  // Query base - SEM filtro de data
  let query = supabase
    .from("apostas_unificada")
    .select(`
      id, 
      data_aposta, 
      lucro_prejuizo, 
      pl_consolidado,
      resultado,
      stake,
      stake_total,
      bookmaker_id,
      moeda_operacao,
      stake_consolidado,
      lucro_prejuizo_brl_referencia,
      valor_brl_referencia
    `)
    .eq("projeto_id", projetoId)
    .eq("status", "LIQUIDADA")
    .is("cancelled_at", null)
    .order("data_aposta", { ascending: true });

  // Aplica filtro de estratégia se fornecido
  if (estrategia) {
    if (Array.isArray(estrategia)) {
      query = query.in("estrategia", estrategia);
    } else {
      query = query.eq("estrategia", estrategia);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const apostaIds = (data || []).map((a: any) => a.id);

  // Buscar contagem de pernas por aposta (para operações multi-casa/multi-entrada)
  let pernasCountMap: Record<string, number> = {};
  if (apostaIds.length > 0) {
    // Buscar em lotes de 200 para evitar limites de URL
    const batchSize = 200;
    for (let i = 0; i < apostaIds.length; i += batchSize) {
      const batch = apostaIds.slice(i, i + batchSize);
      const { data: pernas } = await supabase
        .from("apostas_pernas")
        .select("aposta_id")
        .in("aposta_id", batch);
      
      (pernas || []).forEach((p: any) => {
        pernasCountMap[p.aposta_id] = (pernasCountMap[p.aposta_id] || 0) + 1;
      });
    }
  }

  // Buscar nomes de bookmakers
  const bookmakerIds = [...new Set((data || []).map(a => a.bookmaker_id).filter(Boolean))] as string[];
  let bookmakerMap: Record<string, { nome: string; parceiro_nome: string | null }> = {};
  
  if (bookmakerIds.length > 0) {
    const { data: bookmakers } = await supabase
      .from("bookmakers")
      .select("id, nome, parceiros(nome)")
      .in("id", bookmakerIds);
    
    bookmakerMap = (bookmakers || []).reduce((acc: any, bk: any) => {
      acc[bk.id] = {
        nome: bk.nome,
        parceiro_nome: bk.parceiros?.nome || null,
      };
      return acc;
    }, {});
  }

  // Transformar dados
  return (data || []).map((item: any) => {
    const bkInfo = bookmakerMap[item.bookmaker_id] || { nome: '', parceiro_nome: null };
    // Regra institucional: se tem pernas, contar pernas; senão, 1 operação
    const pernasCount = pernasCountMap[item.id] || 0;
    const operacoes = pernasCount > 0 ? pernasCount : 1;
    return {
      id: item.id,
      data_aposta: item.data_aposta,
      lucro_prejuizo: item.lucro_prejuizo,
      pl_consolidado: item.pl_consolidado,
      resultado: item.resultado,
      stake: item.stake || 0,
      stake_total: item.stake_total,
      bookmaker_nome: bkInfo.nome,
      parceiro_nome: bkInfo.parceiro_nome,
      bookmaker_id: item.bookmaker_id,
      moeda_operacao: item.moeda_operacao,
      stake_consolidado: item.stake_consolidado,
      lucro_prejuizo_brl_referencia: item.lucro_prejuizo_brl_referencia,
      valor_brl_referencia: item.valor_brl_referencia,
      operacoes,
    };
  });
}

export function useCalendarApostas({
  projetoId,
  estrategia,
  autoFetch = true,
}: UseCalendarApostasOptions) {
  const estrategiaKey = Array.isArray(estrategia) ? estrategia.join(",") : estrategia || "all";

  const { data: apostas = [], isLoading: loading, refetch } = useQuery({
    queryKey: ["calendar-apostas", projetoId, estrategiaKey],
    queryFn: () => fetchCalendarApostas(projetoId, estrategia),
    enabled: autoFetch && !!projetoId,
    staleTime: 10 * 1000, // 10s - reativo após invalidação
    gcTime: 5 * 60 * 1000, // 5min no cache
  });

  return {
    apostas,
    loading,
    refetch,
  };
}

/**
 * Transforma apostas do calendário para o formato esperado pelo VisaoGeralCharts
 */
export function transformCalendarApostasForCharts(apostas: CalendarApostaData[]) {
  return apostas.map(a => ({
    data_aposta: a.data_aposta,
    lucro_prejuizo: a.lucro_prejuizo,
    stake: a.stake,
    stake_total: a.stake_total,
    bookmaker_nome: a.bookmaker_nome,
    parceiro_nome: a.parceiro_nome,
    bookmaker_id: a.bookmaker_id,
    // Campos multi-moeda para consolidação correta no VisaoGeralCharts
    pl_consolidado: a.pl_consolidado,
    moeda_operacao: a.moeda_operacao,
    stake_consolidado: a.stake_consolidado,
    lucro_prejuizo_brl_referencia: a.lucro_prejuizo_brl_referencia,
    valor_brl_referencia: a.valor_brl_referencia,
  }));
}
