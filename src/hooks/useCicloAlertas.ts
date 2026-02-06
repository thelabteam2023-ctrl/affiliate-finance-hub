import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, parseISO } from "date-fns";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";

export interface AlertaCiclo {
  id: string;
  projeto_id: string;
  projeto_nome: string;
  numero_ciclo: number;
  tipo_gatilho: string;
  data_inicio: string;
  data_fim_prevista: string;
  meta_volume: number | null;
  valor_acumulado: number;
  metrica_acumuladora: string;
  // Calculated fields
  dias_restantes: number;
  dias_atraso: number;
  progresso_volume: number;
  urgencia: "CRITICA" | "ALTA" | "NORMAL";
  mensagem_tempo: string | null;
  mensagem_volume: string | null;
  motivo_alerta: "META_ATINGIDA" | "META_PROXIMA" | "TEMPO_VENCIDO" | "TEMPO_PROXIMO";
}

export function useCicloAlertas() {
  const [alertas, setAlertas] = useState<AlertaCiclo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlertas = async () => {
    try {
      setLoading(true);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // Fetch ciclos em andamento
      const { data: ciclos, error: ciclosError } = await supabase
        .from("projeto_ciclos")
        .select(`
          id,
          projeto_id,
          numero_ciclo,
          tipo_gatilho,
          data_inicio,
          data_fim_prevista,
          meta_volume,
          valor_acumulado,
          metrica_acumuladora,
          projeto:projetos(nome)
        `)
        .eq("status", "EM_ANDAMENTO");

      if (ciclosError) throw ciclosError;
      if (!ciclos || ciclos.length === 0) {
        setAlertas([]);
        return;
      }

      // Para cada ciclo, calcular valor_acumulado atual baseado em apostas reais
      const alertasCalculados: AlertaCiclo[] = [];

      for (const ciclo of ciclos) {
        // CRÍTICO: Converter datas do ciclo para UTC usando timezone operacional (America/Sao_Paulo)
        const dataInicioCiclo = parseISO(ciclo.data_inicio);
        const dataFimCiclo = parseISO(ciclo.data_fim_prevista);
        const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicioCiclo, dataFimCiclo);
        
        // Buscar todas as apostas do período from apostas_unificada
        const [apostasResult, cashbackResult, girosResult] = await Promise.all([
          supabase
            .from("apostas_unificada")
            .select("lucro_prejuizo, stake, stake_total, status, resultado, estrategia")
            .eq("projeto_id", ciclo.projeto_id)
            .gte("data_aposta", startUTC)
            .lte("data_aposta", endUTC),
          supabase
            .from("cashback_manual")
            .select("valor")
            .eq("projeto_id", ciclo.projeto_id)
            .gte("data_credito", ciclo.data_inicio)
            .lte("data_credito", ciclo.data_fim_prevista),
          supabase
            .from("giros_gratis")
            .select("valor_retorno")
            .eq("projeto_id", ciclo.projeto_id)
            .eq("status", "confirmado")
            .gte("data_registro", startUTC)
            .lte("data_registro", endUTC)
        ]);

        if (apostasResult.error) throw apostasResult.error;
        
        const allApostas = apostasResult.data || [];
        const cashbacks = cashbackResult.data || [];
        const giros = girosResult.data || [];
        
        // Separate by estrategia
        const apostasSimples = allApostas.filter(a => a.estrategia === "SIMPLES");
        const apostasMultiplas = allApostas.filter(a => a.estrategia === "MULTIPLA");
        const surebets = allApostas.filter(a => a.estrategia === "SUREBET");

        // Calcular volume total (todas as apostas, independente de status)
        const volumeTotal = 
          apostasSimples.reduce((acc, a) => acc + (a.stake || 0), 0) +
          apostasMultiplas.reduce((acc, a) => acc + (a.stake || 0), 0) +
          surebets.reduce((acc, a) => acc + (a.stake_total || 0), 0);

        // Calcular lucro realizado (apenas apostas finalizadas)
        const lucroApostas = 
          apostasSimples.filter(a => a.status === "LIQUIDADA").reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0) +
          apostasMultiplas.filter(a => ["GREEN", "RED", "VOID", "MEIO_GREEN", "MEIO_RED"].includes(a.resultado || "")).reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0) +
          surebets.filter(a => a.status === "LIQUIDADA").reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);

        // Calcular lucro de cashback (sempre positivo)
        const lucroCashback = cashbacks.reduce((acc, cb) => acc + Math.max(0, cb.valor || 0), 0);
        
        // Calcular lucro de giros grátis (sempre positivo)
        const lucroGiros = giros.reduce((acc, g) => acc + Math.max(0, (g as any).valor_retorno || 0), 0);
        
        // LUCRO TOTAL DO CICLO = apostas + cashback + giros
        const lucroTotal = lucroApostas + lucroCashback + lucroGiros;

        // Definir valor acumulado baseado na métrica (sem TURNOVER)
        let valorAcumuladoReal = 0;
        if (ciclo.metrica_acumuladora === "VOLUME_APOSTADO") {
          valorAcumuladoReal = volumeTotal;
        } else {
          // LUCRO é o padrão
          valorAcumuladoReal = lucroTotal;
        }

        // Calcular dias
        const dataFim = new Date(ciclo.data_fim_prevista);
        dataFim.setHours(0, 0, 0, 0);
        const diasRestantes = differenceInDays(dataFim, hoje);
        const diasAtraso = diasRestantes < 0 ? Math.abs(diasRestantes) : 0;

        // Calcular progresso de meta
        let progressoVolume = 0;
        if (ciclo.meta_volume && ciclo.meta_volume > 0) {
          progressoVolume = (valorAcumuladoReal / ciclo.meta_volume) * 100;
        }

        // Determinar se deve gerar alerta e qual o motivo
        let deveAlertar = false;
        let urgencia: "CRITICA" | "ALTA" | "NORMAL" = "NORMAL";
        let mensagemTempo: string | null = null;
        let mensagemVolume: string | null = null;
        let motivoAlerta: AlertaCiclo["motivo_alerta"] = "TEMPO_PROXIMO";

        // Gatilho TEMPO: sempre alerta por tempo
        // Gatilho META com data: alerta por tempo E por meta (dual trigger)
        // Gatilho META sem data: só alerta por meta
        const temDataLimite = ciclo.data_fim_prevista && ciclo.data_fim_prevista !== ciclo.data_inicio;
        
        if (ciclo.tipo_gatilho === "TEMPO" || (ciclo.tipo_gatilho === "META" && temDataLimite)) {
          if (diasAtraso > 0) {
            deveAlertar = true;
            urgencia = diasAtraso >= 3 ? "CRITICA" : "ALTA";
            mensagemTempo = `${diasAtraso} dia${diasAtraso > 1 ? "s" : ""} atrasado`;
            motivoAlerta = "TEMPO_VENCIDO";
          } else if (diasRestantes <= 2) {
            deveAlertar = true;
            urgencia = diasRestantes === 0 ? "ALTA" : "NORMAL";
            mensagemTempo = diasRestantes === 0 ? "Vence hoje" : `${diasRestantes} dia${diasRestantes > 1 ? "s" : ""} restante${diasRestantes > 1 ? "s" : ""}`;
            motivoAlerta = "TEMPO_PROXIMO";
          }
        }

        // Gatilho META: alertar quando atingir 90%+ da meta
        if (ciclo.tipo_gatilho === "META" && ciclo.meta_volume) {
          const metricaLabel = ciclo.metrica_acumuladora === "LUCRO" ? "Lucro" : "Volume";
          
          if (progressoVolume >= 100) {
            deveAlertar = true;
            urgencia = "CRITICA";
            mensagemVolume = `Meta de ${metricaLabel} atingida!`;
            motivoAlerta = "META_ATINGIDA";
          } else if (progressoVolume >= 90) {
            deveAlertar = true;
            if (urgencia !== "CRITICA") urgencia = "ALTA";
            mensagemVolume = `${progressoVolume.toFixed(0)}% da meta de ${metricaLabel.toLowerCase()}`;
            if (motivoAlerta === "TEMPO_PROXIMO") {
              motivoAlerta = "META_PROXIMA";
            }
          }
        }

        if (deveAlertar) {
          alertasCalculados.push({
            id: ciclo.id,
            projeto_id: ciclo.projeto_id,
            projeto_nome: (ciclo.projeto as any)?.nome || "Projeto",
            numero_ciclo: ciclo.numero_ciclo,
            tipo_gatilho: ciclo.tipo_gatilho,
            data_inicio: ciclo.data_inicio,
            data_fim_prevista: ciclo.data_fim_prevista,
            meta_volume: ciclo.meta_volume,
            valor_acumulado: valorAcumuladoReal,
            metrica_acumuladora: ciclo.metrica_acumuladora,
            dias_restantes: diasRestantes,
            dias_atraso: diasAtraso,
            progresso_volume: progressoVolume,
            urgencia,
            mensagem_tempo: mensagemTempo,
            mensagem_volume: mensagemVolume,
            motivo_alerta: motivoAlerta,
          });
        }
      }

      // Ordenar por urgência e depois por progresso
      alertasCalculados.sort((a, b) => {
        const ordemUrgencia = { CRITICA: 0, ALTA: 1, NORMAL: 2 };
        if (ordemUrgencia[a.urgencia] !== ordemUrgencia[b.urgencia]) {
          return ordemUrgencia[a.urgencia] - ordemUrgencia[b.urgencia];
        }
        // Dentro da mesma urgência, ordenar por progresso (maior primeiro)
        return b.progresso_volume - a.progresso_volume;
      });

      setAlertas(alertasCalculados);
    } catch (error) {
      console.error("Erro ao buscar alertas de ciclo:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertas();
  }, []);

  return { alertas, loading, refetch: fetchAlertas };
}
