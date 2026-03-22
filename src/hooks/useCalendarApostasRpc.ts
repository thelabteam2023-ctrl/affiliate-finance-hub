import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook que busca dados do calendário via RPC server-side,
 * eliminando truncamento de 1000 linhas e garantindo
 * timezone correto (America/Sao_Paulo).
 * 
 * Substitui useCalendarApostas (REST) para dados agregados diários.
 */

export interface CalendarDailyEntry {
  dia: string;   // YYYY-MM-DD (timezone São Paulo)
  lucro: number;
  qtd: number;   // operações (pernas para arbitragem, 1 para demais)
}

interface UseCalendarApostasRpcOptions {
  projetoId: string;
  estrategia?: string;
  autoFetch?: boolean;
  /** Cotação USD para conversão multimoeda — deve ser a mesma usada nos KPIs */
  cotacaoUSD?: number;
  /** Cotações adicionais em BRL para moedas além de USD/BRL (ex: EUR, GBP) */
  cotacoes?: Record<string, number>;
}

interface RpcResult {
  daily: CalendarDailyEntry[];
  total_apostas: number;
  greens: number;
  reds: number;
  voids: number;
  meio_greens: number;
  meio_reds: number;
  total_stake: number;
  lucro_apostas: number;
  lucro_cashback: number;
  lucro_giros: number;
  lucro_total: number;
  apostas_pendentes: number;
}

async function fetchCalendarRpc(
  projetoId: string,
  estrategia?: string,
   cotacaoUSD?: number,
   cotacoes?: Record<string, number>
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('get_projeto_apostas_resumo', {
    p_projeto_id: projetoId,
    ...(estrategia ? { p_estrategia: estrategia } : {}),
    ...(cotacaoUSD && cotacaoUSD > 0 ? { p_cotacao_usd: cotacaoUSD } : {}),
    ...(cotacoes && Object.keys(cotacoes).length > 0 ? { p_cotacoes: cotacoes } : {}),
  } as any);
  if (error) throw error;
  
  return data as unknown as RpcResult;
}

export function useCalendarApostasRpc({
  projetoId,
  estrategia,
  autoFetch = true,
  cotacaoUSD,
  cotacoes,
}: UseCalendarApostasRpcOptions) {
  const estrategiaKey = estrategia || "all";
  // Round cotacao to avoid unnecessary refetches from floating point noise
  const cotacaoKey = cotacaoUSD ? Math.round(cotacaoUSD * 100) : 0;
  const cotacoesKey = JSON.stringify(
    Object.entries(cotacoes || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moeda, valor]) => [moeda, Math.round(valor * 10000)])
  );

  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ["calendar-apostas-rpc", projetoId, estrategiaKey, cotacaoKey, cotacoesKey],
    queryFn: () => fetchCalendarRpc(projetoId, estrategia, cotacaoUSD, cotacoes),
    enabled: autoFetch && !!projetoId,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });

  return {
    daily: data?.daily ?? [],
    resumo: data ?? null,
    loading,
    refetch,
  };
}

/**
 * Transforma daily[] da RPC para o formato esperado pelo CalendarioLucros.
 * O CalendarioLucros recebe apostas individuais e agrupa internamente,
 * mas como a RPC já entrega agregado, passamos 1 entrada por dia
 * com lucro e operações já consolidados.
 */
export function transformRpcDailyForCalendar(daily: CalendarDailyEntry[]) {
  return daily.map(d => ({
    data_aposta: d.dia, // YYYY-MM-DD, extractLocalDateKey retorna o mesmo
    resultado: null as string | null,
    lucro_prejuizo: d.lucro,
    operacoes: d.qtd,
  }));
}

/**
 * Transforma daily[] da RPC para o formato ApostaBase esperado
 * pelo VisaoGeralCharts (apostasCalendario prop).
 */
export function transformRpcDailyForCharts(daily: CalendarDailyEntry[]) {
  return daily.map(d => ({
    data_aposta: d.dia,
    lucro_prejuizo: d.lucro,
    stake: 0,
    stake_total: null as number | null,
    bookmaker_nome: '',
    parceiro_nome: null as string | null,
    bookmaker_id: null as string | null,
    pl_consolidado: d.lucro,
    moeda_operacao: null as string | null,
    stake_consolidado: null as number | null,
    lucro_prejuizo_brl_referencia: null as number | null,
    valor_brl_referencia: null as number | null,
    operacoes: d.qtd,
  }));
}
