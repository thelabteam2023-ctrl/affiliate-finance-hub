import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { differenceInDays } from "date-fns";
import { calcularMetricasPeriodo } from "@/services/calcularMetricasPeriodo";
import { toast } from "sonner";

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
  dismissed?: boolean;
}

export function useCicloAlertas() {
  const { workspaceId } = useAuth();
  const [allAlertas, setAllAlertas] = useState<AlertaCiclo[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);

  const fetchAlertas = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // Fetch cycles and dismissals in parallel
      const [ciclosResult, dismissalsResult] = await Promise.all([
        supabase
          .from("projeto_ciclos")
          .select(`
            id, projeto_id, numero_ciclo, tipo_gatilho,
            data_inicio, data_fim_prevista, meta_volume,
            valor_acumulado, metrica_acumuladora,
            projeto:projetos(nome, metrica_lucro_ciclo)
          `)
          .eq("status", "EM_ANDAMENTO")
          .eq("workspace_id", workspaceId) as any,
        supabase
          .from("ciclo_alert_dismissals")
          .select("ciclo_id"),
      ]);

      if (ciclosResult.error) throw ciclosResult.error;

      // Build dismissed set
      const dismissed = new Set<string>(
        (dismissalsResult.data || []).map((d: any) => d.ciclo_id)
      );
      setDismissedIds(dismissed);

      const ciclos = ciclosResult.data || [];
      if (ciclos.length === 0) {
        setAllAlertas([]);
        return;
      }

      const alertasCalculados: AlertaCiclo[] = [];

      for (const ciclo of ciclos) {
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
            dismissed: dismissed.has(ciclo.id),
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

      setAllAlertas(alertasCalculados);
    } catch (error) {
      console.error("Erro ao buscar alertas de ciclo:", error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const dismissCiclo = useCallback(async (cicloId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { error } = await supabase
        .from("ciclo_alert_dismissals")
        .insert({ ciclo_id: cicloId, dismissed_by: user.id });
      
      if (error) throw error;
      
      setDismissedIds(prev => new Set([...prev, cicloId]));
      toast.success("Ciclo oculto da central");
    } catch (err) {
      console.error("Erro ao ocultar ciclo:", err);
      toast.error("Erro ao ocultar ciclo");
    }
  }, []);

  const undismissCiclo = useCallback(async (cicloId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("ciclo_alert_dismissals")
        .delete()
        .eq("ciclo_id", cicloId)
        .eq("dismissed_by", user.id);

      if (error) throw error;

      setDismissedIds(prev => {
        const next = new Set(prev);
        next.delete(cicloId);
        return next;
      });
      toast.success("Ciclo visível novamente");
    } catch (err) {
      console.error("Erro ao desocultar ciclo:", err);
      toast.error("Erro ao desocultar ciclo");
    }
  }, []);

  useEffect(() => {
    fetchAlertas();
  }, [fetchAlertas]);

  // Filtered alertas based on visibility toggle
  const visibleAlertas = showDismissed
    ? allAlertas
    : allAlertas.filter(a => !dismissedIds.has(a.id));

  const dismissedCount = allAlertas.filter(a => dismissedIds.has(a.id)).length;

  return {
    alertas: visibleAlertas,
    allAlertas,
    dismissedCount,
    showDismissed,
    setShowDismissed,
    dismissCiclo,
    undismissCiclo,
    loading,
    refetch: fetchAlertas,
  };
}
