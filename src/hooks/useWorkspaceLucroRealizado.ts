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
}

/**
 * Lucro Realizado consolidado do workspace (Saques − Depósitos efetivos),
 * delegando à engine canônica `fetchProjetosLucroCanonico` para garantir paridade
 * absoluta com os cards de projeto (Visão Financeira).
 *
 * Observação: o cálculo é acumulado (lifetime) por projeto — mesmo comportamento
 * de `FinancialMetricsPopover` / `ProjetoKanbanCard`. Não respeita o filtro de
 * período do dashboard, por design (Realizado é uma posição, não um fluxo do mês).
 */
export function useWorkspaceLucroRealizado({
  cotacaoUSD,
  cotacaoEUR = 0,
  cotacaoGBP = 0,
  cotacaoMYR = 0,
  cotacaoMXN = 0,
  cotacaoARS = 0,
  cotacaoCOP = 0,
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
  }, [cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { lucroRealizado, loading, error, refresh };
}