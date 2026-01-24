import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Hook para gerenciar a correção de stablecoins (USDT/USDC)
 * Aplica paridade 1:1 e remove spreads históricos
 */

export interface StablecoinCorrectionEntry {
  ledger_id: string;
  tipo_transacao: string;
  moeda: string;
  valor_origem: number;
  valor_destino_antigo: number;
  valor_destino_novo: number;
  diferenca: number;
}

export interface StablecoinCorrectionResult {
  entries: StablecoinCorrectionEntry[];
  totalDiferenca: number;
  totalEntradas: number;
}

export function useStablecoinCorrection() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StablecoinCorrectionResult | null>(null);

  /**
   * Simula a correção (dry run) - mostra o que seria alterado
   */
  const simularCorrecao = async (workspaceId?: string): Promise<StablecoinCorrectionResult | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("corrigir_depositos_stablecoins", {
        p_dry_run: true,
        p_workspace_id: workspaceId || null,
      });

      if (error) {
        console.error("Erro ao simular correção:", error);
        toast.error("Erro ao simular correção de stablecoins");
        return null;
      }

      const entries = (data || []) as StablecoinCorrectionEntry[];
      const totalDiferenca = entries.reduce((acc, e) => acc + e.diferenca, 0);

      const resultado: StablecoinCorrectionResult = {
        entries,
        totalDiferenca,
        totalEntradas: entries.length,
      };

      setResult(resultado);
      return resultado;
    } catch (err) {
      console.error("Erro ao simular correção:", err);
      toast.error("Erro inesperado ao simular correção");
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Aplica a correção de fato - altera os valores no banco
   */
  const aplicarCorrecao = async (workspaceId?: string): Promise<boolean> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("corrigir_depositos_stablecoins", {
        p_dry_run: false,
        p_workspace_id: workspaceId || null,
      });

      if (error) {
        console.error("Erro ao aplicar correção:", error);
        toast.error("Erro ao aplicar correção de stablecoins");
        return false;
      }

      const entries = (data || []) as StablecoinCorrectionEntry[];
      
      if (entries.length === 0) {
        toast.info("Nenhum depósito de stablecoin precisava de correção");
        return true;
      }

      toast.success(`${entries.length} depósitos de stablecoins corrigidos com sucesso`);

      // Recalcular saldos após correção
      await recalcularSaldosAfetados(workspaceId);

      return true;
    } catch (err) {
      console.error("Erro ao aplicar correção:", err);
      toast.error("Erro inesperado ao aplicar correção");
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Recalcula saldos dos bookmakers afetados pela correção
   */
  const recalcularSaldosAfetados = async (workspaceId?: string): Promise<void> => {
    try {
      const { error } = await supabase.rpc("recalcular_saldos_apos_correcao_stablecoins", {
        p_workspace_id: workspaceId || null,
      });

      if (error) {
        console.error("Erro ao recalcular saldos:", error);
        toast.warning("Correções aplicadas, mas erro ao recalcular saldos. Verifique manualmente.");
      }
    } catch (err) {
      console.error("Erro ao recalcular saldos:", err);
    }
  };

  return {
    loading,
    result,
    simularCorrecao,
    aplicarCorrecao,
    recalcularSaldosAfetados,
  };
}
