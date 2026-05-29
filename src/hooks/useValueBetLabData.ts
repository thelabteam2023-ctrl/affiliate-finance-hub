import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startOfMonth, format, parseISO } from "date-fns";

export type Resultado = 'GREEN' | 'MEIO_GREEN' | 'MEIO_RED' | 'RED' | 'VOID';

export interface RawBet {
  id: string;
  data_aposta: string;
  esporte: string | null;
  mercado: string | null;
  odd: number | null;
  stake_consolidado: number | null;
  pl_consolidado: number | null;
  resultado: Resultado | null;
  evento: string | null;
  selecao: string | null;
  bookmaker_id: string | null;
}

export interface Metrics {
  total: number;
  validas: number;
  stake: number;
  profit: number;
  roi: number;
  winRate: number;
  greens: number;
  meioGreens: number;
  meioReds: number;
  reds: number;
  voids: number;
}

export interface MarketStats extends Metrics {
  name: string;
  oddRanges: Record<string, Metrics>;
}

export interface SportStats extends Metrics {
  name: string;
  markets: Record<string, MarketStats>;
}

export const ODD_RANGES = [
  { min: 1.50, max: 1.74, label: '1.50 - 1.74' },
  { min: 1.75, max: 1.99, label: '1.75 - 1.99' },
  { min: 2.00, max: 2.49, label: '2.00 - 2.49' },
  { min: 2.50, max: 2.99, label: '2.50 - 2.99' },
  { min: 3.00, max: 999, label: '3.00+' },
];

function getOddRange(odd: number | null): string {
  if (odd === null) return 'N/A';
  const range = ODD_RANGES.find(r => odd >= r.min && odd <= r.max);
  return range ? range.label : 'Outras';
}

function calculateMetrics(bets: RawBet[]): Metrics {
  const total = bets.length;
  const voids = bets.filter(b => b.resultado === 'VOID').length;
  const validas = total - voids;
  const stake = bets.reduce((acc, b) => acc + (b.stake_consolidado || 0), 0);
  const profit = bets.reduce((acc, b) => acc + (b.pl_consolidado || 0), 0);
  
  const greens = bets.filter(b => b.resultado === 'GREEN').length;
  const meioGreens = bets.filter(b => b.resultado === 'MEIO_GREEN').length;
  const meioReds = bets.filter(b => b.resultado === 'MEIO_RED').length;
  const reds = bets.filter(b => b.resultado === 'RED').length;

  const roi = stake > 0 ? (profit / stake) * 100 : 0;
  const winRate = validas > 0 ? ((greens + meioGreens * 0.5) / validas) * 100 : 0;

  return { total, validas, stake, profit, roi, winRate, greens, meioGreens, meioReds, reds, voids };
}

export function useValueBetLabData(projectIds: string[] | null, startDate: string | null, endDate: string | null) {
  const { workspaceId } = useAuth();

  const query = useQuery({
    queryKey: ["valuebet-lab-raw", projectIds, startDate, endDate, workspaceId],
    queryFn: async () => {
      let q = supabase
        .from("apostas_unificada")
        .select("id, data_aposta, esporte, mercado, odd, stake_consolidado, pl_consolidado, resultado, evento, selecao, bookmaker_id")
        .eq("workspace_id", workspaceId)
        .eq("estrategia", "VALUEBET")
        .order('data_aposta', { ascending: false });

      if (projectIds && projectIds.length > 0) {
        q = q.in("projeto_id", projectIds);
      }
      if (startDate) q = q.gte("data_aposta", startDate);
      if (endDate) q = q.lte("data_aposta", endDate);

      const { data, error } = await q;
      if (error) throw error;
      return data as RawBet[];
    },
    enabled: !!workspaceId,
  });

  const stats = useMemo(() => {
    if (!query.data) return null;

    const data = query.data;
    const globalMetrics = calculateMetrics(data);

    const sports: Record<string, SportStats> = {};

    data.forEach(bet => {
      // Normalização para evitar duplicidade por case ou nulos
      let sportName = bet.esporte || 'Indefinido';
      sportName = sportName.trim() === "" ? "Indefinido" : sportName.charAt(0).toUpperCase() + sportName.slice(1).toLowerCase();
      
      // Mapeamento de sinonimos ou erros comuns
      if (sportName === 'Soccer') sportName = 'Futebol';
      if (sportName === 'Efootball') sportName = 'E-sports';
      if (sportName === 'Counter-strike' || sportName === 'League of legends' || sportName === 'Valorant' || sportName === 'Dota 2') sportName = 'E-sports';

      let marketName = bet.mercado || 'Geral';
      marketName = marketName.trim() === "" ? "Geral" : marketName;
      
      const oddRange = getOddRange(bet.odd);

      if (!sports[sportName]) {
        sports[sportName] = { name: sportName, markets: {}, ...calculateMetrics([]) };
      }

      if (!sports[sportName].markets[marketName]) {
        sports[sportName].markets[marketName] = { name: marketName, oddRanges: {}, ...calculateMetrics([]) };
      }

      if (!sports[sportName].markets[marketName].oddRanges[oddRange]) {
        sports[sportName].markets[marketName].oddRanges[oddRange] = calculateMetrics([]);
      }
    });

    // Finalize metrics per hierarchy
    Object.keys(sports).forEach(sName => {
      const sportBets = data.filter(b => {
        let bSport = b.esporte || 'Indefinido';
        bSport = bSport.trim() === "" ? "Indefinido" : bSport.charAt(0).toUpperCase() + bSport.slice(1).toLowerCase();
        if (bSport === 'Soccer') bSport = 'Futebol';
        if (bSport === 'Efootball') bSport = 'E-sports';
        if (bSport === 'Counter-strike' || bSport === 'League of legends' || bSport === 'Valorant' || bSport === 'Dota 2') bSport = 'E-sports';
        return bSport === sName;
      });
      sports[sName] = { ...sports[sName], ...calculateMetrics(sportBets) };

      Object.keys(sports[sName].markets).forEach(mName => {
        const marketBets = sportBets.filter(b => {
          const bMarket = b.mercado ? (b.mercado.trim() === "" ? "Geral" : b.mercado) : 'Geral';
          return bMarket === mName;
        });
        sports[sName].markets[mName] = { ...sports[sName].markets[mName], ...calculateMetrics(marketBets) };

        Object.keys(sports[sName].markets[mName].oddRanges).forEach(oRange => {
          const rangeBets = marketBets.filter(b => getOddRange(b.odd) === oRange);
          sports[sName].markets[mName].oddRanges[oRange] = calculateMetrics(rangeBets);
        });
      });
    });

    // Evolution (Daily for "entry by entry" feeling but grouped by day)
    const evolution: Record<string, { date: string, profit: number, volume: number, bets: number }> = {};
    data.forEach(bet => {
      const dateKey = bet.data_aposta.split('T')[0];
      if (!evolution[dateKey]) {
        evolution[dateKey] = { date: dateKey, profit: 0, volume: 0, bets: 0 };
      }
      evolution[dateKey].profit += (bet.pl_consolidado || 0);
      evolution[dateKey].volume += (bet.stake_consolidado || 0);
      evolution[dateKey].bets += 1;
    });

    return {
      global: globalMetrics,
      sports,
      evolution: Object.values(evolution).sort((a, b) => a.date.localeCompare(b.date)),
      raw: data
    };
  }, [query.data]);

  return { ...query, stats };
}