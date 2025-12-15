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
  
  // Métricas Proporcionais (novas)
  participacaoVolume: number; // % do volume total do projeto
  participacaoRisco: number; // % dos eventos de risco do projeto
  rankingVolume: number; // Posição no ranking de volume (1 = top)
  rankingLongevidade: number; // Posição no ranking de longevidade (1 = top)
  
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

// Contexto do projeto para cálculos proporcionais
// NOTA: diasProjetoAtivo removido pois tempo cronológico não representa risco/esforço real
export interface ProjetoContexto {
  volumeTotal: number;
  totalEventosRisco: number;
  totalCasas: number;
  qtdApostasTotal: number;
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
  const [projetoContexto, setProjetoContexto] = useState<ProjetoContexto | null>(null);

  useEffect(() => {
    if (projetoId) {
      fetchAnalises();
    }
  }, [projetoId, dataInicio, dataFim]);

  /**
   * NOVA LÓGICA: Score de Longevidade baseado em Ranking Relativo
   * 
   * Princípios:
   * 1. Participação proporcional no projeto (não valores absolutos)
   * 2. Ranking relativo entre casas (não média/desvio)
   * 3. Penalização progressiva por eventos de risco
   * 4. Tempo comportamental (limitou cedo vs tarde)
   */
  const calcularScoreLongevidadeRelativo = (
    casas: Array<{
      id: string;
      volumeTotal: number;
      eventosLimitacao: number;
      eventosBloqueio: number;
      diasAtivos: number;
      qtdApostas: number;
      statusAtual: string;
      primeiraAposta?: string | null;
    }>,
    contexto: ProjetoContexto
  ): Map<string, { 
    score: number; 
    classificacao: BookmakerAnalise["classificacaoLongevidade"]; 
    frequencia: BookmakerAnalise["frequenciaLimitacao"];
    participacaoVolume: number;
    participacaoRisco: number;
    rankingVolume: number;
    rankingLongevidade: number;
  }> => {
    const resultados = new Map<string, any>();
    
    // 1. Calcular métricas proporcionais para cada casa
    const casasComMetricas = casas.map(casa => {
      const totalEventos = casa.eventosLimitacao + casa.eventosBloqueio;
      
      // Participação no volume do projeto (%)
      const participacaoVolume = contexto.volumeTotal > 0 
        ? (casa.volumeTotal / contexto.volumeTotal) * 100 
        : 0;
      
      // Participação nos eventos de risco (% - quanto menor, melhor)
      const participacaoRisco = contexto.totalEventosRisco > 0 
        ? (totalEventos / contexto.totalEventosRisco) * 100 
        : 0;
      
      // Eficiência: volume girado por evento de risco (métrica ouro)
      // Quanto mais volume a casa aguenta antes de cada evento = melhor
      const volumePorRisco = totalEventos > 0 
        ? casa.volumeTotal / totalEventos 
        : casa.volumeTotal * 2; // Casa sem eventos = alta eficiência
      
      // Densidade de risco: eventos por volume (quanto menor, melhor)
      const densidadeRisco = casa.volumeTotal > 0 
        ? (totalEventos / casa.volumeTotal) * 10000 // Normalizar para escala útil
        : 0;
      
      // Volume por evento comparado à média do projeto (baseado em VOLUME, não tempo)
      const volumeMedioPorCasa = contexto.volumeTotal / Math.max(contexto.totalCasas, 1);
      const eficienciaVolumeRisco = volumeMedioPorCasa > 0
        ? Math.min(volumePorRisco / (volumeMedioPorCasa * 2), 1)
        : 1;
      
      return {
        ...casa,
        totalEventos,
        participacaoVolume,
        participacaoRisco,
        volumePorRisco,
        densidadeRisco,
        eficienciaVolumeRisco
      };
    });
    
    // 2. Criar rankings relativos
    // Ranking por volume (maior = melhor = posição 1)
    const rankingVolume = [...casasComMetricas]
      .sort((a, b) => b.volumeTotal - a.volumeTotal)
      .reduce((acc, casa, idx) => {
        acc.set(casa.id, idx + 1);
        return acc;
      }, new Map<string, number>());
    
    // Ranking por eficiência (volumePorRisco maior = melhor = posição 1)
    const rankingEficiencia = [...casasComMetricas]
      .sort((a, b) => b.volumePorRisco - a.volumePorRisco)
      .reduce((acc, casa, idx) => {
        acc.set(casa.id, idx + 1);
        return acc;
      }, new Map<string, number>());
    
    // 3. Calcular score final para cada casa
    const totalCasas = casas.length;
    
    casasComMetricas.forEach(casa => {
      // Se bloqueada = score 0 automático
      if (casa.statusAtual === "BLOQUEADA" || casa.statusAtual === "bloqueada") {
        resultados.set(casa.id, {
          score: 0,
          classificacao: "alto_risco" as const,
          frequencia: "muito_frequente" as const,
          participacaoVolume: casa.participacaoVolume,
          participacaoRisco: casa.participacaoRisco,
          rankingVolume: rankingVolume.get(casa.id) || totalCasas,
          rankingLongevidade: totalCasas
        });
        return;
      }
      
      const posRankingVolume = rankingVolume.get(casa.id) || totalCasas;
      const posRankingEficiencia = rankingEficiencia.get(casa.id) || totalCasas;
      
      // Componentes do score (total = 100):
      // NOTA: Não usamos tempo/dias ativos - apenas volume e eventos de risco
      
      // A) Ranking de Eficiência (45 pontos) - baseado em volume por evento
      // Top 25% = 45pts, próximos 25% = 35pts, próximos 25% = 22pts, bottom 25% = 10pts
      const percentilEficiencia = posRankingEficiencia / totalCasas;
      let scoreEficiencia: number;
      if (percentilEficiencia <= 0.25) scoreEficiencia = 45;
      else if (percentilEficiencia <= 0.50) scoreEficiencia = 35;
      else if (percentilEficiencia <= 0.75) scoreEficiencia = 22;
      else scoreEficiencia = 10;
      
      // B) Participação no Volume (25 pontos)
      // Proporcional: casa com 30% do volume = 25pts, 15% = 12.5pts, etc.
      const scoreParticipacao = Math.min((casa.participacaoVolume / 30) * 25, 25);
      
      // C) Volume por Evento de Risco (15 pontos) - substitui velocidade baseada em tempo
      // Quanto mais volume a casa aguentou por evento = melhor
      const scoreVolumeEvento = casa.eficienciaVolumeRisco * 15;
      
      // D) Penalização por Risco Concentrado (até -15 pontos)
      // Se casa concentra mais de 30% dos eventos de risco = penalidade máxima
      const penalizacaoRisco = Math.min((casa.participacaoRisco / 30) * 15, 15);
      
      // E) Penalização Progressiva por Quantidade de Eventos (-20 pontos max)
      // 1 evento = -3, 2 = -6, 3 = -10, 4+ = -15 a -20
      let penalizacaoEventos = 0;
      if (casa.totalEventos === 1) penalizacaoEventos = 3;
      else if (casa.totalEventos === 2) penalizacaoEventos = 6;
      else if (casa.totalEventos === 3) penalizacaoEventos = 10;
      else if (casa.totalEventos === 4) penalizacaoEventos = 15;
      else if (casa.totalEventos >= 5) penalizacaoEventos = 20;
      
      // F) Bônus para casa sem eventos (+15 pontos)
      const bonusSemEventos = casa.totalEventos === 0 ? 15 : 0;
      
      // G) Penalização extra se LIMITADA atualmente (-10 pontos)
      const penalizacaoStatusLimitada = 
        (casa.statusAtual === "LIMITADA" || casa.statusAtual === "limitada") ? 10 : 0;
      
      // Score final
      let scoreFinal = 
        scoreEficiencia + 
        scoreParticipacao + 
        scoreVolumeEvento + 
        bonusSemEventos -
        penalizacaoRisco - 
        penalizacaoEventos -
        penalizacaoStatusLimitada;
      
      // Normalizar entre 0-100
      scoreFinal = Math.max(0, Math.min(100, scoreFinal));
      
      // Determinar classificação
      let classificacao: BookmakerAnalise["classificacaoLongevidade"];
      if (scoreFinal >= 80) classificacao = "excelente";
      else if (scoreFinal >= 55) classificacao = "boa";
      else if (scoreFinal >= 30) classificacao = "limitada";
      else classificacao = "alto_risco";
      
      // Se está limitada atualmente, cap máximo é "limitada"
      if (casa.statusAtual === "LIMITADA" || casa.statusAtual === "limitada") {
        if (classificacao === "excelente" || classificacao === "boa") {
          classificacao = "limitada";
        }
      }
      
      // Determinar frequência de limitação
      let frequencia: BookmakerAnalise["frequenciaLimitacao"];
      if (casa.totalEventos === 0) frequencia = "rara";
      else if (casa.totalEventos === 1) frequencia = "moderada";
      else if (casa.totalEventos <= 3) frequencia = "frequente";
      else frequencia = "muito_frequente";
      
      // Ranking de longevidade = ranking de eficiência (já calculado)
      resultados.set(casa.id, {
        score: Math.round(scoreFinal),
        classificacao,
        frequencia,
        participacaoVolume: Math.round(casa.participacaoVolume * 10) / 10,
        participacaoRisco: Math.round(casa.participacaoRisco * 10) / 10,
        rankingVolume: posRankingVolume,
        rankingLongevidade: posRankingEficiencia
      });
    });
    
    return resultados;
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
        setProjetoContexto(null);
        return;
      }

      const bookmakerIds = bookmakers.map(b => b.id);

      // Query base para apostas
      let apostasQuery = supabase
        .from("apostas")
        .select("bookmaker_id, lucro_prejuizo, stake, status, data_aposta, surebet_id")
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

      // Buscar data de início do projeto
      const projetoQuery = supabase
        .from("projetos")
        .select("data_inicio")
        .eq("id", projetoId)
        .single();

      // Executar todas as queries
      const [
        apostasResult,
        apostasMultiplasResult,
        surebetsResult,
        perdasResult,
        depositosResult,
        saquesResult,
        ciclosResult,
        projetoResult
      ] = await Promise.all([
        apostasQuery,
        apostasMultiplasQuery,
        surebetsQuery,
        perdasQuery,
        depositosQuery,
        saquesQuery,
        ciclosQuery,
        projetoQuery
      ]);

      const apostas = apostasResult.data || [];
      const apostasMultiplas = apostasMultiplasResult.data || [];
      const surebets = surebetsResult.data || [];
      const perdas = perdasResult.data || [];
      const depositos = depositosResult.data || [];
      const saques = saquesResult.data || [];
      const ciclos = ciclosResult.data || [];
      const projeto = projetoResult.data;

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

      // Agregar apostas simples (EXCLUINDO apostas que fazem parte de surebets)
      // As apostas com surebet_id serão contadas na seção de surebets para evitar contagem dupla
      apostas.forEach(a => {
        if (bookmakerData[a.bookmaker_id]) {
          // Pular apostas que são pernas de surebet - serão contadas na seção de surebets
          const fazParteDesSurebet = (a as any).surebet_id != null;
          
          if (!fazParteDesSurebet) {
            if (a.status === "FINALIZADA" || a.status === "LIQUIDADA") {
              bookmakerData[a.bookmaker_id].lucro += Number(a.lucro_prejuizo || 0);
            }
            bookmakerData[a.bookmaker_id].volume += Number(a.stake || 0);
            bookmakerData[a.bookmaker_id].qtdApostas += 1;
          }
          
          // Rastrear datas (para todas as apostas, incluindo surebets)
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

      // Calcular contexto do projeto para cálculos proporcionais
      const volumeTotalProjeto = Object.values(bookmakerData).reduce((acc, d) => acc + d.volume, 0);
      const totalEventosRisco = Object.values(bookmakerData).reduce(
        (acc, d) => acc + d.eventosLimitacao + d.eventosBloqueio, 0
      );
      const qtdApostasTotalProjeto = Object.values(bookmakerData).reduce((acc, d) => acc + d.qtdApostas, 0);
      
      // NOTA: Removido cálculo de diasProjetoAtivo
      // Tempo cronológico não representa esforço, risco nem retorno real em apostas protegidas

      const contexto: ProjetoContexto = {
        volumeTotal: volumeTotalProjeto,
        totalEventosRisco,
        totalCasas: bookmakers.length,
        qtdApostasTotal: qtdApostasTotalProjeto
      };
      setProjetoContexto(contexto);

      // Preparar dados das casas para cálculo relativo
      const casasParaCalculo = bookmakers.map(b => {
        const data = bookmakerData[b.id];
        
        // Calcular dias ativos
        let diasAtivos = 0;
        if (data.primeiraAposta && data.ultimaAposta) {
          const diffTime = Math.abs(new Date(data.ultimaAposta).getTime() - new Date(data.primeiraAposta).getTime());
          diasAtivos = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        } else if (data.primeiraAposta) {
          const diffTime = Math.abs(new Date().getTime() - new Date(data.primeiraAposta).getTime());
          diasAtivos = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }

        return {
          id: b.id,
          volumeTotal: data.volume,
          eventosLimitacao: data.eventosLimitacao,
          eventosBloqueio: data.eventosBloqueio,
          diasAtivos,
          qtdApostas: data.qtdApostas,
          statusAtual: b.status,
          primeiraAposta: data.primeiraAposta
        };
      });

      // Calcular scores relativos
      const scoresRelativos = calcularScoreLongevidadeRelativo(casasParaCalculo, contexto);

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

        // Obter score calculado relativamente
        const scoreData = scoresRelativos.get(b.id) || {
          score: 50,
          classificacao: "limitada" as const,
          frequencia: "moderada" as const,
          participacaoVolume: 0,
          participacaoRisco: 0,
          rankingVolume: bookmakers.length,
          rankingLongevidade: bookmakers.length
        };

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
          
          // Novas métricas proporcionais
          participacaoVolume: scoreData.participacaoVolume,
          participacaoRisco: scoreData.participacaoRisco,
          rankingVolume: scoreData.rankingVolume,
          rankingLongevidade: scoreData.rankingLongevidade,
          
          scoreLongevidade: scoreData.score,
          classificacaoLongevidade: scoreData.classificacao,
          frequenciaLimitacao: scoreData.frequencia,
          
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

  return { analises, loading, lucroTotal, projetoContexto, refresh: fetchAnalises };
}
