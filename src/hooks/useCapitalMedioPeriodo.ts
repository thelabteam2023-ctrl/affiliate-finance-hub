import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CapitalMedioPeriodoResult {
  /** Capital médio do período em BRL (média dos snapshots diários) */
  capitalMedio: number;
  /** Capital no início do período */
  capitalInicio: number;
  /** Capital no final do período */
  capitalFim: number;
  /** Número de snapshots encontrados no período */
  snapshotsCount: number;
  /** Volume total apostado no período */
  volumeApostado: number;
  /** Se não há snapshots suficientes, usa capital atual como fallback */
  isFallback: boolean;
}

interface UseCapitalMedioPeriodoProps {
  dataInicio?: string | null;
  dataFim?: string | null;
  capitalAtual?: number; // fallback quando não há snapshots
}

/**
 * Hook que calcula o capital médio alocado em bookmakers para um período.
 * 
 * Usa a tabela capital_snapshots (snapshots diários) para calcular a média
 * do capital ao longo do período, garantindo consistência temporal com o lucro.
 * 
 * Quando não há snapshots suficientes (sistema recém-implantado), usa o
 * capital atual como fallback.
 */
export function useCapitalMedioPeriodo({
  dataInicio = null,
  dataFim = null,
  capitalAtual = 0,
}: UseCapitalMedioPeriodoProps) {
  const [resultado, setResultado] = useState<CapitalMedioPeriodoResult>({
    capitalMedio: capitalAtual,
    capitalInicio: capitalAtual,
    capitalFim: capitalAtual,
    snapshotsCount: 0,
    volumeApostado: 0,
    isFallback: true,
  });
  const [loading, setLoading] = useState(false);

  const calculate = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("capital_snapshots")
        .select("snapshot_date, capital_bookmakers_total_brl, volume_apostado_periodo")
        .order("snapshot_date", { ascending: true });

      if (dataInicio) {
        query = query.gte("snapshot_date", dataInicio);
      }
      if (dataFim) {
        query = query.lte("snapshot_date", dataFim);
      }

      const { data: snapshots, error } = await query;

      if (error) {
        console.error("Erro ao buscar capital snapshots:", error);
        setResultado({
          capitalMedio: capitalAtual,
          capitalInicio: capitalAtual,
          capitalFim: capitalAtual,
          snapshotsCount: 0,
          volumeApostado: 0,
          isFallback: true,
        });
        return;
      }

      if (!snapshots || snapshots.length === 0) {
        // No snapshots — use current capital as fallback
        setResultado({
          capitalMedio: capitalAtual,
          capitalInicio: capitalAtual,
          capitalFim: capitalAtual,
          snapshotsCount: 0,
          volumeApostado: 0,
          isFallback: true,
        });
        return;
      }

      const capitals = snapshots.map((s) => Number(s.capital_bookmakers_total_brl) || 0);
      const volumes = snapshots.map((s) => Number(s.volume_apostado_periodo) || 0);

      const capitalMedio = capitals.reduce((a, b) => a + b, 0) / capitals.length;
      const capitalInicio = capitals[0];
      const capitalFim = capitals[capitals.length - 1];
      const volumeApostado = volumes.reduce((a, b) => a + b, 0);

      setResultado({
        capitalMedio,
        capitalInicio,
        capitalFim,
        snapshotsCount: snapshots.length,
        volumeApostado,
        isFallback: false,
      });
    } catch (err) {
      console.error("Erro no cálculo de capital médio:", err);
      setResultado({
        capitalMedio: capitalAtual,
        capitalInicio: capitalAtual,
        capitalFim: capitalAtual,
        snapshotsCount: 0,
        volumeApostado: 0,
        isFallback: true,
      });
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, capitalAtual]);

  useEffect(() => {
    calculate();
  }, [calculate]);

  return { ...resultado, loading };
}
