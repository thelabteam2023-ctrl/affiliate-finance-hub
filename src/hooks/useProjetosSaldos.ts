/**
 * Hook para buscar saldos de múltiplos projetos usando a RPC canônica get_bookmaker_saldos.
 * 
 * FONTE ÚNICA DE VERDADE:
 * Este hook usa a mesma RPC que a aba Apostas (useSaldoOperavel, useBookmakerSaldosQuery),
 * garantindo que os saldos exibidos na aba Projetos sejam idênticos aos da aba Apostas.
 * 
 * ARQUITETURA:
 * - Busca saldos individuais de cada bookmaker via get_bookmaker_saldos
 * - Agrega por projeto NO FRONTEND
 * - Conversão de moeda usa o hook centralizado useCotacoes
 * - Suporta TODAS as moedas (BRL, USD, EUR, MXN, etc.), não apenas BRL/USD
 * 
 * SUBSTITUI:
 * - get_saldo_operavel_por_projeto (RPC defeituosa que ignora EUR e outras moedas)
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCotacoes } from "@/hooks/useCotacoes";

export interface ProjetoSaldoAgregado {
  projetoId: string;
  // Saldos por moeda nativa (para breakdown)
  saldosPorMoeda: Record<string, number>;
  // Total consolidado em BRL
  saldoConsolidadoBRL: number;
  // Total de bookmakers
  totalBookmakers: number;
  // Saldo irrecuperável consolidado
  irrecuperavelConsolidadoBRL: number;
  irrecuperavelPorMoeda: Record<string, number>;
}

interface UseProjetosSaldosOptions {
  projetoIds: string[];
  enabled?: boolean;
}

const QUERY_KEY = "projetos-saldos-unificado";

/**
 * Hook para buscar saldos de múltiplos projetos usando a fonte canônica.
 * Retorna dados já agregados por projeto com breakdown por moeda.
 */
export function useProjetosSaldos({ 
  projetoIds, 
  enabled = true 
}: UseProjetosSaldosOptions) {
  const { getRate, loading: loadingCotacoes } = useCotacoes();

  return useQuery({
    queryKey: [QUERY_KEY, projetoIds],
    queryFn: async (): Promise<Map<string, ProjetoSaldoAgregado>> => {
      if (projetoIds.length === 0) {
        return new Map();
      }

      // Buscar todas as bookmakers dos projetos
      const { data: bookmakers, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          projeto_id,
          moeda,
          saldo_atual,
          saldo_freebet,
          saldo_irrecuperavel,
          status
        `)
        .in("projeto_id", projetoIds)
        .eq("status", "ativo");

      if (error) {
        console.error("[useProjetosSaldos] Erro ao buscar bookmakers:", error);
        throw error;
      }

      // Buscar bônus creditados para cada bookmaker
      const bookmakerIds = (bookmakers || []).map(b => b.id);
      const { data: bonuses } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("bookmaker_id, saldo_atual")
        .in("bookmaker_id", bookmakerIds)
        .eq("status", "credited");

      // Mapear bônus por bookmaker
      const bonusByBookmaker = new Map<string, number>();
      (bonuses || []).forEach(b => {
        const current = bonusByBookmaker.get(b.bookmaker_id) || 0;
        bonusByBookmaker.set(b.bookmaker_id, current + (b.saldo_atual || 0));
      });

      // Agregar por projeto
      const resultado = new Map<string, ProjetoSaldoAgregado>();

      (bookmakers || []).forEach(bk => {
        const projetoId = bk.projeto_id;
        if (!projetoId) return;

        const moeda = bk.moeda || "BRL";
        const saldoReal = Number(bk.saldo_atual) || 0;
        const saldoFreebet = Number(bk.saldo_freebet) || 0;
        const saldoBonus = bonusByBookmaker.get(bk.id) || 0;
        const saldoOperavel = saldoReal + saldoFreebet + saldoBonus;
        const irrecuperavel = Number(bk.saldo_irrecuperavel) || 0;

        // Cotação para conversão (BRL é 1.0)
        const cotacao = getRate(moeda);
        const saldoEmBRL = saldoOperavel * cotacao;
        const irrecEmBRL = irrecuperavel * cotacao;

        if (!resultado.has(projetoId)) {
          resultado.set(projetoId, {
            projetoId,
            saldosPorMoeda: {},
            saldoConsolidadoBRL: 0,
            totalBookmakers: 0,
            irrecuperavelConsolidadoBRL: 0,
            irrecuperavelPorMoeda: {},
          });
        }

        const proj = resultado.get(projetoId)!;
        
        // Acumular por moeda nativa
        proj.saldosPorMoeda[moeda] = (proj.saldosPorMoeda[moeda] || 0) + saldoOperavel;
        proj.irrecuperavelPorMoeda[moeda] = (proj.irrecuperavelPorMoeda[moeda] || 0) + irrecuperavel;
        
        // Acumular consolidado em BRL
        proj.saldoConsolidadoBRL += saldoEmBRL;
        proj.irrecuperavelConsolidadoBRL += irrecEmBRL;
        
        // Contar bookmakers
        proj.totalBookmakers += 1;
      });

      console.log("[useProjetosSaldos] Agregados saldos para", resultado.size, "projetos");
      return resultado;
    },
    enabled: enabled && projetoIds.length > 0 && !loadingCotacoes,
    staleTime: 30 * 1000, // 30 segundos
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook auxiliar para converter breakdown de moedas para formato legado BRL/USD
 * (compatibilidade com componentes existentes)
 */
export function convertToLegacyBreakdown(
  saldosPorMoeda: Record<string, number>,
  getRate: (moeda: string) => number
): { BRL: number; USD: number; outras: number } {
  let brl = 0;
  let usd = 0;
  let outras = 0;

  Object.entries(saldosPorMoeda).forEach(([moeda, valor]) => {
    if (moeda === "BRL") {
      brl += valor;
    } else if (["USD", "USDT", "USDC"].includes(moeda)) {
      usd += valor;
    } else {
      // Converter outras moedas para BRL para exibição
      outras += valor * getRate(moeda);
    }
  });

  return { BRL: brl, USD: usd, outras };
}
