import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import { calcularMetricasPeriodo } from "@/services/calcularMetricasPeriodo";

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

      const { data: ciclos, error: ciclosError } = await supabase
        .from("projeto_ciclos")
        .select(`
          id, projeto_id, numero_ciclo, tipo_gatilho,
          data_inicio, data_fim_prevista, meta_volume,
          valor_acumulado, metrica_acumuladora,
          projeto:projetos(nome, metrica_lucro_ciclo)
        `)
        .eq("status", "EM_ANDAMENTO");

      if (ciclosError) throw ciclosError;
      if (!ciclos || ciclos.length === 0) {
        setAlertas([]);
        return;
      }

      const alertasCalculados: AlertaCiclo[] = [];

      for (const ciclo of ciclos) {
        // FONTE ÚNICA: Usar serviço canônico de métricas
        const metricas = await calcularMetricasPeriodo({
          projetoId: ciclo.projeto_id,
          dataInicio: ciclo.data_inicio,
          dataFim: ciclo.data_fim_prevista,
        });

        const metricaLucro = ((ciclo.projeto as any)?.metrica_lucro_ciclo as string) || "operacional";
        let valorAcumuladoReal = ciclo.metrica_acumuladora === "VOLUME_APOSTADO"
          ? metricas.volume
          : (metricaLucro === "realizado" ? metricas.lucroRealizado : metricas.lucroLiquido);

        const dataFim = new Date(ciclo.data_fim_prevista);
        dataFim.setHours(0, 0, 0, 0);
        const diasRestantes = differenceInDays(dataFim, hoje);
        const diasAtraso = diasRestantes < 0 ? Math.abs(diasRestantes) : 0;

        let progressoVolume = 0;
        if (ciclo.meta_volume && ciclo.meta_volume > 0) {
          progressoVolume = (valorAcumuladoReal / ciclo.meta_volume) * 100;
        }

        let deveAlertar = false;
        let urgencia: "CRITICA" | "ALTA" | "NORMAL" = "NORMAL";
        let mensagemTempo: string | null = null;
        let mensagemVolume: string | null = null;
        let motivoAlerta: AlertaCiclo["motivo_alerta"] = "TEMPO_PROXIMO";

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
            if (motivoAlerta === "TEMPO_PROXIMO") motivoAlerta = "META_PROXIMA";
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

      alertasCalculados.sort((a, b) => {
        const ordemUrgencia = { CRITICA: 0, ALTA: 1, NORMAL: 2 };
        if (ordemUrgencia[a.urgencia] !== ordemUrgencia[b.urgencia]) {
          return ordemUrgencia[a.urgencia] - ordemUrgencia[b.urgencia];
        }
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
