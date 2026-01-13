import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface MesDisponivel {
  value: string; // formato: YYYY-MM
  label: string; // formato: Janeiro / 2026
  startDate: Date;
  endDate: Date;
}

export interface AnoDisponivel {
  value: string; // formato: YYYY
  label: string; // formato: 2026
  startDate: Date;
  endDate: Date;
}

interface UsePeriodosDisponiveisReturn {
  meses: MesDisponivel[];
  anos: AnoDisponivel[];
  loading: boolean;
}

export function usePeriodosDisponiveis(workspaceId: string | undefined): UsePeriodosDisponiveisReturn {
  const [datasApostas, setDatasApostas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    const fetchDatasDisponiveis = async () => {
      try {
        setLoading(true);
        
        // Buscar datas distintas de apostas no workspace
        const { data, error } = await supabase
          .from("apostas_unificada")
          .select("data_aposta")
          .eq("workspace_id", workspaceId)
          .order("data_aposta", { ascending: true });

        if (error) throw error;

        // Extrair datas únicas
        const datas = data?.map(d => d.data_aposta) || [];
        setDatasApostas(datas);
      } catch (error) {
        console.error("Erro ao buscar datas disponíveis:", error);
        setDatasApostas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDatasDisponiveis();
  }, [workspaceId]);

  const meses = useMemo((): MesDisponivel[] => {
    if (datasApostas.length === 0) return [];

    const mesesMap = new Map<string, { startDate: Date; endDate: Date }>();

    datasApostas.forEach(dataStr => {
      const data = parseISO(dataStr);
      const key = format(data, "yyyy-MM");
      
      if (!mesesMap.has(key)) {
        mesesMap.set(key, {
          startDate: startOfMonth(data),
          endDate: endOfMonth(data),
        });
      }
    });

    return Array.from(mesesMap.entries())
      .map(([key, dates]) => ({
        value: key,
        label: format(dates.startDate, "MMMM / yyyy", { locale: ptBR })
          .replace(/^\w/, c => c.toUpperCase()),
        startDate: dates.startDate,
        endDate: dates.endDate,
      }))
      .sort((a, b) => b.value.localeCompare(a.value)); // Mais recente primeiro
  }, [datasApostas]);

  const anos = useMemo((): AnoDisponivel[] => {
    if (datasApostas.length === 0) return [];

    const anosMap = new Map<string, { startDate: Date; endDate: Date }>();

    datasApostas.forEach(dataStr => {
      const data = parseISO(dataStr);
      const key = format(data, "yyyy");
      
      if (!anosMap.has(key)) {
        anosMap.set(key, {
          startDate: startOfYear(data),
          endDate: endOfYear(data),
        });
      }
    });

    return Array.from(anosMap.entries())
      .map(([key, dates]) => ({
        value: key,
        label: key,
        startDate: dates.startDate,
        endDate: dates.endDate,
      }))
      .sort((a, b) => b.value.localeCompare(a.value)); // Mais recente primeiro
  }, [datasApostas]);

  return { meses, anos, loading };
}
