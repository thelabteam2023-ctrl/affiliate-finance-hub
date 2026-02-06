import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * DESACOPLAMENTO CALENDÁRIO-FILTROS:
 * 
 * Hook dedicado para buscar apostas SEM filtro de data, 
 * exclusivamente para alimentar o calendário visual.
 * 
 * O calendário é um componente de NAVEGAÇÃO TEMPORAL,
 * não deve ser afetado pelos filtros analíticos.
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
}

interface UseCalendarApostasOptions {
  projetoId: string;
  /** Filtro de estratégia para abas específicas (SUREBET, VALUEBET, etc) */
  estrategia?: string | string[];
  /** Se true, busca automaticamente quando projetoId muda */
  autoFetch?: boolean;
}

export function useCalendarApostas({
  projetoId,
  estrategia,
  autoFetch = true,
}: UseCalendarApostasOptions) {
  const [apostas, setApostas] = useState<CalendarApostaData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchApostas = useCallback(async () => {
    if (!projetoId) return;
    
    try {
      setLoading(true);
      
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
          bookmaker_id
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
      const transformed: CalendarApostaData[] = (data || []).map((item: any) => {
        const bkInfo = bookmakerMap[item.bookmaker_id] || { nome: '', parceiro_nome: null };
        return {
          id: item.id,
          data_aposta: item.data_aposta,
          lucro_prejuizo: item.pl_consolidado ?? item.lucro_prejuizo,
          pl_consolidado: item.pl_consolidado,
          resultado: item.resultado,
          stake: item.stake || 0,
          stake_total: item.stake_total,
          bookmaker_nome: bkInfo.nome,
          parceiro_nome: bkInfo.parceiro_nome,
          bookmaker_id: item.bookmaker_id,
        };
      });

      setApostas(transformed);
    } catch (error) {
      console.error("[useCalendarApostas] Erro ao carregar:", error);
    } finally {
      setLoading(false);
    }
  }, [projetoId, estrategia]);

  // Auto-fetch quando projetoId muda
  useEffect(() => {
    if (autoFetch) {
      fetchApostas();
    }
  }, [fetchApostas, autoFetch]);

  return {
    apostas,
    loading,
    refetch: fetchApostas,
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
  }));
}
