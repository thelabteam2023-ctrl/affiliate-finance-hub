import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BookmakerAnalise {
  bookmaker_id: string;
  bookmaker_nome: string;
  lucro: number;
  volume: number;
  qtdApostas: number;
  roi: number;
  percentualLucroTotal: number;
  eventosLimitacao: number;
  eventosBloqueio: number;
  statusAtual: string;
  // Histórico financeiro para vínculos
  totalDepositado?: number;
  totalSacado?: number;
  ciclosParticipados?: number;
}

interface UseBookmakerAnaliseParams {
  projetoId: string;
  dataInicio?: string;
  dataFim?: string;
}

export function useBookmakerAnalise({ projetoId, dataInicio, dataFim }: UseBookmakerAnaliseParams) {
  const [analises, setAnalises] = useState<BookmakerAnalise[]>([]);
  const [loading, setLoading] = useState(true);
  const [lucroTotal, setLucroTotal] = useState(0);

  useEffect(() => {
    if (projetoId) {
      fetchAnalises();
    }
  }, [projetoId, dataInicio, dataFim]);

  const fetchAnalises = async () => {
    try {
      setLoading(true);

      // Buscar todas as bookmakers do projeto
      const { data: bookmakers, error: bkError } = await supabase
        .from("bookmakers")
        .select("id, nome, status")
        .eq("projeto_id", projetoId);

      if (bkError) throw bkError;
      if (!bookmakers || bookmakers.length === 0) {
        setAnalises([]);
        setLucroTotal(0);
        return;
      }

      const bookmakerIds = bookmakers.map(b => b.id);

      // Query base para apostas
      let apostasQuery = supabase
        .from("apostas")
        .select("bookmaker_id, lucro_prejuizo, stake, status")
        .eq("projeto_id", projetoId)
        .in("bookmaker_id", bookmakerIds);

      let apostasMultiplasQuery = supabase
        .from("apostas_multiplas")
        .select("bookmaker_id, lucro_prejuizo, stake, resultado")
        .eq("projeto_id", projetoId)
        .in("bookmaker_id", bookmakerIds);

      let surebetsQuery = supabase
        .from("surebets")
        .select("id, lucro_real, stake_total, status")
        .eq("projeto_id", projetoId);

      // Aplicar filtros de data se fornecidos
      if (dataInicio) {
        apostasQuery = apostasQuery.gte("data_aposta", dataInicio);
        apostasMultiplasQuery = apostasMultiplasQuery.gte("data_aposta", dataInicio);
        surebetsQuery = surebetsQuery.gte("data_evento", dataInicio);
      }
      if (dataFim) {
        apostasQuery = apostasQuery.lte("data_aposta", dataFim);
        apostasMultiplasQuery = apostasMultiplasQuery.lte("data_aposta", dataFim);
        surebetsQuery = surebetsQuery.lte("data_evento", dataFim);
      }

      // Buscar perdas operacionais (limitações/bloqueios)
      let perdasQuery = supabase
        .from("projeto_perdas")
        .select("bookmaker_id, categoria, status")
        .eq("projeto_id", projetoId)
        .in("bookmaker_id", bookmakerIds);

      if (dataInicio) perdasQuery = perdasQuery.gte("data_registro", dataInicio);
      if (dataFim) perdasQuery = perdasQuery.lte("data_registro", dataFim);

      // Buscar dados financeiros (depósitos/saques)
      const depositosQuery = supabase
        .from("cash_ledger")
        .select("destino_bookmaker_id, valor")
        .eq("tipo_transacao", "DEPOSITO")
        .eq("status", "CONFIRMADO")
        .in("destino_bookmaker_id", bookmakerIds);

      const saquesQuery = supabase
        .from("cash_ledger")
        .select("origem_bookmaker_id, valor")
        .eq("tipo_transacao", "SAQUE")
        .eq("status", "CONFIRMADO")
        .in("origem_bookmaker_id", bookmakerIds);

      // Buscar ciclos participados
      const ciclosQuery = supabase
        .from("projeto_ciclos")
        .select("id, data_inicio, data_fim_prevista, data_fim_real")
        .eq("projeto_id", projetoId);

      // Executar todas as queries
      const [
        apostasResult,
        apostasMultiplasResult,
        surebetsResult,
        perdasResult,
        depositosResult,
        saquesResult,
        ciclosResult
      ] = await Promise.all([
        apostasQuery,
        apostasMultiplasQuery,
        surebetsQuery,
        perdasQuery,
        depositosQuery,
        saquesQuery,
        ciclosQuery
      ]);

      const apostas = apostasResult.data || [];
      const apostasMultiplas = apostasMultiplasResult.data || [];
      const surebets = surebetsResult.data || [];
      const perdas = perdasResult.data || [];
      const depositos = depositosResult.data || [];
      const saques = saquesResult.data || [];
      const ciclos = ciclosResult.data || [];

      // Buscar pernas de surebet para mapear bookmaker
      const { data: surebetPernas } = await supabase
        .from("apostas")
        .select("bookmaker_id, surebet_id, stake")
        .eq("projeto_id", projetoId)
        .not("surebet_id", "is", null)
        .in("bookmaker_id", bookmakerIds);

      // Mapear surebets para bookmakers
      const surebetLucroMap: Record<string, number> = {};
      const surebetStakeMap: Record<string, number> = {};
      surebets.forEach(s => {
        surebetLucroMap[s.id] = s.status === "LIQUIDADA" ? Number(s.lucro_real || 0) : 0;
        surebetStakeMap[s.id] = Number(s.stake_total || 0);
      });

      const surebetBookmakerMap: Record<string, Set<string>> = {};
      surebetPernas?.forEach(p => {
        if (p.surebet_id) {
          if (!surebetBookmakerMap[p.surebet_id]) {
            surebetBookmakerMap[p.surebet_id] = new Set();
          }
          surebetBookmakerMap[p.surebet_id].add(p.bookmaker_id);
        }
      });

      // Agregar dados por bookmaker
      const bookmakerData: Record<string, {
        lucro: number;
        volume: number;
        qtdApostas: number;
        eventosLimitacao: number;
        eventosBloqueio: number;
        totalDepositado: number;
        totalSacado: number;
      }> = {};

      // Inicializar
      bookmakers.forEach(b => {
        bookmakerData[b.id] = {
          lucro: 0,
          volume: 0,
          qtdApostas: 0,
          eventosLimitacao: 0,
          eventosBloqueio: 0,
          totalDepositado: 0,
          totalSacado: 0
        };
      });

      // Agregar apostas simples
      apostas.forEach(a => {
        if (bookmakerData[a.bookmaker_id]) {
          if (a.status === "FINALIZADA" || a.status === "LIQUIDADA") {
            bookmakerData[a.bookmaker_id].lucro += Number(a.lucro_prejuizo || 0);
          }
          bookmakerData[a.bookmaker_id].volume += Number(a.stake || 0);
          bookmakerData[a.bookmaker_id].qtdApostas += 1;
        }
      });

      // Agregar apostas múltiplas
      apostasMultiplas.forEach(a => {
        if (bookmakerData[a.bookmaker_id]) {
          if (["GREEN", "RED", "VOID", "MEIO_GREEN", "MEIO_RED"].includes(a.resultado || "")) {
            bookmakerData[a.bookmaker_id].lucro += Number(a.lucro_prejuizo || 0);
          }
          bookmakerData[a.bookmaker_id].volume += Number(a.stake || 0);
          bookmakerData[a.bookmaker_id].qtdApostas += 1;
        }
      });

      // Distribuir lucro de surebets proporcionalmente
      Object.entries(surebetBookmakerMap).forEach(([surebetId, bkSet]) => {
        const lucro = surebetLucroMap[surebetId] || 0;
        const stake = surebetStakeMap[surebetId] || 0;
        const lucroPorBk = lucro / bkSet.size;
        const stakePorBk = stake / bkSet.size;
        bkSet.forEach(bkId => {
          if (bookmakerData[bkId]) {
            bookmakerData[bkId].lucro += lucroPorBk;
            bookmakerData[bkId].volume += stakePorBk;
            bookmakerData[bkId].qtdApostas += 1;
          }
        });
      });

      // Agregar perdas operacionais
      perdas.forEach(p => {
        if (bookmakerData[p.bookmaker_id] && p.status === "CONFIRMADA") {
          if (p.categoria === "CONTA_LIMITADA") {
            bookmakerData[p.bookmaker_id].eventosLimitacao += 1;
          } else if (p.categoria === "SALDO_BLOQUEADO") {
            bookmakerData[p.bookmaker_id].eventosBloqueio += 1;
          }
        }
      });

      // Agregar depósitos
      depositos.forEach(d => {
        if (d.destino_bookmaker_id && bookmakerData[d.destino_bookmaker_id]) {
          bookmakerData[d.destino_bookmaker_id].totalDepositado += Number(d.valor);
        }
      });

      // Agregar saques
      saques.forEach(s => {
        if (s.origem_bookmaker_id && bookmakerData[s.origem_bookmaker_id]) {
          bookmakerData[s.origem_bookmaker_id].totalSacado += Number(s.valor);
        }
      });

      // Calcular lucro total
      const lucroTotalCalc = Object.values(bookmakerData).reduce((acc, d) => acc + d.lucro, 0);
      setLucroTotal(lucroTotalCalc);

      // Montar resultado final
      const result: BookmakerAnalise[] = bookmakers.map(b => {
        const data = bookmakerData[b.id];
        const roi = data.volume > 0 ? (data.lucro / data.volume) * 100 : 0;
        const percentualLucro = lucroTotalCalc !== 0 
          ? (data.lucro / Math.abs(lucroTotalCalc)) * 100 
          : 0;

        return {
          bookmaker_id: b.id,
          bookmaker_nome: b.nome,
          lucro: data.lucro,
          volume: data.volume,
          qtdApostas: data.qtdApostas,
          roi,
          percentualLucroTotal: percentualLucro,
          eventosLimitacao: data.eventosLimitacao,
          eventosBloqueio: data.eventosBloqueio,
          statusAtual: b.status,
          totalDepositado: data.totalDepositado,
          totalSacado: data.totalSacado,
          ciclosParticipados: ciclos.length // Simplificado
        };
      }).filter(a => a.qtdApostas > 0 || a.totalDepositado > 0);

      setAnalises(result);
    } catch (error: any) {
      console.error("Erro ao carregar análise por casa:", error.message);
    } finally {
      setLoading(false);
    }
  };

  return { analises, loading, lucroTotal, refresh: fetchAnalises };
}
