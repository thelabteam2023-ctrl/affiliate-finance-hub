import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ContaminatedBookmaker {
  id: string;
  nome: string;
  estrategias: string[];
  totalApostas: number;
}

interface UseFreebetContaminationProps {
  projetoId: string;
}

interface UseFreebetContaminationResult {
  isContaminated: boolean;
  contaminatedBookmakers: ContaminatedBookmaker[];
  loading: boolean;
  totalContaminatedBets: number;
  estrategiasEncontradas: string[];
}

// Estratégias esperadas para uso de freebet
const ESTRATEGIAS_ESPERADAS = ["EXTRACAO_FREEBET", "EXTRACAO_BONUS"];

export function useFreebetContamination({ 
  projetoId 
}: UseFreebetContaminationProps): UseFreebetContaminationResult {
  const [contaminatedBookmakers, setContaminatedBookmakers] = useState<ContaminatedBookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalContaminatedBets, setTotalContaminatedBets] = useState(0);
  const [estrategiasEncontradas, setEstrategiasEncontradas] = useState<string[]>([]);

  const checkContamination = useCallback(async () => {
    if (!projetoId) {
      setContaminatedBookmakers([]);
      setTotalContaminatedBets(0);
      setEstrategiasEncontradas([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Query for bets that USE freebet but are NOT using expected extraction strategies
      // Contamination = freebet context/tipo_freebet used with non-extraction strategies
      const { data: contaminatedBets, error } = await supabase
        .from("apostas_unificada")
        .select("bookmaker_id, estrategia, tipo_freebet, contexto_operacional")
        .eq("projeto_id", projetoId)
        .or("contexto_operacional.eq.FREEBET,tipo_freebet.not.is.null")
        .is("cancelled_at", null);

      if (error) throw error;

      // Filter out expected strategies and qualifier bets (gerou_freebet)
      const contaminated = (contaminatedBets || []).filter(
        bet => bet.estrategia && !ESTRATEGIAS_ESPERADAS.includes(bet.estrategia)
      );

      if (contaminated.length === 0) {
        setContaminatedBookmakers([]);
        setTotalContaminatedBets(0);
        setEstrategiasEncontradas([]);
        setLoading(false);
        return;
      }

      setTotalContaminatedBets(contaminated.length);

      // Collect all unique non-expected strategies
      const allStrategies = new Set<string>();
      contaminated.forEach(bet => {
        if (bet.estrategia) allStrategies.add(bet.estrategia);
      });
      setEstrategiasEncontradas(Array.from(allStrategies));

      // Group by bookmaker and collect strategies
      const bookmakerMap = new Map<string, { estrategias: Set<string>; count: number }>();
      
      contaminated.forEach(bet => {
        if (!bet.bookmaker_id) return;
        
        const existing = bookmakerMap.get(bet.bookmaker_id);
        if (existing) {
          if (bet.estrategia) existing.estrategias.add(bet.estrategia);
          existing.count++;
        } else {
          bookmakerMap.set(bet.bookmaker_id, {
            estrategias: new Set(bet.estrategia ? [bet.estrategia] : []),
            count: 1,
          });
        }
      });

      // Fetch bookmaker names
      const bookmakerIds = Array.from(bookmakerMap.keys());
      const { data: bookmakers } = await supabase
        .from("bookmakers")
        .select("id, nome")
        .in("id", bookmakerIds);

      const bookmakerNomes = new Map<string, string>();
      (bookmakers || []).forEach(bk => bookmakerNomes.set(bk.id, bk.nome));

      // Build result
      const result: ContaminatedBookmaker[] = Array.from(bookmakerMap.entries()).map(([id, data]) => ({
        id,
        nome: bookmakerNomes.get(id) || "Desconhecida",
        estrategias: Array.from(data.estrategias),
        totalApostas: data.count,
      }));

      // Sort by number of contaminated bets descending
      result.sort((a, b) => b.totalApostas - a.totalApostas);

      setContaminatedBookmakers(result);
    } catch (error) {
      console.error("Error checking freebet contamination:", error);
      setContaminatedBookmakers([]);
      setTotalContaminatedBets(0);
      setEstrategiasEncontradas([]);
    } finally {
      setLoading(false);
    }
  }, [projetoId]);

  useEffect(() => {
    checkContamination();
  }, [checkContamination]);

  return {
    isContaminated: contaminatedBookmakers.length > 0,
    contaminatedBookmakers,
    loading,
    totalContaminatedBets,
    estrategiasEncontradas,
  };
}
