import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BookmakerAnalise {
  bookmaker_id: string;
  bookmaker_nome: string;
  statusAtual: string;
  
  // Métricas de Volume
  volumeTotal: number;
  qtdApostas: number;
  
  // Métricas Financeiras (secundárias para contexto)
  lucro: number;
  roi: number;
  percentualLucroTotal: number;
  
  // Métricas de Longevidade (CORE)
  eventosLimitacao: number;
  eventosBloqueio: number;
  volumeAteLimitacao: number; // Volume médio por limitação - métrica ouro
  diasAtivos: number;
  apostasAteLimitacao: number; // Média de apostas até limitação
  
  // Classificação
  scoreLongevidade: number; // 0-100
  classificacaoLongevidade: "excelente" | "boa" | "limitada" | "alto_risco";
  frequenciaLimitacao: "rara" | "moderada" | "frequente" | "muito_frequente";
  
  // Histórico
  totalDepositado?: number;
  totalSacado?: number;
  ciclosParticipados?: number;
  primeiraAposta?: string;
  ultimaAposta?: string;
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

  const calcularScoreLongevidade = (
    volumeTotal: number,
    eventosLimitacao: number,
    eventosBloqueio: number,
    diasAtivos: number,
    qtdApostas: number,
    statusAtual: string
  ): { score: number; classificacao: BookmakerAnalise["classificacaoLongevidade"]; frequencia: BookmakerAnalise["frequenciaLimitacao"] } => {
    const totalEventos = eventosLimitacao + eventosBloqueio;
    
    // Se está bloqueada, score baixo
    if (statusAtual === "BLOQUEADA" || statusAtual === "bloqueada") {
      return { score: 0, classificacao: "alto_risco", frequencia: "muito_frequente" };
    }
    
    // Se está limitada atualmente
    if (statusAtual === "LIMITADA" || statusAtual === "limitada") {
      // Calcular baseado em quanto volume girou antes de limitar
      const volumeScore = Math.min(volumeTotal / 50000, 1) * 40; // Até 40 pts para 50k+ volume
      const tempoScore = Math.min(diasAtivos / 60, 1) * 30; // Até 30 pts para 60+ dias
      const apostasScore = Math.min(qtdApostas / 100, 1) * 30; // Até 30 pts para 100+ apostas
      
      const score = Math.max(0, Math.min(60, volumeScore + tempoScore + apostasScore)); // Max 60 se limitada
      
      return {
        score,
        classificacao: score > 40 ? "limitada" : "alto_risco",
        frequencia: totalEventos > 2 ? "muito_frequente" : totalEventos > 1 ? "frequente" : "moderada"
      };
    }
    
    // Casa ativa - calcular score completo
    if (totalEventos === 0) {
      // Nunca foi limitada - score alto baseado em volume e tempo
      const volumeScore = Math.min(volumeTotal / 30000, 1) * 35;
      const tempoScore = Math.min(diasAtivos / 45, 1) * 35;
      const apostasScore = Math.min(qtdApostas / 50, 1) * 30;
      
      const score = Math.min(100, 70 + volumeScore + tempoScore + apostasScore * 0.3);
      
      return {
        score,
        classificacao: score >= 90 ? "excelente" : "boa",
        frequencia: "rara"
      };
    }
    
    // Tem eventos mas ainda ativa - calcular volume médio por limitação
    const volumePorLimitacao = volumeTotal / totalEventos;
    const diasPorLimitacao = diasAtivos / totalEventos;
    
    // Score baseado em capacidade de absorção
    const capacidadeScore = Math.min(volumePorLimitacao / 20000, 1) * 40; // 40 pts para 20k+ por limitação
    const resilienciaScore = Math.min(diasPorLimitacao / 30, 1) * 30; // 30 pts para 30+ dias por limitação
    const volumeAbsolutoScore = Math.min(volumeTotal / 50000, 1) * 20; // 20 pts para volume alto
    const penalidade = Math.min(totalEventos * 5, 30); // Penalidade por cada evento
    
    const score = Math.max(0, capacidadeScore + resilienciaScore + volumeAbsolutoScore - penalidade);
    
    let classificacao: BookmakerAnalise["classificacaoLongevidade"];
    if (score >= 70) classificacao = "boa";
    else if (score >= 40) classificacao = "limitada";
    else classificacao = "alto_risco";
    
    let frequencia: BookmakerAnalise["frequenciaLimitacao"];
    if (totalEventos === 1) frequencia = "moderada";
    else if (totalEventos === 2) frequencia = "frequente";
    else frequencia = "muito_frequente";
    
    return { score, classificacao, frequencia };
  };

  const fetchAnalises = async () => {
    try {
      setLoading(true);

      // Buscar todas as bookmakers do projeto
      const { data: bookmakers, error: bkError } = await supabase
        .from("bookmakers")
        .select("id, nome, status, created_at")
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
        .select("bookmaker_id, lucro_prejuizo, stake, status, data_aposta")
        .eq("projeto_id", projetoId)
        .in("bookmaker_id", bookmakerIds);

      let apostasMultiplasQuery = supabase
        .from("apostas_multiplas")
        .select("bookmaker_id, lucro_prejuizo, stake, resultado, data_aposta")
        .eq("projeto_id", projetoId)
        .in("bookmaker_id", bookmakerIds);

      let surebetsQuery = supabase
        .from("surebets")
        .select("id, lucro_real, stake_total, status, data_operacao")
        .eq("projeto_id", projetoId);

      // Aplicar filtros de data se fornecidos
      if (dataInicio) {
        apostasQuery = apostasQuery.gte("data_aposta", dataInicio);
        apostasMultiplasQuery = apostasMultiplasQuery.gte("data_aposta", dataInicio);
        surebetsQuery = surebetsQuery.gte("data_operacao", dataInicio);
      }
      if (dataFim) {
        apostasQuery = apostasQuery.lte("data_aposta", dataFim);
        apostasMultiplasQuery = apostasMultiplasQuery.lte("data_aposta", dataFim);
        surebetsQuery = surebetsQuery.lte("data_operacao", dataFim);
      }

      // Buscar perdas operacionais (limitações/bloqueios)
      let perdasQuery = supabase
        .from("projeto_perdas")
        .select("bookmaker_id, categoria, status, data_registro")
        .eq("projeto_id", projetoId)
        .in("bookmaker_id", bookmakerIds);

      if (dataInicio) perdasQuery = perdasQuery.gte("data_registro", dataInicio);
      if (dataFim) perdasQuery = perdasQuery.lte("data_registro", dataFim);

      // Buscar dados financeiros
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

      // Buscar ciclos
      const ciclosQuery = supabase
        .from("projeto_ciclos")
        .select("id")
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
        primeiraAposta: string | null;
        ultimaAposta: string | null;
        datasPerdas: string[];
        volumeAntesLimitacao: number[];
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
          totalSacado: 0,
          primeiraAposta: null,
          ultimaAposta: null,
          datasPerdas: [],
          volumeAntesLimitacao: []
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
          
          // Rastrear datas
          const dataAposta = a.data_aposta;
          if (!bookmakerData[a.bookmaker_id].primeiraAposta || dataAposta < bookmakerData[a.bookmaker_id].primeiraAposta!) {
            bookmakerData[a.bookmaker_id].primeiraAposta = dataAposta;
          }
          if (!bookmakerData[a.bookmaker_id].ultimaAposta || dataAposta > bookmakerData[a.bookmaker_id].ultimaAposta!) {
            bookmakerData[a.bookmaker_id].ultimaAposta = dataAposta;
          }
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
          
          const dataAposta = a.data_aposta;
          if (!bookmakerData[a.bookmaker_id].primeiraAposta || dataAposta < bookmakerData[a.bookmaker_id].primeiraAposta!) {
            bookmakerData[a.bookmaker_id].primeiraAposta = dataAposta;
          }
          if (!bookmakerData[a.bookmaker_id].ultimaAposta || dataAposta > bookmakerData[a.bookmaker_id].ultimaAposta!) {
            bookmakerData[a.bookmaker_id].ultimaAposta = dataAposta;
          }
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

      // Agregar perdas operacionais e rastrear datas
      perdas.forEach(p => {
        if (bookmakerData[p.bookmaker_id] && p.status === "CONFIRMADA") {
          if (p.categoria === "CONTA_LIMITADA") {
            bookmakerData[p.bookmaker_id].eventosLimitacao += 1;
            bookmakerData[p.bookmaker_id].datasPerdas.push(p.data_registro);
          } else if (p.categoria === "SALDO_BLOQUEADO") {
            bookmakerData[p.bookmaker_id].eventosBloqueio += 1;
            bookmakerData[p.bookmaker_id].datasPerdas.push(p.data_registro);
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

        // Calcular dias ativos
        let diasAtivos = 0;
        if (data.primeiraAposta && data.ultimaAposta) {
          const diffTime = Math.abs(new Date(data.ultimaAposta).getTime() - new Date(data.primeiraAposta).getTime());
          diasAtivos = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        } else if (data.primeiraAposta) {
          const diffTime = Math.abs(new Date().getTime() - new Date(data.primeiraAposta).getTime());
          diasAtivos = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }

        const totalEventos = data.eventosLimitacao + data.eventosBloqueio;
        const volumeAteLimitacao = totalEventos > 0 ? data.volume / totalEventos : data.volume;
        const apostasAteLimitacao = totalEventos > 0 ? data.qtdApostas / totalEventos : data.qtdApostas;

        // Calcular score de longevidade
        const { score, classificacao, frequencia } = calcularScoreLongevidade(
          data.volume,
          data.eventosLimitacao,
          data.eventosBloqueio,
          diasAtivos,
          data.qtdApostas,
          b.status
        );

        return {
          bookmaker_id: b.id,
          bookmaker_nome: b.nome,
          statusAtual: b.status,
          
          volumeTotal: data.volume,
          qtdApostas: data.qtdApostas,
          
          lucro: data.lucro,
          roi,
          percentualLucroTotal: percentualLucro,
          
          eventosLimitacao: data.eventosLimitacao,
          eventosBloqueio: data.eventosBloqueio,
          volumeAteLimitacao,
          diasAtivos,
          apostasAteLimitacao,
          
          scoreLongevidade: score,
          classificacaoLongevidade: classificacao,
          frequenciaLimitacao: frequencia,
          
          totalDepositado: data.totalDepositado,
          totalSacado: data.totalSacado,
          ciclosParticipados: ciclos.length,
          primeiraAposta: data.primeiraAposta || undefined,
          ultimaAposta: data.ultimaAposta || undefined
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
