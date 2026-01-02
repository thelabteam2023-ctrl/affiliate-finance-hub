import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ContaminatedBookmaker {
  id: string;
  nome: string;
  estrategias: string[];
  totalApostas: number;
}

interface UseBonusContaminationProps {
  projetoId: string;
  bookmakersInBonusMode: string[];
}

interface UseBonusContaminationResult {
  isContaminated: boolean;
  contaminatedBookmakers: ContaminatedBookmaker[];
  loading: boolean;
  totalNonBonusBets: number;
}

export function useBonusContamination({ 
  projetoId, 
  bookmakersInBonusMode 
}: UseBonusContaminationProps): UseBonusContaminationResult {
  const [contaminatedBookmakers, setContaminatedBookmakers] = useState<ContaminatedBookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalNonBonusBets, setTotalNonBonusBets] = useState(0);

  const checkContamination = useCallback(async () => {
    if (!projetoId || bookmakersInBonusMode.length === 0) {
      setContaminatedBookmakers([]);
      setTotalNonBonusBets(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Query for bets in bookmakers in bonus mode that are NOT bonus bets
      // Contamination = bookmaker in bonus mode used for non-bonus strategies
      const { data: nonBonusBets, error } = await supabase
        .from("apostas_unificada")
        .select("bookmaker_id, estrategia, is_bonus_bet")
        .eq("projeto_id", projetoId)
        .in("bookmaker_id", bookmakersInBonusMode)
        .or("is_bonus_bet.is.null,is_bonus_bet.eq.false");

      if (error) throw error;

      // Also exclude EXTRACAO_BONUS strategy as it's the expected bonus strategy
      const contaminated = (nonBonusBets || []).filter(
        bet => bet.estrategia !== "EXTRACAO_BONUS"
      );

      if (contaminated.length === 0) {
        setContaminatedBookmakers([]);
        setTotalNonBonusBets(0);
        setLoading(false);
        return;
      }

      setTotalNonBonusBets(contaminated.length);

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
      console.error("Error checking bonus contamination:", error);
      setContaminatedBookmakers([]);
      setTotalNonBonusBets(0);
    } finally {
      setLoading(false);
    }
  }, [projetoId, bookmakersInBonusMode]);

  useEffect(() => {
    checkContamination();
  }, [checkContamination]);

  return {
    isContaminated: contaminatedBookmakers.length > 0,
    contaminatedBookmakers,
    loading,
    totalNonBonusBets,
  };
}
