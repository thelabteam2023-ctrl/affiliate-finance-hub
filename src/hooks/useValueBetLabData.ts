import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startOfMonth, format, parseISO } from "date-fns";
import { resolverMercado, MercadoNormalizado, TipoMercadoKey } from "@/utils/mercadoResolver";

export type Resultado = 'GREEN' | 'MEIO_GREEN' | 'MEIO_RED' | 'RED' | 'VOID';

export interface RawBet {
  id: string;
  data_aposta: string;
  esporte: string | null;
  mercado: string | null;
  tipo_mercado: string | null;
  sub_tipo_mercado: string | null;
  fair_odd: number | null;
  odd: number | null;
  stake_consolidado: number | null;
  pl_consolidado: number | null;
  valor_brl_referencia: number | null;
  stake_total: number | null;
  lucro_prejuizo: number | null;
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
  /** true se algum bet do grupo veio sem `sub_tipo_mercado` (inferido por Geração 1). */
  hasGeracao1?: boolean;
  /** true se algum bet veio com sub_tipo_mercado explícito (Geração 2). */
  hasGeracao2?: boolean;
  /** Apostas com fair_odd preenchida no grupo. */
  apostasComEdge?: number;
}

export interface TipoStats extends Metrics {
  /** chave canônica (`handicap` | `resultado` | `total` | `outro`). */
  tipo_key: TipoMercadoKey;
  /** label exibido ("Handicap", "Total", ...). */
  tipo: string;
  /** Sub-tipos pertencentes a este tipo, indexados pelo `label_completo`. */
  subTipos: Record<string, MarketStats>;
  hasGeracao1?: boolean;
  hasGeracao2?: boolean;
  apostasComEdge?: number;
}

export interface SportStats extends Metrics {
  name: string;
  markets: Record<string, MarketStats>;
  /** Nova estrutura por tipo (Geração 1+2). Indexada por `tipo_key`. */
  tipos: Record<TipoMercadoKey, TipoStats>;
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
  
  const stake = bets.reduce((acc, b) => {
    const val = b.stake_consolidado ?? b.valor_brl_referencia ?? b.stake_total ?? 0;
    return acc + Number(val);
  }, 0);
  
  const profit = bets.reduce((acc, b) => {
    const val = b.pl_consolidado ?? b.lucro_prejuizo ?? 0;
    return acc + Number(val);
  }, 0);
  
  const greens = bets.filter(b => b.resultado === 'GREEN').length;
  const meioGreens = bets.filter(b => b.resultado === 'MEIO_GREEN').length;
  const meioReds = bets.filter(b => b.resultado === 'MEIO_RED').length;
  const reds = bets.filter(b => b.resultado === 'RED').length;

  const roi = stake > 0 ? (profit / stake) * 100 : 0;
  const winRate = validas > 0 ? ((greens + meioGreens * 0.5) / validas) * 100 : 0;

  return { total, validas, stake, profit, roi, winRate, greens, meioGreens, meioReds, reds, voids };
}

export function useValueBetLabData(projectIds: string[] | null, startDate: string | null, endDate: string | null, selectedSport: string | null = null) {
  const { workspaceId } = useAuth();

  const query = useQuery({
    queryKey: ["valuebet-lab-raw", projectIds, startDate, endDate, workspaceId, selectedSport],
    queryFn: async () => {
      if (!workspaceId) return { bets: [] as RawBet[], totalInDb: 0 };

      // 1. Obter o COUNT total para os filtros selecionados
      let countQuery = supabase
        .from("apostas_unificada")
        .select("*", { count: 'exact', head: true })
        .eq("workspace_id", workspaceId)
        .eq("estrategia", "VALUEBET");

      if (projectIds && projectIds.length > 0) {
        countQuery = countQuery.in("projeto_id", projectIds);
      }
      if (startDate) countQuery = countQuery.gte("data_aposta", startDate);
      if (endDate) countQuery = countQuery.lte("data_aposta", endDate);

      const { count: totalCount, error: countError } = await countQuery;
      if (countError) throw countError;

      const total = totalCount || 0;
      if (total === 0) return { bets: [], totalInDb: 0 };

      // Limite de segurança de 15.000 como solicitado
      const safeTotal = Math.min(total, 15000);
      const pageSize = 1000;
      const pages = Math.ceil(safeTotal / pageSize);

      // 2. Carregamento paralelo em chunks de 1000
      const promises = Array.from({ length: pages }, (_, i) => {
        const from = i * pageSize;
        const to = Math.min((i + 1) * pageSize - 1, safeTotal - 1);

        let q = supabase
          .from("apostas_unificada")
          .select("id, data_aposta, esporte, mercado, tipo_mercado, sub_tipo_mercado, fair_odd, odd, stake_consolidado, pl_consolidado, valor_brl_referencia, stake_total, lucro_prejuizo, resultado, evento, selecao, bookmaker_id")
          .eq("workspace_id", workspaceId)
          .eq("estrategia", "VALUEBET")
          .order('data_aposta', { ascending: false })
          .range(from, to);

        if (projectIds && projectIds.length > 0) {
          q = q.in("projeto_id", projectIds);
        }
        if (startDate) q = q.gte("data_aposta", startDate);
        if (endDate) q = q.lte("data_aposta", endDate);

        return q;
      });

      const results = await Promise.all(promises);
      const allData: RawBet[] = [];

      results.forEach(({ data, error }, index) => {
        if (error) throw error;
        if (data) allData.push(...(data as RawBet[]));
      });

      // 3. Validação de integridade
      if (allData.length < safeTotal) {
        console.error(`ATENÇÃO: carregadas ${allData.length} apostas de ${safeTotal} esperadas (Total no banco: ${total})`);
      } else {
        console.log(`Sucesso: ${allData.length} apostas carregadas corretamente.`);
      }

      return { bets: allData, totalInDb: total };
    },
    enabled: !!workspaceId && !!projectIds && projectIds.length > 0,
  });

  const stats = useMemo(() => {
    if (!query.data) return null;

    const data = query.data.bets;
    const globalMetrics = calculateMetrics(data);


    const sports: Record<string, SportStats> = {};

    data.forEach(bet => {
      // Normalização para evitar duplicidade por case ou nulos
      let rawSport = bet.esporte || 'Outros';
      let sportName = rawSport.trim() === "" ? "Outros" : rawSport.charAt(0).toUpperCase() + rawSport.slice(1).toLowerCase();

      
      // Mapeamento de sinonimos ou erros comuns
      if (sportName.toLowerCase() === 'soccer') sportName = 'Futebol';
      if (sportName.toLowerCase() === 'efootball') sportName = 'E-sports';
      if (['counter-strike', 'league of legends', 'valorant', 'dota 2'].includes(sportName.toLowerCase())) sportName = 'E-sports';
      if (sportName.toLowerCase() === 'hockey') sportName = 'Hóquei';
      if (sportName.toLowerCase() === 'basketball') sportName = 'Basquete';
      if (sportName.toLowerCase() === 'tennis') sportName = 'Tênis';
      if (sportName.toLowerCase() === 'volleyball') sportName = 'Vôlei';

      // Usa o nome canônico do MercadoResolver para agrupar (evita fragmentação
      // tipo "GOLS", "Draw No Bet", "Vencedor" como entradas separadas).
      const marketName = resolverMercado(bet).label_completo || "Geral";

      const oddRange = getOddRange(bet.odd);

      if (!sports[sportName]) {
        sports[sportName] = {
          name: sportName,
          markets: {},
          tipos: {} as Record<TipoMercadoKey, TipoStats>,
          ...calculateMetrics([]),
        };
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
        let rawSport = b.esporte || 'Outros';
        let bSport = rawSport.trim() === "" ? "Outros" : rawSport.charAt(0).toUpperCase() + rawSport.slice(1).toLowerCase();

        if (bSport.toLowerCase() === 'soccer') bSport = 'Futebol';
        if (bSport.toLowerCase() === 'efootball') bSport = 'E-sports';
        if (['counter-strike', 'league of legends', 'valorant', 'dota 2'].includes(bSport.toLowerCase())) bSport = 'E-sports';
        if (bSport.toLowerCase() === 'hockey') bSport = 'Hóquei';
        if (bSport.toLowerCase() === 'basketball') bSport = 'Basquete';
        if (bSport.toLowerCase() === 'tennis') bSport = 'Tênis';
        if (bSport.toLowerCase() === 'volleyball') bSport = 'Vôlei';
        return bSport === sName;
      });
      sports[sName] = { ...sports[sName], ...calculateMetrics(sportBets) };

      Object.keys(sports[sName].markets).forEach(mName => {
        const marketBets = sportBets.filter(b => {
          const bMarket = resolverMercado(b).label_completo || "Geral";
          return bMarket === mName;
        });
        sports[sName].markets[mName] = { ...sports[sName].markets[mName], ...calculateMetrics(marketBets) };

        Object.keys(sports[sName].markets[mName].oddRanges).forEach(oRange => {
          const rangeBets = marketBets.filter(b => getOddRange(b.odd) === oRange);
          sports[sName].markets[mName].oddRanges[oRange] = calculateMetrics(rangeBets);
        });
      });

      // --- NOVA HIERARQUIA: por TIPO → SUB_TIPO (via MercadoResolver) ---
      const tipos: Record<TipoMercadoKey, TipoStats> = {} as any;
      sportBets.forEach((b) => {
        const resolved = resolverMercado(b);
        const tk = resolved.tipo_key;
        if (!tipos[tk]) {
          tipos[tk] = {
            tipo_key: tk,
            tipo: resolved.tipo,
            subTipos: {},
            hasGeracao1: false,
            hasGeracao2: false,
            apostasComEdge: 0,
            ...calculateMetrics([]),
          };
        }
        const subKey = resolved.label_completo;
        if (!tipos[tk].subTipos[subKey]) {
          tipos[tk].subTipos[subKey] = {
            name: subKey,
            oddRanges: {},
            hasGeracao1: false,
            hasGeracao2: false,
            apostasComEdge: 0,
            ...calculateMetrics([]),
          };
        }
        if (resolved.geracao === 1) {
          tipos[tk].hasGeracao1 = true;
          tipos[tk].subTipos[subKey].hasGeracao1 = true;
        } else {
          tipos[tk].hasGeracao2 = true;
          tipos[tk].subTipos[subKey].hasGeracao2 = true;
        }
        if (b.fair_odd !== null && b.fair_odd !== undefined && Number(b.fair_odd) > 1) {
          tipos[tk].apostasComEdge = (tipos[tk].apostasComEdge ?? 0) + 1;
          tipos[tk].subTipos[subKey].apostasComEdge =
            (tipos[tk].subTipos[subKey].apostasComEdge ?? 0) + 1;
        }
      });
      // Calcular métricas agregadas para cada tipo e sub-tipo
      Object.keys(tipos).forEach((tk) => {
        const tKey = tk as TipoMercadoKey;
        const tipoBets = sportBets.filter((b) => resolverMercado(b).tipo_key === tKey);
        const tipoMetrics = calculateMetrics(tipoBets);
        tipos[tKey] = { ...tipos[tKey], ...tipoMetrics };
        Object.keys(tipos[tKey].subTipos).forEach((subKey) => {
          const subBets = tipoBets.filter((b) => resolverMercado(b).label_completo === subKey);
          const subMetrics = calculateMetrics(subBets);
          tipos[tKey].subTipos[subKey] = { ...tipos[tKey].subTipos[subKey], ...subMetrics };
        });
      });
      sports[sName].tipos = tipos;
    });

    // Evolution (Daily for "entry by entry" feeling but grouped by day)
    // Now responding to selected sport
    const evolution: Record<string, { date: string, profit: number, volume: number, bets: number }> = {};
    const evolutionData = selectedSport 
      ? data.filter(b => {
          let rawSport = b.esporte || 'Outros';
          let bSport = rawSport.trim() === "" ? "Outros" : rawSport.charAt(0).toUpperCase() + rawSport.slice(1).toLowerCase();

          if (bSport.toLowerCase() === 'soccer') bSport = 'Futebol';
          if (bSport.toLowerCase() === 'efootball') bSport = 'E-sports';
          if (['counter-strike', 'league of legends', 'valorant', 'dota 2'].includes(bSport.toLowerCase())) bSport = 'E-sports';
          if (bSport.toLowerCase() === 'hockey') bSport = 'Hóquei';
          if (bSport.toLowerCase() === 'basketball') bSport = 'Basquete';
          if (bSport.toLowerCase() === 'tennis') bSport = 'Tênis';
          if (bSport.toLowerCase() === 'volleyball') bSport = 'Vôlei';
          return bSport === selectedSport;
        })
      : data;

    evolutionData.forEach(bet => {
      const dateKey = bet.data_aposta.split('T')[0];
      if (!evolution[dateKey]) {
        evolution[dateKey] = { date: dateKey, profit: 0, volume: 0, bets: 0 };
      }
      evolution[dateKey].profit += (bet.pl_consolidado ?? bet.lucro_prejuizo ?? 0);
      evolution[dateKey].volume += (bet.stake_consolidado ?? bet.valor_brl_referencia ?? bet.stake_total ?? 0);
      evolution[dateKey].bets += 1;
    });

    const evolutionArray = Object.values(evolution).sort((a, b) => a.date.localeCompare(b.date));

    // Entry by entry evolution (cumulative profit)
    let cumulative = 0;
    const evolutionByEntry = evolutionData
      .sort((a, b) => a.data_aposta.localeCompare(b.data_aposta))
      .map((bet, index) => {
        cumulative += (bet.pl_consolidado ?? bet.lucro_prejuizo ?? 0);
        return {
          index,
          profit: (bet.pl_consolidado ?? bet.lucro_prejuizo ?? 0),
          cumulative,
          date: bet.data_aposta,
          label: `${format(parseISO(bet.data_aposta), "dd/MM")}`
        };
      });

    return {
      global: globalMetrics,
      sports,
      evolution: evolutionArray,
      evolutionByEntry,
      raw: data,
      totalInDb: query.data.totalInDb
    };
  }, [query.data]);


  return { ...query, stats };
}