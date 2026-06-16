import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjetosLucroCanonico } from "@/services/fetchProjetosLucroCanonico";

interface Params {
  cotacaoUSD: number;
  cotacaoEUR?: number;
  cotacaoGBP?: number;
  cotacaoMYR?: number;
  cotacaoMXN?: number;
  cotacaoARS?: number;
  cotacaoCOP?: number;
  /** Filtro opcional (YYYY-MM-DD). Quando informado, calcula o Fluxo Líquido APENAS dentro do intervalo. */
  dataInicio?: string | null;
  dataFim?: string | null;
}

/**
 * Lucro Realizado consolidado do workspace (Saques − Depósitos efetivos).
 *
 * - Sem `dataInicio`/`dataFim` → comportamento lifetime (paridade com cards de projeto).
 * - Com `dataInicio`/`dataFim` → Fluxo Líquido do período (filtra `cash_ledger.data_transacao`).
 */
export function useWorkspaceLucroRealizado({
  cotacaoUSD,
  cotacaoEUR = 0,
  cotacaoGBP = 0,
  cotacaoMYR = 0,
  cotacaoMXN = 0,
  cotacaoARS = 0,
  cotacaoCOP = 0,
  dataInicio = null,
  dataFim = null,
}: Params) {
  const [lucroRealizado, setLucroRealizado] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: projetos, error: pErr } = await supabase.from("projetos").select("id");
      if (pErr) throw pErr;
      const ids = (projetos || []).map((p) => p.id);
      if (ids.length === 0) {
        setLucroRealizado(0);
        return;
      }
      const resultado = await fetchProjetosLucroCanonico({
        projetoIds: ids,
        cotacoesOficiais: {
          USD: cotacaoUSD,
          EUR: cotacaoEUR,
          GBP: cotacaoGBP,
          MYR: cotacaoMYR,
          MXN: cotacaoMXN,
          ARS: cotacaoARS,
          COP: cotacaoCOP,
        },
        dataInicio,
        dataFim,
      });
      const total = Object.values(resultado).reduce(
        (acc, r) => acc + (Number(r.lucroRealizado) || 0),
        0
      );
      setLucroRealizado(total);
    } catch (e: any) {
      console.error("[useWorkspaceLucroRealizado]", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP, dataInicio, dataFim]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { lucroRealizado, loading, error, refresh };
}